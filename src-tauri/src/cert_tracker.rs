//! Accumulate gateway certificate failure blocks from openfortivpn log lines.
//! Port of `electron/cert-failure-tracker.ts`.

use std::collections::HashMap;
use std::sync::Mutex;

const TRIGGER: &str =
    "Gateway certificate validation failed, and the certificate digest is not in the local whitelist.";
const CLOSE: &str = "Closed connection to gateway.";
const MAX_BUFFER: usize = 10000;

#[derive(Debug, Clone)]
pub struct ParsedCertFailure {
    pub digest: String,
    /// User-facing detail (subject / gateway cert block).
    pub info: String,
    /// Full message for blocked dialog / prompt body.
    pub body: String,
}

#[derive(Debug, Clone)]
pub struct CertFailureFlush {
    pub profile_name: String,
    pub raw: String,
    pub parsed: Option<ParsedCertFailure>,
}

struct AccState {
    mode: bool,
    buf: String,
}

static STATE: Mutex<Option<HashMap<String, AccState>>> = Mutex::new(None);

fn with_state<R>(f: impl FnOnce(&mut HashMap<String, AccState>) -> R) -> R {
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    f(guard.as_mut().unwrap())
}

fn get_state<'a>(map: &'a mut HashMap<String, AccState>, name: &str) -> &'a mut AccState {
    map.entry(name.to_string()).or_insert_with(|| AccState {
        mode: false,
        buf: String::new(),
    })
}

pub fn reset_cert_failure_state(profile_name: &str) {
    with_state(|map| {
        map.remove(profile_name);
    });
}

pub fn is_cert_failure_accumulating(profile_name: &str) -> bool {
    with_state(|map| get_state(map, profile_name).mode)
}

/// OFG vpnLogger.cpp: accumulate from trigger until Closed connection or size cap. Returns flush event or None.
pub fn feed_cert_failure_line(profile_name: &str, line: &str) -> Option<CertFailureFlush> {
    with_state(|map| {
        let s = get_state(map, profile_name);
        if line.contains(TRIGGER) {
            s.mode = true;
        }
        if s.mode {
            s.buf.push_str(line);
            s.buf.push('\n');
        }

        let over = s.buf.len() > MAX_BUFFER;
        let closed = s.mode && line.contains(CLOSE);
        if !s.mode || (!closed && !over) {
            return None;
        }

        let raw = std::mem::take(&mut s.buf);
        s.mode = false;
        let parsed = parse_cert_failure_buffer(&raw);
        Some(CertFailureFlush {
            profile_name: profile_name.to_string(),
            raw,
            parsed,
        })
    })
}

fn parse_cert_failure_buffer(buffer: &str) -> Option<ParsedCertFailure> {
    // /--trusted-cert\s+([0-9a-fA-F]{64})\b/
    let digest = find_trusted_cert_digest(buffer)?;
    let digest = digest.to_lowercase();

    let mut info = String::new();
    if let Some(block) = extract_gateway_cert_info(buffer) {
        info = strip_error_prefixes(&block).trim().to_string();
    }

    let head = "Gateway certificate validation failed and the certificate digest is not in the local whitelist nor a valid CA is provided. Certificate details:\n\n";
    let tail = "\n\nAdd certificate to VPN-profile whitelist?";
    let body = format!(
        "{head}{}{tail}",
        if info.is_empty() {
            "(see VPN log for full certificate output)"
        } else {
            &info
        }
    );
    Some(ParsedCertFailure { digest, info, body })
}

fn find_trusted_cert_digest(buffer: &str) -> Option<&str> {
    const NEEDLE: &str = "--trusted-cert";
    let mut search_from = 0;
    while let Some(rel) = buffer[search_from..].find(NEEDLE) {
        let idx = search_from + rel;
        let after = buffer[idx + NEEDLE.len()..].trim_start();
        let end = after
            .char_indices()
            .find(|(_, c)| !c.is_ascii_hexdigit())
            .map(|(i, _)| i)
            .unwrap_or(after.len());
        let candidate = &after[..end];
        if candidate.len() == 64 && candidate.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Some(candidate);
        }
        search_from = idx + NEEDLE.len();
    }
    None
}

fn extract_gateway_cert_info(buffer: &str) -> Option<String> {
    // /Gateway certificate:\r?\n([\s\S]*?)sha256 digest:\r?\n/i
    let lower = buffer.to_ascii_lowercase();
    let start_key = "gateway certificate:";
    let end_key = "sha256 digest:";
    let start = lower.find(start_key)?;
    let after_start = start + start_key.len();
    let mut body_start = after_start;
    if buffer[body_start..].starts_with("\r\n") {
        body_start += 2;
    } else if buffer[body_start..].starts_with('\n') {
        body_start += 1;
    }
    let end_rel = lower[body_start..].find(end_key)?;
    Some(buffer[body_start..body_start + end_rel].to_string())
}

fn strip_error_prefixes(s: &str) -> String {
    // /ERROR:\s*/gi
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while !rest.is_empty() {
        if rest
            .get(..6)
            .is_some_and(|p| p.eq_ignore_ascii_case("error:"))
        {
            rest = rest[6..].trim_start_matches([' ', '\t']);
            continue;
        }
        let mut chars = rest.chars();
        if let Some(c) = chars.next() {
            out.push(c);
            rest = chars.as_str();
        } else {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accumulates_until_close() {
        reset_cert_failure_state("p");
        assert!(feed_cert_failure_line("p", "noise").is_none());
        assert!(feed_cert_failure_line("p", TRIGGER).is_none());
        assert!(is_cert_failure_accumulating("p"));
        let flush = feed_cert_failure_line(
            "p",
            "ERROR: Gateway certificate:\n  subject\nsha256 digest:\n--trusted-cert aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899\n",
        );
        assert!(flush.is_none());
        let flush = feed_cert_failure_line("p", CLOSE).unwrap();
        assert_eq!(
            flush.parsed.as_ref().unwrap().digest,
            "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"
        );
    }
}
