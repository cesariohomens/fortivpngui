import { BrowserWindow } from "electron";
import * as profileService from "./profile-service.js";
import * as ofv from "./openfortivpn-runner.js";
import * as barr from "./barracuda-runner.js";

export type ConnState = "disconnected" | "connecting" | "connected";

const status = new Map<string, ConnState>();
let logWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null) {
  logWindow = win;
}

function emit(channel: string, payload: unknown) {
  logWindow?.webContents.send(channel, payload);
}

export function getVpnStatus(name: string): ConnState {
  return status.get(name) || "disconnected";
}

export async function startVpn(profileName: string, otp?: string): Promise<void> {
  const profiles = await profileService.listProfiles();
  const p = profiles.find((x) => x.name === profileName);
  if (!p) throw new Error("Profile not found");
  const cur = status.get(profileName);
  if (cur === "connecting" || cur === "connected") return;

  const password = await profileService.getProfilePassword(profileName, p.origin);

  if (p.device_type === "barracuda") {
    status.set(profileName, "connecting");
    emit("vpn:status", { name: profileName, state: "connecting" });
    barr.startBarracuda(
      p,
      password,
      otp || "",
      (line) => emit("vpn:log", { name: profileName, line, stream: "stdout" }),
      (s) => {
        const st: ConnState = s === "connected" ? "connected" : s === "connecting" ? "connecting" : "disconnected";
        status.set(profileName, st);
        emit("vpn:status", { name: profileName, state: st });
      }
    );
    return;
  }

  status.set(profileName, "connecting");
  emit("vpn:status", { name: profileName, state: "connecting" });
  ofv.startOpenfortivpn(
    { ...p, password: "" },
    password,
    p.always_ask_otp ? otp : undefined,
    (ev) => emit("vpn:log", { name: ev.profileName, line: ev.line, stream: ev.stream }),
    () => {
      status.set(profileName, "disconnected");
      emit("vpn:status", { name: profileName, state: "disconnected" });
    },
    () => {
      status.set(profileName, "connected");
      emit("vpn:status", { name: profileName, state: "connected" });
    }
  );
}

export async function stopVpn(profileName: string): Promise<void> {
  const profiles = await profileService.listProfiles();
  const p = profiles.find((x) => x.name === profileName);
  if (p?.device_type === "barracuda") barr.stopBarracuda(profileName);
  else ofv.stopOpenfortivpn(profileName);
  status.set(profileName, "disconnected");
  emit("vpn:status", { name: profileName, state: "disconnected" });
}
