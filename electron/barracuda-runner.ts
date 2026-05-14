import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { VpnProfile, VpnTrafficStats } from "./types.js";

const TEMPLATE = `BINDIP = 
CERTFILE = 
DNSFILEMODE = AUTO
DYNSSA = 2
HANDSHAKETIMEOUT = 10
IPV6TUNNELING = YES
KEEPALIVE = 10
KEYFILE = 
MAXRECONNECT = 3
OTPMODE = %2
PROXYADDR = 
PROXYPORT = 8080
PROXYTYPE = NO PROXY
PROXYUSER = 
SERVER = %1
SERVERPORT = 691
SPECIAL = NONE
TAP = /dev/net/tun
TUNNELENC = AES128-MD5
TUNNELMODE = UDP
TUNNELREKEY = 20
WRITEDNS = NO

.
`;

const barracudaProcesses = new Map<string, { proc: ChildProcess; timer?: NodeJS.Timeout; tempDir: string }>();

function removeBarracudaTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** Remove `fortivpngui-barracuda-*` dirs under TMPDIR that are not tied to an active barracudavpn session. */
export function sweepOrphanBarracudaTempDirs(): void {
  const active = new Set<string>();
  for (const b of barracudaProcesses.values()) {
    if (b.tempDir) active.add(path.resolve(b.tempDir));
  }
  let entries: string[];
  try {
    entries = fs.readdirSync(os.tmpdir());
  } catch {
    return;
  }
  const prefix = "fortivpngui-barracuda-";
  for (const ent of entries) {
    if (!ent.startsWith(prefix)) continue;
    const full = path.resolve(path.join(os.tmpdir(), ent));
    if (active.has(full)) continue;
    try {
      if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Remove any `fortivpngui-barracuda-*` dirs left under the system temp directory. */
export function sweepBarracudaTempDirs(): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(os.tmpdir());
  } catch {
    return;
  }
  const prefix = "fortivpngui-barracuda-";
  for (const ent of entries) {
    if (!ent.startsWith(prefix)) continue;
    const full = path.join(os.tmpdir(), ent);
    try {
      if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export function stopEveryBarracudaAndSweepTemp(): void {
  for (const name of [...barracudaProcesses.keys()]) stopBarracuda(name);
  sweepBarracudaTempDirs();
}

function readTunStats(): VpnTrafficStats | null {
  try {
    const raw = fs.readFileSync("/proc/net/dev", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (!m || !m[1].includes("tun")) continue;
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

export function stopBarracuda(name: string): void {
  const b = barracudaProcesses.get(name);
  if (b?.timer) clearInterval(b.timer);
  spawn("barracudavpn", ["--stop"], { stdio: "ignore" });
  const tempDir = b?.tempDir;
  barracudaProcesses.delete(name);
  if (tempDir) removeBarracudaTempDir(tempDir);
}

/** Send one line to barracudavpn stdin (interactive OTP / TUI), like typing in a terminal. */
export function writeBarracudaStdinLine(profileName: string, text: string): boolean {
  const b = barracudaProcesses.get(profileName);
  if (!b || b.proc.killed) return false;
  const stdin = b.proc.stdin;
  if (!stdin) return false;
  const w = stdin as NodeJS.WritableStream & { writable?: boolean; destroyed?: boolean };
  if (w.destroyed || w.writable === false) return false;
  return w.write(`${text}\n`, "utf8") !== false;
}

export function startBarracuda(
  profile: VpnProfile,
  password: string,
  _otpToken: string,
  onLog: (line: string) => void,
  onStatus: (s: "connecting" | "connected" | "disconnected") => void,
  onStats?: (stats: VpnTrafficStats) => void
): void {
  if (barracudaProcesses.has(profile.name)) return;

  const base = path.join(os.tmpdir(), `fortivpngui-barracuda-${profile.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
  fs.mkdirSync(path.join(base, "ca"), { recursive: true });
  const confFile = path.join(base, "barracudavpn.conf");
  const mode = profile.always_ask_otp ? "STATIC" : "OFF";
  fs.writeFileSync(confFile, TEMPLATE.replace("%1", profile.gateway_host).replace("%2", mode));

  const args = ["--start", "--login", profile.username, "--serverpwd", password];
  /** OpenFortiGUI passes `--onetimepwd`; many Linux client builds ignore it — use OTPMODE=STATIC + stdin like a real TTY. */
  args.push("--config", `${base}/`);
  if (profile.debug) args.push("--verbose");

  onStatus("connecting");
  const proc = spawn("barracudavpn", args, {
    /** Pipe stdin so the client can read OTP from the TUI the same way as an interactive terminal. */
    stdio: ["pipe", "pipe", "pipe"],
  });
  let initialOutput = "";
  const log = (d: Buffer) => {
    const t = d.toString("utf8");
    initialOutput += t;
    for (const line of t.split(/\r?\n/)) if (line) onLog(line);
  };
  proc.stdout?.on("data", log);
  proc.stderr?.on("data", log);

  const startStatusPolling = () => {
    const current = barracudaProcesses.get(profile.name);
    if (!current || current.timer) return;
    const timer = setInterval(() => {
      const st = spawn("barracudavpn", ["--status"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      st.stdout?.on("data", (d) => (out += d.toString()));
      st.stderr?.on("data", (d) => (out += d.toString()));
      st.on("close", () => {
        for (const line of out.split(/\r?\n/)) if (line) onLog(line);
        if (out.includes("Status:      CONNECTED")) {
          onStatus("connected");
          const stats = readTunStats();
          if (stats) onStats?.(stats);
        } else {
          onStatus("disconnected");
          stopBarracuda(profile.name);
        }
      });
    }, 2000);
    barracudaProcesses.set(profile.name, { ...current, timer });
  };

  proc.on("exit", () => {
    if (/failed/i.test(initialOutput)) {
      onStatus("disconnected");
      barracudaProcesses.delete(profile.name);
      removeBarracudaTempDir(base);
      return;
    }
    startStatusPolling();
  });
  proc.on("error", (err) => {
    onLog(`spawn error: ${err.message}`);
    onStatus("disconnected");
    barracudaProcesses.delete(profile.name);
    removeBarracudaTempDir(base);
  });

  barracudaProcesses.set(profile.name, { proc, tempDir: base });
}
