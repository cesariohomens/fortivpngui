import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, dialog } from "electron";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "node:url";
import { initMainConfig, readMainSettings, patchMainSettings } from "./settings-service.js";
import * as profileService from "./profile-service.js";
import * as groupService from "./group-service.js";
import * as vpn from "./vpn-service.js";
import * as imp from "./import-service.js";
import { CHANGELOG_REV } from "./config.js";
import { resolveOpenfortivpnExecutable } from "./openfortivpn-runner.js";
import type { VpnStartCredentials } from "./types.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let autostartVpnsDone = false;

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

function createWindow() {
  const s = readMainSettings();
  const showWindow = !s.start_minimized || s.setupwizard || s.changelogrev_read < CHANGELOG_REV;
  mainWindow = new BrowserWindow({
    width: 1024,
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
  const menu = Menu.buildFromTemplate([
    { label: "Show", click: showAndFocus },
    {
      label: "Settings",
      click: () => {
        showAndFocus();
        mainWindow?.webContents.send("app:navigate", { tab: 2 });
      },
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    showAndFocus();
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
    vpn.setGatewayCertUiHandler((ev) => {
      if (ev.kind === "blocked") {
        dialog.showErrorBox("Gateway certificate validation failed", ev.message);
        return;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("vpn:gateway-cert-prompt", {
          profileName: ev.profileName,
          digest: ev.digest,
          body: ev.body,
        });
      }
    });

    ipcMain.handle("app:openfortivpnPath", () => resolveOpenfortivpnExecutable());
    ipcMain.handle("profiles:list", () => profileService.listProfiles());
    ipcMain.handle("profiles:save", (_e, p) => profileService.saveProfileLocal(p));
    ipcMain.handle("profiles:delete", (_e, name: string) => profileService.deleteProfileLocal(name));
    ipcMain.handle("profiles:rename", (_e, oldName: string, newName: string) => profileService.renameProfileLocal(oldName, newName));

    ipcMain.handle("groups:list", () => groupService.listGroups());
    ipcMain.handle("groups:save", (_e, g) => groupService.saveGroup(g));
    ipcMain.handle("groups:delete", (_e, name: string) => groupService.deleteGroup(name));
    ipcMain.handle("groups:rename", (_e, o: string, n: string) => groupService.renameGroup(o, n));

    ipcMain.handle("groups:duplicate", (_e, name: string) => groupService.duplicateGroup(name));

    ipcMain.handle("settings:get", () => readMainSettings());
    ipcMain.handle("settings:save", (_e, partial) => patchMainSettings(partial));

    ipcMain.handle("vpn:start", (_e, name: string, arg?: string | VpnStartCredentials) => vpn.startVpn(name, arg));
    ipcMain.handle("vpn:stop", (_e, name: string) => vpn.stopVpn(name));
    ipcMain.handle("vpn:status", (_e, name: string) => vpn.getVpnStatus(name));

    ipcMain.handle("import:openfortigui", () => imp.importFromOpenfortigui());
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
    if (process.platform !== "darwin") app.quit();
  });
}
