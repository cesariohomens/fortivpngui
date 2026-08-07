const TRIGGER =
  "Gateway certificate validation failed, and the certificate digest is not in the local whitelist.";
const CLOSE = "Closed connection to gateway.";
const MAX_BUFFER = 10000;

export interface ParsedCertFailure {
  digest: string;
  /** User-facing detail (subject / gateway cert block). */
  info: string;
  /** Full message for blocked dialog / prompt body. */
  body: string;
}

export type CertFailureFlush = { profileName: string; raw: string; parsed: ParsedCertFailure | null };

const state = new Map<string, { mode: boolean; buf: string }>();

function getState(name: string): { mode: boolean; buf: string } {
  let s = state.get(name);
  if (!s) {
    s = { mode: false, buf: "" };
    state.set(name, s);
  }
  return s;
}

export function resetCertFailureState(profileName: string): void {
  state.delete(profileName);
}

export function isCertFailureAccumulating(profileName: string): boolean {
  return getState(profileName).mode;
}

/** OFG vpnLogger.cpp: accumulate from trigger until Closed connection or size cap. Returns flush event or null. */
export function feedCertFailureLine(profileName: string, line: string): CertFailureFlush | null {
  const s = getState(profileName);
  if (line.includes(TRIGGER)) s.mode = true;
  if (s.mode) s.buf += `${line}\n`;

  const over = s.buf.length > MAX_BUFFER;
  const closed = s.mode && line.includes(CLOSE);
  if (!s.mode || (!closed && !over)) return null;

  const raw = s.buf;
  s.mode = false;
  s.buf = "";
  const parsed = parseCertFailureBuffer(raw);
  return { profileName, raw, parsed };
}

function parseCertFailureBuffer(buffer: string): ParsedCertFailure | null {
  const digestM = buffer.match(/--trusted-cert\s+([0-9a-fA-F]{64})\b/);
  const digest = digestM ? digestM[1].toLowerCase() : "";
  if (!digest) return null;

  let info = "";
  const infoM = buffer.match(/Gateway certificate:\r?\n([\s\S]*?)sha256 digest:\r?\n/i);
  if (infoM) {
    info = infoM[1].replace(/ERROR:\s*/gi, "").trim();
  }

  const head =
    "Gateway certificate validation failed and the certificate digest is not in the local whitelist nor a valid CA is provided. Certificate details:\n\n";
  const tail = "\n\nAdd certificate to VPN-profile whitelist?";
  const body = `${head}${info || "(see VPN log for full certificate output)"}${tail}`;
  return { digest, info, body };
}
