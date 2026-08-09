import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

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

export interface OpenfortivpnVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * First upstream release that accepts each key in a config file, taken from `src/config.c` at the release tags.
 * `load_config()` aborts parsing on an unknown key (`goto err_free`), silently dropping every later key, so a key
 * must never be written to a binary that does not know it.
 */
const CONFIG_KEY_MIN_VERSION: Record<string, [number, number]> = {
  "min-tls": [1, 10],
  "seclevel-1": [1, 10],
  pinentry: [1, 10],
  "use-resolvconf": [1, 14],
  "pem-passphrase": [1, 16],
  "user-agent": [1, 16],
  hostcheck: [1, 16],
  "check-virtual-desktop": [1, 16],
  "pppd-accept-remote": [1, 21],
  sni: [1, 22],
  "saml-login": [1, 23],
};

let cache: { bin: string | null; version: OpenfortivpnVersion | null; cliOptions: Set<string> | null } | null = null;

function parseVersion(raw: string): OpenfortivpnVersion | null {
  const m = raw.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return {
    major: Number.parseInt(m[1], 10),
    minor: Number.parseInt(m[2], 10),
    patch: m[3] ? Number.parseInt(m[3], 10) : 0,
    raw: m[0],
  };
}

/** Long options the installed binary advertises in `--help`, or null when `--help` could not be read. */
function parseCliOptions(help: string): Set<string> | null {
  const found = new Set<string>();
  for (const m of help.matchAll(/--([a-z0-9-]+)/g)) found.add(m[1]);
  return found.size > 0 ? found : null;
}

function probe(): { version: OpenfortivpnVersion | null; cliOptions: Set<string> | null } {
  const bin = resolveOpenfortivpnExecutable();
  if (cache && cache.bin === bin) return cache;
  let version: OpenfortivpnVersion | null = null;
  let cliOptions: Set<string> | null = null;
  if (bin) {
    try {
      const v = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 5000 });
      version = parseVersion(`${v.stdout || ""}\n${v.stderr || ""}`);
      const h = spawnSync(bin, ["--help"], { encoding: "utf8", timeout: 5000 });
      cliOptions = parseCliOptions(`${h.stdout || ""}\n${h.stderr || ""}`);
    } catch {
      /* keep whatever was parsed before the failure */
    }
  }
  cache = { bin, version, cliOptions };
  return cache;
}

/** Version of the openfortivpn that will actually be spawned, or null when it cannot be determined. */
export function detectOpenfortivpnVersion(): OpenfortivpnVersion | null {
  return probe().version;
}

/**
 * Whether the installed openfortivpn accepts a command-line option, read from its own `--help`.
 * An unknown argv option makes openfortivpn exit before connecting, so options that only exist on argv
 * (`--ifname`, `--cookie-on-stdin`) are checked this way instead of against a version table.
 */
export function supportsCliOption(name: string): boolean {
  const opts = probe().cliOptions;
  if (!opts) return true;
  return opts.has(name);
}

/**
 * Whether the installed openfortivpn understands a config-file key.
 * When the version cannot be determined we stay permissive: the caller writes gated keys last, so a rejected key
 * costs at most the other gated keys rather than the connection settings.
 */
export function supportsConfigKey(key: string): boolean {
  const min = CONFIG_KEY_MIN_VERSION[key];
  if (!min) return true;
  const v = detectOpenfortivpnVersion();
  if (!v) return true;
  const [major, minor] = min;
  return v.major > major || (v.major === major && v.minor >= minor);
}
