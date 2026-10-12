/**
 * Tauri bridge exposing `window.fvpn` (invoke + events) to the React UI.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  VpnProfile,
  VpnGroup,
  MainSettings,
  VpnStartCredentials,
  VpnTrafficStats,
} from "../../shared/types";

type Unsub = () => void;

function onEvent<T>(event: string, cb: (payload: T) => void): Unsub {
  let unlisten: UnlistenFn | undefined;
  void listen<T>(event, (e) => cb(e.payload)).then((u) => {
    unlisten = u;
  });
  return () => {
    unlisten?.();
  };
}

const fvpn = {
  openfortivpnPath: () => invoke<string | null>("app_openfortivpn_path"),
  listProfiles: () => invoke<VpnProfile[]>("profiles_list"),
  saveProfile: (p: VpnProfile) => invoke<void>("profiles_save", { p }),
  deleteProfile: (name: string) => invoke<boolean>("profiles_delete", { name }),
  listGroups: () => invoke<VpnGroup[]>("groups_list"),
  saveGroup: (g: VpnGroup) => invoke<void>("groups_save", { g }),
  deleteGroup: (name: string) => invoke<boolean>("groups_delete", { name }),
  duplicateGroup: (name: string) => invoke<string>("groups_duplicate", { name }),
  getSettings: () => invoke<MainSettings>("settings_get"),
  saveSettings: (partial: Partial<MainSettings>) =>
    invoke<MainSettings>("settings_save", { partial }),
  getSystemLocale: () => invoke<string>("app_get_locale"),
  mergeOpenfortiguiMain: () => invoke<MainSettings | null>("settings_merge_openfortigui_main"),
  startVpn: (name: string, arg?: string | VpnStartCredentials) =>
    invoke<void>("vpn_start", { name, arg: arg ?? null }),
  stopVpn: (name: string) => invoke<void>("vpn_stop", { name }),
  vpnStatus: (name: string) => invoke<string>("vpn_status", { name }),
  submitFortigateStdinOtp: (profileName: string, otp: string) =>
    invoke<boolean>("vpn_submit_fortigate_stdin_otp", { profileName, otp }),
  resetOtpPrompt: (profileName: string) =>
    invoke<void>("vpn_reset_otp_prompt", { profileName }),
  trustGatewayDigest: (profileName: string, digest: string) =>
    invoke<false | "profile" | "cache">("vpn_trust_gateway_digest", { profileName, digest }),
  chooseDirectory: (initialPath?: string) =>
    invoke<string | null>("app_choose_directory", { initialPath: initialPath ?? null }),
  openLogsDir: () => invoke<string>("app_open_logs_dir"),
  openVpnLog: (name: string) => invoke<string>("app_open_vpn_log", { name }),
  importOpenfortigui: () =>
    invoke<{ profilesCopied: number; groupsCopied: number; errors: string[] }>("import_openfortigui"),
  markChangelogRead: () => invoke<void>("changelog_mark_read"),

  onAppNavigate: (cb: (ev: { tab?: number }) => void) => onEvent("app:navigate", cb),
  onAppConnectProfile: (cb: (ev: { name: string }) => void) => onEvent("app:connect-profile", cb),
  onVpnLog: (cb: (ev: { name: string; line: string; stream: string }) => void) =>
    onEvent("vpn:log", cb),
  onVpnStatus: (cb: (ev: { name: string; state: string }) => void) => onEvent("vpn:status", cb),
  onVpnStats: (cb: (ev: { name: string; stats: VpnTrafficStats }) => void) =>
    onEvent("vpn:stats", cb),
  onGatewayCertPrompt: (cb: (ev: { profileName: string; digest: string; body: string }) => void) =>
    onEvent("vpn:gateway-cert-prompt", cb),
  onFortigateStdinOtpPrompt: (cb: (ev: { name: string }) => void) =>
    onEvent("vpn:fortigate-stdin-otp-prompt", cb),
  onVpnSamlLoginUrl: (cb: (ev: { name: string; url: string }) => void) =>
    onEvent("vpn:saml-login-url", cb),
  onVpnDisconnectWarning: (
    cb: (ev: { name: string; reasonKey: string; detail: string; wasConnected: boolean }) => void
  ) => onEvent("vpn:disconnect-warning", cb),
};

declare global {
  interface Window {
    fvpn: typeof fvpn;
  }
}

window.fvpn = fvpn;

export {};
