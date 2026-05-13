import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { VpnProfile, VpnGroup, MainSettings } from "./types.js";

contextBridge.exposeInMainWorld("fvpn", {
  openfortivpnPath: () => ipcRenderer.invoke("app:openfortivpnPath") as Promise<string | null>,
  listProfiles: () => ipcRenderer.invoke("profiles:list") as Promise<VpnProfile[]>,
  saveProfile: (p: VpnProfile) => ipcRenderer.invoke("profiles:save", p) as Promise<void>,
  deleteProfile: (name: string) => ipcRenderer.invoke("profiles:delete", name) as Promise<boolean>,
  renameProfile: (oldName: string, newName: string) => ipcRenderer.invoke("profiles:rename", oldName, newName) as Promise<void>,
  listGroups: () => ipcRenderer.invoke("groups:list") as Promise<VpnGroup[]>,
  saveGroup: (g: VpnGroup) => ipcRenderer.invoke("groups:save", g) as Promise<void>,
  deleteGroup: (name: string) => ipcRenderer.invoke("groups:delete", name) as Promise<boolean>,
  renameGroup: (oldName: string, newName: string) => ipcRenderer.invoke("groups:rename", oldName, newName) as Promise<void>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<MainSettings>,
  saveSettings: (partial: Partial<MainSettings>) => ipcRenderer.invoke("settings:save", partial) as Promise<MainSettings>,
  startVpn: (name: string, otp?: string) => ipcRenderer.invoke("vpn:start", name, otp) as Promise<void>,
  stopVpn: (name: string) => ipcRenderer.invoke("vpn:stop", name) as Promise<void>,
  vpnStatus: (name: string) => ipcRenderer.invoke("vpn:status", name) as Promise<string>,
  importOpenfortigui: () => ipcRenderer.invoke("import:openfortigui") as Promise<{ profilesCopied: number; groupsCopied: number; errors: string[] }>,
  markChangelogRead: () => ipcRenderer.invoke("changelog:markRead") as Promise<void>,
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
});
