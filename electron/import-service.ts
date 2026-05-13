import fs from "fs";
import path from "path";
import { paths } from "./config.js";

export interface ImportResult {
  profilesCopied: number;
  groupsCopied: number;
  errors: string[];
}

export function importFromOpenfortigui(): ImportResult {
  const errors: string[] = [];
  const legacy = paths.openfortiguiLegacy();
  let profilesCopied = 0;
  let groupsCopied = 0;
  if (!fs.existsSync(legacy)) {
    errors.push(`Legacy directory not found: ${legacy}`);
    return { profilesCopied, groupsCopied, errors };
  }
  const lp = path.join(legacy, "vpnprofiles");
  const destP = paths.localProfiles();
  fs.mkdirSync(destP, { recursive: true });
  if (fs.existsSync(lp)) {
    for (const f of fs.readdirSync(lp)) {
      if (!f.endsWith(".conf")) continue;
      try {
        fs.copyFileSync(path.join(lp, f), path.join(destP, f));
        profilesCopied++;
      } catch (e) {
        errors.push(`Profile ${f}: ${(e as Error).message}`);
      }
    }
  }
  const lg = path.join(legacy, "vpngroups");
  const destG = paths.localGroups();
  fs.mkdirSync(destG, { recursive: true });
  if (fs.existsSync(lg)) {
    for (const f of fs.readdirSync(lg)) {
      if (!f.endsWith(".conf")) continue;
      try {
        fs.copyFileSync(path.join(lg, f), path.join(destG, f));
        groupsCopied++;
      } catch (e) {
        errors.push(`Group ${f}: ${(e as Error).message}`);
      }
    }
  }
  return { profilesCopied, groupsCopied, errors };
}
