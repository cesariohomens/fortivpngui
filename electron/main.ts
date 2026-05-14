import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "node:url";
import { initMainConfig, readMainSettings, patchMainSettings, expandHome } from "./settings-service.js";
import * as profileService from "./profile-service.js";
import * as groupService from "./group-service.js";
import * as vpn from "./vpn-service.js";
import * as imp from "./import-service.js";
import { CHANGELOG_REV } from "./config.js";
import { resolveOpenfortivpnExecutable } from "./openfortivpn-runner.js";
import type { VpnStartCredentials } from "./types.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const logWindows = new Map<string, BrowserWindow>();
/** Per VPN log window: used by IPC to clear the correct on-disk file. */
const logWindowMeta = new WeakMap<BrowserWindow, { profileName: string; filePath: string }>();
let autostartVpnsDone = false;
let isQuitting = false;

/** SVG copied to dist/ on build; duplicate under resources/ for packaged app. */
function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, "../resources/icon.svg"),
    path.join(__dirname, "../dist/icon.svg"),
    path.join(__dirname, "../public/icon.svg"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createAppNativeIcon(): Electron.NativeImage | undefined {
  const p = resolveAppIconPath();
  if (!p) return undefined;
  const img = nativeImage.createFromPath(p);
  return img.isEmpty() ? undefined : img;
}

function safeProfileSegment(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "unknown";
}

function vpnLogFilePath(profileName: string): string {
  const s = readMainSettings();
  return path.join(expandHome(s.logs), "vpn", `${safeProfileSegment(profileName)}.log`);
}

function vpnLogsBaseDir(): string {
  const s = readMainSettings();
  return path.resolve(path.join(expandHome(s.logs), "vpn"));
}

function isPathUnderVpnLogsDir(absPath: string): boolean {
  const base = vpnLogsBaseDir();
  const rel = path.relative(base, path.resolve(absPath));
  if (rel === "" || rel.startsWith(".." + path.sep) || rel === "..") return false;
  return !path.isAbsolute(rel);
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPlainTextLogHtml(profileName: string, filePath: string): string {
  const content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : `No log file exists yet for profile "${profileName}".\n\nExpected path:\n${filePath}\n`;
  const title = `VPN Log - ${profileName}`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #131313; color: #e5e2e1; }
    body { font-family: "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace; font-size: 12px; line-height: 1.55; }
    header { position: sticky; top: 0; padding: 10px 14px; background: #001c3a; border-bottom: 1px solid #414753; font-family: Inter, "Segoe UI", sans-serif; }
    .log-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .log-head-text { min-width: 0; flex: 1; }
    header strong { display: block; color: #a7c8ff; font-size: 13px; }
    header span { display: block; margin-top: 2px; color: #c1c6d5; font-size: 11px; overflow-wrap: anywhere; }
    #clearLog { flex-shrink: 0; margin-top: 2px; padding: 6px 12px; font-size: 12px; font-family: inherit; cursor: pointer; color: #e5e2e1; background: #2f486a; border: 1px solid #414753; border-radius: 6px; }
    #clearLog:hover { background: #3d5a82; }
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

function loadPlainTextLog(win: BrowserWindow, profileName: string, filePath: string): void {
  const html = buildPlainTextLogHtml(profileName, filePath);
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function openPlainTextLogWindow(profileName: string): string {
  const filePath = vpnLogFilePath(profileName);
  const title = `VPN Log - ${profileName}`;
  const existing = logWindows.get(filePath);
  if (existing && !existing.isDestroyed()) {
    logWindowMeta.set(existing, { profileName, filePath });
    loadPlainTextLog(existing, profileName, filePath);
    existing.show();
    existing.focus();
    return filePath;
  }

  const win = new BrowserWindow({
    width: 920,
    height: 680,
    title,
    autoHideMenuBar: true,
    icon: createAppNativeIcon(),
    parent: mainWindow ?? undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "log-window-preload.js"),
    },
  });
  logWindows.set(filePath, win);
  logWindowMeta.set(win, { profileName, filePath });
  win.on("closed", () => logWindows.delete(filePath));
  loadPlainTextLog(win, profileName, filePath);
  return filePath;
}

async function runAutostartVpns(): Promise<void> {
  const profiles = await profileService.listProfiles();
  const ofvPath = resolveOpenfortivpnExecutable();
  const candidates = profiles
    .filter((p) => p.autostart)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const p of candidates) {
    if (p.device_type === "fortigate" && !ofvPath) {
      console.warn("[autostart] Skipping Fortigate profile (openfortivpn not found):", p.name);
      continue;
    }
    if (p.always_ask_otp) {
      console.warn("[autostart] Skipping profile that requires interactive OTP:", p.name);
      continue;
    }
    try {
      await vpn.startVpn(p.name);
    } catch (e) {
      console.warn("[autostart] startVpn failed:", p.name, e);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

function isHttpHttpsOrMailto(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:" || p === "mailto:";
  } catch {
    return false;
  }
}

/** True when the URL is the packaged app (file) or the Vite dev origin. */
function isInAppNavigationUrl(url: string, devServerUrl: string | undefined): boolean {
  try {
    if (devServerUrl) {
      const base = new URL(devServerUrl.endsWith("/") ? devServerUrl : `${devServerUrl}/`);
      return new URL(url).origin === base.origin;
    }
    return new URL(url).protocol === "file:";
  } catch {
    return false;
  }
}

function isSameDocumentExceptHash(fromUrl: string, toUrl: string): boolean {
  try {
    const a = new URL(fromUrl);
    const b = new URL(toUrl);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

function createWindow() {
  const s = readMainSettings();
  const showWindow = !s.start_minimized || !s.setupwizard || s.changelogrev_read < CHANGELOG_REV;
  mainWindow = new BrowserWindow({
    width: Math.round(1024 * 1.2),
    height: 720,
    show: showWindow,
    autoHideMenuBar: true,
    icon: createAppNativeIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Electron 20+ defaults sandbox=true; with preload + file:// UI it often breaks loading; keep off for this app.
      sandbox: false,
    },
  });
  vpn.setMainWindow(mainWindow);
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) {
    const url = dev.endsWith("/") ? dev : `${dev}/`;
    void mainWindow.loadURL(url);
  } else {
    const indexHtml = path.join(__dirname, "../dist/index.html");
    if (!fs.existsSync(indexHtml)) {
      console.error(`Renderer not built: missing ${indexHtml} (run npm run build)`);
    }
    const fileUrl = pathToFileURL(indexHtml).href;
    void mainWindow.loadURL(fileUrl);
  }

  const wc = mainWindow.webContents;
  wc.on("will-navigate", (event, url) => {
    if (isSameDocumentExceptHash(wc.getURL(), url)) return;
    if (isHttpHttpsOrMailto(url) && !isInAppNavigationUrl(url, dev)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (isHttpHttpsOrMailto(url)) {
      if (!isInAppNavigationUrl(url, dev)) {
        void shell.openExternal(url);
        return { action: "deny" };
      }
      return { action: "allow" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("did-fail-load", { code, desc, url });
  });

  if (process.env.FORTIVPN_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.once("did-finish-load", () => {
    if (autostartVpnsDone) return;
    autostartVpnsDone = true;
    void runAutostartVpns();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    vpn.setMainWindow(null);
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
    vpn.sweepDetachedVpnTempFiles();
  });
}

async function refreshTrayMenu() {
  if (!tray) return;
  const showAndFocus = () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };
  const profiles = await profileService.listProfiles().catch(() => []);
  const groups = await groupService.listGroups().catch(() => []);
  const profileItems = profiles.map((p) => {
    const state = vpn.getVpnStatus(p.name);
    const active = state === "connected" || state === "connecting";
    return {
      label: `${active ? "Disconnect" : "Connect"} ${p.name} (${p.device_type})`,
      click: async () => {
        try {
          if (active) await vpn.stopVpn(p.name);
          else if (p.always_ask_otp && mainWindow && !mainWindow.isDestroyed()) {
            showAndFocus();
            mainWindow.webContents.send("app:connect-profile", { name: p.name });
          } else {
            await vpn.startVpn(p.name);
          }
        } catch (e) {
          dialog.showErrorBox("VPN", e instanceof Error ? e.message : String(e));
        } finally {
          void refreshTrayMenu();
        }
      },
    };
  });
  const groupItems = groups.map((g) => ({
    label: g.name,
    submenu: [
      {
        label: "Connect all",
        click: async () => {
          for (const name of [...new Set([...g.localMembers, ...g.globalMembers])]) {
            await vpn.startVpn(name).catch((e) => console.warn("[tray] group connect failed", name, e));
          }
          void refreshTrayMenu();
        },
      },
      {
        label: "Disconnect all",
        click: async () => {
          for (const name of [...new Set([...g.localMembers, ...g.globalMembers])]) {
            await vpn.stopVpn(name).catch((e) => console.warn("[tray] group disconnect failed", name, e));
          }
          void refreshTrayMenu();
        },
      },
    ],
  }));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...profileItems,
      ...(profileItems.length ? [{ type: "separator" as const }] : []),
      { label: "VPN-Groups", submenu: groupItems.length ? groupItems : [{ label: "No groups", enabled: false }] },
      { type: "separator" },
      { label: "Show mainwindow", click: showAndFocus },
      {
        label: "Settings",
        click: () => {
          showAndFocus();
          mainWindow?.webContents.send("app:navigate", { tab: 2 });
        },
      },
      {
        label: "Quit FortiVPN GUI",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function buildTray() {
  const size = process.platform === "darwin" ? 22 : 24;
  let trayImg: Electron.NativeImage | null = null;
  const svgPath = resolveAppIconPath();
  if (svgPath) {
    const fromSvg = nativeImage.createFromPath(svgPath);
    if (!fromSvg.isEmpty()) {
      const resized = fromSvg.resize({ width: size, height: size });
      if (!resized.isEmpty()) trayImg = resized;
    }
  }
  const pngPath = path.join(__dirname, "../resources/tray.png");
  if ((!trayImg || trayImg.isEmpty()) && fs.existsSync(pngPath)) {
    trayImg = nativeImage.createFromPath(pngPath);
  }
  if (!trayImg || trayImg.isEmpty()) return;
  tray = new Tray(trayImg);
  tray.setToolTip("FortiVPN GUI");
  const showAndFocus = () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };
  void refreshTrayMenu();
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else showAndFocus();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === "darwin") {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: app.name,
            submenu: [{ role: "quit" }],
          },
        ])
      );
    } else {
      Menu.setApplicationMenu(null);
    }
    initMainConfig();
    createWindow();
    buildTray();
    vpn.setTrayRef(tray);
    vpn.setStatusChangeHook(() => {
      void refreshTrayMenu();
    });
    vpn.setGatewayCertUiHandler((ev) => {
      if (ev.kind === "blocked") {
        dialog.showErrorBox("Gateway certificate validation failed", ev.message);
        return;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("vpn:gateway-cert-prompt", {
          profileName: ev.profileName,
          digest: ev.digest,
          body: ev.body,
        });
      }
    });

    ipcMain.handle("app:openfortivpnPath", () => resolveOpenfortivpnExecutable());
    ipcMain.handle("app:chooseDirectory", async (_e, initialPath?: string) => {
      const options: Electron.OpenDialogOptions = {
        defaultPath: initialPath ? expandHome(initialPath) : undefined,
        properties: ["openDirectory", "createDirectory"],
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled) return null;
      return result.filePaths[0] ?? null;
    });
    ipcMain.handle("app:openLogsDir", () => {
      const s = readMainSettings();
      return shell.openPath(expandHome(s.logs));
    });
    ipcMain.handle("app:openVpnLog", (_e, name: string) => {
      return openPlainTextLogWindow(name);
    });
    ipcMain.handle("vpnLog:clearFocusedWindow", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      const meta = logWindowMeta.get(win);
      if (!meta) return;
      const resolved = path.resolve(meta.filePath);
      if (!isPathUnderVpnLogsDir(resolved)) {
        console.warn("[vpnLog] clear rejected: path outside vpn logs dir", resolved);
        return;
      }
      try {
        fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o755 });
        fs.writeFileSync(resolved, "", { mode: 0o600 });
      } catch (e) {
        console.warn("[vpnLog] clear failed", e);
      }
      loadPlainTextLog(win, meta.profileName, resolved);
    });
    ipcMain.handle("profiles:list", () => profileService.listProfiles());
    ipcMain.handle("profiles:save", async (_e, p) => {
      await profileService.saveProfileLocal(p);
      void refreshTrayMenu();
    });
    ipcMain.handle("profiles:delete", async (_e, name: string) => {
      const deleted = await profileService.deleteProfileLocal(name);
      void refreshTrayMenu();
      return deleted;
    });
    ipcMain.handle("profiles:rename", async (_e, oldName: string, newName: string) => {
      await profileService.renameProfileLocal(oldName, newName);
      void refreshTrayMenu();
    });

    ipcMain.handle("groups:list", () => groupService.listGroups());
    ipcMain.handle("groups:save", async (_e, g) => {
      await groupService.saveGroup(g);
      void refreshTrayMenu();
    });
    ipcMain.handle("groups:delete", async (_e, name: string) => {
      const deleted = await groupService.deleteGroup(name);
      void refreshTrayMenu();
      return deleted;
    });
    ipcMain.handle("groups:rename", async (_e, o: string, n: string) => {
      await groupService.renameGroup(o, n);
      void refreshTrayMenu();
    });

    ipcMain.handle("groups:duplicate", async (_e, name: string) => {
      const newName = await groupService.duplicateGroup(name);
      void refreshTrayMenu();
      return newName;
    });

    ipcMain.handle("settings:get", () => readMainSettings());
    ipcMain.handle("settings:save", (_e, partial) => {
      const next = patchMainSettings(partial);
      void refreshTrayMenu();
      return next;
    });

    ipcMain.handle("vpn:start", async (_e, name: string, arg?: string | VpnStartCredentials) => {
      await vpn.startVpn(name, arg);
      void refreshTrayMenu();
    });
    ipcMain.handle("vpn:stop", async (_e, name: string) => {
      await vpn.stopVpn(name);
      void refreshTrayMenu();
    });
    ipcMain.handle("vpn:status", (_e, name: string) => vpn.getVpnStatus(name));
    ipcMain.handle("vpn:submitFortigateStdinOtp", (_e, profileName: string, otp: string) => vpn.submitFortigateStdinOtp(profileName, otp));

    ipcMain.handle("import:openfortigui", async () => {
      const result = await imp.importFromOpenfortigui();
      void refreshTrayMenu();
      return result;
    });
    ipcMain.handle("settings:mergeOpenfortiguiMain", () => imp.mergeOpenfortiguiMainIntoFortivpngui());

    ipcMain.handle("vpn:trustGatewayDigest", (_e, profileName: string, digest: string) =>
      vpn.trustGatewayCertDigest(profileName, digest)
    );

    ipcMain.handle("changelog:markRead", () => {
      patchMainSettings({ changelogrev_read: CHANGELOG_REV });
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && isQuitting) app.quit();
  });
  app.on("before-quit", () => {
    isQuitting = true;
    vpn.cleanupTempFilesOnQuit();
  });
}
