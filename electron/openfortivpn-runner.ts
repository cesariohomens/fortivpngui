import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync, ChildProcess } from "child_process";
import type { VpnProfile } from "./types.js";
import { readMainSettings } from "./settings-service.js";

export interface OpenfortivpnLog {
  profileName: string;
  line: string;
  stream: "stdout" | "stderr";
}

/** SHA-256 gateway cert digests for `trusted-cert` lines (64 hex chars, lowercase). */
export function parseTrustedCertDigests(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/[\s,;\n\r]+/).filter(Boolean)) {
    let t = token.trim();
    const prefixed = t.match(/^(?:sha256:|0x)([0-9a-fA-F]{64})$/i);
    if (prefixed) t = prefixed[1];
    if (/^[0-9a-fA-F]{64}$/.test(t)) {
      const lo = t.toLowerCase();
      if (!seen.has(lo)) {
        seen.add(lo);
        out.push(lo);
      }
    }
  }
  return out;
}

/** Build openfortivpn-compatible config file (key names with hyphens per upstream). */
export function buildOpenfortivpnConfig(profile: VpnProfile, password: string, otp?: string): string {
  const lines: string[] = [];
  lines.push(`host = ${profile.gateway_host}`);
  lines.push(`port = ${profile.gateway_port || 443}`);
  if (profile.username) lines.push(`username = ${profile.username}`);
  if (password) lines.push(`password = ${password}`);
  if (otp) lines.push(`otp = ${otp}`);
  if (profile.realm) lines.push(`realm = ${profile.realm}`);
  if (!profile.set_routes) lines.push("set-routes = 0");
  if (profile.set_dns) lines.push("set-dns = 1");
  if (profile.half_internet_routers) lines.push("half-internet-routes = 1");
  if (profile.persistent) lines.push(`persistent = 60`);
  if (profile.ca_file) lines.push(`ca-file = ${profile.ca_file}`);
  if (profile.user_cert) lines.push(`user-cert = ${profile.user_cert}`);
  if (profile.user_key) lines.push(`user-key = ${profile.user_key}`);
  for (const digest of parseTrustedCertDigests(profile.trusted_cert)) {
    lines.push(`trusted-cert = ${digest}`);
  }
  if (profile.insecure_ssl) {
    lines.push(`insecure-ssl = 1`);
  }
  if (profile.seclevel1) lines.push(`seclevel-1 = 1`);
  const minTls = (profile.min_tls || "").trim();
  if (minTls && !/^default$/i.test(minTls)) {
    lines.push(`min-tls = ${minTls}`);
  }
  if (profile.pppd_no_peerdns) lines.push(`pppd-no-peerdns = 1`);
  if (profile.pppd_no_peerdns) lines.push("pppd-use-peerdns = 0");
  if (profile.pppd_accept_remote) lines.push(`pppd-accept-remote = 1`);
  if (profile.pppd_log_file) lines.push(`pppd-log = ${profile.pppd_log_file}`);
  if (profile.pppd_plugin_file) lines.push(`pppd-plugin = ${profile.pppd_plugin_file}`);
  if (profile.pppd_ifname) lines.push(`pppd-ifname = ${profile.pppd_ifname}`);
  if (profile.pppd_ipparam) lines.push(`pppd-ipparam = ${profile.pppd_ipparam}`);
  if (profile.pppd_call) lines.push(`pppd-call = ${profile.pppd_call}`);
  if (profile.otp_prompt) lines.push(`otp-prompt = ${profile.otp_prompt}`);
  if (profile.otp_delay) lines.push(`otp-delay = ${profile.otp_delay}`);
  if (profile.no_ftm_push) lines.push(`no-ftm-push = 1`);
  return lines.join("\n") + "\n";
}

const running = new Map<string, { proc: ChildProcess; configPath: string }>();

/**
 * Absolute path to openfortivpn for `sudo` argv.
 * Sudoers `NOPASSWD: /usr/bin/openfortivpn` only matches that path — not bare `openfortivpn`.
 */
export function resolveOpenfortivpnExecutable(): string | null {
  const env = process.env.OPENFORTIVPN_PATH?.trim();
  if (env) return path.isAbsolute(env) ? env : path.resolve(env);
  for (const p of ["/usr/bin/openfortivpn", "/usr/local/bin/openfortivpn"]) {
    if (fs.existsSync(p)) return p;
  }
  const r = spawnSync("which", ["openfortivpn"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  return null;
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
  fs.writeFileSync(configPath, buildOpenfortivpnConfig(profile, password, otp), { mode: 0o600 });

  const digests = parseTrustedCertDigests(profile.trusted_cert);
  const rawTc = profile.trusted_cert?.trim();
  if (rawTc && digests.length === 0) {
    onLog({
      profileName: name,
      line: "[fortivpngui] Trusted cert field has text but no valid 64-char hex SHA-256 digest was parsed.",
      stream: "stderr",
    });
  }

  const args: string[] = [];
  args.push("-c", configPath);
  if (profile.debug) args.push("-v");
  if (otp) {
    args.push("--otp", otp);
  }

  const bin = resolveOpenfortivpnExecutable();
  if (!bin) {
    onLog({ profileName: name, line: "openfortivpn not found (install package or set OPENFORTIVPN_PATH)", stream: "stderr" });
    onExit(null);
    return;
  }

  const m = readMainSettings();
  const sudoArgs = [...(m.sudo_preserve_env ? ["-E"] : []), bin, ...args];
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
