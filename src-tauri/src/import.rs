//! OpenFortiGUI import (port of `electron/import-service.ts`).

use std::fs;
use std::path::Path;

use ini::Ini;
use serde::{Deserialize, Serialize};

use crate::config::paths;
use crate::settings::{ini_bool, ini_get, patch_main_settings};
use crate::types::{MainSettings, MainSettingsPatch};

fn read_openfortigui_main_partial() -> Option<MainSettingsPatch> {
    let conf_path = paths::openfortigui_legacy().join("main.conf");
    if !conf_path.exists() {
        return None;
    }
    let conf = Ini::load_from_file(&conf_path).ok()?;
    let main = conf.section(Some("main"));
    let gui = conf.section(Some("gui"));

    let mut out = MainSettingsPatch::default();
    let mut any = false;

    if ini_get(main, "disallow_unsecure_certificates").is_some() {
        out.disallow_unsecure_certificates =
            Some(ini_bool(ini_get(main, "disallow_unsecure_certificates")));
        any = true;
    }
    if ini_get(main, "show_search").is_some() {
        out.show_search = Some(ini_bool(ini_get(main, "show_search")));
        any = true;
    }
    if ini_get(main, "start_minimized").is_some() {
        out.start_minimized = Some(ini_bool(ini_get(main, "start_minimized")));
        any = true;
    }
    if ini_get(main, "sudo_preserve_env").is_some() {
        out.sudo_preserve_env = Some(ini_bool(ini_get(main, "sudo_preserve_env")));
        any = true;
    }
    if ini_get(gui, "disable_notifications").is_some() {
        out.disable_notifications = Some(ini_bool(ini_get(gui, "disable_notifications")));
        any = true;
    }
    if ini_get(gui, "connect_on_dblclick").is_some() {
        out.connect_on_dblclick = Some(ini_bool(ini_get(gui, "connect_on_dblclick")));
        any = true;
    }

    if any {
        Some(out)
    } else {
        None
    }
}

/// Merge trivially mappable keys from OpenFortiGUI main.conf into fortivpngui main.conf.
pub fn merge_openfortigui_main_into_fortivpngui() -> Result<Option<MainSettings>, String> {
    let Some(partial) = read_openfortigui_main_partial() else {
        return Ok(None);
    };
    Ok(Some(patch_main_settings(partial)?))
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub profiles_copied: u32,
    pub groups_copied: u32,
    pub errors: Vec<String>,
}

fn copy_conf_dir(src: &Path, dest: &Path, label: &str, errors: &mut Vec<String>) -> u32 {
    let mut copied = 0u32;
    if !src.exists() {
        return 0;
    }
    if let Err(e) = fs::create_dir_all(dest) {
        errors.push(format!("{label} dest mkdir: {e}"));
        return 0;
    }
    let entries = match fs::read_dir(src) {
        Ok(e) => e,
        Err(e) => {
            errors.push(format!("{label} readdir: {e}"));
            return 0;
        }
    };
    for ent in entries {
        let ent = match ent {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("{label} entry: {e}"));
                continue;
            }
        };
        let path = ent.path();
        if path.extension().and_then(|e| e.to_str()) != Some("conf") {
            continue;
        }
        let file_name = match path.file_name() {
            Some(n) => n,
            None => continue,
        };
        let dest_file = dest.join(file_name);
        match fs::copy(&path, &dest_file) {
            Ok(_) => copied += 1,
            Err(e) => {
                let name = file_name.to_string_lossy();
                errors.push(format!("{label} {name}: {e}"));
            }
        }
    }
    copied
}

pub fn import_from_openfortigui() -> Result<ImportResult, String> {
    if let Some(ofg_main) = read_openfortigui_main_partial() {
        let keys: Vec<&str> = [
            ofg_main.disallow_unsecure_certificates.map(|_| "disallow_unsecure_certificates"),
            ofg_main.show_search.map(|_| "show_search"),
            ofg_main.start_minimized.map(|_| "start_minimized"),
            ofg_main.sudo_preserve_env.map(|_| "sudo_preserve_env"),
            ofg_main.disable_notifications.map(|_| "disable_notifications"),
            ofg_main.connect_on_dblclick.map(|_| "connect_on_dblclick"),
        ]
        .into_iter()
        .flatten()
        .collect();
        patch_main_settings(ofg_main)?;
        eprintln!(
            "[import] Merged OpenFortiGUI main.conf keys: {}",
            keys.join(", ")
        );
    }

    let mut result = ImportResult::default();
    let legacy = paths::openfortigui_legacy();
    if !legacy.exists() {
        result
            .errors
            .push(format!("Legacy directory not found: {}", legacy.display()));
        return Ok(result);
    }

    result.profiles_copied = copy_conf_dir(
        &legacy.join("vpnprofiles"),
        &paths::local_profiles(),
        "Profile",
        &mut result.errors,
    );
    result.groups_copied = copy_conf_dir(
        &legacy.join("vpngroups"),
        &paths::local_groups(),
        "Group",
        &mut result.errors,
    );

    Ok(result)
}
