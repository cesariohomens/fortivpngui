/**
 * Classifies why a VPN tunnel dropped, from the tail of the runner output.
 * `reasonKey` is resolved by the renderer against `disconnect.*` i18n messages.
 */

const TAIL_SIZE = 40;
/** Lines shown verbatim in the warning dialog. */
const DETAIL_SIZE = 8;

const tails = new Map<string, string[]>();
/** Profiles stopped from the UI or tray: no warning for those. */
const userInitiated = new Set<string>();

export type DisconnectReasonKey =
  | "authFailed"
  | "otpInvalid"
  | "certRejected"
  | "gatewayUnreachable"
  | "timedOut"
  | "resetByPeer"
  | "pppdFailed"
  | "sudoDenied"
  | "binaryMissing"
  | "tunnelDown"
  | "unknown";

const PATTERNS: { key: DisconnectReasonKey; re: RegExp }[] = [
  { key: "binaryMissing", re: /openfortivpn not found|spawn error/i },
  { key: "sudoDenied", re: /sudo:.*(?:no tty|not allowed|incorrect password|a password is required)/i },
  { key: "otpInvalid", re: /(?:otp|token|one-time password).*(?:invalid|incorrect|expired|rejected)|invalid.*(?:otp|token)/i },
  { key: "authFailed", re: /could not authenticate to (?:the )?gateway|no cookie given|authentication failed|access denied|permission denied by gateway/i },
  { key: "certRejected", re: /certificate (?:verification|validation) failed|gateway certificate|self[- ]signed certificate|certificate has expired|unable to verify/i },
  { key: "gatewayUnreachable", re: /could not resolve|name or service not known|no route to host|network is unreachable|connection refused|could not connect to gateway/i },
  { key: "timedOut", re: /connection timed out|timed out|timeout while/i },
  { key: "pppdFailed", re: /pppd (?:died|exited|failed|terminated)|ppp daemon|lcp: timeout|modem hangup/i },
  { key: "resetByPeer", re: /connection reset by peer|broken pipe|ssl_read|unexpected eof|gateway closed the connection/i },
  { key: "tunnelDown", re: /tunnel is down|got disconnected|closed connection to (?:the )?gateway|tunnel closed|logged out/i },
];

export function recordDisconnectHintLine(profileName: string, line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  const tail = tails.get(profileName) ?? [];
  tail.push(trimmed);
  if (tail.length > TAIL_SIZE) tail.splice(0, tail.length - TAIL_SIZE);
  tails.set(profileName, tail);
}

export function markUserInitiatedStop(profileName: string): void {
  userInitiated.add(profileName);
}

export function isUserInitiatedStop(profileName: string): boolean {
  return userInitiated.has(profileName);
}

export function resetDisconnectTracking(profileName: string): void {
  tails.delete(profileName);
  userInitiated.delete(profileName);
}

export function classifyDisconnect(profileName: string): { reasonKey: DisconnectReasonKey; detail: string } {
  const tail = tails.get(profileName) ?? [];
  let reasonKey: DisconnectReasonKey = "unknown";
  for (let i = tail.length - 1; i >= 0 && reasonKey === "unknown"; i -= 1) {
    const match = PATTERNS.find((p) => p.re.test(tail[i]));
    if (match) reasonKey = match.key;
  }
  return { reasonKey, detail: tail.slice(-DETAIL_SIZE).join("\n") };
}
