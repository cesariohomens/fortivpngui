import fs from "fs";
import path from "path";
import { app, BrowserWindow } from "electron";
import { CHANGELOG_REV } from "./config.js";
import { patchMainSettings, initMainConfig } from "./settings-service.js";
import * as profileService from "./profile-service.js";
import * as groupService from "./group-service.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForUi(win: BrowserWindow, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (win.isDestroyed()) throw new Error("Window destroyed while waiting for UI");
    try {
      const ready = await win.webContents.executeJavaScript(
        `Boolean(window.__fvpnUi && window.fvpnCapture && window.fvpnCapture.enabled)`
      );
      if (ready) return;
    } catch {
      /* renderer still loading */
    }
    await sleep(200);
  }
  throw new Error("Timed out waiting for screenshot UI hooks");
}

async function ui(win: BrowserWindow, expr: string): Promise<unknown> {
  return win.webContents.executeJavaScript(`(async () => { ${expr} })()`);
}

async function settle(win: BrowserWindow, ms = 450): Promise<void> {
  await sleep(ms);
  try {
    await win.webContents.executeJavaScript(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  } catch {
    /* ignore */
  }
}

async function capture(win: BrowserWindow, outPath: string): Promise<void> {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outPath, img.toPNG());
  console.log(`[screenshots] wrote ${outPath}`);
}

async function ensureDemoData(): Promise<void> {
  initMainConfig();
  patchMainSettings({
    language: "en",
    theme_mode: "dark",
    setupwizard: true,
    changelogrev_read: CHANGELOG_REV,
    start_minimized: false,
    show_search: false,
    disable_notifications: true,
  });

  const profiles = await profileService.listProfiles();
  if (!profiles.some((p) => p.name === "Office FortiGate")) {
    await profileService.saveProfileLocal({
      name: "Office FortiGate",
      origin: "local",
      gateway_host: "vpn.example.com",
      gateway_port: 443,
      username: "alice",
      password: "demo-password",
      otp: "",
      realm: "",
      set_routes: true,
      set_dns: true,
      half_internet_routers: false,
      persistent: 0,
      ca_file: "",
      user_cert: "",
      user_key: "",
      trusted_cert: "",
      verify_cert: false,
      debug: false,
      autostart: false,
      always_ask_otp: false,
      otp_prompt: "",
      otp_delay: 0,
      no_ftm_push: false,
      pppd_no_peerdns: false,
      pppd_accept_remote: false,
      pppd_log_file: "",
      pppd_plugin_file: "",
      pppd_ifname: "",
      pppd_ipparam: "",
      pppd_call: "",
      insecure_ssl: false,
      seclevel1: false,
      min_tls: "default",
      trust_all_gw_certs: false,
    });
  }

  const groups = await groupService.listGroups();
  if (!groups.some((g) => g.name === "Work sites")) {
    await groupService.saveGroup({
      name: "Work sites",
      localMembers: ["Office FortiGate"],
      globalMembers: [],
    });
  }
}

/**
 * Capture main views + key dialogs in English. Returns paths written (image01.png …).
 * Env: FORTIVPNGUI_CAPTURE_SCREENSHOTS = absolute output directory (docs/images).
 */
export async function runScreenshotCapture(mainWindow: BrowserWindow, outDir: string): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".png")) fs.unlinkSync(path.join(outDir, f));
  }

  await ensureDemoData();
  mainWindow.setSize(1228, 760);
  mainWindow.center();
  mainWindow.show();
  mainWindow.focus();

  if (mainWindow.webContents.isLoading()) {
    await new Promise<void>((resolve) => mainWindow.webContents.once("did-finish-load", () => resolve()));
  }
  await waitForUi(mainWindow);
  // Reload settings / demo profiles into the renderer after seeding.
  await ui(mainWindow, `await window.fvpn.saveSettings({ language: "en", theme_mode: "dark", setupwizard: true, changelogrev_read: ${CHANGELOG_REV} });`);
  await ui(mainWindow, `await window.__fvpnUi.refresh();`);
  await settle(mainWindow, 700);

  const shots: { file: string; run: () => Promise<void> }[] = [
    {
      file: "image01.png",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("vpn"); window.__fvpnUi.setThemeMode("dark");`);
        await settle(mainWindow);
      },
    },
    {
      file: "image02.png",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("groups");`);
        await settle(mainWindow);
      },
    },
    {
      file: "image03.png",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("settings");`);
        await settle(mainWindow, 600);
      },
    },
    {
      file: "image04.png",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("vpn"); window.__fvpnUi.openProfileEditor();`);
        await settle(mainWindow, 600);
      },
    },
    {
      file: "image05.png",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("vpn"); window.__fvpnUi.openAbout();`);
        await settle(mainWindow, 500);
      },
    },
    {
      file: "image06.png",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.openChangelog();`);
        await settle(mainWindow, 500);
      },
    },
    {
      file: "image07.png",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.openWizard(0);`);
        await settle(mainWindow, 500);
      },
    },
    {
      file: "image08.png",
      run: async () => {
        await ui(
          mainWindow,
          `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setThemeMode("light"); window.__fvpnUi.setView("vpn"); await window.fvpn.saveSettings({ theme_mode: "light" });`
        );
        await settle(mainWindow, 700);
      },
    },
  ];

  const written: string[] = [];
  for (const shot of shots) {
    await shot.run();
    const outPath = path.join(outDir, shot.file);
    await capture(mainWindow, outPath);
    written.push(outPath);
  }

  console.log(`[screenshots] captured ${written.length} images into ${outDir}`);
  return written;
}

export function screenshotCaptureRequested(): string | null {
  const raw = process.env.FORTIVPNGUI_CAPTURE_SCREENSHOTS?.trim();
  return raw || null;
}

export function quitAfterScreenshots(): void {
  // Allow the last PNG flush to settle before quitting.
  setTimeout(() => {
    app.exit(0);
  }, 300);
}
