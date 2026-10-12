//! System tray menu matching Electron `buildTray` / `refreshTrayMenu`.

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::commands::{show_main_window, AppState};
use crate::groups;
use crate::profiles;
use crate::vpn_service::ConnState;

const TRAY_ID: &str = "main";

pub fn build_tray(app: &AppHandle) -> Result<(), String> {
    let icon = load_tray_icon()?;
    let menu = build_menu(app)?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .tooltip("FortiVPN GUI")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                        if let Some(state) = app.try_state::<AppState>() {
                            state.vpn.sweep_detached_vpn_temp_files();
                        }
                    } else {
                        show_main_window(app);
                    }
                }
            }
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().as_ref());
        })
        .build(app)
        .map_err(|e| format!("tray: {e}"))?;

    Ok(())
}

fn load_tray_icon() -> Result<Image<'static>, String> {
    for cand in [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/icon.png",
        "icons/512x512.png",
    ] {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(cand);
        if path.exists() {
            if let Ok(bytes) = std::fs::read(&path) {
                if let Ok(img) = image_from_png_bytes(&bytes) {
                    return Ok(img);
                }
            }
        }
    }
    // 16×16 solid blue fallback
    let mut rgba = Vec::with_capacity(16 * 16 * 4);
    for _ in 0..(16 * 16) {
        rgba.extend_from_slice(&[0x00, 0x5e, 0xb8, 0xff]);
    }
    Ok(Image::new_owned(rgba, 16, 16))
}

fn image_from_png_bytes(bytes: &[u8]) -> Result<Image<'static>, String> {
    // Tauri Image::from_bytes expects PNG/ICO when image-png feature is on.
    Image::from_bytes(bytes)
        .map(|i| i.to_owned())
        .map_err(|e| format!("icon decode: {e}"))
}

pub fn refresh_tray_menu(app: &AppHandle) {
    let Ok(menu) = build_menu(app) else {
        return;
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let profiles_list = profiles::list_profiles().unwrap_or_default();
    let groups_list = groups::list_groups().unwrap_or_default();
    let state = app.try_state::<AppState>();

    let mut profile_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for p in &profiles_list {
        let status = state
            .as_ref()
            .map(|s| s.vpn.get_vpn_status(&p.name))
            .unwrap_or(ConnState::Disconnected);
        let active = matches!(status, ConnState::Connected | ConnState::Connecting);
        let label = format!(
            "{} {}",
            if active { "Disconnect" } else { "Connect" },
            p.name
        );
        let id = if active {
            format!("vpn-stop:{}", p.name)
        } else if p.always_ask_otp {
            format!("vpn-otp:{}", p.name)
        } else {
            format!("vpn-start:{}", p.name)
        };
        profile_items.push(
            MenuItem::with_id(app, &id, &label, true, None::<&str>)
                .map_err(|e| format!("menu item: {e}"))?,
        );
    }

    let empty_groups = MenuItem::with_id(app, "noop-groups", "No groups", false, None::<&str>)
        .map_err(|e| format!("menu: {e}"))?;

    // Per-group actions as flat items under VPN-Groups (Connect/Disconnect labeled with group name).
    let mut group_action_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for g in &groups_list {
        group_action_items.push(
            MenuItem::with_id(
                app,
                format!("group-connect:{}", g.name),
                format!("Connect all ({})", g.name),
                true,
                None::<&str>,
            )
            .map_err(|e| format!("menu: {e}"))?,
        );
        group_action_items.push(
            MenuItem::with_id(
                app,
                format!("group-disconnect:{}", g.name),
                format!("Disconnect all ({})", g.name),
                true,
                None::<&str>,
            )
            .map_err(|e| format!("menu: {e}"))?,
        );
    }

    let groups_sub = if groups_list.is_empty() {
        Submenu::with_items(app, "VPN-Groups", true, &[&empty_groups])
            .map_err(|e| format!("submenu: {e}"))?
    } else {
        let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = group_action_items
            .iter()
            .map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
            .collect();
        Submenu::with_items(app, "VPN-Groups", true, &refs)
            .map_err(|e| format!("submenu: {e}"))?
    };

    let show = MenuItem::with_id(app, "show-main", "Show mainwindow", true, None::<&str>)
        .map_err(|e| format!("menu: {e}"))?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)
        .map_err(|e| format!("menu: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit FortiVPN GUI", true, None::<&str>)
        .map_err(|e| format!("menu: {e}"))?;
    let sep = PredefinedMenuItem::separator(app).map_err(|e| format!("sep: {e}"))?;
    let sep2 = PredefinedMenuItem::separator(app).map_err(|e| format!("sep: {e}"))?;

    let mut refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = Vec::new();
    for it in &profile_items {
        refs.push(it);
    }
    if !profiles_list.is_empty() {
        refs.push(&sep);
    }
    refs.push(&groups_sub);
    refs.push(&sep2);
    refs.push(&show);
    refs.push(&settings_item);
    refs.push(&quit);

    Menu::with_items(app, &refs).map_err(|e| format!("menu: {e}"))
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };

    match id {
        "show-main" => show_main_window(app),
        "settings" => {
            show_main_window(app);
            let _ = app.emit("app:navigate", serde_json::json!({ "tab": 2 }));
        }
        "quit" => {
            state.vpn.cleanup_temp_files_on_quit();
            app.exit(0);
        }
        id if id.starts_with("vpn-start:") => {
            let name = id["vpn-start:".len()..].to_string();
            let vpn = state.vpn.clone();
            let app2 = app.clone();
            std::thread::spawn(move || {
                if let Err(e) = vpn.start_vpn(&name, None) {
                    eprintln!("[tray] start failed: {e}");
                }
                refresh_tray_menu(&app2);
            });
        }
        id if id.starts_with("vpn-otp:") => {
            let name = &id["vpn-otp:".len()..];
            show_main_window(app);
            let _ = app.emit("app:connect-profile", serde_json::json!({ "name": name }));
        }
        id if id.starts_with("vpn-stop:") => {
            state.vpn.stop_vpn(&id["vpn-stop:".len()..]);
            refresh_tray_menu(app);
        }
        id if id.starts_with("group-connect:") => {
            let gname = &id["group-connect:".len()..];
            if let Ok(list) = groups::list_groups() {
                if let Some(g) = list.iter().find(|x| x.name == gname) {
                    let mut names: Vec<String> = g
                        .local_members
                        .iter()
                        .chain(g.global_members.iter())
                        .cloned()
                        .collect();
                    names.sort();
                    names.dedup();
                    let vpn = state.vpn.clone();
                    let app2 = app.clone();
                    std::thread::spawn(move || {
                        for name in names {
                            let _ = vpn.start_vpn(&name, None);
                        }
                        refresh_tray_menu(&app2);
                    });
                }
            }
        }
        id if id.starts_with("group-disconnect:") => {
            let gname = &id["group-disconnect:".len()..];
            if let Ok(list) = groups::list_groups() {
                if let Some(g) = list.iter().find(|x| x.name == gname) {
                    let mut names: Vec<String> = g
                        .local_members
                        .iter()
                        .chain(g.global_members.iter())
                        .cloned()
                        .collect();
                    names.sort();
                    names.dedup();
                    for name in names {
                        state.vpn.stop_vpn(&name);
                    }
                    refresh_tray_menu(app);
                }
            }
        }
        _ => {}
    }
}
