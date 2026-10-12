//! VPN profile load/save (port of `electron/profile-service.ts`).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use ini::Ini;

use crate::config::{expand_home, is_valid_name};
use crate::crypto::{aes128_decrypt, aes128_encrypt};
use crate::keychain;
use crate::settings::{
    ensure_dir_pub, ini_bool, ini_get, read_main_settings, write_conf_file,
};
use crate::types::{ProfileOrigin, VpnProfile};

/// Extract unique lowercase SHA-256 digests from a trusted-cert field
/// (port of `parseTrustedCertDigests` in `openfortivpn-runner.ts`).
pub fn parse_trusted_cert_digests(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for token in trimmed.split(|c: char| c.is_whitespace() || c == ',' || c == ';') {
        let token = token.trim();
        if token.is_empty() {
            continue;
        }
        let mut t = token.to_string();
        // /^(?:sha256:|0x)([0-9a-fA-F]{64})$/i
        let lower = t.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("sha256:") {
            if rest.len() == 64 && rest.chars().all(|c| c.is_ascii_hexdigit()) {
                t = rest.to_string();
            }
        } else if let Some(rest) = lower.strip_prefix("0x") {
            if rest.len() == 64 && rest.chars().all(|c| c.is_ascii_hexdigit()) {
                t = rest.to_string();
            }
        }
        if t.len() == 64 && t.chars().all(|c| c.is_ascii_hexdigit()) {
            let lo = t.to_ascii_lowercase();
            if seen.insert(lo.clone()) {
                out.push(lo);
            }
        }
    }
    out
}

fn ini_persistent_seconds(v: Option<&str>) -> u32 {
    let s = v.unwrap_or("").trim().to_ascii_lowercase();
    if s.is_empty() || s == "false" || s == "0" {
        return 0;
    }
    if s == "true" {
        return 60;
    }
    s.parse::<u32>().ok().filter(|&n| n > 0).unwrap_or(0)
}

/// OpenFortiGUI `device_type`: 0 = FortiGate, 1 = Barracuda (unsupported — skip).
fn is_unsupported_device_type(raw: Option<&str>) -> bool {
    let n = raw
        .unwrap_or("0")
        .trim()
        .parse::<i32>()
        .unwrap_or(0);
    n != 0
}

fn get_aes_keys() -> Result<(String, String), String> {
    let m = read_main_settings()?;
    if m.use_system_password_store {
        if let (Some(k), Some(iv)) = (keychain::get("aeskey"), keychain::get("aesiv")) {
            return Ok((k, iv));
        }
    }
    Ok((m.aeskey, m.aesiv))
}

fn section_props<'a>(conf: &'a Ini, name: &str) -> Option<&'a ini::Properties> {
    conf.section(Some(name))
}

fn trusted_cert_from_ini_cert(cert: Option<&ini::Properties>) -> String {
    let Some(cert) = cert else {
        return String::new();
    };
    let mut chunks: Vec<String> = Vec::new();
    for (k, v) in cert.iter() {
        chunks.push(v.to_string());
        let kl = k.to_ascii_lowercase();
        if kl.contains("trusted")
            || kl.contains("whitelist")
            || kl.contains("pin")
            || kl.contains("digest")
            || kl.contains("cert_hash")
        {
            chunks.push(v.to_string());
        }
    }
    parse_trusted_cert_digests(&chunks.join(" ")).join(" ")
}

fn read_profile_from_file(
    file_path: &Path,
    origin: ProfileOrigin,
    include_password: bool,
) -> Result<Option<VpnProfile>, String> {
    let name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    if !is_valid_name(&name) {
        return Ok(None);
    }
    let conf = Ini::load_from_file(file_path)
        .map_err(|e| format!("read {}: {e}", file_path.display()))?;
    let vpn = section_props(&conf, "vpn");
    let cert = section_props(&conf, "cert");
    let opt = section_props(&conf, "options");

    if is_unsupported_device_type(ini_get(vpn, "device_type")) {
        eprintln!("[profile-service] Skipping unsupported Barracuda profile: {name}");
        return Ok(None);
    }

    let m = read_main_settings()?;
    let aes = if include_password && !m.use_system_password_store {
        Some(get_aes_keys()?)
    } else {
        None
    };

    let mut password = String::new();
    let mut pem_passphrase = String::new();
    let mut cookie = String::new();

    if include_password {
        if m.use_system_password_store {
            password = keychain::get(&format!("vpn:{name}")).unwrap_or_default();
            pem_passphrase = keychain::get(&format!("vpnpem:{name}")).unwrap_or_default();
            cookie = keychain::get(&format!("vpncookie:{name}")).unwrap_or_default();
        } else if let Some((ref key, ref iv)) = aes {
            if let Some(p) = ini_get(vpn, "password").filter(|s| !s.is_empty()) {
                password = aes128_decrypt(p, key, iv)?;
            }
            if let Some(p) = ini_get(cert, "pem_passphrase").filter(|s| !s.is_empty()) {
                pem_passphrase = aes128_decrypt(p, key, iv)?;
            }
            if let Some(p) = ini_get(vpn, "cookie").filter(|s| !s.is_empty()) {
                cookie = aes128_decrypt(p, key, iv)?;
            }
        }
    }

    let gateway_port = ini_get(vpn, "gateway_port")
        .and_then(|s| s.parse::<u16>().ok())
        .filter(|&n| n != 0)
        .unwrap_or(443);

    let saml_port = ini_get(opt, "saml_port")
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);

    let otp_delay = ini_get(opt, "otp_delay")
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);

    Ok(Some(VpnProfile {
        name: ini_get(vpn, "name")
            .filter(|s| !s.is_empty())
            .unwrap_or(&name)
            .to_string(),
        origin,
        gateway_host: ini_get(vpn, "gateway_host").unwrap_or("").to_string(),
        gateway_port,
        username: ini_get(vpn, "username").unwrap_or("").to_string(),
        password,
        cookie,
        pinentry: ini_get(opt, "pinentry").unwrap_or("").to_string(),
        saml_login: ini_bool(ini_get(opt, "saml_login")),
        saml_port,
        realm: ini_get(opt, "realm").unwrap_or("").to_string(),
        set_routes: ini_bool(ini_get(opt, "set_routes")),
        set_dns: ini_bool(ini_get(opt, "set_dns")),
        half_internet_routers: ini_bool(ini_get(opt, "half_internet_routers")),
        use_resolvconf: ini_get(opt, "use_resolvconf")
            .filter(|s| !s.is_empty())
            .unwrap_or("default")
            .to_string(),
        ifname: ini_get(opt, "ifname").unwrap_or("").to_string(),
        persistent: ini_persistent_seconds(ini_get(vpn, "persistent")),
        ca_file: ini_get(cert, "ca_file").unwrap_or("").to_string(),
        user_cert: ini_get(cert, "user_cert").unwrap_or("").to_string(),
        user_key: ini_get(cert, "user_key").unwrap_or("").to_string(),
        pem_passphrase,
        trusted_cert: trusted_cert_from_ini_cert(cert),
        debug: ini_bool(ini_get(opt, "debug")),
        autostart: ini_bool(ini_get(opt, "autostart")),
        always_ask_otp: ini_bool(ini_get(opt, "always_ask_otp")),
        otp_prompt: ini_get(opt, "otp_prompt").unwrap_or("").to_string(),
        otp_delay,
        no_ftm_push: ini_bool(ini_get(opt, "no_ftm_push")),
        pppd_use_peerdns: ini_bool(ini_get(opt, "pppd_use_peerdns")),
        pppd_accept_remote: ini_bool(ini_get(opt, "pppd_accept_remote")),
        pppd_log_file: ini_get(opt, "pppd_log_file").unwrap_or("").to_string(),
        pppd_plugin_file: ini_get(opt, "pppd_plugin_file").unwrap_or("").to_string(),
        pppd_ifname: ini_get(opt, "pppd_ifname").unwrap_or("").to_string(),
        pppd_ipparam: ini_get(opt, "pppd_ipparam").unwrap_or("").to_string(),
        pppd_call: ini_get(opt, "pppd_call").unwrap_or("").to_string(),
        insecure_ssl: ini_bool(ini_get(opt, "insecure_ssl")),
        seclevel1: ini_bool(ini_get(opt, "seclevel1")),
        min_tls: ini_get(opt, "min_tls")
            .filter(|s| !s.is_empty())
            .unwrap_or("default")
            .to_string(),
        cipher_list: ini_get(opt, "cipher_list").unwrap_or("").to_string(),
        sni: ini_get(opt, "sni").unwrap_or("").to_string(),
        user_agent: ini_get(opt, "user_agent").unwrap_or("").to_string(),
        hostcheck: ini_get(opt, "hostcheck").unwrap_or("").to_string(),
        check_virtual_desktop: ini_get(opt, "check_virtual_desktop")
            .unwrap_or("")
            .to_string(),
        trust_all_gw_certs: ini_bool(ini_get(cert, "trust_all_gw_certs")),
    }))
}

fn list_dir_profiles(dir: &Path, origin: ProfileOrigin) -> Result<Vec<VpnProfile>, String> {
    let mut out = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }
    let entries = fs::read_dir(dir).map_err(|e| format!("readdir {}: {e}", dir.display()))?;
    for ent in entries {
        let ent = ent.map_err(|e| format!("readdir entry: {e}"))?;
        let path = ent.path();
        if path.extension().and_then(|e| e.to_str()) != Some("conf") {
            continue;
        }
        if let Some(p) = read_profile_from_file(&path, origin, true)? {
            out.push(p);
        }
    }
    Ok(out)
}

/// Local profiles win over global on name clash.
pub fn list_profiles() -> Result<Vec<VpnProfile>, String> {
    let m = read_main_settings()?;
    let mut out = Vec::new();
    out.extend(list_dir_profiles(
        &expand_home(&m.localvpnprofiles),
        ProfileOrigin::Local,
    )?);
    out.extend(list_dir_profiles(
        &expand_home(&m.globalvpnprofiles),
        ProfileOrigin::Global,
    )?);

    let mut by_name: HashMap<String, VpnProfile> = HashMap::new();
    for p in out {
        match by_name.get(&p.name) {
            None => {
                by_name.insert(p.name.clone(), p);
            }
            Some(prev) if prev.origin == ProfileOrigin::Global && p.origin == ProfileOrigin::Local => {
                by_name.insert(p.name.clone(), p);
            }
            Some(_) => {}
        }
    }
    let mut list: Vec<VpnProfile> = by_name.into_values().collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(list)
}

fn bool_str(b: bool) -> &'static str {
    if b {
        "true"
    } else {
        "false"
    }
}

pub fn save_profile_local(profile: &VpnProfile) -> Result<(), String> {
    let name = profile.name.trim();
    if !is_valid_name(name) {
        return Err(
            "Invalid profile name (min 3 chars, allowed: letters, numbers, space, -, _)".into(),
        );
    }
    let m = read_main_settings()?;
    let dir = expand_home(&m.localvpnprofiles);
    ensure_dir_pub(&dir);
    let (aes_key, aes_iv) = get_aes_keys()?;

    let mut enc_pass = String::new();
    let mut enc_pem = String::new();
    let mut enc_cookie = String::new();

    if m.use_system_password_store {
        keychain::set(&format!("vpn:{name}"), &profile.password)?;
        keychain::set(
            &format!("vpnpem:{name}"),
            profile.pem_passphrase.as_str(),
        )?;
        keychain::set(&format!("vpncookie:{name}"), profile.cookie.as_str())?;
    } else {
        enc_pass = aes128_encrypt(profile.password.trim(), &aes_key, &aes_iv);
        enc_pem = if profile.pem_passphrase.is_empty() {
            String::new()
        } else {
            aes128_encrypt(&profile.pem_passphrase, &aes_key, &aes_iv)
        };
        enc_cookie = if profile.cookie.trim().is_empty() {
            String::new()
        } else {
            aes128_encrypt(profile.cookie.trim(), &aes_key, &aes_iv)
        };
    }

    let persistent = profile.persistent;
    let saml_port = profile.saml_port;
    let trusted = parse_trusted_cert_digests(&profile.trusted_cert).join(" ");

    let mut conf = Ini::new();
    {
        let mut vpn = conf.with_section(Some("vpn"));
        vpn.set("name", name);
        vpn.set("gateway_host", profile.gateway_host.trim());
        vpn.set(
            "gateway_port",
            if profile.gateway_port == 0 {
                443
            } else {
                profile.gateway_port
            }
            .to_string(),
        );
        vpn.set("username", profile.username.trim());
        vpn.set("password", &enc_pass);
        vpn.set("cookie", &enc_cookie);
        vpn.set("persistent", persistent.to_string());
        vpn.set("device_type", "0");
    }
    {
        let mut cert = conf.with_section(Some("cert"));
        cert.set("ca_file", &profile.ca_file);
        cert.set("user_cert", &profile.user_cert);
        cert.set("user_key", &profile.user_key);
        cert.set("pem_passphrase", &enc_pem);
        cert.set("trusted_cert", &trusted);
        cert.set("trust_all_gw_certs", bool_str(profile.trust_all_gw_certs));
    }
    {
        let mut opt = conf.with_section(Some("options"));
        opt.set("set_routes", bool_str(profile.set_routes));
        opt.set("set_dns", bool_str(profile.set_dns));
        opt.set("pppd_use_peerdns", bool_str(profile.pppd_use_peerdns));
        // Mirror for OpenFortiGUI and older FortiVPN GUI builds.
        opt.set("pppd_no_peerdns", bool_str(!profile.pppd_use_peerdns));
        opt.set("pppd_accept_remote", bool_str(profile.pppd_accept_remote));
        opt.set("insecure_ssl", bool_str(profile.insecure_ssl));
        opt.set("debug", bool_str(profile.debug));
        opt.set("realm", &profile.realm);
        opt.set("autostart", bool_str(profile.autostart));
        opt.set("always_ask_otp", bool_str(profile.always_ask_otp));
        opt.set("otp_prompt", &profile.otp_prompt);
        opt.set("otp_delay", profile.otp_delay.to_string());
        opt.set("no_ftm_push", bool_str(profile.no_ftm_push));
        opt.set("half_internet_routers", bool_str(profile.half_internet_routers));
        opt.set("pppd_log_file", &profile.pppd_log_file);
        opt.set("pppd_plugin_file", &profile.pppd_plugin_file);
        opt.set("pppd_ifname", &profile.pppd_ifname);
        opt.set("pppd_ipparam", &profile.pppd_ipparam);
        opt.set("pppd_call", &profile.pppd_call);
        opt.set("seclevel1", bool_str(profile.seclevel1));
        opt.set("min_tls", &profile.min_tls);
        opt.set("cipher_list", &profile.cipher_list);
        opt.set("use_resolvconf", &profile.use_resolvconf);
        opt.set("ifname", &profile.ifname);
        opt.set("pinentry", &profile.pinentry);
        opt.set("saml_login", bool_str(profile.saml_login));
        opt.set("saml_port", saml_port.to_string());
        opt.set("sni", &profile.sni);
        opt.set("user_agent", &profile.user_agent);
        opt.set("hostcheck", &profile.hostcheck);
        opt.set("check_virtual_desktop", &profile.check_virtual_desktop);
    }

    let path: PathBuf = dir.join(format!("{name}.conf"));
    write_conf_file(&path, &conf)
}

pub fn get_profile_password(name: &str, origin: ProfileOrigin) -> Result<String, String> {
    let m = read_main_settings()?;
    if m.use_system_password_store {
        return Ok(keychain::get(&format!("vpn:{name}")).unwrap_or_default());
    }
    let dir = expand_home(match origin {
        ProfileOrigin::Local => &m.localvpnprofiles,
        ProfileOrigin::Global => &m.globalvpnprofiles,
    });
    let f = dir.join(format!("{name}.conf"));
    let p = read_profile_from_file(&f, origin, true)?;
    Ok(p.map(|p| p.password).unwrap_or_default())
}

pub fn delete_profile_local(name: &str) -> Result<bool, String> {
    let m = read_main_settings()?;
    let f = expand_home(&m.localvpnprofiles).join(format!("{name}.conf"));
    if f.exists() {
        fs::remove_file(&f).map_err(|e| format!("unlink {}: {e}", f.display()))?;
        keychain::delete_ignore(&format!("vpn:{name}"));
        keychain::delete_ignore(&format!("vpnpem:{name}"));
        keychain::delete_ignore(&format!("vpncookie:{name}"));
        return Ok(true);
    }
    Ok(false)
}

/// Find a profile by name after local-wins merge (helper for vpn_service).
pub fn find_profile(name: &str) -> Result<Option<VpnProfile>, String> {
    Ok(list_profiles()?.into_iter().find(|p| p.name == name))
}
