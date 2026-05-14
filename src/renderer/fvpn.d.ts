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
  mergeOpenfortiguiMain: () => Promise<MainSettings | null>;
  startVpn: (name: string, arg?: string | VpnStartCredentials) => Promise<void>;
  stopVpn: (name: string) => Promise<void>;
  vpnStatus: (name: string) => Promise<string>;
  submitFortigateStdinOtp: (profileName: string, otp: string) => Promise<boolean>;
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
}

declare global {
  interface Window {
    fvpn: FvpnApi;
  }
}

export {};
