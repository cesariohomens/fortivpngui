import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { VpnProfile } from "./types.js";

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
  onStatus: (s: "connecting" | "connected" | "disconnected") => void
): void {
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
  const log = (d: Buffer) => {
    const t = d.toString("utf8");
    for (const line of t.split(/\r?\n/)) if (line) onLog(line);
  };
  proc.stdout?.on("data", log);
  proc.stderr?.on("data", log);

  proc.on("exit", () => {
    const b = barracudaProcesses.get(profile.name);
    if (b?.timer) clearInterval(b.timer);
    barracudaProcesses.delete(profile.name);
  });

  const timer = setInterval(() => {
    const st = spawn("barracudavpn", ["--status"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    st.stdout?.on("data", (d) => (out += d.toString()));
    st.on("close", () => {
      if (out.includes("Status:      CONNECTED")) onStatus("connected");
      else if (out.includes("failed")) onStatus("disconnected");
    });
  }, 2000);

  barracudaProcesses.set(profile.name, { proc, timer });
}
