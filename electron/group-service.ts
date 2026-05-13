import fs from "fs";
import path from "path";
import ini from "ini";
import { expandHome, NAME_VALIDATOR } from "./config.js";
import { readMainSettings } from "./settings-service.js";
import type { VpnGroup } from "./types.js";

function parseGroupIni(content: string): VpnGroup | null {
  const o = ini.parse(content) as Record<string, unknown>;
  const raw = o.group as Record<string, unknown> | undefined;
  if (!raw || typeof raw.name !== "string") return null;
  const name = raw.name;
  if (!NAME_VALIDATOR.test(name)) return null;

  const localMembers: string[] = [];
  const globalMembers: string[] = [];

  const nestedLm = raw.localMembers;
  if (nestedLm && typeof nestedLm === "object" && !Array.isArray(nestedLm)) {
    for (const [, entry] of Object.entries(nestedLm as Record<string, { name?: string }>)) {
      if (entry && typeof entry.name === "string") localMembers.push(entry.name);
    }
  }
  const nestedGm = raw.globalMembers;
  if (nestedGm && typeof nestedGm === "object" && !Array.isArray(nestedGm)) {
    for (const [, entry] of Object.entries(nestedGm as Record<string, { name?: string }>)) {
      if (entry && typeof entry.name === "string") globalMembers.push(entry.name);
    }
  }

  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") continue;
    const lm = k.match(/^localMembers[\\/](\d+)[\\/]name$/);
    if (lm) {
      localMembers[parseInt(lm[1], 10)] = v;
      continue;
    }
    const gm = k.match(/^globalMembers[\\/](\d+)[\\/]name$/);
    if (gm) globalMembers[parseInt(gm[1], 10)] = v;
  }

  return {
    name,
    localMembers: localMembers.filter(Boolean),
    globalMembers: globalMembers.filter(Boolean),
  };
}

export async function listGroups(): Promise<VpnGroup[]> {
  const m = readMainSettings();
  const dir = expandHome(m.localvpngroups);
  if (!fs.existsSync(dir)) return [];
  const out: VpnGroup[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".conf")) continue;
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const g = parseGroupIni(raw);
    if (g) out.push(g);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveGroup(group: VpnGroup): Promise<void> {
  if (!NAME_VALIDATOR.test(group.name.trim())) {
    throw new Error("Invalid group name");
  }
  const m = readMainSettings();
  const dir = expandHome(m.localvpngroups);
  fs.mkdirSync(dir, { recursive: true });
  const flat: Record<string, string | number> = { name: group.name.trim() };
  flat["localMembers/size"] = group.localMembers.length;
  group.localMembers.forEach((mem, i) => {
    flat[`localMembers/${i}/name`] = mem;
  });
  flat["globalMembers/size"] = group.globalMembers.length;
  group.globalMembers.forEach((mem, i) => {
    flat[`globalMembers/${i}/name`] = mem;
  });
  const obj = { group: flat };
  fs.writeFileSync(path.join(dir, `${group.name.trim()}.conf`), ini.stringify(obj), { mode: 0o600 });
}

export async function deleteGroup(name: string): Promise<boolean> {
  const m = readMainSettings();
  const f = path.join(expandHome(m.localvpngroups), `${name}.conf`);
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    return true;
  }
  return false;
}

export async function renameGroup(oldName: string, newName: string): Promise<void> {
  const m = readMainSettings();
  const dir = expandHome(m.localvpngroups);
  const from = path.join(dir, `${oldName}.conf`);
  const to = path.join(dir, `${newName}.conf`);
  if (fs.existsSync(to)) throw new Error("Target exists");
  const raw = fs.readFileSync(from, "utf8");
  const g = parseGroupIni(raw);
  if (!g) throw new Error("Invalid group file");
  g.name = newName;
  fs.unlinkSync(from);
  await saveGroup(g);
}
