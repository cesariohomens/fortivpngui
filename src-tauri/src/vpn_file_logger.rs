//! Append VPN runner lines under `settings.logs`/vpn/<profile>.log (rotates at ~2 MiB).
//! Port of `electron/vpn-file-logger.ts`.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::config::expand_home;
use crate::settings::read_main_settings;

const MAX_BYTES: u64 = 2 * 1024 * 1024;

fn safe_profile_segment(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if out.len() >= 120 {
            break;
        }
        // TS: /[^\w.\-]+/g — `\w` is [A-Za-z0-9_]
        if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "unknown".to_string()
    } else {
        out
    }
}

fn vpn_log_dir() -> std::io::Result<PathBuf> {
    let logs = read_main_settings()
        .map(|m| m.logs)
        .unwrap_or_default();
    let raw = logs.trim();
    let base = if raw.is_empty() {
        home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".fortivpngui")
            .join("logs")
    } else {
        expand_home(raw)
    };
    let dir = base.join("vpn");
    fs::create_dir_all(&dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o755));
    }
    Ok(dir)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn rotate_if_needed(file: &Path) {
    let Ok(meta) = fs::metadata(file) else {
        return;
    };
    if meta.len() < MAX_BYTES {
        return;
    }
    let bak = PathBuf::from(format!("{}.1", file.display()));
    if bak.exists() {
        let _ = fs::remove_file(&bak);
    }
    let _ = fs::rename(file, &bak);
}

/// Append one VPN log line under expanded `settings.logs`/vpn/<profile>.log (rotates at ~2 MiB).
pub fn append_vpn_log_line(profile_name: &str, stream: &str, line: &str) {
    if let Err(e) = append_vpn_log_line_inner(profile_name, stream, line) {
        eprintln!("[vpn-file-logger] {e}");
    }
}

fn append_vpn_log_line_inner(profile_name: &str, stream: &str, line: &str) -> std::io::Result<()> {
    let dir = vpn_log_dir()?;
    let file = dir.join(format!("{}.log", safe_profile_segment(profile_name)));
    rotate_if_needed(&file);
    let ts = chrono_like_iso8601();
    let mut opts = OpenOptions::new();
    opts.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(&file)?;
    writeln!(f, "{ts} [{stream}] {line}")?;
    Ok(())
}

/// UTC timestamp close to `Date.prototype.toISOString()` (millis precision).
fn chrono_like_iso8601() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let Ok(dur) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        return "1970-01-01T00:00:00.000Z".to_string();
    };
    let secs = dur.as_secs();
    let millis = dur.subsec_millis();
    let (y, mon, d, h, min, s) = civil_from_unix(secs);
    format!("{y:04}-{mon:02}-{d:02}T{h:02}:{min:02}:{s:02}.{millis:03}Z")
}

/// Convert Unix seconds to UTC civil datetime (y, month, day, hour, min, sec).
fn civil_from_unix(secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    let days = (secs / 86_400) as i64;
    let rem = (secs % 86_400) as u32;
    let h = rem / 3600;
    let min = (rem % 3600) / 60;
    let s = rem % 60;

    // Howard Hinnant civil_from_days
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d, h, min, s)
}
