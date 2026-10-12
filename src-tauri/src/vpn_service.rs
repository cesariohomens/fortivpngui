//! VPN session orchestration: start/stop, logs, OTP, SAML, cert trust, traffic stats.
//! Faithful port of `electron/vpn-service.ts` for Tauri.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::cert_tracker;
use crate::disconnect_reason;
use crate::openfortivpn_runner as ofv;
use crate::profiles;
use crate::settings;
use crate::types::{VpnProfile, VpnStartCredentials, VpnTrafficStats};
use crate::vpn_file_logger;

const OTP_RECONNECT_DEBOUNCE_MS: u128 = 2000;

/// Connection lifecycle for one profile.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnState {
    Disconnected,
    Connecting,
    Connected,
}

impl Default for ConnState {
    fn default() -> Self {
        Self::Disconnected
    }
}

/// Result of whitelisting a gateway SHA-256 digest (`false` | `"profile"` | `"cache"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrustGatewayResult {
    NotSaved,
    Profile,
    Cache,
}

impl Serialize for TrustGatewayResult {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::NotSaved => serializer.serialize_bool(false),
            Self::Profile => serializer.serialize_str("profile"),
            Self::Cache => serializer.serialize_str("cache"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayCertPromptPayload {
    profile_name: String,
    digest: String,
    body: String,
}

#[derive(Debug, Clone, Serialize)]
struct NamedPayload {
    name: String,
}

#[derive(Debug, Clone, Serialize)]
struct StatusPayload {
    name: String,
    state: ConnState,
}

#[derive(Debug, Clone, Serialize)]
struct LogPayload {
    name: String,
    line: String,
    stream: String,
}

#[derive(Debug, Clone, Serialize)]
struct StatsPayload {
    name: String,
    stats: VpnTrafficStats,
}

#[derive(Debug, Clone, Serialize)]
struct SamlUrlPayload {
    name: String,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DisconnectWarningPayload {
    name: String,
    reason_key: String,
    detail: String,
    was_connected: bool,
}

struct VpnServiceInner {
    app: Option<AppHandle>,
    status: HashMap<String, ConnState>,
    stats: HashMap<String, VpnTrafficStats>,
    /// Per-profile traffic poll cancel flags.
    traffic_stop: HashMap<String, Arc<AtomicBool>>,
    status_change_hook: Option<Arc<dyn Fn() + Send + Sync>>,
    fortigate_stdin_otp_prompt_sent: HashSet<String>,
    saml_login_url_opened: HashSet<String>,
    otp_reconnect_cycle_debounced: HashMap<String, Instant>,
    trusted_digest_auto_saved: HashSet<String>,
}

/// Thread-safe VPN service shared via [`AppState`](crate::commands::AppState).
#[derive(Clone)]
pub struct VpnService {
    inner: Arc<Mutex<VpnServiceInner>>,
}

impl Default for VpnService {
    fn default() -> Self {
        Self::new()
    }
}

impl VpnService {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(VpnServiceInner {
                app: None,
                status: HashMap::new(),
                stats: HashMap::new(),
                traffic_stop: HashMap::new(),
                status_change_hook: None,
                fortigate_stdin_otp_prompt_sent: HashSet::new(),
                saml_login_url_opened: HashSet::new(),
                otp_reconnect_cycle_debounced: HashMap::new(),
                trusted_digest_auto_saved: HashSet::new(),
            })),
        }
    }

    pub fn set_app_handle(&self, app: AppHandle) {
        if let Ok(mut g) = self.inner.lock() {
            g.app = Some(app);
        }
    }

    pub fn set_status_change_hook(&self, cb: Box<dyn Fn() + Send + Sync>) {
        if let Ok(mut g) = self.inner.lock() {
            g.status_change_hook = Some(Arc::from(cb));
        }
    }

    pub fn get_vpn_status(&self, name: &str) -> ConnState {
        self.inner
            .lock()
            .map(|g| g.status.get(name).copied().unwrap_or(ConnState::Disconnected))
            .unwrap_or(ConnState::Disconnected)
    }

    pub fn reset_fortigate_otp_prompt(&self, profile_name: &str) {
        if let Ok(mut g) = self.inner.lock() {
            g.fortigate_stdin_otp_prompt_sent.remove(profile_name);
        }
    }

    pub fn submit_fortigate_stdin_otp(&self, profile_name: &str, otp: &str) -> bool {
        let t = otp.trim();
        if t.is_empty() {
            return false;
        }
        ofv::write_openfortivpn_stdin_line(profile_name, t)
    }

    pub fn trust_gateway_cert_digest(
        &self,
        profile_name: &str,
        digest: &str,
    ) -> TrustGatewayResult {
        let d = digest.trim().to_ascii_lowercase();
        if d.len() != 64 || !d.chars().all(|c| c.is_ascii_hexdigit()) {
            return TrustGatewayResult::NotSaved;
        }
        append_trusted_cert_digest_to_profile(profile_name, &d)
    }

    pub fn cleanup_temp_files_on_quit(&self) {
        if let Ok(g) = self.inner.lock() {
            for name in g.status.keys() {
                disconnect_reason::mark_user_initiated_stop(name);
            }
        }
        ofv::stop_every_openfortivpn_and_sweep_temp();
    }

    pub fn sweep_detached_vpn_temp_files(&self) {
        ofv::sweep_orphan_openfortivpn_configs();
    }

    pub fn stop_vpn(&self, profile_name: &str) {
        disconnect_reason::mark_user_initiated_stop(profile_name);
        if let Ok(mut g) = self.inner.lock() {
            g.fortigate_stdin_otp_prompt_sent.remove(profile_name);
            g.saml_login_url_opened.remove(profile_name);
        }
        ofv::stop_openfortivpn(profile_name);
        let prev = self.get_vpn_status(profile_name);
        self.set_status(profile_name, ConnState::Disconnected);
        self.clear_traffic_poll(profile_name);
        self.on_conn_state_change(profile_name, Some(prev), ConnState::Disconnected);
        self.emit_status(profile_name, ConnState::Disconnected);
    }

    pub fn start_vpn(
        &self,
        profile_name: &str,
        arg: Option<VpnStartArg>,
    ) -> Result<(), String> {
        let p = profiles::find_profile(profile_name)?
            .ok_or_else(|| "Profile not found".to_string())?;
        let cur = self.get_vpn_status(profile_name);
        if matches!(cur, ConnState::Connecting | ConnState::Connected) {
            return Ok(());
        }

        let opts = normalize_vpn_start_arg(arg);
        let saved_password = profiles::get_profile_password(profile_name, p.origin)?;
        let effective_password = opts
            .password
            .clone()
            .unwrap_or(saved_password);
        let effective_username = match &opts.username {
            Some(u) if !u.trim().is_empty() => u.trim().to_string(),
            Some(_) => p.username.clone(),
            None => p.username.clone(),
        };

        cert_tracker::reset_cert_failure_state(profile_name);
        disconnect_reason::reset_disconnect_tracking(profile_name);

        let prev = self.get_vpn_status(profile_name);
        self.set_status(profile_name, ConnState::Connecting);
        self.on_conn_state_change(profile_name, Some(prev), ConnState::Connecting);
        self.emit_status(profile_name, ConnState::Connecting);

        if let Ok(mut g) = self.inner.lock() {
            clear_trusted_auto_save_for_profile(&mut g, profile_name);
            g.fortigate_stdin_otp_prompt_sent.remove(profile_name);
            g.saml_login_url_opened.remove(profile_name);
        }

        let trusted_merged = effective_trusted_cert_field(&p);
        let otp_trim = opts.otp.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let (login_password, otp_arg) = if p.always_ask_otp {
            if let Some(otp) = otp_trim {
                (
                    format!("{effective_password},{otp}"),
                    Some(otp.to_string()),
                )
            } else {
                (effective_password, None)
            }
        } else {
            (effective_password, otp_trim.map(|s| s.to_string()))
        };

        let mut run_profile = p.clone();
        run_profile.username = effective_username;
        run_profile.password = String::new();
        run_profile.trusted_cert = trusted_merged;

        let otp_prompt = p.otp_prompt.clone();
        let svc = self.clone();
        let name_for_log = profile_name.to_string();
        let name_exit = profile_name.to_string();
        let name_up = profile_name.to_string();

        let on_log: ofv::LogCallback = Arc::new(move |ev: ofv::OpenfortivpnLog| {
            svc.process_fortigate_log_line(
                &ev.profile_name,
                &ev.line,
                ev.stream,
                Some(otp_prompt.as_str()).filter(|s| !s.is_empty()),
            );
            svc.emit(
                "vpn:log",
                LogPayload {
                    name: name_for_log.clone(),
                    line: ev.line,
                    stream: ev.stream.to_string(),
                },
            );
        });

        let svc_exit = self.clone();
        let on_exit: ofv::ExitCallback = Arc::new(move |_code| {
            let prev_s = svc_exit.get_vpn_status(&name_exit);
            svc_exit.set_status(&name_exit, ConnState::Disconnected);
            svc_exit.clear_traffic_poll(&name_exit);
            svc_exit.on_conn_state_change(&name_exit, Some(prev_s), ConnState::Disconnected);
            svc_exit.emit_status(&name_exit, ConnState::Disconnected);
        });

        let svc_up = self.clone();
        let on_tunnel_up: ofv::TunnelUpCallback = Arc::new(move || {
            let prev_s = svc_up.get_vpn_status(&name_up);
            svc_up.set_status(&name_up, ConnState::Connected);
            svc_up.on_conn_state_change(&name_up, Some(prev_s), ConnState::Connected);
            svc_up.emit_status(&name_up, ConnState::Connected);
        });

        ofv::start_openfortivpn(
            &run_profile,
            &login_password,
            otp_arg.as_deref(),
            on_log,
            on_exit,
            Some(on_tunnel_up),
        );
        Ok(())
    }

    fn set_status(&self, name: &str, state: ConnState) {
        if let Ok(mut g) = self.inner.lock() {
            g.status.insert(name.to_string(), state);
        }
    }

    fn emit_status(&self, name: &str, state: ConnState) {
        self.emit(
            "vpn:status",
            StatusPayload {
                name: name.to_string(),
                state,
            },
        );
    }

    fn emit<T: Serialize + Clone>(&self, event: &str, payload: T) {
        let app = self.inner.lock().ok().and_then(|g| g.app.clone());
        if let Some(app) = app {
            let _ = app.emit(event, payload);
        }
    }

    fn on_conn_state_change(&self, profile_name: &str, prev: Option<ConnState>, next: ConnState) {
        if prev == Some(next) {
            return;
        }
        if next == ConnState::Connected {
            self.maybe_notify_vpn("VPN connected", profile_name);
        }
        if next == ConnState::Disconnected
            && matches!(prev, Some(ConnState::Connected | ConnState::Connecting))
        {
            self.maybe_notify_vpn("VPN disconnected", profile_name);
            if let Some(p) = prev {
                self.maybe_warn_unexpected_disconnect(profile_name, p);
            }
        }
        let hook = self
            .inner
            .lock()
            .ok()
            .and_then(|g| g.status_change_hook.clone());
        if let Some(cb) = hook {
            cb();
        }
    }

    fn maybe_warn_unexpected_disconnect(&self, profile_name: &str, prev: ConnState) {
        if disconnect_reason::is_user_initiated_stop(profile_name) {
            disconnect_reason::reset_disconnect_tracking(profile_name);
            return;
        }
        let classified = disconnect_reason::classify_disconnect(profile_name);
        self.emit(
            "vpn:disconnect-warning",
            DisconnectWarningPayload {
                name: profile_name.to_string(),
                reason_key: classified.reason_key.as_str().to_string(),
                detail: classified.detail,
                was_connected: prev == ConnState::Connected,
            },
        );
        disconnect_reason::reset_disconnect_tracking(profile_name);
    }

    fn maybe_notify_vpn(&self, title: &str, body: &str) {
        let disable = settings::read_main_settings()
            .map(|s| s.disable_notifications)
            .unwrap_or(false);
        if disable {
            return;
        }
        let app = self.inner.lock().ok().and_then(|g| g.app.clone());
        let Some(app) = app else {
            return;
        };
        if !main_window_hidden(&app) {
            return;
        }
        let _ = notify_rust::Notification::new()
            .summary(title)
            .body(body)
            .show();
    }

    fn emit_stats(&self, profile_name: &str, next: VpnTrafficStats) {
        if let Ok(mut g) = self.inner.lock() {
            g.stats.insert(profile_name.to_string(), next.clone());
        }
        self.emit(
            "vpn:stats",
            StatsPayload {
                name: profile_name.to_string(),
                stats: next,
            },
        );
    }

    fn clear_traffic_poll(&self, profile_name: &str) {
        if let Ok(mut g) = self.inner.lock() {
            if let Some(flag) = g.traffic_stop.remove(profile_name) {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }

    fn start_traffic_poll(&self, profile_name: &str, iface: &str) {
        self.clear_traffic_poll(profile_name);
        let stop = Arc::new(AtomicBool::new(false));
        if let Ok(mut g) = self.inner.lock() {
            g.traffic_stop
                .insert(profile_name.to_string(), Arc::clone(&stop));
        }
        let svc = self.clone();
        let name = profile_name.to_string();
        let iface = iface.to_string();
        thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                if let Some(next) = read_interface_stats(&iface) {
                    svc.emit_stats(&name, next);
                }
                thread::sleep(Duration::from_secs(2));
            }
        });
    }

    fn begin_otp_reconnect_cycle(&self, profile_name: &str) {
        let Ok(mut g) = self.inner.lock() else {
            return;
        };
        let now = Instant::now();
        if let Some(last) = g.otp_reconnect_cycle_debounced.get(profile_name) {
            if now.duration_since(*last).as_millis() < OTP_RECONNECT_DEBOUNCE_MS {
                return;
            }
        }
        g.otp_reconnect_cycle_debounced
            .insert(profile_name.to_string(), now);
        g.fortigate_stdin_otp_prompt_sent.remove(profile_name);
        g.saml_login_url_opened.remove(profile_name);
    }

    fn maybe_emit_fortigate_stdin_otp_prompt(
        &self,
        profile_name: &str,
        line: &str,
        otp_prompt: Option<&str>,
    ) {
        if !otp_log_line_requests_token(line, otp_prompt) {
            return;
        }
        let Ok(mut g) = self.inner.lock() else {
            return;
        };
        if g.fortigate_stdin_otp_prompt_sent.contains(profile_name) {
            return;
        }
        g.fortigate_stdin_otp_prompt_sent
            .insert(profile_name.to_string());
        drop(g);
        self.emit(
            "vpn:fortigate-stdin-otp-prompt",
            NamedPayload {
                name: profile_name.to_string(),
            },
        );
    }

    fn maybe_open_saml_login_url(&self, profile_name: &str, line: &str) {
        let Some(url) = extract_saml_auth_url(line) else {
            return;
        };
        {
            let Ok(mut g) = self.inner.lock() else {
                return;
            };
            if g.saml_login_url_opened.contains(profile_name) {
                return;
            }
            g.saml_login_url_opened.insert(profile_name.to_string());
        }
        self.emit(
            "vpn:saml-login-url",
            SamlUrlPayload {
                name: profile_name.to_string(),
                url: url.clone(),
            },
        );
        if let Err(e) = open::that(&url) {
            self.emit(
                "vpn:log",
                LogPayload {
                    name: profile_name.to_string(),
                    line: format!(
                        "[fortivpngui] Could not open the SAML login page ({e}). Open it manually: {url}"
                    ),
                    stream: "stderr".into(),
                },
            );
        }
    }

    fn handle_gateway_cert_flush(&self, profile_name: &str, flush: cert_tracker::CertFailureFlush) {
        let main = settings::read_main_settings().ok();
        let disallow = main
            .as_ref()
            .map(|m| m.disallow_unsecure_certificates)
            .unwrap_or(false);

        if flush.parsed.is_none() {
            self.emit(
                "vpn:log",
                LogPayload {
                    name: profile_name.to_string(),
                    line: format!(
                        "[fortivpngui] Gateway certificate failure block ended but no --trusted-cert digest was found in the buffer ({} chars).",
                        flush.raw.len()
                    ),
                    stream: "stderr".into(),
                },
            );
            if disallow {
                let message = format!(
                    "Gateway certificate validation failed.\n\n{}",
                    flush.raw.chars().take(4000).collect::<String>()
                );
                show_gateway_cert_blocked(&message);
            }
            return;
        }

        let parsed = flush.parsed.unwrap();
        if disallow {
            let message = strip_whitelist_prompt_suffix(&parsed.body);
            show_gateway_cert_blocked(&message);
        } else {
            self.emit(
                "vpn:gateway-cert-prompt",
                GatewayCertPromptPayload {
                    profile_name: profile_name.to_string(),
                    digest: parsed.digest,
                    body: parsed.body,
                },
            );
        }
    }

    fn process_fortigate_log_line(
        &self,
        profile_name: &str,
        line: &str,
        stream: &str,
        otp_prompt: Option<&str>,
    ) {
        vpn_file_logger::append_vpn_log_line(profile_name, stream, line);
        disconnect_reason::record_disconnect_hint_line(profile_name, line);
        if is_openfortivpn_reconnect_cycle_line(line) {
            self.begin_otp_reconnect_cycle(profile_name);
        }
        self.maybe_open_saml_login_url(profile_name, line);
        self.maybe_emit_fortigate_stdin_otp_prompt(profile_name, line, otp_prompt);

        if let Some(iface) = extract_interface_up(line) {
            self.start_traffic_poll(profile_name, &iface);
        }

        if let Some(flush) = cert_tracker::feed_cert_failure_line(profile_name, line) {
            self.handle_gateway_cert_flush(profile_name, flush);
        }

        if cert_tracker::is_cert_failure_accumulating(profile_name) {
            return;
        }

        let Some(digest) = extract_digest_from_openfortivpn_trusted_hint(line) else {
            return;
        };
        let key = trusted_auto_save_key(profile_name, &digest);
        {
            let Ok(mut g) = self.inner.lock() else {
                return;
            };
            if g.trusted_digest_auto_saved.contains(&key) {
                return;
            }
            g.trusted_digest_auto_saved.insert(key.clone());
        }

        let svc = self.clone();
        let name = profile_name.to_string();
        thread::spawn(move || {
            let saved = append_trusted_cert_digest_to_profile(&name, &digest);
            match saved {
                TrustGatewayResult::Profile => {
                    svc.emit(
                        "vpn:log",
                        LogPayload {
                            name: name.clone(),
                            line: "[fortivpngui] trusted-cert saved to profile. Connect again."
                                .into(),
                            stream: "stderr".into(),
                        },
                    );
                }
                TrustGatewayResult::Cache => {
                    svc.emit(
                        "vpn:log",
                        LogPayload {
                            name: name.clone(),
                            line: "[fortivpngui] Gateway digest saved to ~/.fortivpngui/gw_cert.cache (Trust all). Connect again.".into(),
                            stream: "stderr".into(),
                        },
                    );
                }
                TrustGatewayResult::NotSaved => {
                    if let Ok(mut g) = svc.inner.lock() {
                        g.trusted_digest_auto_saved.remove(&key);
                    }
                }
            }
        });
    }
}

/// Start-arg mirroring Electron `string | VpnStartCredentials`.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(untagged)]
pub enum VpnStartArg {
    OtpOnly(String),
    Creds(VpnStartCredentials),
}

struct NormalizedStart {
    username: Option<String>,
    password: Option<String>,
    otp: Option<String>,
}

fn normalize_vpn_start_arg(input: Option<VpnStartArg>) -> NormalizedStart {
    match input {
        None => NormalizedStart {
            username: None,
            password: None,
            otp: None,
        },
        Some(VpnStartArg::OtpOnly(otp)) => NormalizedStart {
            username: None,
            password: None,
            otp: Some(otp),
        },
        Some(VpnStartArg::Creds(c)) => NormalizedStart {
            username: c.username,
            password: c.password,
            otp: c.otp,
        },
    }
}

fn main_window_hidden(app: &AppHandle) -> bool {
    let Some(win) = app.get_webview_window("main") else {
        return true;
    };
    let visible = win.is_visible().unwrap_or(true);
    let minimized = win.is_minimized().unwrap_or(false);
    !visible || minimized
}

fn show_gateway_cert_blocked(message: &str) {
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("Gateway certificate validation failed")
        .set_description(message)
        .show();
}

fn strip_whitelist_prompt_suffix(body: &str) -> String {
    let re =
        regex::Regex::new(r"(?i)\n\nAdd certificate to VPN-profile whitelist\?$").ok();
    if let Some(re) = re {
        re.replace(body, "").into_owned()
    } else {
        body.to_string()
    }
}

fn trusted_auto_save_key(profile_name: &str, digest: &str) -> String {
    format!("{profile_name}|{digest}")
}

fn clear_trusted_auto_save_for_profile(g: &mut VpnServiceInner, profile_name: &str) {
    let prefix = format!("{profile_name}|");
    g.trusted_digest_auto_saved
        .retain(|k| !k.starts_with(&prefix));
}

fn extract_digest_from_openfortivpn_trusted_hint(line: &str) -> Option<String> {
    let re = regex::Regex::new(
        r"(?i)--trusted-cert\s+([0-9a-fA-F]{64})\b|trusted-cert\s*=\s*([0-9a-fA-F]{64})\b",
    )
    .ok()?;
    if let Some(c) = re.captures(line) {
        let dig = c.get(1).or_else(|| c.get(2))?.as_str().to_ascii_lowercase();
        return Some(dig);
    }
    let lower = line.to_ascii_lowercase();
    if lower.contains("sha256 digest") && lower.contains("error") {
        let hex = regex::Regex::new(r"\b([0-9a-fA-F]{64})\b").ok()?;
        if let Some(m) = hex.find(line) {
            return Some(m.as_str().to_ascii_lowercase());
        }
    }
    None
}

fn append_trusted_cert_digest_to_profile(profile_name: &str, digest: &str) -> TrustGatewayResult {
    let Ok(Some(mut p)) = profiles::find_profile(profile_name) else {
        return TrustGatewayResult::NotSaved;
    };
    if p.trust_all_gw_certs {
        let cached = settings::read_gw_cert_cache()
            .get(profile_name)
            .map(|s| s.to_ascii_lowercase());
        if cached.as_deref() == Some(digest) {
            return TrustGatewayResult::NotSaved;
        }
        if settings::set_gw_cert_cache_entry(profile_name, digest).is_err() {
            return TrustGatewayResult::NotSaved;
        }
        return TrustGatewayResult::Cache;
    }
    let cur = ofv::parse_trusted_cert_digests(Some(&p.trusted_cert));
    if cur.iter().any(|d| d == digest) {
        return TrustGatewayResult::NotSaved;
    }
    let mut next = cur;
    next.push(digest.to_string());
    p.trusted_cert = next.join(" ");
    if profiles::save_profile_local(&p).is_err() {
        return TrustGatewayResult::NotSaved;
    }
    TrustGatewayResult::Profile
}

fn effective_trusted_cert_field(p: &VpnProfile) -> String {
    let from_profile = ofv::parse_trusted_cert_digests(Some(&p.trusted_cert));
    if !p.trust_all_gw_certs {
        return from_profile.join(" ");
    }
    let ours = settings::read_gw_cert_cache().get(&p.name).cloned();
    let legacy = settings::read_openfortigui_gw_cert_cache()
        .get(&p.name)
        .cloned();
    let joined = [
        Some(from_profile.join(" ")).filter(|s| !s.is_empty()),
        ours,
        legacy,
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ");
    ofv::parse_trusted_cert_digests(Some(&joined)).join(" ")
}

/// OpenFortiGUI `vpnlogger.cpp` OTP heuristics (custom prompt = regex or substring).
fn otp_log_line_requests_token(line: &str, custom_prompt: Option<&str>) -> bool {
    if let Some(raw) = custom_prompt.map(str::trim).filter(|s| !s.is_empty()) {
        if let Ok(re) = regex::RegexBuilder::new(raw)
            .case_insensitive(true)
            .build()
        {
            if re.is_match(line) {
                return true;
            }
        }
        return line.to_ascii_lowercase().contains(&raw.to_ascii_lowercase());
    }
    if regex::Regex::new(r"(?i)Please")
        .map(|r| r.is_match(line))
        .unwrap_or(false)
    {
        return true;
    }
    let patterns: &[&str] = &[
        r"(?i)2factor authentication token:",
        r"(?i)Two-factor authentication",
        r"(?i)one-time password",
        r"(?i)Please enter one-time password",
        r"(?i)Two-factor authentication token\s*:",
        r"(?i)enter (?:the |your )?(?:one[-\s]?time )?(?:password|token|code|pin|passcode)\b",
        r"(?i)second\s+factor|2[-\s]?FA|two[-\s]factor",
        r"(?i)SMS[-\s]?code|Authenticator",
        r"(?i)\b(?:challenge|verification)\s+code\b",
        r"(?i)\btoken\s*[:#>?)]",
        r"(?i)authentication key\s*:",
        r"(?i)verification code",
        r"(?i)soft[-\s]?token|hardware[-\s]?token",
    ];
    for p in patterns {
        if let Ok(re) = regex::Regex::new(p) {
            if re.is_match(line) {
                return true;
            }
        }
    }
    let has_otp = regex::Regex::new(r"(?i)\bOTP\b")
        .map(|r| r.is_match(line))
        .unwrap_or(false);
    let has_enter = regex::Regex::new(r"(?i)\b(?:enter|type|input|provide)\b")
        .map(|r| r.is_match(line))
        .unwrap_or(false);
    has_otp && has_enter
}

fn is_openfortivpn_reconnect_cycle_line(line: &str) -> bool {
    let pats: &[&str] = &[
        r"(?i)tunnel is down",
        r"(?i)got disconnected",
        r"(?i)sleeping \d+ seconds? before",
        r"(?i)\breconnecting\b",
        r"(?i)\bretrying\b",
        r"(?i)connection timed out",
    ];
    for p in pats {
        if let Ok(re) = regex::Regex::new(p) {
            if re.is_match(line) {
                return true;
            }
        }
    }
    false
}

fn extract_saml_auth_url(line: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?i)Authenticate at '(https?://[^']+)'").ok()?;
    re.captures(line)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

fn extract_interface_up(line: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?i)\bInterface\s+([^\s.]+)\s+is\s+UP\b").ok()?;
    re.captures(line)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

fn read_interface_stats(iface: &str) -> Option<VpnTrafficStats> {
    let raw = fs::read_to_string("/proc/net/dev").ok()?;
    for line in raw.lines() {
        let trimmed = line.trim();
        let Some((name, rest)) = trimmed.split_once(':') else {
            continue;
        };
        if name.trim() != iface {
            continue;
        }
        let cols: Vec<u64> = rest
            .split_whitespace()
            .filter_map(|x| x.parse().ok())
            .collect();
        if cols.len() >= 16 {
            return Some(VpnTrafficStats {
                bytes_read: cols[0],
                bytes_written: cols[8],
                vpn_start: None,
            });
        }
    }
    None
}
