//! Plain-text VPN log viewer windows (port of Electron `openPlainTextLogWindow`).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::config::expand_home;
use crate::settings::read_main_settings;
use crate::types::ThemeMode;

struct ThemeColors {
    background: &'static str,
    on_surface: &'static str,
    on_surface_variant: &'static str,
    outline_variant: &'static str,
    nav: &'static str,
    primary: &'static str,
    secondary_container: &'static str,
}

/// Matches `shared/theme-tokens.ts` `darkTokens` (subset used by the log window).
const DARK: ThemeColors = ThemeColors {
    background: "#131313",
    on_surface: "#e5e2e1",
    on_surface_variant: "#c1c6d5",
    outline_variant: "#414753",
    nav: "#001c3a",
    primary: "#a7c8ff",
    secondary_container: "#2f486a",
};

/// Matches `shared/theme-tokens.ts` `lightTokens`.
const LIGHT: ThemeColors = ThemeColors {
    background: "#f4f6fa",
    on_surface: "#1a1d24",
    on_surface_variant: "#5c6478",
    outline_variant: "#c8d0de",
    nav: "#e8f0fb",
    primary: "#005eb8",
    secondary_container: "#d6e4f5",
};

static OPEN_LOG_WINDOWS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn with_windows<R>(f: impl FnOnce(&mut HashMap<String, String>) -> R) -> R {
    let mut guard = OPEN_LOG_WINDOWS
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    f(guard.as_mut().unwrap())
}

fn safe_profile_segment(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if out.len() >= 120 {
            break;
        }
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

fn vpn_logs_base_dir() -> PathBuf {
    let logs = read_main_settings()
        .map(|m| m.logs)
        .unwrap_or_default();
    let raw = logs.trim();
    let base = if raw.is_empty() {
        crate::config::paths::logs_dir()
    } else {
        expand_home(raw)
    };
    base.join("vpn")
}

fn vpn_log_file_path(profile_name: &str) -> PathBuf {
    vpn_logs_base_dir().join(format!("{}.log", safe_profile_segment(profile_name)))
}

fn is_path_under_vpn_logs_dir(abs_path: &Path) -> bool {
    let base = match vpn_logs_base_dir().canonicalize() {
        Ok(b) => b,
        Err(_) => vpn_logs_base_dir(),
    };
    let resolved = abs_path
        .canonicalize()
        .unwrap_or_else(|_| abs_path.to_path_buf());
    resolved.starts_with(&base)
}

fn escape_html(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn prefers_dark_from_settings(mode: ThemeMode) -> (&'static str, ThemeColors) {
    match mode {
        ThemeMode::Light => ("light", LIGHT),
        ThemeMode::Dark | ThemeMode::System => ("dark", DARK),
    }
}

fn build_plain_text_log_html(profile_name: &str, file_path: &Path) -> String {
    let theme_mode = read_main_settings()
        .map(|m| m.theme_mode)
        .unwrap_or_default();
    let (scheme, t) = prefers_dark_from_settings(theme_mode);
    let content = if file_path.exists() {
        fs::read_to_string(file_path).unwrap_or_else(|e| format!("(failed to read log: {e})\n"))
    } else {
        format!(
            "No log file exists yet for profile \"{profile_name}\".\n\nExpected path:\n{}\n",
            file_path.display()
        )
    };
    let title = format!("VPN Log - {profile_name}");
    let file_disp = file_path.display().to_string();
    format!(
        r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="{scheme}">
  <title>{title}</title>
  <style>
    html, body {{ margin: 0; height: 100%; background: {bg}; color: {on}; color-scheme: {scheme}; }}
    body {{ display: flex; flex-direction: column; overflow: hidden;
      font-family: "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      font-size: 12px; line-height: 1.55; }}
    header {{ flex-shrink: 0; padding: 10px 14px; background: {nav}; border-bottom: 1px solid {outline}; }}
    .log-head-row {{ display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }}
    .log-head-text {{ min-width: 0; flex: 1; }}
    header strong {{ display: block; color: {primary}; font-size: 13px; font-family: Inter, "Segoe UI", sans-serif; }}
    header span {{ display: block; margin-top: 2px; color: {on_var}; font-size: 11px; overflow-wrap: anywhere;
      font-family: Inter, "Segoe UI", sans-serif; }}
    #clearLog {{ flex-shrink: 0; margin-top: 2px; padding: 6px 12px; font-size: 12px; font-family: inherit;
      cursor: pointer; color: {on}; background: {sec}; border: 1px solid {outline}; border-radius: 6px; }}
    #clearLog:hover {{ filter: brightness(1.12); }}
    #logScroll {{ flex: 1; min-height: 0; overflow: auto; }}
    pre {{ margin: 0; padding: 14px; white-space: pre-wrap; word-break: break-word; }}
  </style>
</head>
<body>
  <header>
    <div class="log-head-row">
      <div class="log-head-text"><strong>{title_esc}</strong><span>{path_esc}</span></div>
      <button type="button" id="clearLog" onclick="window.__TAURI__&&window.__TAURI__.core&&window.__TAURI__.core.invoke('vpn_log_clear',{{name:'{name_js}'}})">Clear log</button>
    </div>
  </header>
  <div id="logScroll"><pre>{body}</pre></div>
</body>
</html>"#,
        scheme = scheme,
        bg = t.background,
        on = t.on_surface,
        nav = t.nav,
        outline = t.outline_variant,
        primary = t.primary,
        on_var = t.on_surface_variant,
        sec = t.secondary_container,
        title = escape_html(&title),
        title_esc = escape_html(&title),
        path_esc = escape_html(&file_disp),
        name_js = escape_html(profile_name).replace('\\', "\\\\"),
        body = escape_html(&content),
    )
}

fn window_label_for_profile(profile_name: &str) -> String {
    format!("vpn-log-{}", safe_profile_segment(profile_name))
}

fn write_log_html_to_temp(profile_name: &str, file_path: &Path) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!(
        "fortivpngui-log-{}",
        safe_profile_segment(profile_name)
    ));
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir log temp: {e}"))?;
    let html = build_plain_text_log_html(profile_name, file_path);
    let out = dir.join("index.html");
    fs::write(&out, html).map_err(|e| format!("write log html: {e}"))?;
    Ok(out)
}

/// Open (or focus) a themed plain-text log window for `profile_name`.
/// Returns the absolute path of the log file on disk.
pub fn open_plain_text_log_window(app: &AppHandle, profile_name: &str) -> Result<String, String> {
    let file_path = vpn_log_file_path(profile_name);
    let file_path_str = file_path.to_string_lossy().into_owned();
    let title = format!("VPN Log - {profile_name}");
    let label = window_label_for_profile(profile_name);
    let html_path = write_log_html_to_temp(profile_name, &file_path)?;
    let file_url =
        url::Url::from_file_path(&html_path).map_err(|_| "invalid log html path".to_string())?;
    let webview_url = WebviewUrl::External(file_url.clone());

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.navigate(file_url);
        let _ = existing.set_title(&title);
        let _ = existing.show();
        let _ = existing.set_focus();
        with_windows(|m| {
            m.insert(file_path_str.clone(), label.clone());
        });
        return Ok(file_path_str);
    }

    WebviewWindowBuilder::new(app, &label, webview_url)
        .title(&title)
        .inner_size(920.0, 680.0)
        .build()
        .map_err(|e| format!("open log window: {e}"))?;

    with_windows(|m| {
        m.insert(file_path_str.clone(), label);
    });
    Ok(file_path_str)
}

/// Reload HTML for every open VPN log window (e.g. after theme change).
pub fn reload_open_log_windows(app: &AppHandle) -> Result<(), String> {
    let entries: Vec<(String, String)> = with_windows(|m| {
        m.iter()
            .map(|(path, label)| (path.clone(), label.clone()))
            .collect()
    });
    for (file_path_str, label) in entries {
        let Some(win) = app.get_webview_window(&label) else {
            continue;
        };
        let profile_name = label
            .strip_prefix("vpn-log-")
            .unwrap_or("unknown")
            .to_string();
        let file_path = PathBuf::from(&file_path_str);
        let html_path = write_log_html_to_temp(&profile_name, &file_path)?;
        let file_url = url::Url::from_file_path(&html_path)
            .map_err(|_| "invalid log html path".to_string())?;
        let _ = win.navigate(file_url);
    }
    Ok(())
}

/// Truncate the VPN log file for `profile_name` and reload an open log window if present.
pub fn clear_log_for_window(app: &AppHandle, profile_name: &str) -> Result<(), String> {
    let file_path = vpn_log_file_path(profile_name);
    if !is_path_under_vpn_logs_dir(&file_path) && file_path.exists() {
        return Err("clear rejected: path outside vpn logs dir".into());
    }
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        use std::io::Write;
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&file_path)
            .map_err(|e| format!("truncate log: {e}"))?;
        f.write_all(b"").map_err(|e| format!("truncate log: {e}"))?;
    }
    #[cfg(not(unix))]
    {
        fs::write(&file_path, "").map_err(|e| format!("truncate log: {e}"))?;
    }

    let label = window_label_for_profile(profile_name);
    if let Some(win) = app.get_webview_window(&label) {
        let html_path = write_log_html_to_temp(profile_name, &file_path)?;
        let file_url = url::Url::from_file_path(&html_path)
            .map_err(|_| "invalid log html path".to_string())?;
        let _ = win.navigate(file_url);
    }
    Ok(())
}
