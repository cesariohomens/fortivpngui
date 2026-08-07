import fs from "fs";
import path from "path";
import ini from "ini";
import { paths } from "./config.js";
import { patchMainSettings } from "./settings-service.js";
import type { MainSettings } from "../shared/types.js";

function iniBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1";
}

/** Read ~/.openfortigui/main.conf and return fields we can map into fortivpngui main.conf. */
function readOpenfortiguiMainPartial(): Partial<MainSettings> | null {
  const conf = path.join(paths.openfortiguiLegacy(), "main.conf");
  if (!fs.existsSync(conf)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(conf, "utf8");
  } catch {
    return null;
  }
  const o = ini.parse(raw) as Record<string, Record<string, string>>;
  const main = o.main || {};
  const gui = o.gui || {};
  const out: Partial<MainSettings> = {};
  if (main.disallow_unsecure_certificates !== undefined) {
    out.disallow_unsecure_certificates = iniBool(main.disallow_unsecure_certificates);
  }
  if (main.show_search !== undefined) {
    out.show_search = iniBool(main.show_search);
  }
  if (main.start_minimized !== undefined) {
    out.start_minimized = iniBool(main.start_minimized);
  }
  if (main.sudo_preserve_env !== undefined) {
    out.sudo_preserve_env = iniBool(main.sudo_preserve_env);
  }
  if (gui.disable_notifications !== undefined) {
    out.disable_notifications = iniBool(gui.disable_notifications);
  }
  if (gui.connect_on_dblclick !== undefined) {
    out.connect_on_dblclick = iniBool(gui.connect_on_dblclick);
  }
  return Object.keys(out).length ? out : null;
}

/** Merge trivially mappable keys from OpenFortiGUI main.conf into ~/.fortivpngui/main.conf. */
export function mergeOpenfortiguiMainIntoFortivpngui(): MainSettings | null {
  const partial = readOpenfortiguiMainPartial();
  if (!partial) return null;
  return patchMainSettings(partial);
}

export interface ImportResult {
  profilesCopied: number;
  groupsCopied: number;
  errors: string[];
}

export function importFromOpenfortigui(): ImportResult {
  const ofgMain = readOpenfortiguiMainPartial();
  if (ofgMain) {
    patchMainSettings(ofgMain);
    console.log("[import] Merged OpenFortiGUI main.conf keys:", Object.keys(ofgMain).join(", "));
  }
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
