import fs from "fs";
import path from "path";
import ini from "ini";
import { expandHome, paths, DEFAULT_AES_IV, DEFAULT_AES_KEY, toTilde } from "./config.js";
import type { MainSettings, ThemeMode } from "../shared/types.js";

function parseLanguageSetting(raw: unknown): MainSettings["language"] {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "system") return "system";
  if (s === "en" || s === "pt" || s === "es" || s === "fr" || s === "it" || s === "de") return s;
  return "system";
}

function parseThemeMode(raw: unknown): ThemeMode {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "light" || s === "system") return s;
  return "dark";
}

function ensureDir(d: string) {
  fs.mkdirSync(d, { recursive: true, mode: 0o755 });
}

function defaultMain(): MainSettings {
  return {
    debug: true,
    aeskey: DEFAULT_AES_KEY,
    aesiv: DEFAULT_AES_IV,
    start_minimized: false,
    setupwizard: false,
    changelogrev_read: 0,
    use_system_password_store: false,
    sudo_preserve_env: false,
    disallow_unsecure_certificates: false,
    globalvpnprofiles: toTilde(paths.globalProfiles()),
    localvpnprofiles: toTilde(paths.localProfiles()),
    localvpngroups: toTilde(paths.localGroups()),
    logs: toTilde(paths.logsDir()),
    disable_notifications: false,
    connect_on_dblclick: false,
    show_search: false,
    theme_mode: "dark",
    language: "system",
  };
}

function iniBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1";
}

export function initMainConfig(): void {
  const base = paths.baseDir();
  ensureDir(base);
  ensureDir(paths.localProfiles());
  ensureDir(paths.localGroups());
  ensureDir(paths.logsDir());
  ensureDir(paths.vpnLogsDir());

  const confPath = paths.mainConf();
  if (!fs.existsSync(confPath)) {
    const d = defaultMain();
    writeMainSettings(d);
  }
}

export function readMainSettings(): MainSettings {
  initMainConfig();
  const raw = fs.readFileSync(paths.mainConf(), "utf8");
  const o = ini.parse(raw) as Record<string, Record<string, string>>;
  const main = o.main || {};
  const p = o.paths || {};
  const gui = o.gui || {};
  return {
    debug: iniBool(main.debug),
    aeskey: main.aeskey || DEFAULT_AES_KEY,
    aesiv: main.aesiv || DEFAULT_AES_IV,
    start_minimized: iniBool(main.start_minimized),
    setupwizard: iniBool(main.setupwizard),
    changelogrev_read: parseInt(String(main.changelogrev_read || "0"), 10) || 0,
    use_system_password_store: iniBool(main.use_system_password_store),
    sudo_preserve_env: iniBool(main.sudo_preserve_env),
    disallow_unsecure_certificates: iniBool(main.disallow_unsecure_certificates),
    globalvpnprofiles: p.globalvpnprofiles || defaultMain().globalvpnprofiles,
    localvpnprofiles: p.localvpnprofiles || defaultMain().localvpnprofiles,
    localvpngroups: p.localvpngroups || defaultMain().localvpngroups,
    logs: p.logs || defaultMain().logs,
    disable_notifications: iniBool(gui.disable_notifications),
    connect_on_dblclick: iniBool(gui.connect_on_dblclick),
    show_search: iniBool(main.show_search),
    theme_mode: parseThemeMode(gui.theme_mode),
    language: parseLanguageSetting(gui.language),
  };
}

function writeMainSettings(s: MainSettings): void {
  const obj: Record<string, Record<string, string | boolean | number>> = {
    main: {
      debug: s.debug,
      aeskey: s.aeskey,
      aesiv: s.aesiv,
      start_minimized: s.start_minimized,
      setupwizard: s.setupwizard,
      changelogrev_read: s.changelogrev_read,
      use_system_password_store: s.use_system_password_store,
      sudo_preserve_env: s.sudo_preserve_env,
      disallow_unsecure_certificates: s.disallow_unsecure_certificates,
      show_search: s.show_search,
    },
    paths: {
      globalvpnprofiles: s.globalvpnprofiles,
      localvpnprofiles: s.localvpnprofiles,
      localvpngroups: s.localvpngroups,
      logs: s.logs,
    },
    gui: {
      disable_notifications: s.disable_notifications,
      connect_on_dblclick: s.connect_on_dblclick,
      theme_mode: s.theme_mode,
      language: s.language,
    },
  };
  fs.writeFileSync(paths.mainConf(), ini.stringify(obj), { mode: 0o600 });
}

export function patchMainSettings(partial: Partial<MainSettings>): MainSettings {
  const cur = readMainSettings();
  const next = { ...cur, ...partial };
  writeMainSettings(next);
  return next;
}

export function readGwCertCache(): Record<string, string> {
  const p = paths.gwCertCache();
  if (!fs.existsSync(p)) return {};
  const o = ini.parse(fs.readFileSync(p, "utf8")) as { gw_cert_hashes?: Record<string, string> };
  return o.gw_cert_hashes || {};
}

/** OpenFortiGUI stores accepted gateway digests here when "Trust all gateway certs" is enabled. */
export function readOpenfortiguiGwCertCache(): Record<string, string> {
  const p = path.join(paths.openfortiguiLegacy(), "gw_cert.cache");
  if (!fs.existsSync(p)) return {};
  try {
    const o = ini.parse(fs.readFileSync(p, "utf8")) as { gw_cert_hashes?: Record<string, string> };
    return o.gw_cert_hashes || {};
  } catch {
    return {};
  }
}

function writeGwCertCache(map: Record<string, string>): void {
  const body = ini.stringify({ gw_cert_hashes: map });
  fs.writeFileSync(paths.gwCertCache(), body, { mode: 0o600 });
}

/** One entry per profile name (same semantics as OpenFortiGUI `saveGwCertCache`). */
export function setGwCertCacheEntry(profileName: string, digest: string): void {
  const d = digest.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(d)) return;
  const map = readGwCertCache();
  if (map[profileName] === d) return;
  map[profileName] = d;
  writeGwCertCache(map);
}

export { expandHome };
