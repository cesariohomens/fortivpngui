export type DeviceType = "fortigate" | "barracuda";

export interface VpnProfile {
  name: string;
  origin: "local" | "global";
  device_type: DeviceType;
  gateway_host: string;
  gateway_port: number;
  username: string;
  password: string;
  otp: string;
  realm: string;
  set_routes: boolean;
  set_dns: boolean;
  half_internet_routers: boolean;
  persistent: boolean;
  ca_file: string;
  user_cert: string;
  user_key: string;
  trusted_cert: string;
  verify_cert: boolean;
  debug: boolean;
  autostart: boolean;
  always_ask_otp: boolean;
  otp_prompt: string;
  otp_delay: number;
  pppd_no_peerdns: boolean;
  pppd_accept_remote: boolean;
  pppd_log_file: string;
  pppd_plugin_file: string;
  pppd_ifname: string;
  pppd_ipparam: string;
  pppd_call: string;
  insecure_ssl: boolean;
  seclevel1: boolean;
  min_tls: string;
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
  globalvpnprofiles: string;
  localvpnprofiles: string;
  localvpngroups: string;
  logs: string;
  initd: string;
  sudopresenv: boolean;
  disable_notifications: boolean;
  connect_on_dblclick: boolean;
}
