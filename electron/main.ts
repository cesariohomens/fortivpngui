import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from "electron";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "node:url";
import { initMainConfig, readMainSettings, patchMainSettings } from "./settings-service.js";
import * as profileService from "./profile-service.js";
import * as groupService from "./group-service.js";
import * as vpn from "./vpn-service.js";
import * as imp from "./import-service.js";
import { spawnSync } from "child_process";
import { CHANGELOG_REV } from "./config.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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

function resolveOpenfortivpn(): string | null {
  const r = spawnSync("which", ["openfortivpn"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
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
  const menu = Menu.buildFromTemplate([
    { label: "Show", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    mainWindow?.show();
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

    ipcMain.handle("app:openfortivpnPath", () => resolveOpenfortivpn());
    ipcMain.handle("profiles:list", () => profileService.listProfiles());
    ipcMain.handle("profiles:save", (_e, p) => profileService.saveProfileLocal(p));
    ipcMain.handle("profiles:delete", (_e, name: string) => profileService.deleteProfileLocal(name));
    ipcMain.handle("profiles:rename", (_e, oldName: string, newName: string) => profileService.renameProfileLocal(oldName, newName));

    ipcMain.handle("groups:list", () => groupService.listGroups());
    ipcMain.handle("groups:save", (_e, g) => groupService.saveGroup(g));
    ipcMain.handle("groups:delete", (_e, name: string) => groupService.deleteGroup(name));
    ipcMain.handle("groups:rename", (_e, o: string, n: string) => groupService.renameGroup(o, n));

    ipcMain.handle("settings:get", () => readMainSettings());
    ipcMain.handle("settings:save", (_e, partial) => patchMainSettings(partial));

    ipcMain.handle("vpn:start", (_e, name: string, otp?: string) => vpn.startVpn(name, otp));
    ipcMain.handle("vpn:stop", (_e, name: string) => vpn.stopVpn(name));
    ipcMain.handle("vpn:status", (_e, name: string) => vpn.getVpnStatus(name));

    ipcMain.handle("import:openfortigui", () => imp.importFromOpenfortigui());

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
