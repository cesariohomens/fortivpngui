import type { VpnProfile, VpnGroup, MainSettings, VpnStartCredentials, VpnTrafficStats } from "../../shared/types";

export interface FvpnApi {
  openfortivpnPath: () => Promise<string | null>;
  listProfiles: () => Promise<VpnProfile[]>;
  saveProfile: (p: VpnProfile) => Promise<void>;
  deleteProfile: (name: string) => Promise<boolean>;
  renameProfile: (oldName: string, newName: string) => Promise<void>;
  listGroups: () => Promise<VpnGroup[]>;
  saveGroup: (g: VpnGroup) => Promise<void>;
  deleteGroup: (name: string) => Promise<boolean>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  duplicateGroup: (name: string) => Promise<string>;
  getSettings: () => Promise<MainSettings>;
  saveSettings: (partial: Partial<MainSettings>) => Promise<MainSettings>;
  getSystemLocale: () => Promise<string>;
  mergeOpenfortiguiMain: () => Promise<MainSettings | null>;
  startVpn: (name: string, arg?: string | VpnStartCredentials) => Promise<void>;
  stopVpn: (name: string) => Promise<void>;
  vpnStatus: (name: string) => Promise<string>;
  /** FortiGate: send OTP/token to the running openfortivpn process stdin. */
  submitFortigateStdinOtp: (profileName: string, otp: string) => Promise<boolean>;
  /** Allow one more stdin OTP prompt after a failed attempt. */
  resetOtpPrompt: (profileName: string) => Promise<void>;
  trustGatewayDigest: (profileName: string, digest: string) => Promise<false | "profile" | "cache">;
  chooseDirectory: (initialPath?: string) => Promise<string | null>;
  openLogsDir: () => Promise<string>;
  openVpnLog: (name: string) => Promise<string>;
  importOpenfortigui: () => Promise<{ profilesCopied: number; groupsCopied: number; errors: string[] }>;
  markChangelogRead: () => Promise<void>;
  onAppNavigate: (cb: (ev: { tab?: number }) => void) => () => void;
  onAppConnectProfile: (cb: (ev: { name: string }) => void) => () => void;
  onVpnLog: (cb: (ev: { name: string; line: string; stream: string }) => void) => () => void;
  onVpnStatus: (cb: (ev: { name: string; state: string }) => void) => () => void;
  onVpnStats: (cb: (ev: { name: string; stats: VpnTrafficStats }) => void) => () => void;
  onGatewayCertPrompt: (cb: (ev: { profileName: string; digest: string; body: string }) => void) => () => void;
  onFortigateStdinOtpPrompt: (cb: (ev: { name: string }) => void) => () => void;
  /** Tunnel dropped without the user asking for it: `reasonKey` maps to a `disconnect.*` message. */
  onVpnDisconnectWarning: (
    cb: (ev: { name: string; reasonKey: string; detail: string; wasConnected: boolean }) => void
  ) => () => void;
}

declare global {
  interface Window {
    fvpn: FvpnApi;
    fvpnCapture?: { enabled: boolean };
    __fvpnUi?: {
      setView: (view: "vpn" | "groups" | "settings") => void;
      setThemeMode: (mode: "dark" | "light" | "system") => void;
      setLanguage: (language: "en" | "pt" | "es" | "fr" | "it" | "de" | "system") => void;
      closeOverlays: () => void;
      openAbout: () => void;
      openChangelog: () => void;
      openWizard: (step?: number) => void;
      openProfileEditor: () => void;
      refresh: () => Promise<void>;
    };
  }
}

export {};
