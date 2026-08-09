import fs from "fs";
import path from "path";
import ini from "ini";
import { expandHome, NAME_VALIDATOR } from "./config.js";
import { aes128Decrypt, aes128Encrypt } from "./crypto-aes.js";
import { readMainSettings } from "./settings-service.js";
import * as keychain from "./keychain-service.js";
import type { VpnProfile } from "../shared/types.js";
import { parseTrustedCertDigests } from "./openfortivpn-runner.js";

function iniBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1";
}

/** OpenFortiGUI / older FortiVPN GUI stored `persistent` as a boolean; `true` maps to the historical 60s interval. */
function iniPersistentSeconds(v: unknown): number {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "" || s === "false" || s === "0") return 0;
  if (s === "true") return 60;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** OpenFortiGUI `device_type`: 0 = FortiGate, 1 = Barracuda (unsupported — skip). */
function isUnsupportedDeviceType(raw: unknown): boolean {
  const n = parseInt(String(raw ?? "0"), 10) || 0;
  return n !== 0;
}

async function getAesKeys(): Promise<{ key: string; iv: string }> {
  const m = readMainSettings();
  if (m.use_system_password_store) {
    const k = await keychain.keytarGet("aeskey");
    const iv = await keychain.keytarGet("aesiv");
    if (k && iv) return { key: k, iv };
  }
  return { key: m.aeskey, iv: m.aesiv };
}

/** Flatten [cert] section (OpenFortiGUI may nest trusted_cert\\… keys) and extract SHA-256 digests. */
function trustedCertFromIniCert(cert: Record<string, unknown>): string {
  const chunks: string[] = [];
  const walk = (x: unknown, depth: number) => {
    if (depth > 12) return;
    if (typeof x === "string") chunks.push(x);
    else if (typeof x === "number" || typeof x === "boolean") chunks.push(String(x));
    else if (x && typeof x === "object" && !Array.isArray(x)) {
      for (const v of Object.values(x as Record<string, unknown>)) walk(v, depth + 1);
    } else if (Array.isArray(x)) {
      for (const v of x) walk(v, depth + 1);
    }
  };
  walk(cert, 0);
  for (const [k, v] of Object.entries(cert)) {
    if (/trusted|whitelist|pin|digest|cert_hash/i.test(k) && typeof v === "string") chunks.push(v);
  }
  return parseTrustedCertDigests(chunks.join(" ")).join(" ");
}

async function readProfileFromFile(
  filePath: string,
  origin: "local" | "global",
  includePassword: boolean
): Promise<VpnProfile | null> {
  const name = path.basename(filePath, ".conf");
  if (!NAME_VALIDATOR.test(name)) return null;
  const o = ini.parse(fs.readFileSync(filePath, "utf8")) as Record<string, Record<string, unknown>>;
  const vpn = o.vpn || {};
  const cert = o.cert || {};
  const opt = o.options || {};
  if (isUnsupportedDeviceType(vpn.device_type)) {
    console.warn(`[profile-service] Skipping unsupported Barracuda profile: ${name}`);
    return null;
  }
  const m = readMainSettings();
  const aes = includePassword && !m.use_system_password_store ? await getAesKeys() : null;
  let password = "";
  let pemPassphrase = "";
  let cookie = "";
  if (includePassword) {
    if (m.use_system_password_store) {
      password = (await keychain.keytarGet(`vpn:${name}`)) || "";
      pemPassphrase = (await keychain.keytarGet(`vpnpem:${name}`)) || "";
      cookie = (await keychain.keytarGet(`vpncookie:${name}`)) || "";
    } else if (aes) {
      if (vpn.password) password = aes128Decrypt(String(vpn.password), aes.key, aes.iv);
      if (cert.pem_passphrase) pemPassphrase = aes128Decrypt(String(cert.pem_passphrase), aes.key, aes.iv);
      if (vpn.cookie) cookie = aes128Decrypt(String(vpn.cookie), aes.key, aes.iv);
    }
  }
  return {
    name: String(vpn.name || name),
    origin,
    gateway_host: String(vpn.gateway_host || ""),
    gateway_port: parseInt(String(vpn.gateway_port || "443"), 10) || 443,
    username: String(vpn.username || ""),
    password,
    cookie,
    pinentry: String(opt.pinentry || ""),
    saml_login: iniBool(opt.saml_login),
    saml_port: parseInt(String(opt.saml_port || "0"), 10) || 0,
    realm: String(opt.realm || ""),
    set_routes: iniBool(opt.set_routes),
    set_dns: iniBool(opt.set_dns),
    half_internet_routers: iniBool(opt.half_internet_routers),
    use_resolvconf: String(opt.use_resolvconf || "default"),
    ifname: String(opt.ifname || ""),
    persistent: iniPersistentSeconds(vpn.persistent),
    ca_file: String(cert.ca_file || ""),
    user_cert: String(cert.user_cert || ""),
    user_key: String(cert.user_key || ""),
    pem_passphrase: pemPassphrase,
    trusted_cert: trustedCertFromIniCert(cert),
    debug: iniBool(opt.debug),
    autostart: iniBool(opt.autostart),
    always_ask_otp: iniBool(opt.always_ask_otp),
    otp_prompt: String(opt.otp_prompt || ""),
    otp_delay: parseInt(String(opt.otp_delay || "0"), 10) || 0,
    no_ftm_push: iniBool(opt.no_ftm_push),
    /**
     * Profiles written before the peerdns fix only carry `pppd_no_peerdns`, which never reached openfortivpn, so
     * peerdns was effectively off whatever it said. Absent `pppd_use_peerdns` therefore means off, not `!no_peerdns`.
     */
    pppd_use_peerdns: iniBool(opt.pppd_use_peerdns),
    pppd_accept_remote: iniBool(opt.pppd_accept_remote),
    pppd_log_file: String(opt.pppd_log_file || ""),
    pppd_plugin_file: String(opt.pppd_plugin_file || ""),
    pppd_ifname: String(opt.pppd_ifname || ""),
    pppd_ipparam: String(opt.pppd_ipparam || ""),
    pppd_call: String(opt.pppd_call || ""),
    insecure_ssl: iniBool(opt.insecure_ssl),
    seclevel1: iniBool(opt.seclevel1),
    min_tls: String(opt.min_tls || "default"),
    cipher_list: String(opt.cipher_list || ""),
    sni: String(opt.sni || ""),
    user_agent: String(opt.user_agent || ""),
    hostcheck: String(opt.hostcheck || ""),
    check_virtual_desktop: String(opt.check_virtual_desktop || ""),
    trust_all_gw_certs: iniBool(cert.trust_all_gw_certs),
  };
}

export async function listProfiles(): Promise<VpnProfile[]> {
  const m = readMainSettings();
  const dirs: { origin: "local" | "global"; dir: string }[] = [
    { origin: "local", dir: expandHome(m.localvpnprofiles) },
    { origin: "global", dir: expandHome(m.globalvpnprofiles) },
  ];
  const out: VpnProfile[] = [];
  for (const { origin, dir } of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".conf")) continue;
      const p = await readProfileFromFile(path.join(dir, f), origin, true);
      if (p) out.push(p);
    }
  }
  /** Same name can exist in local + global (e.g. import); `find(name)` must not pick global and ignore local trusted_cert. */
  const byName = new Map<string, VpnProfile>();
  for (const p of out) {
    const prev = byName.get(p.name);
    if (!prev) {
      byName.set(p.name, p);
    } else if (prev.origin === "global" && p.origin === "local") {
      byName.set(p.name, p);
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveProfileLocal(profile: VpnProfile): Promise<void> {
  if (!NAME_VALIDATOR.test(profile.name.trim())) {
    throw new Error("Invalid profile name (min 3 chars, allowed: letters, numbers, space, -, _)");
  }
  const m = readMainSettings();
  const dir = expandHome(m.localvpnprofiles);
  fs.mkdirSync(dir, { recursive: true });
  const aes = await getAesKeys();
  let encPass = "";
  let encPemPassphrase = "";
  let encCookie = "";
  if (m.use_system_password_store) {
    await keychain.keytarSet(`vpn:${profile.name}`, profile.password);
    await keychain.keytarSet(`vpnpem:${profile.name}`, profile.pem_passphrase || "");
    await keychain.keytarSet(`vpncookie:${profile.name}`, profile.cookie || "");
  } else {
    encPass = aes128Encrypt(profile.password.trim(), aes.key, aes.iv);
    encPemPassphrase = profile.pem_passphrase ? aes128Encrypt(profile.pem_passphrase, aes.key, aes.iv) : "";
    encCookie = profile.cookie ? aes128Encrypt(profile.cookie.trim(), aes.key, aes.iv) : "";
  }
  const obj: Record<string, Record<string, string | number | boolean>> = {
    vpn: {
      name: profile.name.trim(),
      gateway_host: profile.gateway_host.trim(),
      gateway_port: profile.gateway_port || 443,
      username: profile.username.trim(),
      password: encPass,
      cookie: encCookie,
      persistent: Math.max(0, Math.trunc(profile.persistent) || 0),
      /** OpenFortiGUI-compatible: 0 = FortiGate only. */
      device_type: 0,
    },
    cert: {
      ca_file: profile.ca_file,
      user_cert: profile.user_cert,
      user_key: profile.user_key,
      pem_passphrase: encPemPassphrase,
      trusted_cert: parseTrustedCertDigests(profile.trusted_cert).join(" "),
      trust_all_gw_certs: profile.trust_all_gw_certs,
    },
    options: {
      set_routes: profile.set_routes,
      set_dns: profile.set_dns,
      pppd_use_peerdns: profile.pppd_use_peerdns,
      /** Mirror for OpenFortiGUI and older FortiVPN GUI builds, which only know the inverted key. */
      pppd_no_peerdns: !profile.pppd_use_peerdns,
      pppd_accept_remote: profile.pppd_accept_remote,
      insecure_ssl: profile.insecure_ssl,
      debug: profile.debug,
      realm: profile.realm,
      autostart: profile.autostart,
      always_ask_otp: profile.always_ask_otp,
      otp_prompt: profile.otp_prompt,
      otp_delay: profile.otp_delay,
      no_ftm_push: profile.no_ftm_push,
      half_internet_routers: profile.half_internet_routers,
      pppd_log_file: profile.pppd_log_file,
      pppd_plugin_file: profile.pppd_plugin_file,
      pppd_ifname: profile.pppd_ifname,
      pppd_ipparam: profile.pppd_ipparam,
      pppd_call: profile.pppd_call,
      seclevel1: profile.seclevel1,
      min_tls: profile.min_tls,
      cipher_list: profile.cipher_list,
      use_resolvconf: profile.use_resolvconf,
      ifname: profile.ifname,
      pinentry: profile.pinentry,
      saml_login: profile.saml_login,
      saml_port: Math.max(0, Math.trunc(profile.saml_port) || 0),
      sni: profile.sni,
      user_agent: profile.user_agent,
      hostcheck: profile.hostcheck,
      check_virtual_desktop: profile.check_virtual_desktop,
    },
  };
  fs.writeFileSync(path.join(dir, `${profile.name.trim()}.conf`), ini.stringify(obj), { mode: 0o600 });
}

export async function getProfilePassword(name: string, origin: "local" | "global"): Promise<string> {
  const m = readMainSettings();
  if (m.use_system_password_store) {
    return (await keychain.keytarGet(`vpn:${name}`)) || "";
  }
  const dir = expandHome(origin === "local" ? m.localvpnprofiles : m.globalvpnprofiles);
  const f = path.join(dir, `${name}.conf`);
  const p = await readProfileFromFile(f, origin, true);
  return p?.password || "";
}

export async function deleteProfileLocal(name: string): Promise<boolean> {
  const m = readMainSettings();
  const f = path.join(expandHome(m.localvpnprofiles), `${name}.conf`);
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    await keychain.keytarDelete(`vpn:${name}`).catch(() => {});
    await keychain.keytarDelete(`vpnpem:${name}`).catch(() => {});
    await keychain.keytarDelete(`vpncookie:${name}`).catch(() => {});
    return true;
  }
  return false;
}
