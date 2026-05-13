import { BrowserWindow, Notification, Tray } from "electron";
import * as profileService from "./profile-service.js";
import * as ofv from "./openfortivpn-runner.js";
import * as barr from "./barracuda-runner.js";
import * as settingsService from "./settings-service.js";
import { appendVpnLogLine } from "./vpn-file-logger.js";
import * as certTracker from "./cert-failure-tracker.js";
import type { VpnStartCredentials } from "./types.js";
function normalizeVpnStartArg(input?: string | VpnStartCredentials): { username?: string; password?: string; otp?: string } {
  if (input == null) return {};
  if (typeof input === "string") return { otp: input };
  return {
    username: input.username,
    password: input.password,
    otp: input.otp,
  };
}

export type ConnState = "disconnected" | "connecting" | "connected";

const status = new Map<string, ConnState>();
let logWindow: BrowserWindow | null = null;
let trayRef: Tray | null = null;

export type GatewayCertUiEvent =
  | { kind: "prompt"; profileName: string; digest: string; body: string }
  | { kind: "blocked"; profileName: string; message: string };

let gatewayCertUiHandler: ((ev: GatewayCertUiEvent) => void) | null = null;

/** Evita guardar o mesmo digest várias vezes por sessão de tentativa de ligação. */
const trustedDigestAutoSaved = new Set<string>();

function trustedAutoSaveKey(profileName: string, digest: string): string {
  return `${profileName}|${digest}`;
}

function clearTrustedAutoSaveForProfile(profileName: string): void {
  const prefix = `${profileName}|`;
  for (const k of [...trustedDigestAutoSaved]) {
    if (k.startsWith(prefix)) trustedDigestAutoSaved.delete(k);
  }
}

/** Linhas tipo `--trusted-cert 2746…` ou `trusted-cert = 2746…` (ex.: prefixo [Amper]). */
function extractDigestFromOpenfortivpnTrustedHint(line: string): string | null {
  const m = line.match(/--trusted-cert\s+([0-9a-fA-F]{64})\b|trusted-cert\s*=\s*([0-9a-fA-F]{64})\b/i);
  if (m) return (m[1] || m[2]).toLowerCase();
  if (/sha256 digest/i.test(line) && /ERROR/i.test(line)) {
    const m2 = line.match(/\b([0-9a-fA-F]{64})\b/);
    if (m2) return m2[1].toLowerCase();
  }
  return null;
}

async function appendTrustedCertDigestToProfile(
  profileName: string,
  digest: string
): Promise<false | "profile" | "cache"> {
  const profiles = await profileService.listProfiles();
  const p = profiles.find((x) => x.name === profileName);
  if (!p || p.device_type !== "fortigate") return false;
  if (p.trust_all_gw_certs) {
    const cached = settingsService.readGwCertCache()[profileName]?.toLowerCase();
    if (cached === digest) return false;
    settingsService.setGwCertCacheEntry(profileName, digest);
    return "cache";
  }
  const cur = ofv.parseTrustedCertDigests(p.trusted_cert);
  if (cur.includes(digest)) return false;
  await profileService.saveProfileLocal({ ...p, trusted_cert: [...cur, digest].join(" ") });
  return "profile";
}

/** IPC / renderer: whitelist gateway SHA-256 after interactive cert prompt (OpenFortiGUI-style). */
export async function trustGatewayCertDigest(profileName: string, digest: string): Promise<false | "profile" | "cache"> {
  const d = digest.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(d)) return false;
  return appendTrustedCertDigestToProfile(profileName, d);
}

/** OpenFortiGUI: with trust_all_gw_certs, digest comes from gw_cert.cache at connect time (see vpnprocess.cpp). */
function effectiveTrustedCertField(p: { name: string; trusted_cert: string; trust_all_gw_certs: boolean }): string {
  const fromProfile = ofv.parseTrustedCertDigests(p.trusted_cert);
  if (!p.trust_all_gw_certs) return fromProfile.join(" ");
  const ours = settingsService.readGwCertCache()[p.name];
  const legacy = settingsService.readOpenfortiguiGwCertCache()[p.name];
  return ofv.parseTrustedCertDigests([fromProfile.join(" "), ours, legacy].filter(Boolean).join(" ")).join(" ");
}

export function setMainWindow(win: BrowserWindow | null) {
  logWindow = win;
}

export function setTrayRef(t: Tray | null) {
  trayRef = t;
}

export function setGatewayCertUiHandler(cb: ((ev: GatewayCertUiEvent) => void) | null) {
  gatewayCertUiHandler = cb;
}

function emit(channel: string, payload: unknown) {
  logWindow?.webContents.send(channel, payload);
}

function maybeNotifyVpn(title: string, body: string): void {
  const s = settingsService.readMainSettings();
  if (s.disable_notifications) return;
  const win = logWindow;
  const hidden = !win || !win.isVisible() || win.isMinimized();
  if (!hidden) return;
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body });
      n.show();
      return;
    }
  } catch (e) {
    console.warn("[vpn-service] Notification failed", e);
  }
  try {
    trayRef?.displayBalloon({ title, content: body });
  } catch (e) {
    console.warn("[vpn-service] tray.displayBalloon failed", e);
  }
}

function onConnStateChange(profileName: string, prev: ConnState | undefined, next: ConnState): void {
  if (prev === next) return;
  if (next === "connected") maybeNotifyVpn("VPN connected", profileName);
  if (next === "disconnected" && (prev === "connected" || prev === "connecting")) {
    maybeNotifyVpn("VPN disconnected", profileName);
  }
}

export function getVpnStatus(name: string): ConnState {
  return status.get(name) || "disconnected";
}

function processFortigateLogLine(profileName: string, line: string, stream: "stdout" | "stderr"): void {
  appendVpnLogLine(profileName, stream, line);
  const flush = certTracker.feedCertFailureLine(profileName, line);
  if (flush) {
    const main = settingsService.readMainSettings();
    if (!flush.parsed) {
      emit("vpn:log", {
        name: profileName,
        line: `[fortivpngui] Gateway certificate failure block ended but no --trusted-cert digest was found in the buffer (${flush.raw.length} chars).`,
        stream: "stderr",
      });
      if (main.disallow_unsecure_certificates) {
        gatewayCertUiHandler?.({
          kind: "blocked",
          profileName,
          message: `Gateway certificate validation failed.\n\n${flush.raw.slice(0, 4000)}`,
        });
      }
    } else if (main.disallow_unsecure_certificates) {
      const message = flush.parsed.body.replace(/\n\nAdd certificate to VPN-profile whitelist\?$/i, "");
      gatewayCertUiHandler?.({ kind: "blocked", profileName, message });
    } else {
      gatewayCertUiHandler?.({
        kind: "prompt",
        profileName,
        digest: flush.parsed.digest,
        body: flush.parsed.body,
      });
    }
  }

  if (certTracker.isCertFailureAccumulating(profileName)) return;

  const digest = extractDigestFromOpenfortivpnTrustedHint(line);
  if (!digest) return;
  const key = trustedAutoSaveKey(profileName, digest);
  if (trustedDigestAutoSaved.has(key)) return;
  trustedDigestAutoSaved.add(key);
  void appendTrustedCertDigestToProfile(profileName, digest)
    .then((saved) => {
      if (saved === "profile") {
        emit("vpn:log", {
          name: profileName,
          line: "[fortivpngui] trusted-cert saved to profile. Connect again.",
          stream: "stderr",
        });
      } else if (saved === "cache") {
        emit("vpn:log", {
          name: profileName,
          line: "[fortivpngui] Gateway digest saved to ~/.fortivpngui/gw_cert.cache (Trust all). Connect again.",
          stream: "stderr",
        });
      } else {
        trustedDigestAutoSaved.delete(key);
      }
    })
    .catch((e) => {
      trustedDigestAutoSaved.delete(key);
      emit("vpn:log", {
        name: profileName,
        line: `[fortivpngui] Erro ao guardar trusted-cert: ${e instanceof Error ? e.message : String(e)}`,
        stream: "stderr",
      });
    });
}

export async function startVpn(profileName: string, arg?: string | VpnStartCredentials): Promise<void> {
  const profiles = await profileService.listProfiles();
  const p = profiles.find((x) => x.name === profileName);
  if (!p) throw new Error("Profile not found");
  const cur = status.get(profileName);
  if (cur === "connecting" || cur === "connected") return;

  const opts = normalizeVpnStartArg(arg);
  const savedPassword = await profileService.getProfilePassword(profileName, p.origin);
  const effectivePassword = opts.password !== undefined ? opts.password : savedPassword;
  const effectiveUsername =
    opts.username !== undefined
      ? opts.username.trim() !== ""
        ? opts.username.trim()
        : p.username
      : p.username;

  if (p.device_type === "barracuda") {
    const prev = status.get(profileName);
    status.set(profileName, "connecting");
    onConnStateChange(profileName, prev, "connecting");
    emit("vpn:status", { name: profileName, state: "connecting" });
    barr.startBarracuda(
      { ...p, username: effectiveUsername },
      effectivePassword,
      (opts.otp ?? "").trim(),
      (line) => {
        appendVpnLogLine(profileName, "stdout", line);
        emit("vpn:log", { name: profileName, line, stream: "stdout" });
      },
      (s) => {
        const st: ConnState = s === "connected" ? "connected" : s === "connecting" ? "connecting" : "disconnected";
        const prevS = status.get(profileName);
        status.set(profileName, st);
        onConnStateChange(profileName, prevS, st);
        emit("vpn:status", { name: profileName, state: st });
      }
    );
    return;
  }

  certTracker.resetCertFailureState(profileName);
  const prev = status.get(profileName);
  status.set(profileName, "connecting");
  onConnStateChange(profileName, prev, "connecting");
  emit("vpn:status", { name: profileName, state: "connecting" });
  clearTrustedAutoSaveForProfile(profileName);
  const trustedMerged = effectiveTrustedCertField(p);
  let loginPassword = effectivePassword;
  let otpArg: string | undefined;
  const otpTrim = opts.otp?.trim();
  if (p.always_ask_otp) {
    if (otpTrim) {
      loginPassword = `${effectivePassword},${otpTrim}`;
      otpArg = otpTrim;
    }
  } else {
    otpArg = otpTrim || undefined;
  }
  ofv.startOpenfortivpn(
    { ...p, username: effectiveUsername, password: "", trusted_cert: trustedMerged },
    loginPassword,
    otpArg,
    (ev) => {
      processFortigateLogLine(profileName, ev.line, ev.stream);
      emit("vpn:log", { name: profileName, line: ev.line, stream: ev.stream });
    },
    () => {
      const prevS = status.get(profileName);
      status.set(profileName, "disconnected");
      onConnStateChange(profileName, prevS, "disconnected");
      emit("vpn:status", { name: profileName, state: "disconnected" });
    },
    () => {
      const prevS = status.get(profileName);
      status.set(profileName, "connected");
      onConnStateChange(profileName, prevS, "connected");
      emit("vpn:status", { name: profileName, state: "connected" });
    }
  );
}

export async function stopVpn(profileName: string): Promise<void> {
  const profiles = await profileService.listProfiles();
  const p = profiles.find((x) => x.name === profileName);
  if (p?.device_type === "barracuda") barr.stopBarracuda(profileName);
  else ofv.stopOpenfortivpn(profileName);
  const prev = status.get(profileName);
  status.set(profileName, "disconnected");
  onConnStateChange(profileName, prev, "disconnected");
  emit("vpn:status", { name: profileName, state: "disconnected" });
}
