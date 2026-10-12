//! Main config / settings (port of `electron/settings-service.ts`).

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use ini::Ini;

use crate::config::{paths, to_tilde, DEFAULT_AES_IV, DEFAULT_AES_KEY};
use crate::types::{LanguageSetting, MainSettings, MainSettingsPatch, ThemeMode};

pub use crate::config::expand_home;

fn ensure_dir(d: &Path) {
    let _ = fs::create_dir_all(d);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(d, fs::Permissions::from_mode(0o755));
    }
}

fn write_file_600(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| format!("open {}: {e}", path.display()))?;
        f.write_all(contents.as_bytes())
            .map_err(|e| format!("write {}: {e}", path.display()))?;
        f.sync_all()
            .map_err(|e| format!("sync {}: {e}", path.display()))?;
    }
    #[cfg(not(unix))]
    {
        fs::write(path, contents).map_err(|e| format!("write {}: {e}", path.display()))?;
    }
    Ok(())
}

pub(crate) fn ini_bool(v: Option<&str>) -> bool {
    match v {
        None => false,
        Some(s) => {
            let s = s.trim().to_ascii_lowercase();
            s == "true" || s == "1"
        }
    }
}

pub(crate) fn ini_get<'a>(section: Option<&'a ini::Properties>, key: &str) -> Option<&'a str> {
    section.and_then(|s| s.get(key))
}

fn parse_language_setting(raw: Option<&str>) -> LanguageSetting {
    let s = raw.unwrap_or("").trim().to_ascii_lowercase();
    match s.as_str() {
        "system" => LanguageSetting::System,
        "en" => LanguageSetting::En,
        "pt" => LanguageSetting::Pt,
        "es" => LanguageSetting::Es,
        "fr" => LanguageSetting::Fr,
        "it" => LanguageSetting::It,
        "de" => LanguageSetting::De,
        _ => LanguageSetting::System,
    }
}

fn parse_theme_mode(raw: Option<&str>) -> ThemeMode {
    let s = raw.unwrap_or("").trim().to_ascii_lowercase();
    match s.as_str() {
        "light" => ThemeMode::Light,
        "system" => ThemeMode::System,
        _ => ThemeMode::Dark,
    }
}

fn theme_mode_str(m: ThemeMode) -> &'static str {
    match m {
        ThemeMode::Dark => "dark",
        ThemeMode::Light => "light",
        ThemeMode::System => "system",
    }
}

fn language_str(l: LanguageSetting) -> &'static str {
    match l {
        LanguageSetting::System => "system",
        LanguageSetting::En => "en",
        LanguageSetting::Pt => "pt",
        LanguageSetting::Es => "es",
        LanguageSetting::Fr => "fr",
        LanguageSetting::It => "it",
        LanguageSetting::De => "de",
    }
}

fn default_main() -> MainSettings {
    MainSettings {
        debug: true,
        aeskey: DEFAULT_AES_KEY.to_string(),
        aesiv: DEFAULT_AES_IV.to_string(),
        start_minimized: false,
        setupwizard: false,
        changelogrev_read: 0,
        use_system_password_store: false,
        sudo_preserve_env: false,
        disallow_unsecure_certificates: false,
        globalvpnprofiles: to_tilde(&paths::global_profiles()),
        localvpnprofiles: to_tilde(&paths::local_profiles()),
        localvpngroups: to_tilde(&paths::local_groups()),
        logs: to_tilde(&paths::logs_dir()),
        disable_notifications: false,
        connect_on_dblclick: false,
        show_search: false,
        theme_mode: ThemeMode::Dark,
        language: LanguageSetting::System,
    }
}

fn bool_str(b: bool) -> &'static str {
    if b {
        "true"
    } else {
        "false"
    }
}

fn write_main_settings(s: &MainSettings) -> Result<(), String> {
    let mut conf = Ini::new();
    {
        let mut main = conf.with_section(Some("main"));
        main.set("debug", bool_str(s.debug));
        main.set("aeskey", &s.aeskey);
        main.set("aesiv", &s.aesiv);
        main.set("start_minimized", bool_str(s.start_minimized));
        main.set("setupwizard", bool_str(s.setupwizard));
        main.set("changelogrev_read", s.changelogrev_read.to_string());
        main.set(
            "use_system_password_store",
            bool_str(s.use_system_password_store),
        );
        main.set("sudo_preserve_env", bool_str(s.sudo_preserve_env));
        main.set(
            "disallow_unsecure_certificates",
            bool_str(s.disallow_unsecure_certificates),
        );
        main.set("show_search", bool_str(s.show_search));
    }
    {
        let mut p = conf.with_section(Some("paths"));
        p.set("globalvpnprofiles", &s.globalvpnprofiles);
        p.set("localvpnprofiles", &s.localvpnprofiles);
        p.set("localvpngroups", &s.localvpngroups);
        p.set("logs", &s.logs);
    }
    {
        let mut gui = conf.with_section(Some("gui"));
        gui.set("disable_notifications", bool_str(s.disable_notifications));
        gui.set("connect_on_dblclick", bool_str(s.connect_on_dblclick));
        gui.set("theme_mode", theme_mode_str(s.theme_mode));
        gui.set("language", language_str(s.language));
    }

    let mut buf = Vec::new();
    conf.write_to(&mut buf)
        .map_err(|e| format!("serialize main.conf: {e}"))?;
    let text = String::from_utf8(buf).map_err(|e| format!("utf8 main.conf: {e}"))?;
    write_file_600(&paths::main_conf(), &text)
}

pub fn init_main_config() -> Result<(), String> {
    let base = paths::base_dir();
    ensure_dir(&base);
    ensure_dir(&paths::local_profiles());
    ensure_dir(&paths::local_groups());
    ensure_dir(&paths::logs_dir());
    ensure_dir(&paths::vpn_logs_dir());

    let conf_path = paths::main_conf();
    if !conf_path.exists() {
        write_main_settings(&default_main())?;
    }
    Ok(())
}

pub fn read_main_settings() -> Result<MainSettings, String> {
    init_main_config()?;
    let conf = Ini::load_from_file(paths::main_conf())
        .map_err(|e| format!("read main.conf: {e}"))?;
    let main = conf.section(Some("main"));
    let p = conf.section(Some("paths"));
    let gui = conf.section(Some("gui"));
    let defaults = default_main();

    let changelogrev_read = ini_get(main, "changelogrev_read")
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);

    Ok(MainSettings {
        debug: ini_bool(ini_get(main, "debug")),
        aeskey: ini_get(main, "aeskey")
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_AES_KEY)
            .to_string(),
        aesiv: ini_get(main, "aesiv")
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_AES_IV)
            .to_string(),
        start_minimized: ini_bool(ini_get(main, "start_minimized")),
        setupwizard: ini_bool(ini_get(main, "setupwizard")),
        changelogrev_read,
        use_system_password_store: ini_bool(ini_get(main, "use_system_password_store")),
        sudo_preserve_env: ini_bool(ini_get(main, "sudo_preserve_env")),
        disallow_unsecure_certificates: ini_bool(ini_get(main, "disallow_unsecure_certificates")),
        globalvpnprofiles: ini_get(p, "globalvpnprofiles")
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or(defaults.globalvpnprofiles),
        localvpnprofiles: ini_get(p, "localvpnprofiles")
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or(defaults.localvpnprofiles),
        localvpngroups: ini_get(p, "localvpngroups")
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or(defaults.localvpngroups),
        logs: ini_get(p, "logs")
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or(defaults.logs),
        disable_notifications: ini_bool(ini_get(gui, "disable_notifications")),
        connect_on_dblclick: ini_bool(ini_get(gui, "connect_on_dblclick")),
        show_search: ini_bool(ini_get(main, "show_search")),
        theme_mode: parse_theme_mode(ini_get(gui, "theme_mode")),
        language: parse_language_setting(ini_get(gui, "language")),
    })
}

pub fn patch_main_settings(partial: MainSettingsPatch) -> Result<MainSettings, String> {
    let mut cur = read_main_settings()?;
    cur.apply_patch(partial);
    write_main_settings(&cur)?;
    Ok(cur)
}

fn parse_gw_cert_hashes(path: &Path) -> HashMap<String, String> {
    if !path.exists() {
        return HashMap::new();
    }
    let conf = match Ini::load_from_file(path) {
        Ok(c) => c,
        Err(_) => return HashMap::new(),
    };
    let mut map = HashMap::new();
    if let Some(sec) = conf.section(Some("gw_cert_hashes")) {
        for (k, v) in sec.iter() {
            map.insert(k.to_string(), v.to_string());
        }
    }
    map
}

pub fn read_gw_cert_cache() -> HashMap<String, String> {
    parse_gw_cert_hashes(&paths::gw_cert_cache())
}

/// OpenFortiGUI stores accepted gateway digests here when "Trust all gateway certs" is enabled.
pub fn read_openfortigui_gw_cert_cache() -> HashMap<String, String> {
    let p = paths::openfortigui_legacy().join("gw_cert.cache");
    parse_gw_cert_hashes(&p)
}

fn write_gw_cert_cache(map: &HashMap<String, String>) -> Result<(), String> {
    let mut conf = Ini::new();
    {
        let mut sec = conf.with_section(Some("gw_cert_hashes"));
        for (k, v) in map {
            sec.set(k.as_str(), v.as_str());
        }
    }
    let mut buf = Vec::new();
    conf.write_to(&mut buf)
        .map_err(|e| format!("serialize gw_cert.cache: {e}"))?;
    let text = String::from_utf8(buf).map_err(|e| format!("utf8 gw_cert.cache: {e}"))?;
    write_file_600(&paths::gw_cert_cache(), &text)
}

/// One entry per profile name (same semantics as OpenFortiGUI `saveGwCertCache`).
pub fn set_gw_cert_cache_entry(profile_name: &str, digest: &str) -> Result<(), String> {
    let d = digest.trim().to_ascii_lowercase();
    if d.len() != 64 || !d.chars().all(|c| c.is_ascii_hexdigit()) {
        return Ok(());
    }
    let mut map = read_gw_cert_cache();
    if map.get(profile_name).map(String::as_str) == Some(d.as_str()) {
        return Ok(());
    }
    map.insert(profile_name.to_string(), d);
    write_gw_cert_cache(&map)
}

/// Write a config file with mode `0o600` (shared by profile/group writers).
pub(crate) fn write_conf_file(path: &Path, conf: &Ini) -> Result<(), String> {
    let mut buf = Vec::new();
    conf.write_to(&mut buf)
        .map_err(|e| format!("serialize {}: {e}", path.display()))?;
    let text = String::from_utf8(buf).map_err(|e| format!("utf8 {}: {e}", path.display()))?;
    write_file_600(path, &text)
}

pub(crate) fn ensure_dir_pub(d: &Path) {
    ensure_dir(d);
}
