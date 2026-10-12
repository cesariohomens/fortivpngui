//! Tauri command handlers mirroring Electron IPC channels.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::config::CHANGELOG_REV;
use crate::groups;
use crate::import::{self, ImportResult};
use crate::log_window;
use crate::openfortivpn_caps::resolve_openfortivpn_executable;
use crate::profiles;
use crate::settings::{self, expand_home};
use crate::types::{MainSettings, MainSettingsPatch, VpnGroup, VpnProfile};
use crate::vpn_service::{ConnState, TrustGatewayResult, VpnService, VpnStartArg};

pub struct AppState {
    pub vpn: VpnService,
    pub tray_refresh: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
}

impl AppState {
    pub fn new(vpn: VpnService) -> Self {
        Self {
            vpn,
            tray_refresh: Mutex::new(None),
        }
    }

    pub fn refresh_tray(&self) {
        if let Ok(g) = self.tray_refresh.lock() {
            if let Some(cb) = g.as_ref() {
                cb();
            }
        }
    }
}

fn err(e: impl ToString) -> String {
    e.to_string()
}

#[tauri::command]
pub fn app_openfortivpn_path() -> Option<String> {
    resolve_openfortivpn_executable()
}

#[tauri::command]
pub fn app_get_locale() -> String {
    sys_locale::get_locale().unwrap_or_else(|| "en-US".into())
}

#[tauri::command]
pub async fn app_choose_directory(
    app: AppHandle,
    initial_path: Option<String>,
) -> Result<Option<String>, String> {
    let default = initial_path
        .as_deref()
        .map(expand_home)
        .filter(|p| p.exists());

    let (tx, rx) = std::sync::mpsc::channel();
    let mut builder = app.dialog().file();
    if let Some(p) = default {
        builder = builder.set_directory(p);
    }
    builder.pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let folder = rx.recv().map_err(|e| err(e))?;
    Ok(folder.and_then(|fp| match fp {
        FilePath::Path(p) => Some(p.to_string_lossy().into_owned()),
        FilePath::Url(u) => u.to_file_path().ok().map(|p| p.to_string_lossy().into_owned()),
    }))
}

#[tauri::command]
pub fn app_open_logs_dir() -> Result<String, String> {
    let s = settings::read_main_settings()?;
    let path = expand_home(&s.logs);
    open::that(&path).map_err(|e| format!("open logs dir: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn app_open_vpn_log(app: AppHandle, name: String) -> Result<String, String> {
    log_window::open_plain_text_log_window(&app, &name)
}

#[tauri::command]
pub fn vpn_log_clear(app: AppHandle, name: String) -> Result<(), String> {
    log_window::clear_log_for_window(&app, &name)
}

#[tauri::command]
pub fn profiles_list() -> Result<Vec<VpnProfile>, String> {
    profiles::list_profiles()
}

#[tauri::command]
pub fn profiles_save(state: State<'_, AppState>, p: VpnProfile) -> Result<(), String> {
    profiles::save_profile_local(&p)?;
    state.refresh_tray();
    Ok(())
}

#[tauri::command]
pub fn profiles_delete(state: State<'_, AppState>, name: String) -> Result<bool, String> {
    let deleted = profiles::delete_profile_local(&name)?;
    state.refresh_tray();
    Ok(deleted)
}

#[tauri::command]
pub fn groups_list() -> Result<Vec<VpnGroup>, String> {
    groups::list_groups()
}

#[tauri::command]
pub fn groups_save(state: State<'_, AppState>, g: VpnGroup) -> Result<(), String> {
    groups::save_group(&g)?;
    state.refresh_tray();
    Ok(())
}

#[tauri::command]
pub fn groups_delete(state: State<'_, AppState>, name: String) -> Result<bool, String> {
    let deleted = groups::delete_group(&name)?;
    state.refresh_tray();
    Ok(deleted)
}

#[tauri::command]
pub fn groups_duplicate(state: State<'_, AppState>, name: String) -> Result<String, String> {
    let new_name = groups::duplicate_group(&name)?;
    state.refresh_tray();
    Ok(new_name)
}

#[tauri::command]
pub fn settings_get() -> Result<MainSettings, String> {
    settings::read_main_settings()
}

#[tauri::command]
pub fn settings_save(
    app: AppHandle,
    state: State<'_, AppState>,
    partial: MainSettingsPatch,
) -> Result<MainSettings, String> {
    let theme_changed = partial.theme_mode.is_some();
    let next = settings::patch_main_settings(partial)?;
    if theme_changed {
        let _ = log_window::reload_open_log_windows(&app);
    }
    state.refresh_tray();
    Ok(next)
}

#[tauri::command]
pub fn settings_merge_openfortigui_main() -> Result<Option<MainSettings>, String> {
    import::merge_openfortigui_main_into_fortivpngui()
}

#[tauri::command]
pub fn vpn_start(
    state: State<'_, AppState>,
    name: String,
    arg: Option<VpnStartArg>,
) -> Result<(), String> {
    state.vpn.start_vpn(&name, arg)?;
    state.refresh_tray();
    Ok(())
}

#[tauri::command]
pub fn vpn_stop(state: State<'_, AppState>, name: String) -> Result<(), String> {
    state.vpn.stop_vpn(&name);
    state.refresh_tray();
    Ok(())
}

#[tauri::command]
pub fn vpn_status(state: State<'_, AppState>, name: String) -> ConnState {
    state.vpn.get_vpn_status(&name)
}

#[tauri::command]
pub fn vpn_submit_fortigate_stdin_otp(
    state: State<'_, AppState>,
    profile_name: String,
    otp: String,
) -> bool {
    state.vpn.submit_fortigate_stdin_otp(&profile_name, &otp)
}

#[tauri::command]
pub fn vpn_reset_otp_prompt(state: State<'_, AppState>, profile_name: String) {
    state.vpn.reset_fortigate_otp_prompt(&profile_name);
}

#[tauri::command]
pub fn vpn_trust_gateway_digest(
    state: State<'_, AppState>,
    profile_name: String,
    digest: String,
) -> TrustGatewayResult {
    state.vpn.trust_gateway_cert_digest(&profile_name, &digest)
}

#[tauri::command]
pub fn import_openfortigui(state: State<'_, AppState>) -> Result<ImportResult, String> {
    let result = import::import_from_openfortigui()?;
    state.refresh_tray();
    Ok(result)
}

#[tauri::command]
pub fn changelog_mark_read() -> Result<(), String> {
    settings::patch_main_settings(MainSettingsPatch {
        changelogrev_read: Some(CHANGELOG_REV),
        ..Default::default()
    })?;
    Ok(())
}

/// Show / focus the main window (tray helper).
pub fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}
