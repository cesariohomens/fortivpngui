import type { VpnProfile, VpnGroup, MainSettings } from "../../shared/types";

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
  getSettings: () => Promise<MainSettings>;
  saveSettings: (partial: Partial<MainSettings>) => Promise<MainSettings>;
  startVpn: (name: string, otp?: string) => Promise<void>;
  stopVpn: (name: string) => Promise<void>;
  vpnStatus: (name: string) => Promise<string>;
  importOpenfortigui: () => Promise<{ profilesCopied: number; groupsCopied: number; errors: string[] }>;
  markChangelogRead: () => Promise<void>;
  onVpnLog: (cb: (ev: { name: string; line: string; stream: string }) => void) => () => void;
  onVpnStatus: (cb: (ev: { name: string; state: string }) => void) => () => void;
}

declare global {
  interface Window {
    fvpn: FvpnApi;
  }
}

export {};
