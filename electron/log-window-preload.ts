import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("fvpnLogWindow", {
  clearLogFile: () => ipcRenderer.invoke("vpnLog:clearFocusedWindow") as Promise<void>,
});
