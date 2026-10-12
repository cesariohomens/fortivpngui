//! Paths and shared constants (port of `electron/config.ts`).

use std::path::{Path, PathBuf};

/// Bump when changelog content changes (shown until user marks read). Keep in sync with `shared/constants.ts`.
pub const CHANGELOG_REV: u32 = 13;

pub const DEFAULT_AES_KEY: &str = "yowp2IwTTRodgdWp";
pub const DEFAULT_AES_IV: &str = "VoUT5n5ToogkmQU3";

/// Letters (incl. äöüÄÖÜ), digits, space, `-`, `_`; minimum length 3.
pub fn is_valid_name(name: &str) -> bool {
    let mut len = 0usize;
    for c in name.chars() {
        len += 1;
        let ok = c.is_ascii_alphanumeric()
            || c == ' '
            || c == '-'
            || c == '_'
            || matches!(c, 'ä' | 'ö' | 'ü' | 'Ä' | 'Ö' | 'Ü');
        if !ok {
            return false;
        }
    }
    len >= 3
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

pub fn expand_home(p: &str) -> PathBuf {
    if p == "~" {
        return home_dir();
    }
    if let Some(rest) = p.strip_prefix("~/") {
        return home_dir().join(rest);
    }
    PathBuf::from(p)
}

pub fn to_tilde(abs: &Path) -> String {
    let h = home_dir();
    if let Ok(rest) = abs.strip_prefix(&h) {
        let s = rest.to_string_lossy();
        if s.is_empty() {
            "~".to_string()
        } else {
            format!("~/{s}")
        }
    } else {
        abs.to_string_lossy().into_owned()
    }
}

pub mod paths {
    use super::{expand_home, home_dir};
    use std::path::PathBuf;

    /// Override with `FORTIVPNGUI_CONFIG_DIR` for tests (isolated from `~/.fortivpngui`).
    pub fn base_dir() -> PathBuf {
        if let Ok(v) = std::env::var("FORTIVPNGUI_CONFIG_DIR") {
            let t = v.trim();
            if !t.is_empty() {
                return PathBuf::from(t);
            }
        }
        home_dir().join(".fortivpngui")
    }

    pub fn main_conf() -> PathBuf {
        base_dir().join("main.conf")
    }

    pub fn gw_cert_cache() -> PathBuf {
        base_dir().join("gw_cert.cache")
    }

    pub fn local_profiles() -> PathBuf {
        base_dir().join("vpnprofiles")
    }

    pub fn global_profiles() -> PathBuf {
        PathBuf::from("/etc/fortivpngui/vpnprofiles")
    }

    pub fn local_groups() -> PathBuf {
        base_dir().join("vpngroups")
    }

    pub fn logs_dir() -> PathBuf {
        base_dir().join("logs")
    }

    pub fn vpn_logs_dir() -> PathBuf {
        base_dir().join("logs").join("vpn")
    }

    pub fn openfortigui_legacy() -> PathBuf {
        home_dir().join(".openfortigui")
    }

    /// Expand a tilde path from settings (convenience for callers).
    pub fn expand(p: &str) -> PathBuf {
        expand_home(p)
    }
}
