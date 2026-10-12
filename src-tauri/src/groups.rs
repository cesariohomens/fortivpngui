//! VPN groups (port of `electron/group-service.ts`).

use std::fs;
use std::path::PathBuf;

use ini::Ini;

use crate::config::{expand_home, is_valid_name};
use crate::settings::{ensure_dir_pub, read_main_settings, write_conf_file};
use crate::types::VpnGroup;

/// Parse `localMembers/0/name` or `localMembers\0\name` (and globalMembers).
fn member_index(key: &str, prefix: &str) -> Option<usize> {
    let rest = key.strip_prefix(prefix)?;
    let (idx_s, name_s) = if let Some(r) = rest.strip_prefix('/') {
        let (i, rem) = r.split_once('/')?;
        (i, rem)
    } else if let Some(r) = rest.strip_prefix('\\') {
        let (i, rem) = r.split_once('\\')?;
        (i, rem)
    } else {
        return None;
    };
    if name_s != "name" {
        return None;
    }
    idx_s.parse().ok()
}

fn parse_group_ini(content: &str) -> Option<VpnGroup> {
    let conf = Ini::load_from_str(content).ok()?;
    let raw = conf.section(Some("group"))?;
    let name = raw.get("name")?.to_string();
    if !is_valid_name(&name) {
        return None;
    }

    let mut local_members: Vec<Option<String>> = Vec::new();
    let mut global_members: Vec<Option<String>> = Vec::new();

    for (k, v) in raw.iter() {
        if let Some(idx) = member_index(k, "localMembers") {
            if local_members.len() <= idx {
                local_members.resize(idx + 1, None);
            }
            local_members[idx] = Some(v.to_string());
            continue;
        }
        if let Some(idx) = member_index(k, "globalMembers") {
            if global_members.len() <= idx {
                global_members.resize(idx + 1, None);
            }
            global_members[idx] = Some(v.to_string());
        }
    }

    Some(VpnGroup {
        name,
        local_members: local_members
            .into_iter()
            .flatten()
            .filter(|s| !s.is_empty())
            .collect(),
        global_members: global_members
            .into_iter()
            .flatten()
            .filter(|s| !s.is_empty())
            .collect(),
    })
}

pub fn list_groups() -> Result<Vec<VpnGroup>, String> {
    let m = read_main_settings()?;
    let dir = expand_home(&m.localvpngroups);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("readdir {}: {e}", dir.display()))?;
    for ent in entries {
        let ent = ent.map_err(|e| format!("readdir entry: {e}"))?;
        let path = ent.path();
        if path.extension().and_then(|e| e.to_str()) != Some("conf") {
            continue;
        }
        let raw =
            fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
        if let Some(g) = parse_group_ini(&raw) {
            out.push(g);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn save_group(group: &VpnGroup) -> Result<(), String> {
    let name = group.name.trim();
    if !is_valid_name(name) {
        return Err("Invalid group name".into());
    }
    let m = read_main_settings()?;
    let dir = expand_home(&m.localvpngroups);
    ensure_dir_pub(&dir);

    let mut conf = Ini::new();
    {
        let mut g = conf.with_section(Some("group"));
        g.set("name", name);
        g.set("localMembers/size", group.local_members.len().to_string());
        for (i, mem) in group.local_members.iter().enumerate() {
            g.set(format!("localMembers/{i}/name"), mem.as_str());
        }
        g.set(
            "globalMembers/size",
            group.global_members.len().to_string(),
        );
        for (i, mem) in group.global_members.iter().enumerate() {
            g.set(format!("globalMembers/{i}/name"), mem.as_str());
        }
    }

    let path: PathBuf = dir.join(format!("{name}.conf"));
    write_conf_file(&path, &conf)
}

pub fn delete_group(name: &str) -> Result<bool, String> {
    let m = read_main_settings()?;
    let f = expand_home(&m.localvpngroups).join(format!("{name}.conf"));
    if f.exists() {
        fs::remove_file(&f).map_err(|e| format!("unlink {}: {e}", f.display()))?;
        return Ok(true);
    }
    Ok(false)
}

pub fn duplicate_group(source_name: &str) -> Result<String, String> {
    let groups = list_groups()?;
    let g = groups
        .iter()
        .find(|x| x.name == source_name)
        .ok_or_else(|| "Group not found".to_string())?;

    let mut new_name = format!("{} copy", g.name);
    let mut n = 2u32;
    while groups.iter().any(|x| x.name == new_name) {
        new_name = format!("{} copy {n}", g.name);
        n += 1;
    }

    save_group(&VpnGroup {
        name: new_name.clone(),
        local_members: g.local_members.clone(),
        global_members: g.global_members.clone(),
    })?;
    Ok(new_name)
}
