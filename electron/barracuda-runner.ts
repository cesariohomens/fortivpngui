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

const barracudaProcesses = new Map<string, { proc: ChildProcess; timer?: NodeJS.Timeout }>();

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
  barracudaProcesses.delete(name);
}

export function startBarracuda(
  profile: VpnProfile,
  password: string,
  otpToken: string,
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
  if (profile.always_ask_otp) {
    args.push("--onetimepwd", otpToken);
  }
  args.push("--config", `${base}/`);
  if (profile.debug) args.push("--verbose");

  onStatus("connecting");
  const proc = spawn("barracudavpn", args, { stdio: ["ignore", "pipe", "pipe"] });
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
      return;
    }
    startStatusPolling();
  });
  proc.on("error", (err) => {
    onLog(`spawn error: ${err.message}`);
    onStatus("disconnected");
    barracudaProcesses.delete(profile.name);
  });

  barracudaProcesses.set(profile.name, { proc });
}
