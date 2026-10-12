//! Shared types for the Tauri backend (port of `shared/types.ts`).

use serde::{Deserialize, Serialize};

/// UI colour scheme (`gui/theme_mode` in main.conf).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Dark,
    Light,
    System,
}

impl Default for ThemeMode {
    fn default() -> Self {
        Self::Dark
    }
}

/// Stored in `gui/language` — `system` follows the OS locale.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageSetting {
    System,
    En,
    Pt,
    Es,
    Fr,
    It,
    De,
}

impl Default for LanguageSetting {
    fn default() -> Self {
        Self::System
    }
}

/// Optional connect-time credentials (not stored on the profile).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VpnStartCredentials {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub otp: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VpnTrafficStats {
    pub bytes_read: u64,
    pub bytes_written: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vpn_start: Option<u64>,
}

/// VPN profile — field names are snake_case to match the TypeScript `VpnProfile` / frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VpnProfile {
    pub name: String,
    pub origin: ProfileOrigin,
    pub gateway_host: String,
    pub gateway_port: u16,
    pub username: String,
    pub password: String,
    /// openfortivpn `--cookie-on-stdin`: SVPNCOOKIE used instead of username/password.
    pub cookie: String,
    /// openfortivpn `pinentry` (>= 1.10.0).
    pub pinentry: String,
    /// openfortivpn `saml-login` (>= 1.23.0).
    pub saml_login: bool,
    /// Local port for SAML redirect; 0 uses upstream default of 8020.
    pub saml_port: u16,
    pub realm: String,
    pub set_routes: bool,
    pub set_dns: bool,
    pub half_internet_routers: bool,
    /// `default` leaves upstream's choice, otherwise `1` or `0`.
    pub use_resolvconf: String,
    pub ifname: String,
    /// Seconds between reconnect attempts; 0 disables.
    pub persistent: u32,
    pub ca_file: String,
    pub user_cert: String,
    pub user_key: String,
    pub pem_passphrase: String,
    pub trusted_cert: String,
    pub debug: bool,
    pub autostart: bool,
    pub always_ask_otp: bool,
    pub otp_prompt: String,
    pub otp_delay: u32,
    pub no_ftm_push: bool,
    pub pppd_use_peerdns: bool,
    pub pppd_accept_remote: bool,
    pub pppd_log_file: String,
    pub pppd_plugin_file: String,
    pub pppd_ifname: String,
    pub pppd_ipparam: String,
    pub pppd_call: String,
    pub insecure_ssl: bool,
    pub seclevel1: bool,
    pub min_tls: String,
    pub cipher_list: String,
    pub sni: String,
    pub user_agent: String,
    pub hostcheck: String,
    pub check_virtual_desktop: String,
    pub trust_all_gw_certs: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileOrigin {
    Local,
    Global,
}

impl ProfileOrigin {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Global => "global",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnGroup {
    pub name: String,
    pub local_members: Vec<String>,
    pub global_members: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MainSettings {
    pub debug: bool,
    pub aeskey: String,
    pub aesiv: String,
    pub start_minimized: bool,
    pub setupwizard: bool,
    pub changelogrev_read: u32,
    pub use_system_password_store: bool,
    pub sudo_preserve_env: bool,
    /// When true, insecure certificate options are hidden in the UI.
    pub disallow_unsecure_certificates: bool,
    pub globalvpnprofiles: String,
    pub localvpnprofiles: String,
    pub localvpngroups: String,
    pub logs: String,
    pub disable_notifications: bool,
    pub connect_on_dblclick: bool,
    pub show_search: bool,
    pub theme_mode: ThemeMode,
    pub language: LanguageSetting,
}

/// Partial update for `patch_main_settings` (mirrors TypeScript `Partial<MainSettings>`).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct MainSettingsPatch {
    pub debug: Option<bool>,
    pub aeskey: Option<String>,
    pub aesiv: Option<String>,
    pub start_minimized: Option<bool>,
    pub setupwizard: Option<bool>,
    pub changelogrev_read: Option<u32>,
    pub use_system_password_store: Option<bool>,
    pub sudo_preserve_env: Option<bool>,
    pub disallow_unsecure_certificates: Option<bool>,
    pub globalvpnprofiles: Option<String>,
    pub localvpnprofiles: Option<String>,
    pub localvpngroups: Option<String>,
    pub logs: Option<String>,
    pub disable_notifications: Option<bool>,
    pub connect_on_dblclick: Option<bool>,
    pub show_search: Option<bool>,
    pub theme_mode: Option<ThemeMode>,
    pub language: Option<LanguageSetting>,
}

impl MainSettings {
    pub fn apply_patch(&mut self, p: MainSettingsPatch) {
        macro_rules! apply {
            ($field:ident) => {
                if let Some(v) = p.$field {
                    self.$field = v;
                }
            };
        }
        apply!(debug);
        apply!(aeskey);
        apply!(aesiv);
        apply!(start_minimized);
        apply!(setupwizard);
        apply!(changelogrev_read);
        apply!(use_system_password_store);
        apply!(sudo_preserve_env);
        apply!(disallow_unsecure_certificates);
        apply!(globalvpnprofiles);
        apply!(localvpnprofiles);
        apply!(localvpngroups);
        apply!(logs);
        apply!(disable_notifications);
        apply!(connect_on_dblclick);
        apply!(show_search);
        apply!(theme_mode);
        apply!(language);
    }
}
