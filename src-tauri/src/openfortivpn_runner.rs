//! Spawn `sudo openfortivpn` with piped stdio, temp configs, cookie/OTP on stdin.
//! Port of `electron/openfortivpn-runner.ts`.

use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::openfortivpn_caps::{
    detect_openfortivpn_version, supports_cli_option, supports_config_key,
};
use crate::settings::read_main_settings;
use crate::types::VpnProfile;

pub use crate::openfortivpn_caps::resolve_openfortivpn_executable;

#[derive(Debug, Clone)]
pub struct OpenfortivpnLog {
    pub profile_name: String,
    pub line: String,
    pub stream: &'static str, // "stdout" | "stderr"
}

pub type LogCallback = Arc<dyn Fn(OpenfortivpnLog) + Send + Sync + 'static>;
pub type ExitCallback = Arc<dyn Fn(Option<i32>) + Send + Sync + 'static>;
pub type TunnelUpCallback = Arc<dyn Fn() + Send + Sync + 'static>;

/// SHA-256 gateway cert digests for `trusted-cert` lines (64 hex chars, lowercase).
pub fn parse_trusted_cert_digests(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for token in split_digest_tokens(raw) {
        let mut t = token.trim().to_string();
        if let Some(hex) = strip_digest_prefix(&t) {
            t = hex.to_string();
        }
        if t.len() == 64 && t.bytes().all(|b| b.is_ascii_hexdigit()) {
            let lo = t.to_ascii_lowercase();
            if seen.insert(lo.clone()) {
                out.push(lo);
            }
        }
    }
    out
}

fn split_digest_tokens(raw: &str) -> Vec<&str> {
    raw.split(|c: char| c.is_whitespace() || c == ',' || c == ';')
        .filter(|s| !s.is_empty())
        .collect()
}

fn strip_digest_prefix(t: &str) -> Option<&str> {
    let lower = t.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("sha256:") {
        let start = t.len() - rest.len();
        let hex = &t[start..];
        if hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Some(hex);
        }
    }
    if let Some(rest) = lower.strip_prefix("0x") {
        let start = t.len() - rest.len();
        let hex = &t[start..];
        if hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Some(hex);
        }
    }
    None
}

/// Upstream default for `--saml-login` when no port is given (see `main.c`).
const SAML_DEFAULT_PORT: u16 = 8020;

struct BuiltOpenfortivpnConfig {
    config: String,
    /// Keys left out because the installed openfortivpn is too old to parse them.
    skipped: Vec<String>,
}

/// Build openfortivpn-compatible config file (key names with hyphens per upstream).
///
/// Booleans whose upstream default is the enabled value are written explicitly, otherwise unchecking them in the UI
/// would be a no-op. Keys that only exist in newer releases are gated and emitted last: `load_config()` stops parsing
/// at the first key it does not recognise, so anything after a rejected key would be dropped without an error.
fn build_openfortivpn_config(
    profile: &VpnProfile,
    password: &str,
    otp: Option<&str>,
) -> BuiltOpenfortivpnConfig {
    let mut lines: Vec<String> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();

    let mut push = |key: &str, value: String| {
        if !supports_config_key(key) {
            skipped.push(key.to_string());
            return;
        }
        /* A newline pasted into a field would turn the rest of the value into an unknown key and abort the parse. */
        let sanitized = value.replace(['\r', '\n'], " ");
        lines.push(format!("{key} = {sanitized}"));
    };

    push("host", profile.gateway_host.clone());
    push(
        "port",
        (if profile.gateway_port == 0 {
            443u16
        } else {
            profile.gateway_port
        })
        .to_string(),
    );
    if !profile.username.is_empty() {
        push("username", profile.username.clone());
    }
    if !password.is_empty() {
        push("password", password.to_string());
    }
    if let Some(otp) = otp.filter(|s| !s.is_empty()) {
        push("otp", otp.to_string());
    }
    if !profile.realm.is_empty() {
        push("realm", profile.realm.clone());
    }
    /* `set-routes` and `set-dns` default to 1 upstream, so the disabled state has to be written out. */
    push("set-routes", if profile.set_routes { "1" } else { "0" }.to_string());
    push("set-dns", if profile.set_dns { "1" } else { "0" }.to_string());
    if profile.half_internet_routers {
        push("half-internet-routes", "1".to_string());
    }
    if profile.persistent > 0 {
        push("persistent", profile.persistent.to_string());
    }
    if !profile.ca_file.is_empty() {
        push("ca-file", profile.ca_file.clone());
    }
    if !profile.user_cert.is_empty() {
        push("user-cert", profile.user_cert.clone());
    }
    if !profile.user_key.is_empty() {
        push("user-key", profile.user_key.clone());
    }
    for digest in parse_trusted_cert_digests(Some(&profile.trusted_cert)) {
        push("trusted-cert", digest);
    }
    if profile.insecure_ssl {
        push("insecure-ssl", "1".to_string());
    }
    if !profile.cipher_list.trim().is_empty() {
        push("cipher-list", profile.cipher_list.trim().to_string());
    }
    if profile.pppd_use_peerdns {
        push("pppd-use-peerdns", "1".to_string());
    }
    if !profile.pppd_log_file.is_empty() {
        push("pppd-log", profile.pppd_log_file.clone());
    }
    if !profile.pppd_plugin_file.is_empty() {
        push("pppd-plugin", profile.pppd_plugin_file.clone());
    }
    if !profile.pppd_ifname.is_empty() {
        push("pppd-ifname", profile.pppd_ifname.clone());
    }
    if !profile.pppd_ipparam.is_empty() {
        push("pppd-ipparam", profile.pppd_ipparam.clone());
    }
    if !profile.pppd_call.is_empty() {
        push("pppd-call", profile.pppd_call.clone());
    }
    if !profile.otp_prompt.is_empty() {
        push("otp-prompt", profile.otp_prompt.clone());
    }
    if profile.otp_delay != 0 {
        push("otp-delay", profile.otp_delay.to_string());
    }
    if profile.no_ftm_push {
        push("no-ftm-push", "1".to_string());
    }

    /* Version-gated keys last, oldest first. */
    if !profile.pinentry.trim().is_empty() {
        push("pinentry", profile.pinentry.trim().to_string());
    }
    if profile.seclevel1 {
        push("seclevel-1", "1".to_string());
    }
    let min_tls = profile.min_tls.trim();
    if !min_tls.is_empty() && !min_tls.eq_ignore_ascii_case("default") {
        push("min-tls", min_tls.to_string());
    }
    let use_resolvconf = profile.use_resolvconf.trim();
    if !use_resolvconf.is_empty() && !use_resolvconf.eq_ignore_ascii_case("default") {
        push(
            "use-resolvconf",
            if use_resolvconf == "1" { "1" } else { "0" }.to_string(),
        );
    }
    if !profile.pem_passphrase.is_empty() {
        push("pem-passphrase", profile.pem_passphrase.clone());
    }
    if !profile.user_agent.trim().is_empty() {
        push("user-agent", profile.user_agent.trim().to_string());
    }
    if !profile.hostcheck.trim().is_empty() {
        push("hostcheck", profile.hostcheck.trim().to_string());
    }
    if !profile.check_virtual_desktop.trim().is_empty() {
        push(
            "check-virtual-desktop",
            profile.check_virtual_desktop.trim().to_string(),
        );
    }
    /* Upstream default depends on the pppd it was built against, so write both states. */
    push(
        "pppd-accept-remote",
        if profile.pppd_accept_remote { "1" } else { "0" }.to_string(),
    );
    if !profile.sni.trim().is_empty() {
        push("sni", profile.sni.trim().to_string());
    }
    if profile.saml_login {
        let port = if profile.saml_port > 0 {
            profile.saml_port
        } else {
            SAML_DEFAULT_PORT
        };
        push("saml-login", port.to_string());
    }

    BuiltOpenfortivpnConfig {
        config: {
            let mut s = lines.join("\n");
            s.push('\n');
            s
        },
        skipped,
    }
}

struct RunningEntry {
    pid: u32,
    stdin: Mutex<Option<ChildStdin>>,
    config_path: PathBuf,
}

static RUNNING: Mutex<Option<HashMap<String, RunningEntry>>> = Mutex::new(None);

const FORTIVPNGUI_TMP_SUBDIR: &str = "fortivpngui";

fn with_running<R>(f: impl FnOnce(&mut HashMap<String, RunningEntry>) -> R) -> R {
    let mut guard = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    f(guard.as_mut().unwrap())
}

fn openfortivpn_config_dir() -> PathBuf {
    std::env::temp_dir().join(FORTIVPNGUI_TMP_SUBDIR)
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Delete `run-*.conf` in TMPDIR/fortivpngui that are not used by a running openfortivpn
/// (safe when the main window is hidden but VPNs stay up).
pub fn sweep_orphan_configs() {
    sweep_orphan_openfortivpn_configs();
}

pub fn sweep_orphan_openfortivpn_configs() {
    let dir = openfortivpn_config_dir();
    if !dir.exists() {
        return;
    }
    let active: HashSet<PathBuf> = with_running(|running| {
        running
            .values()
            .filter_map(|r| fs::canonicalize(&r.config_path).ok())
            .collect()
    });
    let Ok(entries) = fs::read_dir(&dir) else {
        return;
    };
    for ent in entries.flatten() {
        let Ok(ft) = ent.file_type() else { continue };
        if !ft.is_file() {
            continue;
        }
        let name = ent.file_name();
        let name = name.to_string_lossy();
        if !is_run_conf_name(&name) {
            continue;
        }
        let full = match fs::canonicalize(ent.path()) {
            Ok(p) => p,
            Err(_) => ent.path(),
        };
        if active.contains(&full) {
            continue;
        }
        let _ = fs::remove_file(ent.path());
    }
    let _ = fs::remove_dir(&dir);
}

fn is_run_conf_name(name: &str) -> bool {
    // /^run-.+\.conf$/
    name.starts_with("run-") && name.ends_with(".conf") && name.len() > "run-.conf".len()
}

/// Remove leftover `run-*.conf` (crash, failed spawn, etc.).
fn sweep_openfortivpn_config_dir() {
    let dir = openfortivpn_config_dir();
    if !dir.exists() {
        return;
    }
    let Ok(entries) = fs::read_dir(&dir) else {
        return;
    };
    for ent in entries.flatten() {
        let Ok(ft) = ent.file_type() else { continue };
        if !ft.is_file() {
            continue;
        }
        let name = ent.file_name();
        let name = name.to_string_lossy();
        if !is_run_conf_name(&name) {
            continue;
        }
        let _ = fs::remove_file(ent.path());
    }
    let _ = fs::remove_dir(&dir);
}

/// Stop every tracked openfortivpn and delete temp configs under TMPDIR/fortivpngui.
pub fn stop_every_and_sweep() {
    stop_every_openfortivpn_and_sweep_temp();
}

pub fn stop_every_openfortivpn_and_sweep_temp() {
    let names: Vec<String> = with_running(|running| running.keys().cloned().collect());
    for name in names {
        stop_openfortivpn(&name);
    }
    sweep_openfortivpn_config_dir();
}

pub fn stop_openfortivpn(name: &str) {
    let entry = with_running(|running| running.remove(name));
    let Some(entry) = entry else {
        return;
    };
    terminate_pid(entry.pid);
    let _ = fs::remove_file(&entry.config_path);
}

fn terminate_pid(pid: u32) {
    #[cfg(unix)]
    {
        // Match Electron `proc.kill("SIGTERM")` (Rust's Child::kill sends SIGKILL).
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }
    #[cfg(not(unix))]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status();
    }
}

/// Send one line to openfortivpn stdin (same as typing OTP at the terminal prompt).
pub fn write_openfortivpn_stdin_line(profile_name: &str, text: &str) -> bool {
    with_running(|running| {
        let Some(entry) = running.get(profile_name) else {
            return false;
        };
        let mut stdin_guard = entry.stdin.lock().unwrap_or_else(|e| e.into_inner());
        let Some(ref mut stdin) = *stdin_guard else {
            return false;
        };
        match writeln!(stdin, "{text}") {
            Ok(()) => stdin.flush().is_ok(),
            Err(_) => {
                *stdin_guard = None;
                false
            }
        }
    })
}

fn write_config_file(path: &Path, contents: &str) -> std::io::Result<()> {
    let mut opts = OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(path)?;
    f.write_all(contents.as_bytes())?;
    Ok(())
}

fn tunnel_up_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    if lower.contains("tunnel is up") {
        return true;
    }
    // /Interface .* is UP/i
    if let Some(idx) = lower.find("interface ") {
        let rest = &lower[idx + "interface ".len()..];
        if rest.contains(" is up") {
            return true;
        }
    }
    false
}

fn spawn_line_reader<R: std::io::Read + Send + 'static>(
    reader: R,
    profile_name: String,
    stream: &'static str,
    on_log: LogCallback,
    on_tunnel_up: Option<TunnelUpCallback>,
) {
    thread::spawn(move || {
        let mut buf = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            match buf.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim_end_matches(['\r', '\n']);
                    if trimmed.is_empty() {
                        continue;
                    }
                    let text = trimmed.to_string();
                    on_log(OpenfortivpnLog {
                        profile_name: profile_name.clone(),
                        line: text.clone(),
                        stream,
                    });
                    if tunnel_up_line(&text) {
                        if let Some(ref cb) = on_tunnel_up {
                            cb();
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn finish_wait(
    name: String,
    pid: u32,
    config_path: PathBuf,
    child: Child,
    on_exit: ExitCallback,
) {
    thread::spawn(move || {
        let mut child = child;
        let code = match child.wait() {
            Ok(status) => status.code(),
            Err(_) => None,
        };
        let should_notify = with_running(|running| {
            if let Some(entry) = running.get(&name) {
                if entry.pid == pid {
                    running.remove(&name);
                    return true;
                }
            }
            false
        });
        if should_notify {
            let _ = fs::remove_file(&config_path);
            on_exit(code);
        }
    });
}

pub fn start_openfortivpn(
    profile: &VpnProfile,
    password: &str,
    otp: Option<&str>,
    on_log: LogCallback,
    on_exit: ExitCallback,
    on_tunnel_up: Option<TunnelUpCallback>,
) {
    let name = profile.name.clone();
    if with_running(|r| r.contains_key(&name)) {
        stop_openfortivpn(&name);
    }

    let cfg_dir = openfortivpn_config_dir();
    if let Err(e) = fs::create_dir_all(&cfg_dir) {
        on_log(OpenfortivpnLog {
            profile_name: name.clone(),
            line: format!("spawn error: failed to create config dir: {e}"),
            stream: "stderr",
        });
        on_exit(None);
        return;
    }

    let config_path = cfg_dir.join(format!("run-{}-{}.conf", name, now_millis()));
    let mut built = build_openfortivpn_config(profile, password, otp);
    if let Err(e) = write_config_file(&config_path, &built.config) {
        on_log(OpenfortivpnLog {
            profile_name: name.clone(),
            line: format!("spawn error: failed to write config: {e}"),
            stream: "stderr",
        });
        on_exit(None);
        return;
    }

    let digests = parse_trusted_cert_digests(Some(&profile.trusted_cert));
    let raw_tc = profile.trusted_cert.trim();
    if !raw_tc.is_empty() && digests.is_empty() {
        on_log(OpenfortivpnLog {
            profile_name: name.clone(),
            line: "[fortivpngui] Trusted cert field has text but no valid 64-char hex SHA-256 digest was parsed.".to_string(),
            stream: "stderr",
        });
    }

    let mut args: Vec<String> = Vec::new();
    args.push("-c".to_string());
    args.push(config_path.to_string_lossy().into_owned());
    if profile.debug {
        args.push("-v".to_string());
    }
    if let Some(otp) = otp.filter(|s| !s.is_empty()) {
        args.push("--otp".to_string());
        args.push(otp.to_string());
    }

    /* `ifname` has no config-file key upstream, so it can only go on argv. */
    let ifname = profile.ifname.trim();
    if !ifname.is_empty() {
        if supports_cli_option("ifname") {
            args.push(format!("--ifname={ifname}"));
        } else {
            built.skipped.push("--ifname".to_string());
        }
    }
    let cookie = profile.cookie.trim();
    let use_cookie = !cookie.is_empty() && supports_cli_option("cookie-on-stdin");
    if !cookie.is_empty() && !use_cookie {
        built.skipped.push("--cookie-on-stdin".to_string());
    }
    if use_cookie {
        args.push("--cookie-on-stdin".to_string());
    }

    if !built.skipped.is_empty() {
        let v = detect_openfortivpn_version();
        let ver = v
            .as_ref()
            .map(|v| v.raw.as_str())
            .unwrap_or("(unknown version)");
        on_log(OpenfortivpnLog {
            profile_name: name.clone(),
            line: format!(
                "[fortivpngui] openfortivpn {ver} does not support these options, they were not applied: {}.",
                built.skipped.join(", ")
            ),
            stream: "stderr",
        });
    }

    let Some(bin) = resolve_openfortivpn_executable() else {
        on_log(OpenfortivpnLog {
            profile_name: name.clone(),
            line: "openfortivpn not found (install package or set OPENFORTIVPN_PATH)".to_string(),
            stream: "stderr",
        });
        let _ = fs::remove_file(&config_path);
        on_exit(None);
        return;
    };

    let sudo_preserve_env = read_main_settings()
        .map(|m| m.sudo_preserve_env)
        .unwrap_or(false);
    let mut sudo_args: Vec<String> = Vec::new();
    if sudo_preserve_env {
        sudo_args.push("-E".to_string());
    }
    sudo_args.push(bin);
    sudo_args.extend(args);

    let mut child = match Command::new("sudo")
        .args(&sudo_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(err) => {
            on_log(OpenfortivpnLog {
                profile_name: name.clone(),
                line: format!("spawn error: {err}"),
                stream: "stderr",
            });
            let _ = fs::remove_file(&config_path);
            on_exit(None);
            return;
        }
    };

    let mut stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let pid = child.id();

    /* `--cookie-on-stdin` reads one line; argv would expose the session cookie in the process list. */
    if use_cookie && !cookie.is_empty() {
        if let Some(ref mut stdin_ref) = stdin {
            if let Err(e) = writeln!(stdin_ref, "{cookie}").and_then(|_| stdin_ref.flush()) {
                on_log(OpenfortivpnLog {
                    profile_name: name.clone(),
                    line: format!("[fortivpngui] Failed to send the cookie on stdin: {e}"),
                    stream: "stderr",
                });
            }
        }
    }

    with_running(|running| {
        running.insert(
            name.clone(),
            RunningEntry {
                pid,
                stdin: Mutex::new(stdin),
                config_path: config_path.clone(),
            },
        );
    });

    if let Some(out) = stdout {
        spawn_line_reader(out, name.clone(), "stdout", on_log.clone(), on_tunnel_up.clone());
    }
    if let Some(err) = stderr {
        spawn_line_reader(err, name.clone(), "stderr", on_log.clone(), on_tunnel_up);
    }

    finish_wait(name, pid, config_path, child, on_exit);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_digests_dedup_and_prefix() {
        let d = parse_trusted_cert_digests(Some(
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, \
             AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        ));
        assert_eq!(d.len(), 1);
        assert_eq!(d[0], "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    }
}
