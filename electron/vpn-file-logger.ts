import fs from "fs";
import path from "path";
import os from "os";
import { expandHome, readMainSettings } from "./settings-service.js";

const MAX_BYTES = 2 * 1024 * 1024;

function safeProfileSegment(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "unknown";
}

function vpnLogDir(): string {
  const m = readMainSettings();
  const raw = (m.logs || "").trim();
  const base = raw ? expandHome(raw) : path.join(os.homedir(), ".fortivpngui", "logs");
  const dir = path.join(base, "vpn");
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  return dir;
}

function rotateIfNeeded(file: string): void {
  try {
    const st = fs.statSync(file);
    if (st.size < MAX_BYTES) return;
    const bak = `${file}.1`;
    if (fs.existsSync(bak)) fs.unlinkSync(bak);
    fs.renameSync(file, bak);
  } catch {
    /* ignore */
  }
}

/** Append one VPN log line under expanded `settings.logs`/vpn/<profile>.log (rotates at ~2 MiB). */
export function appendVpnLogLine(profileName: string, stream: "stdout" | "stderr", line: string): void {
  try {
    const dir = vpnLogDir();
    const file = path.join(dir, `${safeProfileSegment(profileName)}.log`);
    rotateIfNeeded(file);
    const ts = new Date().toISOString();
    fs.appendFileSync(file, `${ts} [${stream}] ${line}\n`, { mode: 0o600 });
  } catch (e) {
    console.warn("[vpn-file-logger]", e);
  }
}
