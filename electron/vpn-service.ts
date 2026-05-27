import { BrowserWindow, Notification, Tray } from "electron";
import * as profileService from "./profile-service.js";
import * as ofv from "./openfortivpn-runner.js";
import * as barr from "./barracuda-runner.js";
import * as settingsService from "./settings-service.js";
import { appendVpnLogLine } from "./vpn-file-logger.js";
import * as certTracker from "./cert-failure-tracker.js";
import fs from "fs";
import type { VpnProfile, VpnStartCredentials, VpnTrafficStats } from "./types.js";
function normalizeVpnStartArg(input?: string | VpnStartCredentials): { username?: string; password?: string; otp?: string } {
  if (input == null) return {};
  if (typeof input === "string") return { otp: input };
  return {
    username: input.username,
    password: input.password,
    otp: input.otp,
  };
}

/** Barracuda interactive OTP: `barracudavpn` reads the token from stdin (TUI). OpenFortiGUI uses `--onetimepwd`, which is ignored on several Linux client builds. */
const barracudaStdinOtpPromptSent = new Set<string>();
/** One IPC per Fortigate OTP cycle until explicit reset, reconnect cycle, start, or stop. */
const fortigateStdinOtpPromptSent = new Set<string>();
const otpReconnectCycleDebounced = new Map<string, number>();
const OTP_RECONNECT_DEBOUNCE_MS = 2000;

/**
 * OpenFortiGUI `vpnlogger.cpp`: when `otp_prompt` is empty, OTP UI if chunk contains any of these; when set, substring/regex match.
 * Logger is shared for Fortigate and Barracuda. Extra patterns cover common TUI / gateway wording.
 */
function otpLogLineRequestsToken(line: string, customPrompt?: string): boolean {
  const raw = customPrompt?.trim();
  if (raw) {
    try {
      if (new RegExp(raw, "i").test(line)) return true;
    } catch {
      /* invalid regex from profile → substring */
    }
    return line.toLowerCase().includes(raw.toLowerCase());
  }
  if (/Please/i.test(line)) return true;
  if (/2factor authentication token:/i.test(line)) return true;
  if (/Two-factor authentication/i.test(line)) return true;
  if (/one-time password/i.test(line)) return true;
  if (/Please enter one-time password/i.test(line)) return true;
  if (/Two-factor authentication token\s*:/i.test(line)) return true;
  if (/\bOTP\b/i.test(line) && /\b(?:enter|type|input|provide)\b/i.test(line)) return true;
  if (/enter (?:the |your )?(?:one[-\s]?time )?(?:password|token|code|pin|passcode)\b/i.test(line)) return true;
  if (/second\s+factor|2[-\s]?FA|two[-\s]factor/i.test(line)) return true;
  if (/SMS[-\s]?code|Authenticator/i.test(line)) return true;
  if (/\b(?:challenge|verification)\s+code\b/i.test(line)) return true;
  if (/\btoken\s*[:#>?)]/i.test(line)) return true;
  if (/authentication key\s*:/i.test(line)) return true;
  if (/verification code/i.test(line)) return true;
  if (/soft[-\s]?token|hardware[-\s]?token/i.test(line)) return true;
  return false;
}

function maybeEmitBarracudaStdinOtpPrompt(profileName: string, line: string, profile: VpnProfile): void {
  if (profile.device_type !== "barracuda" || !profile.always_ask_otp) return;
  if (!otpLogLineRequestsToken(line, profile.otp_prompt)) return;
  if (barracudaStdinOtpPromptSent.has(profileName)) return;
  barracudaStdinOtpPromptSent.add(profileName);
  emit("vpn:fortigate-stdin-otp-prompt", { name: profileName });
}

function isOpenfortivpnReconnectCycleLine(line: string): boolean {
  return (
    /tunnel is down/i.test(line) ||
    /got disconnected/i.test(line) ||
    /sleeping \d+ seconds? before/i.test(line) ||
    /\breconnecting\b/i.test(line) ||
    /\bretrying\b/i.test(line) ||
    /connection timed out/i.test(line)
  );
}

/** Allow one new stdin OTP IPC after VPN drop / persistent reconnect (debounced per profile). */
function beginOtpReconnectCycle(profileName: string): void {
  const now = Date.now();
  const last = otpReconnectCycleDebounced.get(profileName) ?? 0;
  if (now - last < OTP_RECONNECT_DEBOUNCE_MS) return;
  otpReconnectCycleDebounced.set(profileName, now);
  fortigateStdinOtpPromptSent.delete(profileName);
  barracudaStdinOtpPromptSent.delete(profileName);
}

/** User chose to request a new OTP after a failed attempt. */
export function resetFortigateOtpPrompt(profileName: string): void {
  fortigateStdinOtpPromptSent.delete(profileName);
  barracudaStdinOtpPromptSent.delete(profileName);
}

/** Feed OTP to a running openfortivpn (FortiGate 2FA on stdin) or barracudavpn (TUI), like typing in a terminal. */
export function submitFortigateStdinOtp(profileName: string, otp: string): boolean {
  const t = otp.trim();
  if (!t) return false;
  if (ofv.writeOpenfortivpnStdinLine(profileName, t)) return true;
  if (barr.writeBarracudaStdinLine(profileName, t)) return true;
  return false;
}

export type ConnState = "disconnected" | "connecting" | "connected";

const status = new Map<string, ConnState>();
const stats = new Map<string, VpnTrafficStats>();
const trafficTimers = new Map<string, NodeJS.Timeout>();
let logWindow: BrowserWindow | null = null;
let trayRef: Tray | null = null;
let statusChangeHook: (() => void) | null = null;

export type GatewayCertUiEvent =
  | { kind: "prompt"; profileName: string; digest: string; body: string }
  | { kind: "blocked"; profileName: string; message: string };

let gatewayCertUiHandler: ((ev: GatewayCertUiEvent) => void) | null = null;

/** Avoid saving the same digest multiple times in one connect attempt. */
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

export function setStatusChangeHook(cb: (() => void) | null) {
  statusChangeHook = cb;
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
  statusChangeHook?.();
}

export function getVpnStatus(name: string): ConnState {
  return status.get(name) || "disconnected";
}

function emitStats(profileName: string, next: VpnTrafficStats): void {
  stats.set(profileName, next);
  emit("vpn:stats", { name: profileName, stats: next });
}

function readInterfaceStats(iface: string): VpnTrafficStats | null {
  try {
    const raw = fs.readFileSync("/proc/net/dev", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (!m || m[1] !== iface) continue;
      const cols = m[2].trim().split(/\s+/).map((x) => Number.parseInt(x, 10));
      if (cols.length >= 16 && Number.isFinite(cols[0]) && Number.isFinite(cols[8])) {
        return { bytes_read: cols[0], bytes_written: cols[8] };
      }
    }
  } catch {
    /* /proc/net/dev is Linux-specific. */
  }
  return null;
}

function clearTrafficPoll(profileName: string): void {
  const timer = trafficTimers.get(profileName);
  if (timer) clearInterval(timer);
  trafficTimers.delete(profileName);
}

function startTrafficPoll(profileName: string, iface: string): void {
  clearTrafficPoll(profileName);
  const tick = () => {
    const next = readInterfaceStats(iface);
    if (next) emitStats(profileName, next);
  };
  tick();
  trafficTimers.set(profileName, setInterval(tick, 2000));
}

function isAnyBarracudaActive(profiles: VpnProfile[], exceptName?: string): boolean {
  for (const [name, state] of status.entries()) {
    if (name === exceptName) continue;
    if (profiles.find((p) => p.name === name)?.device_type !== "barracuda") continue;
    if (state !== "connected" && state !== "connecting") continue;
    return true;
  }
  return false;
}

function maybeEmitFortigateStdinOtpPrompt(profileName: string, line: string, otpPrompt?: string): void {
  if (!otpLogLineRequestsToken(line, otpPrompt)) return;
  if (fortigateStdinOtpPromptSent.has(profileName)) return;
  fortigateStdinOtpPromptSent.add(profileName);
  emit("vpn:fortigate-stdin-otp-prompt", { name: profileName });
}

function processFortigateLogLine(profileName: string, line: string, stream: "stdout" | "stderr", otpPrompt?: string): void {
  appendVpnLogLine(profileName, stream, line);
  if (isOpenfortivpnReconnectCycleLine(line)) beginOtpReconnectCycle(profileName);
  maybeEmitFortigateStdinOtpPrompt(profileName, line, otpPrompt);
  const iface = line.match(/\bInterface\s+([^\s.]+)\s+is\s+UP\b/i)?.[1];
  if (iface) startTrafficPoll(profileName, iface);
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
        line: `[fortivpngui] Failed to save trusted-cert: ${e instanceof Error ? e.message : String(e)}`,
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
    if (isAnyBarracudaActive(profiles, profileName)) {
      throw new Error("Only one running barracuda VPN allowed!");
    }
    if (!effectiveUsername || !effectivePassword) {
      throw new Error("Please provide username and password in your VPN profile!");
    }
    const prev = status.get(profileName);
    status.set(profileName, "connecting");
    onConnStateChange(profileName, prev, "connecting");
    emit("vpn:status", { name: profileName, state: "connecting" });
    barracudaStdinOtpPromptSent.delete(profileName);
    barr.startBarracuda(
      { ...p, username: effectiveUsername },
      effectivePassword,
      "",
      (line) => {
        appendVpnLogLine(profileName, "stdout", line);
        emit("vpn:log", { name: profileName, line, stream: "stdout" });
        maybeEmitBarracudaStdinOtpPrompt(profileName, line, p);
      },
      (s) => {
        const st: ConnState = s === "connected" ? "connected" : s === "connecting" ? "connecting" : "disconnected";
        const prevS = status.get(profileName);
        status.set(profileName, st);
        if (st === "connected") barracudaStdinOtpPromptSent.delete(profileName);
        if (st === "disconnected") clearTrafficPoll(profileName);
        onConnStateChange(profileName, prevS, st);
        emit("vpn:status", { name: profileName, state: st });
      },
      (nextStats) => emitStats(profileName, nextStats)
    );
    return;
  }

  certTracker.resetCertFailureState(profileName);
  const prev = status.get(profileName);
  status.set(profileName, "connecting");
  onConnStateChange(profileName, prev, "connecting");
  emit("vpn:status", { name: profileName, state: "connecting" });
  clearTrustedAutoSaveForProfile(profileName);
  fortigateStdinOtpPromptSent.delete(profileName);
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
      processFortigateLogLine(profileName, ev.line, ev.stream, p.otp_prompt);
      emit("vpn:log", { name: profileName, line: ev.line, stream: ev.stream });
    },
    () => {
      const prevS = status.get(profileName);
      status.set(profileName, "disconnected");
      clearTrafficPoll(profileName);
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
  fortigateStdinOtpPromptSent.delete(profileName);
  barracudaStdinOtpPromptSent.delete(profileName);
  const profiles = await profileService.listProfiles();
  const p = profiles.find((x) => x.name === profileName);
  if (p?.device_type === "barracuda") {
    barr.stopBarracuda(profileName);
    barracudaStdinOtpPromptSent.delete(profileName);
  } else ofv.stopOpenfortivpn(profileName);
  const prev = status.get(profileName);
  status.set(profileName, "disconnected");
  clearTrafficPoll(profileName);
  onConnStateChange(profileName, prev, "disconnected");
  emit("vpn:status", { name: profileName, state: "disconnected" });
}

/** Sync cleanup before the Electron process exits: stop VPN helpers and remove TMPDIR artefacts. */
export function cleanupTempFilesOnQuit(): void {
  ofv.stopEveryOpenfortivpnAndSweepTemp();
  barr.stopEveryBarracudaAndSweepTemp();
}

/** Remove temp files not referenced by running VPN processes (e.g. after hiding the main window). */
export function sweepDetachedVpnTempFiles(): void {
  ofv.sweepOrphanOpenfortivpnConfigs();
  barr.sweepOrphanBarracudaTempDirs();
}
