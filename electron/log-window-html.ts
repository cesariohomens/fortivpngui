import fs from "fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { nativeTheme } from "electron";
import { readMainSettings } from "./settings-service.js";
import { themeTokensForMode, resolveThemeMode, type ThemeTokens } from "../shared/theme-tokens.js";

const nodeRequire = createRequire(__filename);

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function effectiveLogThemeTokens(): ThemeTokens {
  const settings = readMainSettings();
  return themeTokensForMode(settings.theme_mode, nativeTheme.shouldUseDarkColors);
}

function overlayScrollbarAssetHrefs(): { cssHref: string; jsHref: string } {
  const css = nodeRequire.resolve("overlayscrollbars/styles/overlayscrollbars.min.css");
  const js = nodeRequire.resolve("overlayscrollbars/browser/overlayscrollbars.browser.es6.min.js");
  return { cssHref: pathToFileURL(css).href, jsHref: pathToFileURL(js).href };
}

export function buildPlainTextLogHtml(profileName: string, filePath: string, tokens?: ThemeTokens): string {
  const t = tokens ?? effectiveLogThemeTokens();
  const resolved = resolveThemeMode(readMainSettings().theme_mode, nativeTheme.shouldUseDarkColors);
  const { cssHref, jsHref } = overlayScrollbarAssetHrefs();
  const content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : `No log file exists yet for profile "${profileName}".\n\nExpected path:\n${filePath}\n`;
  const title = `VPN Log - ${profileName}`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="${resolved}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' file:; script-src 'unsafe-inline' file:">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${cssHref}">
  <style>
    :root { --fvpn-scrollbar-thumb: ${t.outlineVariant}; }
    html, body { margin: 0; height: 100%; background: ${t.background}; color: ${t.onSurface}; color-scheme: ${resolved}; }
    body { display: flex; flex-direction: column; overflow: hidden; font-family: "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace; font-size: 12px; line-height: 1.55; }
    .os-theme-fvpn {
      --os-size: 6px;
      --os-padding-perpendicular: 2px;
      --os-padding-axis: 2px;
      --os-track-border-radius: 999px;
      --os-handle-border-radius: 999px;
      --os-handle-bg: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 70%, transparent);
      --os-handle-bg-hover: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 85%, transparent);
      --os-handle-bg-active: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 95%, transparent);
      --os-track-bg: transparent;
    }
    header { flex-shrink: 0; padding: 10px 14px; background: ${t.nav}; border-bottom: 1px solid ${t.outlineVariant}; font-family: Inter, "Segoe UI", sans-serif; }
    .log-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .log-head-text { min-width: 0; flex: 1; }
    header strong { display: block; color: ${t.primary}; font-size: 13px; }
    header span { display: block; margin-top: 2px; color: ${t.onSurfaceVariant}; font-size: 11px; overflow-wrap: anywhere; }
    #clearLog { flex-shrink: 0; margin-top: 2px; padding: 6px 12px; font-size: 12px; font-family: inherit; cursor: pointer; color: ${t.onSurface}; background: ${t.secondaryContainer}; border: 1px solid ${t.outlineVariant}; border-radius: 6px; }
    #clearLog:hover { filter: brightness(1.12); }
    #clearLog:disabled { opacity: 0.55; cursor: not-allowed; }
    #logScroll { flex: 1; min-height: 0; }
    pre { margin: 0; padding: 14px; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <header>
    <div class="log-head-row">
      <div class="log-head-text"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(filePath)}</span></div>
      <button type="button" id="clearLog" onclick="(function(){var b=document.getElementById('clearLog');if(!window.fvpnLogWindow)return;b.disabled=true;window.fvpnLogWindow.clearLogFile().finally(function(){b.disabled=false;});})()">Clear log</button>
    </div>
  </header>
  <div id="logScroll"><pre>${escapeHtml(content)}</pre></div>
  <script src="${jsHref}"></script>
  <script>
    (function () {
      var host = document.getElementById("logScroll");
      if (!host || typeof OverlayScrollbarsGlobal === "undefined") return;
      OverlayScrollbarsGlobal.OverlayScrollbars(host, {
        overflow: { x: "scroll", y: "scroll" },
        scrollbars: { theme: "os-theme-fvpn", autoHide: "leave", autoHideDelay: 600, clickScroll: true }
      });
    })();
  </script>
</body>
</html>`;
}
