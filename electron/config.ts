import path from "path";
import os from "os";

export const APP_NAME = "FortiVPN GUI";
/** Bump when changelog content changes (shown until user marks read). */
export const CHANGELOG_REV = 6;

export const NAME_VALIDATOR = /^[a-zA-ZäöüÄÖÜ0-9 \-_]{3,}$/;

export const DEFAULT_AES_KEY = "yowp2IwTTRodgdWp";
export const DEFAULT_AES_IV = "VoUT5n5ToogkmQU3";

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (p === "~") return os.homedir();
  return p;
}

export function toTilde(abs: string): string {
  const h = os.homedir();
  if (abs.startsWith(h + path.sep)) return "~" + path.sep + abs.slice(h.length + 1);
  return abs;
}

export const paths = {
  baseDir: () => path.join(os.homedir(), ".fortivpngui"),
  mainConf: () => path.join(os.homedir(), ".fortivpngui", "main.conf"),
  gwCertCache: () => path.join(os.homedir(), ".fortivpngui", "gw_cert.cache"),
  localProfiles: () => path.join(os.homedir(), ".fortivpngui", "vpnprofiles"),
  globalProfiles: () => "/etc/fortivpngui/vpnprofiles",
  localGroups: () => path.join(os.homedir(), ".fortivpngui", "vpngroups"),
  logsDir: () => path.join(os.homedir(), ".fortivpngui", "logs"),
  vpnLogsDir: () => path.join(os.homedir(), ".fortivpngui", "logs", "vpn"),
  openfortiguiLegacy: () => path.join(os.homedir(), ".openfortigui"),
};
