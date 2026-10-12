#![allow(dead_code)]

mod cert_tracker;
mod commands;
mod config;
mod crypto;
mod disconnect_reason;
mod groups;
mod import;
mod keychain;
mod log_window;
mod openfortivpn_caps;
mod openfortivpn_runner;
mod otp_detect;
mod profiles;
mod settings;
mod tray;
mod types;
mod vpn_file_logger;
mod vpn_service;

use tauri::{Manager, WindowEvent};

use commands::AppState;
use vpn_service::VpnService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let vpn = VpnService::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            commands::show_main_window(app);
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(vpn.clone()))
        .invoke_handler(tauri::generate_handler![
            commands::app_openfortivpn_path,
            commands::app_get_locale,
            commands::app_choose_directory,
            commands::app_open_logs_dir,
            commands::app_open_vpn_log,
            commands::vpn_log_clear,
            commands::profiles_list,
            commands::profiles_save,
            commands::profiles_delete,
            commands::groups_list,
            commands::groups_save,
            commands::groups_delete,
            commands::groups_duplicate,
            commands::settings_get,
            commands::settings_save,
            commands::settings_merge_openfortigui_main,
            commands::vpn_start,
            commands::vpn_stop,
            commands::vpn_status,
            commands::vpn_submit_fortigate_stdin_otp,
            commands::vpn_reset_otp_prompt,
            commands::vpn_trust_gateway_digest,
            commands::import_openfortigui,
            commands::changelog_mark_read,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            vpn.set_app_handle(handle.clone());

            if let Err(e) = settings::init_main_config() {
                eprintln!("[setup] init_main_config: {e}");
            }

            // Close-to-tray: intercept main window close.
            if let Some(win) = app.get_webview_window("main") {
                let vpn_for_close = vpn.clone();
                let handle_close = handle.clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = handle_close.get_webview_window("main") {
                            let _ = w.hide();
                        }
                        vpn_for_close.sweep_detached_vpn_temp_files();
                    }
                });

                // start_minimized + setupwizard + changelog already read → hide.
                if let Ok(s) = settings::read_main_settings() {
                    if s.start_minimized
                        && s.setupwizard
                        && s.changelogrev_read >= config::CHANGELOG_REV
                    {
                        let _ = win.hide();
                    }
                }
            }

            // Tray
            if let Err(e) = tray::build_tray(&handle) {
                eprintln!("[setup] tray: {e}");
            }

            let handle_tray = handle.clone();
            vpn.set_status_change_hook(Box::new(move || {
                tray::refresh_tray_menu(&handle_tray);
            }));

            if let Some(state) = app.try_state::<AppState>() {
                let handle_tray2 = handle.clone();
                if let Ok(mut g) = state.tray_refresh.lock() {
                    *g = Some(Box::new(move || {
                        tray::refresh_tray_menu(&handle_tray2);
                    }));
                }
            }

            // Autostart VPNs after a short delay (renderer may still be loading).
            let vpn_auto = vpn.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(800));
                run_autostart_vpns(&vpn_auto);
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building fortivpngui")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    state.vpn.cleanup_temp_files_on_quit();
                }
            }
        });
}

fn run_autostart_vpns(vpn: &VpnService) {
    let ofv = openfortivpn_caps::resolve_openfortivpn_executable();
    let Ok(profiles) = profiles::list_profiles() else {
        return;
    };
    let mut candidates: Vec<_> = profiles.into_iter().filter(|p| p.autostart).collect();
    candidates.sort_by(|a, b| a.name.cmp(&b.name));
    for p in candidates {
        if ofv.is_none() {
            eprintln!(
                "[autostart] Skipping Fortigate profile (openfortivpn not found): {}",
                p.name
            );
            continue;
        }
        if p.always_ask_otp {
            eprintln!(
                "[autostart] Skipping profile that requires interactive OTP: {}",
                p.name
            );
            continue;
        }
        if let Err(e) = vpn.start_vpn(&p.name, None) {
            eprintln!("[autostart] startVpn failed: {} — {e}", p.name);
        }
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
}
