import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { VpnProfile, VpnGroup, MainSettings, VpnStartCredentials, VpnTrafficStats } from "../shared/types.js";

contextBridge.exposeInMainWorld("fvpn", {
  openfortivpnPath: () => ipcRenderer.invoke("app:openfortivpnPath") as Promise<string | null>,
  listProfiles: () => ipcRenderer.invoke("profiles:list") as Promise<VpnProfile[]>,
  saveProfile: (p: VpnProfile) => ipcRenderer.invoke("profiles:save", p) as Promise<void>,
  deleteProfile: (name: string) => ipcRenderer.invoke("profiles:delete", name) as Promise<boolean>,
  listGroups: () => ipcRenderer.invoke("groups:list") as Promise<VpnGroup[]>,
  saveGroup: (g: VpnGroup) => ipcRenderer.invoke("groups:save", g) as Promise<void>,
  deleteGroup: (name: string) => ipcRenderer.invoke("groups:delete", name) as Promise<boolean>,
  duplicateGroup: (name: string) => ipcRenderer.invoke("groups:duplicate", name) as Promise<string>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<MainSettings>,
  saveSettings: (partial: Partial<MainSettings>) => ipcRenderer.invoke("settings:save", partial) as Promise<MainSettings>,
  getSystemLocale: () => ipcRenderer.invoke("app:getLocale") as Promise<string>,
  mergeOpenfortiguiMain: () => ipcRenderer.invoke("settings:mergeOpenfortiguiMain") as Promise<MainSettings | null>,
  startVpn: (name: string, arg?: string | VpnStartCredentials) => ipcRenderer.invoke("vpn:start", name, arg) as Promise<void>,
  stopVpn: (name: string) => ipcRenderer.invoke("vpn:stop", name) as Promise<void>,
  vpnStatus: (name: string) => ipcRenderer.invoke("vpn:status", name) as Promise<string>,
  submitFortigateStdinOtp: (profileName: string, otp: string) =>
    ipcRenderer.invoke("vpn:submitFortigateStdinOtp", profileName, otp) as Promise<boolean>,
  resetOtpPrompt: (profileName: string) => ipcRenderer.invoke("vpn:resetOtpPrompt", profileName) as Promise<void>,
  trustGatewayDigest: (profileName: string, digest: string) =>
    ipcRenderer.invoke("vpn:trustGatewayDigest", profileName, digest) as Promise<false | "profile" | "cache">,
  chooseDirectory: (initialPath?: string) => ipcRenderer.invoke("app:chooseDirectory", initialPath) as Promise<string | null>,
  openLogsDir: () => ipcRenderer.invoke("app:openLogsDir") as Promise<string>,
  openVpnLog: (name: string) => ipcRenderer.invoke("app:openVpnLog", name) as Promise<string>,
  importOpenfortigui: () => ipcRenderer.invoke("import:openfortigui") as Promise<{ profilesCopied: number; groupsCopied: number; errors: string[] }>,
  markChangelogRead: () => ipcRenderer.invoke("changelog:markRead") as Promise<void>,
  onAppNavigate: (cb: (ev: { tab?: number }) => void) => {
    const fn = (_e: IpcRendererEvent, ev: { tab?: number }) => cb(ev);
    ipcRenderer.on("app:navigate", fn);
    return () => ipcRenderer.removeListener("app:navigate", fn);
  },
  onAppConnectProfile: (cb: (ev: { name: string }) => void) => {
    const fn = (_e: IpcRendererEvent, ev: { name: string }) => cb(ev);
    ipcRenderer.on("app:connect-profile", fn);
    return () => ipcRenderer.removeListener("app:connect-profile", fn);
  },
  onVpnLog: (cb: (ev: { name: string; line: string; stream: string }) => void) => {
    const fn = (_e: IpcRendererEvent, ev: { name?: string; profileName?: string; line: string; stream: string }) => {
      cb({ name: ev.name ?? ev.profileName ?? "", line: ev.line, stream: ev.stream });
    };
    ipcRenderer.on("vpn:log", fn);
    return () => ipcRenderer.removeListener("vpn:log", fn);
  },
  onVpnStatus: (cb: (ev: { name: string; state: string }) => void) => {
    const fn = (_e: IpcRendererEvent, ev: { name: string; state: string }) => cb(ev);
    ipcRenderer.on("vpn:status", fn);
    return () => ipcRenderer.removeListener("vpn:status", fn);
  },
  onVpnStats: (cb: (ev: { name: string; stats: VpnTrafficStats }) => void) => {
    const fn = (_e: IpcRendererEvent, ev: { name: string; stats: VpnTrafficStats }) => cb(ev);
    ipcRenderer.on("vpn:stats", fn);
    return () => ipcRenderer.removeListener("vpn:stats", fn);
  },
  onGatewayCertPrompt: (cb: (ev: { profileName: string; digest: string; body: string }) => void) => {
    const fn = (_e: IpcRendererEvent, ev: { profileName: string; digest: string; body: string }) => cb(ev);
    ipcRenderer.on("vpn:gateway-cert-prompt", fn);
    return () => ipcRenderer.removeListener("vpn:gateway-cert-prompt", fn);
  },
  onFortigateStdinOtpPrompt: (cb: (ev: { name: string }) => void) => {
    const fn = (_e: IpcRendererEvent, ev: { name: string }) => cb(ev);
    ipcRenderer.on("vpn:fortigate-stdin-otp-prompt", fn);
    return () => ipcRenderer.removeListener("vpn:fortigate-stdin-otp-prompt", fn);
  },
  onVpnDisconnectWarning: (cb: (ev: { name: string; reasonKey: string; detail: string; wasConnected: boolean }) => void) => {
    const fn = (_e: IpcRendererEvent, ev: { name: string; reasonKey: string; detail: string; wasConnected: boolean }) => cb(ev);
    ipcRenderer.on("vpn:disconnect-warning", fn);
    return () => ipcRenderer.removeListener("vpn:disconnect-warning", fn);
  },
});

contextBridge.exposeInMainWorld("fvpnCapture", {
  enabled: Boolean(process.env.FORTIVPNGUI_CAPTURE_SCREENSHOTS?.trim()),
});
