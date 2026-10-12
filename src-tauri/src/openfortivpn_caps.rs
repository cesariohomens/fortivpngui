//! Absolute path / version / feature probes for the installed `openfortivpn`.
//! Port of `electron/openfortivpn-capabilities.ts`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Absolute path to openfortivpn for `sudo` argv.
/// Sudoers `NOPASSWD: /usr/bin/openfortivpn` only matches that path — not bare `openfortivpn`.
pub fn resolve_openfortivpn_executable() -> Option<String> {
    if let Ok(env) = std::env::var("OPENFORTIVPN_PATH") {
        let env = env.trim();
        if !env.is_empty() {
            let p = Path::new(env);
            return Some(if p.is_absolute() {
                env.to_string()
            } else {
                PathBuf::from(env)
                    .canonicalize()
                    .unwrap_or_else(|_| PathBuf::from(env))
                    .to_string_lossy()
                    .into_owned()
            });
        }
    }
    for p in ["/usr/bin/openfortivpn", "/usr/local/bin/openfortivpn"] {
        if Path::new(p).exists() {
            return Some(p.to_string());
        }
    }
    let output = Command::new("which").arg("openfortivpn").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

#[derive(Debug, Clone)]
pub struct OpenfortivpnVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub raw: String,
}

/// First upstream release that accepts each key in a config file, taken from `src/config.c` at the release tags.
/// `load_config()` aborts parsing on an unknown key (`goto err_free`), silently dropping every later key, so a key
/// must never be written to a binary that does not know it.
fn config_key_min_version(key: &str) -> Option<(u32, u32)> {
    match key {
        "min-tls" | "seclevel-1" | "pinentry" => Some((1, 10)),
        "use-resolvconf" => Some((1, 14)),
        "pem-passphrase" | "user-agent" | "hostcheck" | "check-virtual-desktop" => Some((1, 16)),
        "pppd-accept-remote" => Some((1, 21)),
        "sni" => Some((1, 22)),
        "saml-login" => Some((1, 23)),
        _ => None,
    }
}

struct ProbeCache {
    bin: Option<String>,
    version: Option<OpenfortivpnVersion>,
    cli_options: Option<HashSet<String>>,
}

static CACHE: Mutex<Option<ProbeCache>> = Mutex::new(None);

fn parse_version(raw: &str) -> Option<OpenfortivpnVersion> {
    // /(\d+)\.(\d+)(?:\.(\d+))?/
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            let mut major = 0u32;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                major = major
                    .saturating_mul(10)
                    .saturating_add((bytes[i] - b'0') as u32);
                i += 1;
            }
            if i < bytes.len() && bytes[i] == b'.' {
                i += 1;
                if i < bytes.len() && bytes[i].is_ascii_digit() {
                    let mut minor = 0u32;
                    while i < bytes.len() && bytes[i].is_ascii_digit() {
                        minor = minor
                            .saturating_mul(10)
                            .saturating_add((bytes[i] - b'0') as u32);
                        i += 1;
                    }
                    let mut patch = 0u32;
                    let end_before_patch = i;
                    if i < bytes.len() && bytes[i] == b'.' {
                        i += 1;
                        if i < bytes.len() && bytes[i].is_ascii_digit() {
                            while i < bytes.len() && bytes[i].is_ascii_digit() {
                                patch = patch
                                    .saturating_mul(10)
                                    .saturating_add((bytes[i] - b'0') as u32);
                                i += 1;
                            }
                        } else {
                            i = end_before_patch;
                        }
                    }
                    let raw_str = raw[start..i].to_string();
                    return Some(OpenfortivpnVersion {
                        major,
                        minor,
                        patch,
                        raw: raw_str,
                    });
                }
            }
        } else {
            i += 1;
        }
    }
    None
}

/// Long options the installed binary advertises in `--help`, or None when `--help` could not be read.
fn parse_cli_options(help: &str) -> Option<HashSet<String>> {
    let mut found = HashSet::new();
    let bytes = help.as_bytes();
    let mut i = 0;
    while i + 2 < bytes.len() {
        if bytes[i] == b'-' && bytes[i + 1] == b'-' {
            i += 2;
            let start = i;
            while i < bytes.len() {
                let c = bytes[i];
                if c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' {
                    i += 1;
                } else {
                    break;
                }
            }
            if i > start {
                found.insert(help[start..i].to_string());
            }
        } else {
            i += 1;
        }
    }
    if found.is_empty() {
        None
    } else {
        Some(found)
    }
}

fn run_with_timeout(bin: &str, args: &[&str], timeout: Duration) -> Option<(String, String)> {
    use std::io::Read;

    let mut child = Command::new(bin)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .ok()?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    let _ = out.read_to_end(&mut stdout);
                }
                if let Some(mut err) = child.stderr.take() {
                    let _ = err.read_to_end(&mut stderr);
                }
                return Some((
                    String::from_utf8_lossy(&stdout).into_owned(),
                    String::from_utf8_lossy(&stderr).into_owned(),
                ));
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return None,
        }
    }
}

fn probe() -> ProbeCache {
    let bin = resolve_openfortivpn_executable();
    {
        let guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ref c) = *guard {
            if c.bin == bin {
                return ProbeCache {
                    bin: c.bin.clone(),
                    version: c.version.clone(),
                    cli_options: c.cli_options.clone(),
                };
            }
        }
    }

    let mut version = None;
    let mut cli_options = None;
    if let Some(ref b) = bin {
        let timeout = Duration::from_secs(5);
        if let Some((stdout, stderr)) = run_with_timeout(b, &["--version"], timeout) {
            version = parse_version(&format!("{stdout}\n{stderr}"));
        }
        if let Some((stdout, stderr)) = run_with_timeout(b, &["--help"], timeout) {
            cli_options = parse_cli_options(&format!("{stdout}\n{stderr}"));
        }
    }

    let result = ProbeCache {
        bin,
        version,
        cli_options,
    };
    *CACHE.lock().unwrap_or_else(|e| e.into_inner()) = Some(ProbeCache {
        bin: result.bin.clone(),
        version: result.version.clone(),
        cli_options: result.cli_options.clone(),
    });
    result
}

/// Version of the openfortivpn that will actually be spawned, or None when it cannot be determined.
pub fn detect_openfortivpn_version() -> Option<OpenfortivpnVersion> {
    probe().version
}

/// Whether the installed openfortivpn accepts a command-line option, read from its own `--help`.
/// An unknown argv option makes openfortivpn exit before connecting, so options that only exist on argv
/// (`--ifname`, `--cookie-on-stdin`) are checked this way instead of against a version table.
pub fn supports_cli_option(name: &str) -> bool {
    match probe().cli_options {
        None => true,
        Some(opts) => opts.contains(name),
    }
}

/// Whether the installed openfortivpn understands a config-file key.
/// When the version cannot be determined we stay permissive: the caller writes gated keys last, so a rejected key
/// costs at most the other gated keys rather than the connection settings.
pub fn supports_config_key(key: &str) -> bool {
    let Some((major, minor)) = config_key_min_version(key) else {
        return true;
    };
    let Some(v) = detect_openfortivpn_version() else {
        return true;
    };
    v.major > major || (v.major == major && v.minor >= minor)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_basic() {
        let v = parse_version("openfortivpn 1.22.1").unwrap();
        assert_eq!((v.major, v.minor, v.patch), (1, 22, 1));
        assert_eq!(v.raw, "1.22.1");
    }

    #[test]
    fn parse_cli_options_finds_long_opts() {
        let opts = parse_cli_options("Usage: --ifname=IF --cookie-on-stdin\n").unwrap();
        assert!(opts.contains("ifname"));
        assert!(opts.contains("cookie-on-stdin"));
    }
}
