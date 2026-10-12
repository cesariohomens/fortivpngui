//! Classifies why a VPN tunnel dropped, from the tail of the runner output.
//! `reason_key` is resolved by the renderer against `disconnect.*` i18n messages.
//! Port of `electron/disconnect-reason.ts`.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

const TAIL_SIZE: usize = 40;
/// Lines shown verbatim in the warning dialog.
const DETAIL_SIZE: usize = 8;

static TAILS: Mutex<Option<HashMap<String, Vec<String>>>> = Mutex::new(None);
/// Profiles stopped from the UI or tray: no warning for those.
static USER_INITIATED: Mutex<Option<HashSet<String>>> = Mutex::new(None);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisconnectReasonKey {
    AuthFailed,
    OtpInvalid,
    CertRejected,
    GatewayUnreachable,
    TimedOut,
    ResetByPeer,
    PppdFailed,
    SudoDenied,
    BinaryMissing,
    TunnelDown,
    Unknown,
}

impl DisconnectReasonKey {
    /// i18n key segment matching the TypeScript union (`authFailed`, …).
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AuthFailed => "authFailed",
            Self::OtpInvalid => "otpInvalid",
            Self::CertRejected => "certRejected",
            Self::GatewayUnreachable => "gatewayUnreachable",
            Self::TimedOut => "timedOut",
            Self::ResetByPeer => "resetByPeer",
            Self::PppdFailed => "pppdFailed",
            Self::SudoDenied => "sudoDenied",
            Self::BinaryMissing => "binaryMissing",
            Self::TunnelDown => "tunnelDown",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone)]
pub struct DisconnectClassification {
    pub reason_key: DisconnectReasonKey,
    pub detail: String,
}

fn with_tails<R>(f: impl FnOnce(&mut HashMap<String, Vec<String>>) -> R) -> R {
    let mut guard = TAILS.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    f(guard.as_mut().unwrap())
}

fn with_user_initiated<R>(f: impl FnOnce(&mut HashSet<String>) -> R) -> R {
    let mut guard = USER_INITIATED.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashSet::new());
    }
    f(guard.as_mut().unwrap())
}

fn line_matches(key: DisconnectReasonKey, line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    match key {
        DisconnectReasonKey::BinaryMissing => {
            l.contains("openfortivpn not found") || l.contains("spawn error")
        }
        DisconnectReasonKey::SudoDenied => {
            l.contains("sudo:")
                && (l.contains("no tty")
                    || l.contains("not allowed")
                    || l.contains("incorrect password")
                    || l.contains("a password is required"))
        }
        DisconnectReasonKey::OtpInvalid => {
            let otpish = l.contains("otp") || l.contains("token") || l.contains("one-time password");
            let bad = l.contains("invalid")
                || l.contains("incorrect")
                || l.contains("expired")
                || l.contains("rejected");
            (otpish && bad) || (l.contains("invalid") && (l.contains("otp") || l.contains("token")))
        }
        DisconnectReasonKey::AuthFailed => {
            l.contains("could not authenticate to the gateway")
                || l.contains("could not authenticate to gateway")
                || l.contains("no cookie given")
                || l.contains("authentication failed")
                || l.contains("access denied")
                || l.contains("permission denied by gateway")
        }
        DisconnectReasonKey::CertRejected => {
            l.contains("certificate verification failed")
                || l.contains("certificate validation failed")
                || l.contains("gateway certificate")
                || l.contains("self-signed certificate")
                || l.contains("self signed certificate")
                || l.contains("certificate has expired")
                || l.contains("unable to verify")
        }
        DisconnectReasonKey::GatewayUnreachable => {
            l.contains("could not resolve")
                || l.contains("name or service not known")
                || l.contains("no route to host")
                || l.contains("network is unreachable")
                || l.contains("connection refused")
                || l.contains("could not connect to gateway")
        }
        DisconnectReasonKey::TimedOut => {
            l.contains("connection timed out") || l.contains("timed out") || l.contains("timeout while")
        }
        DisconnectReasonKey::PppdFailed => {
            l.contains("pppd died")
                || l.contains("pppd exited")
                || l.contains("pppd failed")
                || l.contains("pppd terminated")
                || l.contains("ppp daemon")
                || l.contains("lcp: timeout")
                || l.contains("modem hangup")
        }
        DisconnectReasonKey::ResetByPeer => {
            l.contains("connection reset by peer")
                || l.contains("broken pipe")
                || l.contains("ssl_read")
                || l.contains("unexpected eof")
                || l.contains("gateway closed the connection")
        }
        DisconnectReasonKey::TunnelDown => {
            l.contains("tunnel is down")
                || l.contains("got disconnected")
                || l.contains("closed connection to the gateway")
                || l.contains("closed connection to gateway")
                || l.contains("tunnel closed")
                || l.contains("logged out")
        }
        DisconnectReasonKey::Unknown => false,
    }
}

/// Pattern order matches TypeScript `PATTERNS` (first match from the end of the tail wins per key scan).
const PATTERN_ORDER: &[DisconnectReasonKey] = &[
    DisconnectReasonKey::BinaryMissing,
    DisconnectReasonKey::SudoDenied,
    DisconnectReasonKey::OtpInvalid,
    DisconnectReasonKey::AuthFailed,
    DisconnectReasonKey::CertRejected,
    DisconnectReasonKey::GatewayUnreachable,
    DisconnectReasonKey::TimedOut,
    DisconnectReasonKey::PppdFailed,
    DisconnectReasonKey::ResetByPeer,
    DisconnectReasonKey::TunnelDown,
];

pub fn record_disconnect_hint_line(profile_name: &str, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    with_tails(|tails| {
        let tail = tails.entry(profile_name.to_string()).or_default();
        tail.push(trimmed.to_string());
        if tail.len() > TAIL_SIZE {
            let drain = tail.len() - TAIL_SIZE;
            tail.drain(0..drain);
        }
    });
}

pub fn mark_user_initiated_stop(profile_name: &str) {
    with_user_initiated(|set| {
        set.insert(profile_name.to_string());
    });
}

pub fn is_user_initiated_stop(profile_name: &str) -> bool {
    with_user_initiated(|set| set.contains(profile_name))
}

pub fn reset_disconnect_tracking(profile_name: &str) {
    with_tails(|tails| {
        tails.remove(profile_name);
    });
    with_user_initiated(|set| {
        set.remove(profile_name);
    });
}

pub fn classify_disconnect(profile_name: &str) -> DisconnectClassification {
    let tail = with_tails(|tails| tails.get(profile_name).cloned().unwrap_or_default());
    let mut reason_key = DisconnectReasonKey::Unknown;
    for line in tail.iter().rev() {
        if reason_key != DisconnectReasonKey::Unknown {
            break;
        }
        for &key in PATTERN_ORDER {
            if line_matches(key, line) {
                reason_key = key;
                break;
            }
        }
    }
    let detail = if tail.len() <= DETAIL_SIZE {
        tail.join("\n")
    } else {
        tail[tail.len() - DETAIL_SIZE..].join("\n")
    };
    DisconnectClassification { reason_key, detail }
}
