import fs from "fs";
import os from "os";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import type { VpnProfile } from "./types.js";
import { readMainSettings } from "./settings-service.js";

export interface OpenfortivpnLog {
  profileName: string;
  line: string;
  stream: "stdout" | "stderr";
}

/** Build openfortivpn-compatible config file (key names with hyphens per upstream). */
export function buildOpenfortivpnConfig(profile: VpnProfile, password: string): string {
  const lines: string[] = [];
  lines.push(`host = ${profile.gateway_host}`);
  lines.push(`port = ${profile.gateway_port || 443}`);
  if (profile.username) lines.push(`username = ${profile.username}`);
  if (password) lines.push(`password = ${password}`);
  if (profile.realm) lines.push(`realm = ${profile.realm}`);
  lines.push(`set-routes = ${profile.set_routes ? 1 : 0}`);
  lines.push(`set-dns = ${profile.set_dns ? 1 : 0}`);
  lines.push(`half-internet-routes = ${profile.half_internet_routers ? 1 : 0}`);
  if (profile.persistent) lines.push(`persistent = 60`);
  if (profile.ca_file) lines.push(`ca-file = ${profile.ca_file}`);
  if (profile.user_cert) lines.push(`user-cert = ${profile.user_cert}`);
  if (profile.user_key) lines.push(`user-key = ${profile.user_key}`);
  if (profile.trusted_cert) {
    for (const digest of profile.trusted_cert.split(/[\s,]+/).filter(Boolean)) {
      lines.push(`trusted-cert = ${digest}`);
    }
  }
  if (!profile.verify_cert || profile.trust_all_gw_certs || profile.insecure_ssl) {
    lines.push(`insecure-ssl = 1`);
  }
  if (profile.seclevel1) lines.push(`seclevel-1 = 1`);
  if (profile.min_tls && profile.min_tls !== "default") {
    lines.push(`min-tls = ${profile.min_tls}`);
  }
  if (profile.pppd_no_peerdns) lines.push(`pppd-no-peerdns = 1`);
  lines.push(`pppd-use-peerdns = ${profile.pppd_no_peerdns ? 0 : 1}`);
  if (profile.pppd_accept_remote) lines.push(`pppd-accept-remote = 1`);
  if (profile.pppd_log_file) lines.push(`pppd-log = ${profile.pppd_log_file}`);
  if (profile.pppd_plugin_file) lines.push(`pppd-plugin = ${profile.pppd_plugin_file}`);
  if (profile.pppd_ifname) lines.push(`pppd-ifname = ${profile.pppd_ifname}`);
  if (profile.pppd_ipparam) lines.push(`pppd-ipparam = ${profile.pppd_ipparam}`);
  if (profile.pppd_call) lines.push(`pppd-call = ${profile.pppd_call}`);
  if (profile.otp_prompt) lines.push(`otp-prompt = ${profile.otp_prompt}`);
  if (profile.otp_delay) lines.push(`otp-delay = ${profile.otp_delay}`);
  return lines.join("\n") + "\n";
}

const running = new Map<string, { proc: ChildProcess; configPath: string }>();

function findOpenfortivpn(): string {
  return process.env.OPENFORTIVPN_PATH || "openfortivpn";
}

export function isOpenfortivpnRunning(name: string): boolean {
  return running.has(name);
}

export function stopOpenfortivpn(name: string): void {
  const r = running.get(name);
  if (!r) return;
  try {
    r.proc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(r.configPath);
  } catch {
    /* ignore */
  }
  running.delete(name);
}

export function startOpenfortivpn(
  profile: VpnProfile,
  password: string,
  otp: string | undefined,
  onLog: (ev: OpenfortivpnLog) => void,
  onExit: (code: number | null) => void,
  onTunnelUp?: () => void
): void {
  const name = profile.name;
  if (running.has(name)) return;

  const cfgDir = path.join(os.tmpdir(), "fortivpngui");
  fs.mkdirSync(cfgDir, { recursive: true });
  const configPath = path.join(cfgDir, `run-${name}-${Date.now()}.conf`);
  fs.writeFileSync(configPath, buildOpenfortivpnConfig(profile, password), { mode: 0o600 });

  const args: string[] = ["-c", configPath];
  if (profile.debug) args.push("-v");
  if (otp) {
    args.push("--otp", otp);
  }

  const m = readMainSettings();
  const sudoArgs = [...(m.sudo_preserve_env ? ["-E"] : []), findOpenfortivpn(), ...args];
  const proc = spawn("sudo", sudoArgs, {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const push = (stream: "stdout" | "stderr", chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line) {
        onLog({ profileName: name, line, stream });
        if (/[Tt]unnel is up|Interface .* is UP/i.test(line)) onTunnelUp?.();
      }
    }
  };
  proc.stdout?.on("data", (d: Buffer) => push("stdout", d));
  proc.stderr?.on("data", (d: Buffer) => push("stderr", d));
  proc.on("exit", (code) => {
    try {
      fs.unlinkSync(configPath);
    } catch {
      /* ignore */
    }
    running.delete(name);
    onExit(code);
  });
  proc.on("error", (err) => {
    onLog({ profileName: name, line: `spawn error: ${err.message}`, stream: "stderr" });
    onExit(null);
  });

  running.set(name, { proc, configPath });
}
