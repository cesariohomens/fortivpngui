import type { LanguageSetting } from "./locale.js";

/** UI colour scheme (`gui/theme_mode` in main.conf). */
export type ThemeMode = "dark" | "light" | "system";

export type { LanguageSetting, LocaleCode } from "./locale.js";

/** Optional connect-time credentials (not stored on the profile). Compatible with `startVpn(name, otp)` (string = OTP only). */
export interface VpnStartCredentials {
  username?: string;
  password?: string;
  otp?: string;
}

export interface VpnTrafficStats {
  bytes_read: number;
  bytes_written: number;
  vpn_start?: number;
}

export interface VpnProfile {
  name: string;
  origin: "local" | "global";
  gateway_host: string;
  gateway_port: number;
  username: string;
  password: string;
  /** openfortivpn `--cookie-on-stdin`: SVPNCOOKIE used instead of username/password. Fed on stdin, never on argv. */
  cookie: string;
  /** openfortivpn `pinentry` (>= 1.10.0): program asked for the password instead of storing one. */
  pinentry: string;
  /** openfortivpn `saml-login` (>= 1.23.0): authenticate through the gateway's SAML flow. */
  saml_login: boolean;
  /** Local port for the SAML redirect web server (`saml-login = <port>`); 0 uses the upstream default of 8020. */
  saml_port: number;
  realm: string;
  set_routes: boolean;
  set_dns: boolean;
  half_internet_routers: boolean;
  /** openfortivpn `use-resolvconf` (>= 1.14.0): `default` leaves upstream's choice, otherwise `1` or `0`. */
  use_resolvconf: string;
  /** openfortivpn `--ifname`: bind the tunnel to a host interface. Command line only, unlike `pppd_ifname`. */
  ifname: string;
  /** openfortivpn `persistent`: seconds between reconnect attempts. 0 disables auto-reconnect (user reconnects manually). */
  persistent: number;
  ca_file: string;
  user_cert: string;
  user_key: string;
  /** openfortivpn `pem-passphrase`: pass phrase for an encrypted `user_key` (>= 1.16.0). */
  pem_passphrase: string;
  trusted_cert: string;
  debug: boolean;
  autostart: boolean;
  always_ask_otp: boolean;
  otp_prompt: string;
  otp_delay: number;
  /** Maps to openfortivpn `no-ftm-push`: prefer token/email/SMS over FortiToken Mobile push when the gateway offers both. */
  no_ftm_push: boolean;
  /** openfortivpn `pppd-use-peerdns`: ask the peer for DNS servers and let pppd rewrite resolv.conf. Off by default upstream. */
  pppd_use_peerdns: boolean;
  /** openfortivpn `pppd-accept-remote` (>= 1.21.0): required by pppd >= 2.5.0, breaks older pppd. */
  pppd_accept_remote: boolean;
  pppd_log_file: string;
  pppd_plugin_file: string;
  pppd_ifname: string;
  pppd_ipparam: string;
  pppd_call: string;
  insecure_ssl: boolean;
  seclevel1: boolean;
  min_tls: string;
  /** openfortivpn `cipher-list`: OpenSSL cipher string; preferred over `insecure_ssl` for gateways needing a specific cipher. */
  cipher_list: string;
  /** openfortivpn `sni` (>= 1.22.0): TLS server name sent to the gateway. */
  sni: string;
  /** openfortivpn `user-agent` (>= 1.16.0): User-Agent header sent to the gateway. */
  user_agent: string;
  /** openfortivpn `hostcheck` (>= 1.16.0): value reported for the FortiGate host check. */
  hostcheck: string;
  /** openfortivpn `check-virtual-desktop` (>= 1.16.0): value reported for the FortiGate virtual desktop check. */
  check_virtual_desktop: string;
  trust_all_gw_certs: boolean;
}

export interface VpnGroup {
  name: string;
  localMembers: string[];
  globalMembers: string[];
}

export interface MainSettings {
  debug: boolean;
  aeskey: string;
  aesiv: string;
  start_minimized: boolean;
  setupwizard: boolean;
  changelogrev_read: number;
  use_system_password_store: boolean;
  sudo_preserve_env: boolean;
  /** When true, insecure certificate options are hidden in the UI (OpenFortiGUI `main/disallow_unsecure_certificates`). */
  disallow_unsecure_certificates: boolean;
  globalvpnprofiles: string;
  localvpnprofiles: string;
  localvpngroups: string;
  logs: string;
  disable_notifications: boolean;
  connect_on_dblclick: boolean;
  /** OpenFortiGUI `main/show_search`: show profile search field. */
  show_search: boolean;
  /** `gui/theme_mode`: dark, light, or follow OS (system). */
  theme_mode: ThemeMode;
  /** `gui/language`: UI language or `system` to follow OS locale. */
  language: LanguageSetting;
}
