import fs from "fs";
import path from "path";
import { app, BrowserWindow } from "electron";
import { CHANGELOG_REV } from "./config.js";
import { patchMainSettings, initMainConfig } from "./settings-service.js";
import * as profileService from "./profile-service.js";
import * as groupService from "./group-service.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ThemeModeShot = "dark" | "light";

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
      cookie: "",
      pinentry: "",
      saml_login: false,
      saml_port: 0,
      realm: "",
      set_routes: true,
      set_dns: true,
      half_internet_routers: false,
      use_resolvconf: "default",
      ifname: "",
      persistent: 0,
      ca_file: "",
      user_cert: "",
      user_key: "",
      pem_passphrase: "",
      trusted_cert: "",
      debug: false,
      autostart: false,
      always_ask_otp: false,
      otp_prompt: "",
      otp_delay: 0,
      no_ftm_push: false,
      pppd_use_peerdns: false,
      pppd_accept_remote: false,
      pppd_log_file: "",
      pppd_plugin_file: "",
      pppd_ifname: "",
      pppd_ipparam: "",
      pppd_call: "",
      insecure_ssl: false,
      seclevel1: false,
      min_tls: "default",
      cipher_list: "",
      sni: "",
      user_agent: "",
      hostcheck: "",
      check_virtual_desktop: "",
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

async function applyTheme(win: BrowserWindow, theme: ThemeModeShot): Promise<void> {
  await ui(
    win,
    `window.__fvpnUi.setThemeMode("${theme}"); await window.fvpn.saveSettings({ theme_mode: "${theme}" });`
  );
  await settle(win, 700);
}

/**
 * Capture main views + key dialogs in English for dark and light themes.
 * Writes dark-image01.png … dark-image07.png and light-image01.png … light-image07.png.
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
  await ui(
    mainWindow,
    `await window.fvpn.saveSettings({ language: "en", theme_mode: "dark", setupwizard: true, changelogrev_read: ${CHANGELOG_REV} });`
  );
  await ui(mainWindow, `await window.__fvpnUi.refresh();`);
  await settle(mainWindow, 700);

  const scenes: { id: string; run: () => Promise<void> }[] = [
    {
      id: "01",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("vpn");`);
        await settle(mainWindow);
      },
    },
    {
      id: "02",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("groups");`);
        await settle(mainWindow);
      },
    },
    {
      id: "03",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("settings");`);
        await settle(mainWindow, 600);
      },
    },
    {
      id: "04",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("vpn"); window.__fvpnUi.openProfileEditor();`);
        await settle(mainWindow, 600);
      },
    },
    {
      id: "05",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.setView("vpn"); window.__fvpnUi.openAbout();`);
        await settle(mainWindow, 500);
      },
    },
    {
      id: "06",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.openChangelog();`);
        await settle(mainWindow, 500);
      },
    },
    {
      id: "07",
      run: async () => {
        await ui(mainWindow, `window.__fvpnUi.closeOverlays(); window.__fvpnUi.openWizard(0);`);
        await settle(mainWindow, 500);
      },
    },
  ];

  const themes: ThemeModeShot[] = ["dark", "light"];
  const written: string[] = [];
  for (const theme of themes) {
    await applyTheme(mainWindow, theme);
    for (const scene of scenes) {
      await scene.run();
      const outPath = path.join(outDir, `${theme}-image${scene.id}.png`);
      await capture(mainWindow, outPath);
      written.push(outPath);
    }
  }

  console.log(`[screenshots] captured ${written.length} images into ${outDir}`);
  return written;
}

export function screenshotCaptureRequested(): string | null {
  const raw = process.env.FORTIVPNGUI_CAPTURE_SCREENSHOTS?.trim();
  return raw || null;
}

export function quitAfterScreenshots(): void {
  setTimeout(() => {
    app.exit(0);
  }, 300);
}
