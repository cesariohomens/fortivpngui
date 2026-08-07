import fs from "fs";
import { nativeTheme } from "electron";
import { readMainSettings } from "./settings-service.js";
import { themeTokensForMode, resolveThemeMode, type ThemeTokens } from "../shared/theme-tokens.js";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function effectiveLogThemeTokens(): ThemeTokens {
  const settings = readMainSettings();
  return themeTokensForMode(settings.theme_mode, nativeTheme.shouldUseDarkColors);
}

export function buildPlainTextLogHtml(profileName: string, filePath: string, tokens?: ThemeTokens): string {
  const t = tokens ?? effectiveLogThemeTokens();
  const resolved = resolveThemeMode(readMainSettings().theme_mode, nativeTheme.shouldUseDarkColors);
  const content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : `No log file exists yet for profile "${profileName}".\n\nExpected path:\n${filePath}\n`;
  const title = `VPN Log - ${profileName}`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="${resolved}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: ${t.background}; color: ${t.onSurface}; color-scheme: ${resolved}; scrollbar-color: ${t.outlineVariant} ${t.surfaceLowest}; scrollbar-width: thin; }
    body { font-family: "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace; font-size: 12px; line-height: 1.55; }
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-track { background: ${t.surfaceLowest}; }
    *::-webkit-scrollbar-thumb { background-color: ${t.outlineVariant}; border-radius: 8px; border: 2px solid ${t.surfaceLowest}; }
    *::-webkit-scrollbar-thumb:hover { background-color: ${t.outline}; }
    *::-webkit-scrollbar-corner { background: ${t.surfaceLowest}; }
    header { position: sticky; top: 0; padding: 10px 14px; background: ${t.nav}; border-bottom: 1px solid ${t.outlineVariant}; font-family: Inter, "Segoe UI", sans-serif; }
    .log-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .log-head-text { min-width: 0; flex: 1; }
    header strong { display: block; color: ${t.primary}; font-size: 13px; }
    header span { display: block; margin-top: 2px; color: ${t.onSurfaceVariant}; font-size: 11px; overflow-wrap: anywhere; }
    #clearLog { flex-shrink: 0; margin-top: 2px; padding: 6px 12px; font-size: 12px; font-family: inherit; cursor: pointer; color: ${t.onSurface}; background: ${t.secondaryContainer}; border: 1px solid ${t.outlineVariant}; border-radius: 6px; }
    #clearLog:hover { filter: brightness(1.12); }
    #clearLog:disabled { opacity: 0.55; cursor: not-allowed; }
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
  <pre>${escapeHtml(content)}</pre>
</body>
</html>`;
}
