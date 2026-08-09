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
      --os-size: 9.9px;
      --os-btn-size: 9.9px;
      --os-padding-perpendicular: 2px;
      --os-padding-axis: 2px;
      --os-track-border-radius: 4px;
      --os-handle-border-radius: 4px;
      --os-handle-bg: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 70%, transparent);
      --os-handle-bg-hover: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 85%, transparent);
      --os-handle-bg-active: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 95%, transparent);
      --os-track-bg: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 18%, transparent);
    }
    .os-theme-fvpn.os-scrollbar-vertical { padding-block: var(--os-btn-size); }
    .os-theme-fvpn.os-scrollbar-horizontal { padding-inline: var(--os-btn-size); }
    .os-theme-fvpn .os-scrollbar-button {
      position: absolute; z-index: 1; box-sizing: border-box; margin: 0; padding: 0; border: none; border-radius: 2px;
      background: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 28%, transparent);
      color: var(--fvpn-scrollbar-thumb, #8b919e); cursor: pointer; display: flex; align-items: center; justify-content: center; pointer-events: auto;
    }
    .os-theme-fvpn .os-scrollbar-button:hover { background: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 45%, transparent); }
    .os-theme-fvpn .os-scrollbar-button:active { background: color-mix(in srgb, var(--fvpn-scrollbar-thumb, #8b919e) 60%, transparent); }
    .os-theme-fvpn .os-scrollbar-button-up, .os-theme-fvpn .os-scrollbar-button-down { left: 0; width: 100%; height: var(--os-btn-size); }
    .os-theme-fvpn .os-scrollbar-button-up { top: 0; }
    .os-theme-fvpn .os-scrollbar-button-down { bottom: 0; }
    .os-theme-fvpn .os-scrollbar-button-left, .os-theme-fvpn .os-scrollbar-button-right { top: 0; height: 100%; width: var(--os-btn-size); }
    .os-theme-fvpn .os-scrollbar-button-left { left: 0; }
    .os-theme-fvpn .os-scrollbar-button-right { right: 0; }
    .os-theme-fvpn .os-scrollbar-button-up::before, .os-theme-fvpn .os-scrollbar-button-down::before,
    .os-theme-fvpn .os-scrollbar-button-left::before, .os-theme-fvpn .os-scrollbar-button-right::before {
      content: ""; display: block; width: 0; height: 0; border-style: solid;
    }
    .os-theme-fvpn .os-scrollbar-button-up::before { border-width: 0 3px 4px 3px; border-color: transparent transparent currentColor transparent; }
    .os-theme-fvpn .os-scrollbar-button-down::before { border-width: 4px 3px 0 3px; border-color: currentColor transparent transparent transparent; }
    .os-theme-fvpn .os-scrollbar-button-left::before { border-width: 3px 4px 3px 0; border-color: transparent currentColor transparent transparent; }
    .os-theme-fvpn .os-scrollbar-button-right::before { border-width: 3px 0 3px 4px; border-color: transparent transparent transparent currentColor; }
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
      var STEP = 48;
      var MARK = "data-fvpn-scroll-buttons";
      function bindRepeat(btn, action) {
        var timer = 0, delayTimer = 0;
        function stop() { clearInterval(timer); clearTimeout(delayTimer); timer = 0; delayTimer = 0; }
        btn.addEventListener("pointerdown", function (ev) {
          if (ev.button !== 0) return;
          ev.preventDefault(); ev.stopPropagation();
          action();
          delayTimer = setTimeout(function () { timer = setInterval(action, 50); }, 400);
        });
        btn.addEventListener("pointerup", stop);
        btn.addEventListener("pointerleave", stop);
        btn.addEventListener("pointercancel", stop);
        btn.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); });
      }
      function mountButtons(scrollbar, axis, scrollEl) {
        if (!scrollbar || scrollbar.hasAttribute(MARK)) return;
        var track = scrollbar.querySelector(".os-scrollbar-track");
        if (!track) return;
        scrollbar.setAttribute(MARK, "");
        var dec = document.createElement("button");
        var inc = document.createElement("button");
        dec.type = "button"; inc.type = "button";
        dec.tabIndex = -1; inc.tabIndex = -1;
        dec.className = "os-scrollbar-button os-scrollbar-button-" + (axis === "y" ? "up" : "left");
        inc.className = "os-scrollbar-button os-scrollbar-button-" + (axis === "y" ? "down" : "right");
        scrollbar.insertBefore(dec, track);
        scrollbar.appendChild(inc);
        bindRepeat(dec, function () { if (axis === "y") scrollEl.scrollTop -= STEP; else scrollEl.scrollLeft -= STEP; });
        bindRepeat(inc, function () { if (axis === "y") scrollEl.scrollTop += STEP; else scrollEl.scrollLeft += STEP; });
      }
      function attachButtons(instance) {
        var el = instance.elements();
        mountButtons(el.scrollbarVertical.scrollbar, "y", el.scrollOffsetElement);
        mountButtons(el.scrollbarHorizontal.scrollbar, "x", el.scrollOffsetElement);
      }
      var host = document.getElementById("logScroll");
      if (!host || typeof OverlayScrollbarsGlobal === "undefined") return;
      OverlayScrollbarsGlobal.OverlayScrollbars(host, {
        overflow: { x: "scroll", y: "scroll" },
        scrollbars: { theme: "os-theme-fvpn", visibility: "auto", autoHide: "never", clickScroll: true }
      }, {
        initialized: attachButtons,
        updated: attachButtons
      });
    })();
  </script>
</body>
</html>`;
}
