import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArticleIcon from "@mui/icons-material/Article";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import InfoIcon from "@mui/icons-material/Info";
import InputIcon from "@mui/icons-material/Input";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import SecurityIcon from "@mui/icons-material/Security";
import SettingsIcon from "@mui/icons-material/Settings";
import StopIcon from "@mui/icons-material/Stop";
import TuneIcon from "@mui/icons-material/Tune";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import type { MainSettings, VpnGroup, VpnProfile, VpnStartCredentials, VpnTrafficStats } from "../../shared/types";
import { CHANGELOG_REV } from "../../shared/constants";

type ViewId = "vpn" | "groups" | "settings" | "logs";

const NAME_RE = /^[a-zA-ZäöüÄÖÜ0-9 \-_]{3,}$/;
const navWidth = 280;

const colors = {
  background: "#131313",
  nav: "#001c3a",
  surface: "#201f1f",
  surfaceLow: "#1c1b1b",
  surfaceHigh: "#2a2a2a",
  outline: "#414753",
  text: "#e5e2e1",
  muted: "#c1c6d5",
  primary: "#a7c8ff",
  primaryContainer: "#0074d9",
  secondaryContainer: "#2f486a",
  error: "#ffb4ab",
  warning: "#ffb68e",
  connected: "#32d583",
  disconnected: "#8b919e",
};

const emptyProfile = (): VpnProfile => ({
  name: "",
  origin: "local",
  device_type: "fortigate",
  gateway_host: "",
  gateway_port: 10443,
  username: "",
  password: "",
  otp: "",
  realm: "",
  set_routes: true,
  set_dns: true,
  half_internet_routers: false,
  persistent: false,
  ca_file: "",
  user_cert: "",
  user_key: "",
  trusted_cert: "",
  verify_cert: false,
  debug: false,
  autostart: false,
  always_ask_otp: false,
  otp_prompt: "",
  otp_delay: 0,
  no_ftm_push: false,
  pppd_no_peerdns: false,
  pppd_accept_remote: false,
  pppd_log_file: "",
  pppd_plugin_file: "",
  pppd_ifname: "",
  pppd_ipparam: "",
  pppd_call: "",
  insecure_ssl: false,
  seclevel1: false,
  min_tls: "default",
  trust_all_gw_certs: false,
});

function profileKey(p: VpnProfile): string {
  return `${p.origin}:${p.name}`;
}

function groupKey(origin: "local" | "global", name: string): string {
  return `${origin}:${name}`;
}

function uniq(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))];
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  return `${v.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function randKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 16; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function statusColor(state: string): string {
  if (state === "connected") return colors.connected;
  if (state === "connecting") return colors.warning;
  return colors.disconnected;
}

function sectionSx() {
  return {
    bgcolor: colors.surface,
    border: `1px solid ${colors.outline}`,
    borderRadius: 2,
    overflow: "hidden",
  };
}

function SectionTitle({ icon, title, action }: { icon?: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <Box px={2} py={1.5} bgcolor={colors.surfaceLow} borderBottom={`1px solid ${colors.outline}`} display="flex" alignItems="center" gap={1}>
      {icon}
      <Typography variant="overline" color={colors.primary} fontWeight={700} sx={{ letterSpacing: 0, flex: 1 }}>
        {title}
      </Typography>
      {action}
    </Box>
  );
}

function StatusChip({ state }: { state: string }) {
  return (
    <Chip
      size="small"
      label={state || "disconnected"}
      sx={{
        bgcolor: colors.surfaceHigh,
        color: colors.text,
        border: `1px solid ${colors.outline}`,
        "& .MuiChip-label": { px: 1 },
        "&::before": {
          content: '""',
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: statusColor(state),
          ml: 1,
        },
      }}
    />
  );
}

export default function App() {
  const [view, setView] = useState<ViewId>("vpn");
  const [bootError, setBootError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<VpnProfile[]>([]);
  const [groups, setGroups] = useState<VpnGroup[]>([]);
  const [settings, setSettings] = useState<MainSettings | null>(null);
  const [ofvPath, setOfvPath] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Record<string, VpnTrafficStats>>({});
  const [logs, setLogs] = useState<{ t: number; name: string; line: string; stream?: string }[]>([]);

  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const [profileFilter, setProfileFilter] = useState("");
  const [profileCtx, setProfileCtx] = useState<{ top: number; left: number; name: string } | null>(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<VpnProfile>(emptyProfile());
  const [profileOriginalName, setProfileOriginalName] = useState<string | null>(null);
  const [profileEditorTab, setProfileEditorTab] = useState(0);
  const [credentialsEnabled, setCredentialsEnabled] = useState(false);
  const [certificateEnabled, setCertificateEnabled] = useState(false);
  const [showProfilePassword, setShowProfilePassword] = useState(false);

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupDraftName, setGroupDraftName] = useState("");
  const [groupOriginalName, setGroupOriginalName] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Set<string>>(new Set());

  const [loginOpen, setLoginOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState<string | null>(null);
  const [loginKind, setLoginKind] = useState<"always" | "challenge" | null>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [loginChallengeExplicitOtp, setLoginChallengeExplicitOtp] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showLoginOtp, setShowLoginOtp] = useState(false);
  const lastOtpChallengeLogKey = useRef("");
  const fortigateLastConnectHadOtp = useRef<Record<string, boolean>>({});
  const connectProfileRequest = useRef<(name: string) => void>(() => {});

  const [barrOtpOpen, setBarrOtpOpen] = useState(false);
  const [barrOtpTarget, setBarrOtpTarget] = useState<string | null>(null);
  const [barrOtpVal, setBarrOtpVal] = useState("");
  const [showBarrOtp, setShowBarrOtp] = useState(false);

  const [gwCertDlg, setGwCertDlg] = useState<{ profileName: string; digest: string; body: string } | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAesKey, setWizardAesKey] = useState("");
  const [wizardAesIv, setWizardAesIv] = useState("");
  const [wizardUseStore, setWizardUseStore] = useState(false);
  const settingsPromptsDone = useRef(false);

  const refresh = useCallback(async () => {
    setBootError(null);
    try {
      if (typeof window.fvpn === "undefined") {
        throw new Error("API do processo principal não disponível.");
      }
      const [p, g, s, o] = await Promise.all([
        window.fvpn.listProfiles(),
        window.fvpn.listGroups(),
        window.fvpn.getSettings(),
        window.fvpn.openfortivpnPath(),
      ]);
      setProfiles(p);
      setGroups(g);
      setSettings(s);
      setOfvPath(o);
      const st: Record<string, string> = {};
      await Promise.all(
        p.map(async (profile) => {
          st[profile.name] = await window.fvpn.vpnStatus(profile.name);
        })
      );
      setStatus(st);
      if (selectedProfileName && !p.some((x) => x.name === selectedProfileName)) setSelectedProfileName(null);
      if (selectedGroupName && !g.some((x) => x.name === selectedGroupName)) setSelectedGroupName(null);
    } catch (e) {
      setBootError(e instanceof Error ? e.message : String(e));
    }
  }, [selectedGroupName, selectedProfileName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!settings) return;
    setWizardAesKey(settings.aeskey);
    setWizardAesIv(settings.aesiv);
    setWizardUseStore(settings.use_system_password_store);
    if (settingsPromptsDone.current) return;
    settingsPromptsDone.current = true;
    if (!settings.setupwizard) setWizardOpen(true);
    if (settings.changelogrev_read < CHANGELOG_REV) setChangelogOpen(true);
  }, [settings]);

  useEffect(() => {
    return window.fvpn.onAppNavigate((ev) => {
      if (ev.tab === 0) setView("vpn");
      if (ev.tab === 1) setView("groups");
      if (ev.tab === 2) setView("settings");
      if (ev.tab === 3) setView("logs");
    });
  }, []);

  useEffect(() => window.fvpn.onAppConnectProfile((ev) => connectProfileRequest.current(ev.name)), []);

  useEffect(() => window.fvpn.onGatewayCertPrompt((ev) => setGwCertDlg(ev)), []);

  useEffect(() => {
    const unsubLog = window.fvpn.onVpnLog((ev) => {
      setLogs((prev) => [...prev, { t: Date.now(), name: ev.name, line: ev.line, stream: ev.stream }].slice(-500));
    });
    const unsubStatus = window.fvpn.onVpnStatus((ev) => {
      setStatus((prev) => ({ ...prev, [ev.name]: ev.state }));
    });
    const unsubStats = window.fvpn.onVpnStats((ev) => {
      setStats((prev) => ({ ...prev, [ev.name]: ev.stats }));
    });
    return () => {
      unsubLog();
      unsubStatus();
      unsubStats();
    };
  }, []);

  useEffect(() => {
    if (loginOpen || !profiles.length) return;
    const explicitOtpNeed = (line: string) => /No OTP specified|No token specified/i.test(line);
    const authFailMaybeOtp = (line: string) => /Could not authenticate to (?:the )?gateway/i.test(line) || /No cookie given/i.test(line);

    for (let i = logs.length - 1; i >= Math.max(0, logs.length - 24); i -= 1) {
      const e = logs[i];
      const explicit = explicitOtpNeed(e.line);
      const maybeAuth = authFailMaybeOtp(e.line);
      if (!explicit && !maybeAuth) continue;
      if (maybeAuth && fortigateLastConnectHadOtp.current[e.name]) continue;
      const key = `${e.t}|${e.name}|${e.line}`;
      if (key === lastOtpChallengeLogKey.current) continue;
      const profile = profiles.find((x) => x.name === e.name);
      if (!profile || profile.device_type !== "fortigate" || profile.always_ask_otp) continue;
      lastOtpChallengeLogKey.current = key;
      setLoginChallengeExplicitOtp(explicit);
      setLoginKind("challenge");
      setLoginTarget(e.name);
      setLoginUser(profile.username);
      setLoginPass(profile.password);
      setLoginOtp("");
      setShowLoginPass(false);
      setShowLoginOtp(false);
      setLoginOpen(true);
      return;
    }
  }, [logs, loginOpen, profiles]);

  const selectedProfile = useMemo(
    () => (selectedProfileName ? profiles.find((p) => p.name === selectedProfileName) ?? null : null),
    [profiles, selectedProfileName]
  );
  const selectedGroup = useMemo(() => (selectedGroupName ? groups.find((g) => g.name === selectedGroupName) ?? null : null), [groups, selectedGroupName]);

  const filteredProfiles = useMemo(() => {
    const q = profileFilter.trim().toLowerCase();
    const base = settings?.show_search && q
      ? profiles.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.gateway_host.toLowerCase().includes(q) ||
            p.username.toLowerCase().includes(q) ||
            p.device_type.toLowerCase().includes(q) ||
            p.origin.toLowerCase().includes(q)
        )
      : profiles;
    return base;
  }, [profileFilter, profiles, settings?.show_search]);

  const localProfiles = filteredProfiles.filter((p) => p.origin === "local");
  const globalProfiles = filteredProfiles.filter((p) => p.origin === "global");

  const suggestedTrustedDigest = useMemo(() => {
    const name = profileDraft.name.trim();
    if (!name || !profileOpen) return null;
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const e = logs[i];
      if (e.name !== name) continue;
      const m = e.line.match(/--trusted-cert\s+([0-9a-fA-F]{64})\b|trusted-cert\s*=\s*([0-9a-fA-F]{64})\b/);
      if (m) return (m[1] || m[2]).toLowerCase();
    }
    return null;
  }, [logs, profileDraft.name, profileOpen]);

  const groupStatus = (g: VpnGroup) => {
    const members = uniq([...g.localMembers, ...g.globalMembers]);
    if (!members.length) return "disconnected";
    const connected = members.filter((name) => status[name] === "connected").length;
    if (connected === members.length) return "connected";
    if (connected > 0 || members.some((name) => status[name] === "connecting")) return "connecting";
    return "disconnected";
  };

  const logGroupLine = (line: string) => {
    setLogs((prev) => [...prev, { t: Date.now(), name: "(group)", line }].slice(-500));
    console.warn(line);
  };

  const isProfileActive = (name: string) => status[name] === "connected" || status[name] === "connecting";

  const startVpnFlow = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    if (p.device_type === "fortigate" && !ofvPath) {
      alert("openfortivpn not found in PATH.");
      return;
    }
    if (p.device_type === "barracuda" && p.always_ask_otp) {
      setBarrOtpTarget(name);
      setBarrOtpVal("");
      setShowBarrOtp(false);
      setBarrOtpOpen(true);
      return;
    }
    if (p.device_type === "fortigate" && p.always_ask_otp) {
      lastOtpChallengeLogKey.current = "";
      setLoginKind("always");
      setLoginTarget(name);
      setLoginUser(p.username);
      setLoginPass(p.password);
      setLoginOtp("");
      setLoginChallengeExplicitOtp(false);
      setShowLoginPass(false);
      setShowLoginOtp(false);
      setLoginOpen(true);
      return;
    }
    lastOtpChallengeLogKey.current = "";
    fortigateLastConnectHadOtp.current[name] = false;
    try {
      await window.fvpn.startVpn(name);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  connectProfileRequest.current = (name: string) => {
    void startVpnFlow(name);
  };

  const stopVpn = async (name: string) => {
    await window.fvpn.stopVpn(name);
  };

  const openNewProfile = () => {
    const p = emptyProfile();
    setProfileDraft(p);
    setProfileOriginalName(null);
    setCredentialsEnabled(false);
    setCertificateEnabled(false);
    setProfileEditorTab(0);
    setShowProfilePassword(false);
    setProfileOpen(true);
  };

  const editProfile = (p: VpnProfile) => {
    if (p.origin === "global") return;
    if (isProfileActive(p.name)) {
      alert("The VPN state must be disconnected to perform this action.");
      return;
    }
    setProfileDraft({ ...p });
    setProfileOriginalName(p.name);
    setCredentialsEnabled(Boolean(p.username || p.password));
    setCertificateEnabled(Boolean(p.ca_file || p.user_cert || p.user_key));
    setProfileEditorTab(0);
    setShowProfilePassword(false);
    setProfileOpen(true);
  };

  const saveProfile = async () => {
    const name = profileDraft.name.trim();
    if (!NAME_RE.test(name)) {
      alert("You must set a valid name for the VPN.");
      return;
    }
    if (!profileDraft.gateway_host.trim()) {
      alert("You must set a gateway for the VPN.");
      return;
    }
    if (!profileDraft.gateway_port) {
      alert("You must set a gateway-port for the VPN.");
      return;
    }
    if (credentialsEnabled && !profileDraft.username.trim()) {
      alert("You must set a valid username if credentials are enabled.");
      return;
    }
    const next: VpnProfile = {
      ...profileDraft,
      name,
      username: credentialsEnabled ? profileDraft.username.trim() : "",
      password: credentialsEnabled ? profileDraft.password : "",
      ca_file: certificateEnabled ? profileDraft.ca_file : "",
      user_cert: certificateEnabled ? profileDraft.user_cert : "",
      user_key: certificateEnabled ? profileDraft.user_key : "",
      origin: "local",
    };
    try {
      if (profileOriginalName && profileOriginalName !== name) {
        await window.fvpn.deleteProfile(profileOriginalName);
      }
      await window.fvpn.saveProfile(next);
      setProfileOpen(false);
      setSelectedProfileName(name);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteProfile = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    if (p.origin === "global") {
      alert("Global VPN-Profiles cannot be deleted.");
      return;
    }
    const st = status[name];
    if (st === "connected" || st === "connecting") {
      alert("The VPN state must be disconnected to perform this action.");
      return;
    }
    if (!confirm(`Warning, the selected vpn will be deleted, continue?\n\n${name}`)) return;
    await window.fvpn.deleteProfile(name);
    if (selectedProfileName === name) setSelectedProfileName(null);
    await refresh();
  };

  const duplicateProfile = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    const proposed = `${p.name} copy`;
    const newName = prompt("Enter the new VPN-profile name", proposed);
    if (!newName) return;
    try {
      await window.fvpn.saveProfile({ ...p, name: newName.trim(), origin: "local" });
      setSelectedProfileName(newName.trim());
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const openNewGroup = () => {
    setGroupDraftName("");
    setGroupOriginalName(null);
    setGroupMembers(new Set());
    setGroupOpen(true);
  };

  const editGroup = (g: VpnGroup) => {
    setGroupDraftName(g.name);
    setGroupOriginalName(g.name);
    setGroupMembers(new Set([...g.localMembers.map((n) => groupKey("local", n)), ...g.globalMembers.map((n) => groupKey("global", n))]));
    setGroupOpen(true);
  };

  const saveGroup = async () => {
    const name = groupDraftName.trim();
    if (!NAME_RE.test(name)) {
      alert("You must set a name for the VPN-group.");
      return;
    }
    const localMembers: string[] = [];
    const globalMembers: string[] = [];
    for (const key of groupMembers) {
      const [origin, memberName] = key.split(":") as ["local" | "global", string];
      const p = profiles.find((x) => x.name === memberName && x.origin === origin);
      if (!p || !p.username || !p.password) {
        alert(`You must set username and password for each group member. First missing on VPN: ${memberName}`);
        return;
      }
      if (origin === "local") localMembers.push(memberName);
      else globalMembers.push(memberName);
    }
    try {
      if (groupOriginalName && groupOriginalName !== name) await window.fvpn.deleteGroup(groupOriginalName);
      await window.fvpn.saveGroup({ name, localMembers, globalMembers });
      setGroupOpen(false);
      setSelectedGroupName(name);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteGroup = async (name: string) => {
    if (!confirm(`Warning, the selected vpn-group will be deleted, continue?\n\n${name}`)) return;
    await window.fvpn.deleteGroup(name);
    if (selectedGroupName === name) setSelectedGroupName(null);
    await refresh();
  };

  const duplicateGroup = async (name: string) => {
    try {
      const newName = await window.fvpn.duplicateGroup(name);
      setSelectedGroupName(newName);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const connectGroup = async (g: VpnGroup) => {
    for (const name of uniq([...g.localMembers, ...g.globalMembers])) {
      const p = profiles.find((x) => x.name === name);
      if (!p) {
        logGroupLine(`[group "${g.name}"] Member profile not found: ${name}`);
        continue;
      }
      if (p.device_type === "fortigate" && !ofvPath) {
        logGroupLine(`[group "${g.name}"] Skipping ${name} (openfortivpn not found).`);
        continue;
      }
      if (p.always_ask_otp) {
        logGroupLine(`[group "${g.name}"] Skipping ${name} (interactive OTP required).`);
        continue;
      }
      if (status[name] === "connected" || status[name] === "connecting") continue;
      try {
        await window.fvpn.startVpn(name);
      } catch (e) {
        logGroupLine(`[group "${g.name}"] connect failed for ${name}: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const disconnectGroup = async (g: VpnGroup) => {
    for (const name of uniq([...g.localMembers, ...g.globalMembers])) await window.fvpn.stopVpn(name);
  };

  const submitLogin = async () => {
    if (!loginTarget || !loginKind) return;
    if (!loginUser.trim()) {
      alert("Enter the username.");
      return;
    }
    if (loginKind === "always" && !loginOtp.trim()) {
      alert("Enter the one-time password.");
      return;
    }
    if (loginKind === "challenge" && loginChallengeExplicitOtp && !loginOtp.trim()) {
      alert("Enter the one-time password.");
      return;
    }
    if (loginOtp.trim()) fortigateLastConnectHadOtp.current[loginTarget] = true;
    const creds: VpnStartCredentials = { username: loginUser.trim(), password: loginPass, otp: loginOtp.trim() };
    try {
      await window.fvpn.startVpn(loginTarget, creds);
    } catch (e) {
      alert((e as Error).message);
    }
    setLoginOpen(false);
    setLoginKind(null);
    setLoginTarget(null);
  };

  const submitBarrOtp = async () => {
    if (!barrOtpTarget) return;
    if (!barrOtpVal.trim()) {
      alert("Enter the one-time password.");
      return;
    }
    try {
      await window.fvpn.startVpn(barrOtpTarget, { otp: barrOtpVal.trim() });
    } catch (e) {
      alert((e as Error).message);
    }
    setBarrOtpOpen(false);
    setBarrOtpTarget(null);
    setBarrOtpVal("");
  };

  const saveSettingsUi = async (partial: Partial<MainSettings>) => {
    const next = await window.fvpn.saveSettings(partial);
    setSettings(next);
  };

  const chooseSettingDir = async (key: keyof Pick<MainSettings, "localvpnprofiles" | "globalvpnprofiles" | "localvpngroups" | "logs">) => {
    if (!settings) return;
    const dir = await window.fvpn.chooseDirectory(settings[key]);
    if (!dir) return;
    await saveSettingsUi({ [key]: dir } as Partial<MainSettings>);
  };

  const runImport = async () => {
    const r = await window.fvpn.importOpenfortigui();
    alert(`Imported ${r.profilesCopied} profiles, ${r.groupsCopied} groups.${r.errors.length ? `\n\nErrors:\n${r.errors.join("\n")}` : ""}`);
    await refresh();
  };

  const mergeOfgMain = async () => {
    const next = await window.fvpn.mergeOpenfortiguiMain();
    if (!next) alert("No ~/.openfortigui/main.conf or no mappable keys found.");
    else setSettings(next);
  };

  const finishWizard = async () => {
    if (wizardAesKey.length !== 16 || wizardAesIv.length !== 16) {
      alert("Both AES-Key and AES-IV must be 128bit (16 chars) long.");
      return;
    }
    await saveSettingsUi({ aeskey: wizardAesKey, aesiv: wizardAesIv, use_system_password_store: wizardUseStore, setupwizard: true });
    setWizardOpen(false);
  };

  const toolbarConnect = () => {
    if (view === "vpn" && selectedProfile) void startVpnFlow(selectedProfile.name);
    if (view === "groups" && selectedGroup) void connectGroup(selectedGroup);
  };
  const toolbarDisconnect = () => {
    if (view === "vpn" && selectedProfile) void stopVpn(selectedProfile.name);
    if (view === "groups" && selectedGroup) void disconnectGroup(selectedGroup);
  };
  const toolbarEdit = () => {
    if (view === "vpn" && selectedProfile) editProfile(selectedProfile);
    if (view === "groups" && selectedGroup) editGroup(selectedGroup);
  };
  const toolbarCopy = () => {
    if (view === "vpn" && selectedProfile) void duplicateProfile(selectedProfile.name);
    if (view === "groups" && selectedGroup) void duplicateGroup(selectedGroup.name);
  };
  const toolbarDelete = () => {
    if (view === "vpn" && selectedProfile) void deleteProfile(selectedProfile.name);
    if (view === "groups" && selectedGroup) void deleteGroup(selectedGroup.name);
  };

  if (bootError) {
    return (
      <Box p={3}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {bootError}
        </Alert>
        <Button variant="contained" onClick={() => void refresh()}>
          Try again
        </Button>
      </Box>
    );
  }

  if (!settings) {
    return (
      <Box p={2} bgcolor={colors.background} minHeight="100vh">
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  const certLocked = settings.disallow_unsecure_certificates;

  const renderProfileTable = (title: string, items: VpnProfile[]) => (
    <Paper sx={sectionSx()}>
      <SectionTitle
        icon={<VpnKeyIcon fontSize="small" sx={{ color: colors.primary }} />}
        title={title}
        action={<Chip size="small" label={`${items.length} profiles`} sx={{ bgcolor: colors.surfaceHigh, color: colors.muted }} />}
      />
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 820 }}>
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Device</TableCell>
              <TableCell>Gateway</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Traffic RX/TX</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((p) => {
              const st = status[p.name] || "disconnected";
              const active = st === "connected" || st === "connecting";
              const selected = selectedProfileName === p.name;
              const traffic = stats[p.name];
              return (
                <TableRow
                  key={profileKey(p)}
                  hover
                  selected={selected}
                  onClick={() => setSelectedProfileName(p.name)}
                  onDoubleClick={() => {
                    if (settings.connect_on_dblclick) void startVpnFlow(p.name);
                    else editProfile(p);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedProfileName(p.name);
                    setProfileCtx({ top: e.clientY, left: e.clientX, name: p.name });
                  }}
                  sx={{ cursor: "default" }}
                >
                  <TableCell>
                    <StatusChip state={st} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{p.name}</TableCell>
                  <TableCell>
                    <Chip size="small" label={p.device_type === "fortigate" ? "Fortigate" : "Barracuda"} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {p.gateway_host}:{p.gateway_port}
                  </TableCell>
                  <TableCell>{p.username}</TableCell>
                  <TableCell sx={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {formatBytes(traffic?.bytes_read)} / {formatBytes(traffic?.bytes_written)}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={active ? "Disconnect" : "Connect"}>
                      <IconButton size="small" disabled={p.device_type === "fortigate" && !ofvPath && !active} onClick={() => void (active ? stopVpn(p.name) : startVpnFlow(p.name))}>
                        {active ? <LinkOffIcon fontSize="small" /> : <LinkIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <span>
                        <IconButton size="small" disabled={p.origin === "global" || active} onClick={() => editProfile(p)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Copy">
                      <IconButton size="small" onClick={() => void duplicateProfile(p.name)}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <span>
                        <IconButton size="small" disabled={p.origin === "global" || active} onClick={() => void deleteProfile(p.name)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );

  return (
    <Box minHeight="100vh" bgcolor={colors.background} color={colors.text} display="flex">
      <Box
        component="nav"
        width={navWidth}
        bgcolor={colors.nav}
        borderRight={`1px solid ${colors.outline}`}
        position="fixed"
        left={0}
        top={0}
        bottom={0}
        display={{ xs: "none", md: "flex" }}
        flexDirection="column"
        py={3}
      >
        <Box px={2} mb={3} display="flex" alignItems="center" gap={1.5}>
          <Box width={40} height={40} borderRadius={2} bgcolor={colors.primaryContainer} display="flex" alignItems="center" justifyContent="center">
            <SecurityIcon />
          </Box>
          <Box>
            <Typography variant="h6" color={colors.primary} fontWeight={800} lineHeight={1}>
              FortiVPN GUI
            </Typography>
            <Typography variant="caption" color={colors.muted}>
              OpenFortiGUI flow
            </Typography>
          </Box>
        </Box>
        <Stack px={1} spacing={0.5} flex={1}>
          {[
            ["vpn", "VPN", <VpnKeyIcon />],
            ["groups", "VPN-Groups", <GroupWorkIcon />],
            ["settings", "Settings", <SettingsIcon />],
            ["logs", "Logs", <InputIcon />],
          ].map(([id, label, icon]) => (
            <ListItemButton
              key={id as string}
              selected={view === id}
              onClick={() => setView(id as ViewId)}
              sx={{
                borderRadius: 2,
                color: view === id ? colors.primary : colors.muted,
                "&.Mui-selected": { bgcolor: colors.secondaryContainer, color: colors.text },
              }}
            >
              <Box mr={1.5} display="flex">
                {icon}
              </Box>
              <Typography variant="body2" fontWeight={view === id ? 700 : 500}>
                {label as string}
              </Typography>
            </ListItemButton>
          ))}
        </Stack>
        <Stack px={1} spacing={0.5}>
          <ListItemButton sx={{ borderRadius: 2, color: colors.muted }} onClick={() => setAboutOpen(true)}>
            <InfoIcon sx={{ mr: 1.5 }} />
            <Typography variant="body2">About</Typography>
          </ListItemButton>
        </Stack>
      </Box>

      <Box ml={{ xs: 0, md: `${navWidth}px` }} flex={1} minWidth={0}>
        <Box
          height={64}
          position="sticky"
          top={0}
          zIndex={10}
          bgcolor={colors.background}
          borderBottom={`1px solid ${colors.outline}`}
          display="flex"
          alignItems="center"
          px={2}
          gap={1}
        >
          <Typography variant="h6" fontWeight={800} flex={1}>
            {view === "vpn" ? "VPN Profiles" : view === "groups" ? "VPN Groups" : view === "settings" ? "Settings" : "Logs"}
          </Typography>
          <Tooltip title="Changelog">
            <IconButton onClick={() => setChangelogOpen(true)}>
              <ArticleIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton onClick={() => void refresh()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {!ofvPath && (
          <Alert severity="error" sx={{ m: 2 }}>
            openfortivpn not found in PATH. Fortigate profiles require it.
          </Alert>
        )}

        <Box p={3}>
          {(view === "vpn" || view === "groups") && (
            <Stack direction="row" flexWrap="wrap" gap={1} mb={2} p={1} sx={sectionSx()}>
              <Button startIcon={<PlayArrowIcon />} onClick={toolbarConnect} disabled={view === "vpn" ? !selectedProfile : !selectedGroup}>
                Connect
              </Button>
              <Button startIcon={<StopIcon />} onClick={toolbarDisconnect} disabled={view === "vpn" ? !selectedProfile : !selectedGroup}>
                Disconnect
              </Button>
              <Divider orientation="vertical" flexItem />
              <Button startIcon={<AddIcon />} onClick={(e) => setAddMenuAnchor(e.currentTarget)}>
                Add
              </Button>
              <Button startIcon={<EditIcon />} onClick={toolbarEdit} disabled={view === "vpn" ? !selectedProfile || selectedProfile.origin === "global" || isProfileActive(selectedProfile.name) : !selectedGroup}>
                Edit
              </Button>
              <Button startIcon={<ContentCopyIcon />} onClick={toolbarCopy} disabled={view === "vpn" ? !selectedProfile : !selectedGroup}>
                Copy
              </Button>
              <Button
                startIcon={<SearchIcon />}
                onClick={() => void saveSettingsUi({ show_search: !settings.show_search })}
                disabled={view !== "vpn"}
                sx={{ color: settings.show_search ? colors.primary : undefined }}
              >
                Search
              </Button>
              <Divider orientation="vertical" flexItem />
              <Button startIcon={<DeleteIcon />} onClick={toolbarDelete} disabled={view === "vpn" ? !selectedProfile || selectedProfile.origin === "global" || isProfileActive(selectedProfile.name) : !selectedGroup} color="error">
                Delete
              </Button>
              <Button
                startIcon={<FolderOpenIcon />}
                disabled={view === "vpn" && !selectedProfile}
                onClick={() => {
                  if (view === "vpn" && selectedProfile) void window.fvpn.openVpnLog(selectedProfile.name);
                  else void window.fvpn.openLogsDir();
                }}
              >
                Logs
              </Button>
            </Stack>
          )}

          {view === "vpn" && (
            <Stack spacing={2}>
              {settings.show_search && (
                <TextField
                  size="small"
                  placeholder="Search profiles"
                  value={profileFilter}
                  onChange={(e) => setProfileFilter(e.target.value)}
                  InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: colors.muted }} /> }}
                />
              )}
              {renderProfileTable("Local VPNs", localProfiles)}
              {renderProfileTable("Global VPNs", globalProfiles)}
            </Stack>
          )}

          {view === "groups" && (
            <Paper sx={sectionSx()}>
              <SectionTitle icon={<GroupWorkIcon fontSize="small" sx={{ color: colors.primary }} />} title="VPN-Groups" />
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 680 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Status</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>VPNs</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groups.map((g) => {
                      const st = groupStatus(g);
                      return (
                        <TableRow key={g.name} hover selected={selectedGroupName === g.name} onClick={() => setSelectedGroupName(g.name)} onDoubleClick={() => (settings.connect_on_dblclick ? void connectGroup(g) : editGroup(g))}>
                          <TableCell>
                            <StatusChip state={st} />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{g.name}</TableCell>
                          <TableCell>{uniq([...g.localMembers, ...g.globalMembers]).join(", ")}</TableCell>
                          <TableCell align="right">
                            <IconButton size="small" onClick={() => void connectGroup(g)}>
                              <LinkIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => void disconnectGroup(g)}>
                              <LinkOffIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => void duplicateGroup(g.name)}>
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => editGroup(g)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => void deleteGroup(g.name)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {view === "settings" && (
            <Stack spacing={2} maxWidth={920}>
              <Paper sx={sectionSx()}>
                <SectionTitle icon={<SettingsIcon fontSize="small" sx={{ color: colors.primary }} />} title="Main" />
                <Stack p={2} spacing={1.5}>
                  <FormControlLabel control={<Checkbox checked={settings.debug} onChange={(_, c) => void saveSettingsUi({ debug: c })} />} label="Debug" />
                  <FormControlLabel control={<Checkbox checked={settings.use_system_password_store} onChange={(_, c) => void saveSettingsUi({ use_system_password_store: c })} />} label="Password Manager" />
                  <TextField label="AES-Key" value={settings.aeskey} disabled={settings.use_system_password_store} onChange={(e) => setSettings({ ...settings, aeskey: e.target.value })} onBlur={() => void saveSettingsUi({ aeskey: settings.aeskey })} />
                  <TextField label="AES-IV" value={settings.aesiv} disabled={settings.use_system_password_store} onChange={(e) => setSettings({ ...settings, aesiv: e.target.value })} onBlur={() => void saveSettingsUi({ aesiv: settings.aesiv })} />
                  <FormControlLabel control={<Checkbox checked={settings.sudo_preserve_env} onChange={(_, c) => void saveSettingsUi({ sudo_preserve_env: c })} />} label="SUDO Preserve Env." />
                  <FormControlLabel control={<Checkbox checked={settings.disallow_unsecure_certificates} onChange={(_, c) => void saveSettingsUi({ disallow_unsecure_certificates: c })} />} label="Disallow insecure certificates" />
                </Stack>
              </Paper>
              <Paper sx={sectionSx()}>
                <SectionTitle icon={<FolderOpenIcon fontSize="small" sx={{ color: colors.primary }} />} title="Paths" />
                <Stack p={2} spacing={1.5}>
                  {[
                    ["localvpnprofiles", "Local VPN-Profiles"],
                    ["localvpngroups", "Local VPN-Groups"],
                    ["globalvpnprofiles", "Global VPN-Profiles"],
                    ["logs", "Logs"],
                  ].map(([key, label]) => (
                    <TextField
                      key={key}
                      label={label}
                      value={settings[key as keyof MainSettings] as string}
                      onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                      onBlur={() => void saveSettingsUi({ [key]: settings[key as keyof MainSettings] } as Partial<MainSettings>)}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => void chooseSettingDir(key as "localvpnprofiles" | "globalvpnprofiles" | "localvpngroups" | "logs")}>
                              <FolderOpenIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  ))}
                </Stack>
              </Paper>
              <Paper sx={sectionSx()}>
                <SectionTitle icon={<TuneIcon fontSize="small" sx={{ color: colors.primary }} />} title="GUI" />
                <Stack p={2} spacing={1}>
                  <FormControlLabel control={<Checkbox checked={settings.start_minimized} onChange={(_, c) => void saveSettingsUi({ start_minimized: c })} />} label="Start minimized" />
                  <FormControlLabel control={<Checkbox checked={settings.disable_notifications} onChange={(_, c) => void saveSettingsUi({ disable_notifications: c })} />} label="Disable notifications" />
                  <FormControlLabel control={<Checkbox checked={settings.connect_on_dblclick} onChange={(_, c) => void saveSettingsUi({ connect_on_dblclick: c })} />} label="Connect on double-click" />
                  <FormControlLabel control={<Checkbox checked={settings.show_search} onChange={(_, c) => void saveSettingsUi({ show_search: c })} />} label="Show search" />
                  <Stack direction="row" gap={1}>
                    <Button variant="outlined" onClick={() => void mergeOfgMain()}>
                      Merge OpenFortiGUI main.conf
                    </Button>
                    <Button variant="outlined" onClick={() => void runImport()}>
                      Import OpenFortiGUI profiles/groups
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            </Stack>
          )}

          {view === "logs" && (
            <Paper sx={sectionSx()}>
              <SectionTitle
                icon={<InputIcon fontSize="small" sx={{ color: colors.primary }} />}
                title="Logs"
                action={
                  <Stack direction="row" gap={1}>
                    <Button size="small" startIcon={<FolderOpenIcon />} onClick={() => void window.fvpn.openLogsDir()}>
                      Open folder
                    </Button>
                    <Button size="small" startIcon={<ClearAllIcon />} disabled={!logs.length} onClick={() => setLogs([])}>
                      Clear
                    </Button>
                  </Stack>
                }
              />
              <Box p={1.5} fontFamily="JetBrains Mono, monospace" fontSize={12} maxHeight="70vh" overflow="auto">
                {logs.length === 0 ? (
                  <Typography color={colors.muted}>VPN process output will appear here.</Typography>
                ) : (
                  logs.map((l, i) => (
                    <Box key={`${l.t}-${i}`} py={0.25} px={0.5} bgcolor={i % 2 ? colors.surfaceLow : "transparent"}>
                      [{l.name}] {l.line}
                    </Box>
                  ))
                )}
              </Box>
            </Paper>
          )}
        </Box>
      </Box>

      <Menu anchorEl={addMenuAnchor} open={Boolean(addMenuAnchor)} onClose={() => setAddMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null);
            openNewProfile();
          }}
        >
          VPN
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null);
            openNewGroup();
          }}
        >
          VPN-Group
        </MenuItem>
      </Menu>

      <Menu open={profileCtx !== null} onClose={() => setProfileCtx(null)} anchorReference="anchorPosition" anchorPosition={profileCtx ? { top: profileCtx.top, left: profileCtx.left } : undefined}>
        <MenuItem
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) void startVpnFlow(name);
          }}
        >
          Connect
        </MenuItem>
        <MenuItem
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) void stopVpn(name);
          }}
        >
          Disconnect
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={profiles.find((p) => p.name === profileCtx?.name)?.origin === "global" || Boolean(profileCtx?.name && isProfileActive(profileCtx.name))}
          onClick={() => {
            const p = profiles.find((x) => x.name === profileCtx?.name);
            setProfileCtx(null);
            if (p) editProfile(p);
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) void duplicateProfile(name);
          }}
        >
          Copy
        </MenuItem>
        <MenuItem
          disabled={profiles.find((p) => p.name === profileCtx?.name)?.origin === "global" || Boolean(profileCtx?.name && isProfileActive(profileCtx.name))}
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) void deleteProfile(name);
          }}
        >
          Delete
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) void window.fvpn.openVpnLog(name);
          }}
        >
          View logs
        </MenuItem>
      </Menu>

      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle display="flex" alignItems="center" gap={1}>
          <EditIcon sx={{ color: colors.primary }} />
          {profileOriginalName ? `Edit VPN - ${profileOriginalName}` : "Add VPN"}
          <Box flex={1} />
          <IconButton onClick={() => setProfileOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Tabs value={profileEditorTab} onChange={(_, v) => setProfileEditorTab(v)} sx={{ px: 3 }}>
          <Tab icon={<TuneIcon />} iconPosition="start" label="VPN-Preferences" />
          <Tab icon={<SettingsIcon />} iconPosition="start" label="Options" />
        </Tabs>
        <DialogContent dividers>
          {profileDraft.device_type === "barracuda" && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Barracuda uses gateway, username, password, static OTP and debug. Fortigate certificate, PPPD, routing and SSL options are stored but not sent to barracudavpn.
            </Alert>
          )}
          {profileEditorTab === 0 ? (
            <Stack spacing={2}>
              <Paper sx={sectionSx()}>
                <SectionTitle icon={<TuneIcon fontSize="small" sx={{ color: colors.primary }} />} title="Common" />
                <Stack p={2} spacing={2}>
                  <TextField label="Name" value={profileDraft.name} onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })} />
                  <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                    <TextField label="VPN-Server" fullWidth value={profileDraft.gateway_host} onChange={(e) => setProfileDraft({ ...profileDraft, gateway_host: e.target.value })} />
                    <Select value={profileDraft.device_type} onChange={(e) => setProfileDraft({ ...profileDraft, device_type: e.target.value as VpnProfile["device_type"] })} sx={{ minWidth: 180 }}>
                      <MenuItem value="fortigate">Fortigate</MenuItem>
                      <MenuItem value="barracuda">Barracuda</MenuItem>
                    </Select>
                    <TextField label="VPN-Port" type="number" value={profileDraft.gateway_port} onChange={(e) => setProfileDraft({ ...profileDraft, gateway_port: Number.parseInt(e.target.value, 10) || 10443 })} sx={{ maxWidth: 140 }} />
                  </Stack>
                  <FormControlLabel control={<Checkbox checked={profileDraft.persistent} onChange={(_, c) => setProfileDraft({ ...profileDraft, persistent: c })} />} label="Reconnect on disconnect" />
                </Stack>
              </Paper>
              <Paper sx={sectionSx()}>
                <SectionTitle
                  icon={<VpnKeyIcon fontSize="small" sx={{ color: colors.primary }} />}
                  title="Credentials"
                  action={<FormControlLabel control={<Checkbox checked={credentialsEnabled} onChange={(_, c) => setCredentialsEnabled(c)} />} label="Enabled" />}
                />
                <Stack p={2} spacing={2}>
                  <TextField disabled={!credentialsEnabled} label="Username" value={profileDraft.username} onChange={(e) => setProfileDraft({ ...profileDraft, username: e.target.value })} />
                  <TextField
                    disabled={!credentialsEnabled}
                    label="Password"
                    type={showProfilePassword ? "text" : "password"}
                    value={profileDraft.password}
                    onChange={(e) => setProfileDraft({ ...profileDraft, password: e.target.value })}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowProfilePassword((v) => !v)}>
                            {showProfilePassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Stack>
              </Paper>
              <Paper sx={sectionSx()}>
                <SectionTitle
                  title="Certificate"
                  action={<FormControlLabel control={<Checkbox checked={certificateEnabled} disabled={certLocked && profileDraft.device_type === "fortigate"} onChange={(_, c) => setCertificateEnabled(c)} />} label="Enabled" />}
                />
                <Stack p={2} spacing={2}>
                  <TextField disabled={!certificateEnabled || (certLocked && profileDraft.device_type === "fortigate")} label="User-Certificate" value={profileDraft.user_cert} onChange={(e) => setProfileDraft({ ...profileDraft, user_cert: e.target.value })} />
                  <TextField disabled={!certificateEnabled || (certLocked && profileDraft.device_type === "fortigate")} label="User-Key" value={profileDraft.user_key} onChange={(e) => setProfileDraft({ ...profileDraft, user_key: e.target.value })} />
                  <TextField disabled={!certificateEnabled || (certLocked && profileDraft.device_type === "fortigate")} label="CA-File" value={profileDraft.ca_file} onChange={(e) => setProfileDraft({ ...profileDraft, ca_file: e.target.value })} />
                </Stack>
              </Paper>
              <Paper sx={sectionSx()}>
                <SectionTitle title="Fortigate Gateway Validation" />
                <Stack p={2} spacing={2}>
                  <FormControlLabel control={<Checkbox disabled={certLocked && profileDraft.device_type === "fortigate"} checked={profileDraft.trust_all_gw_certs} onChange={(_, c) => setProfileDraft({ ...profileDraft, trust_all_gw_certs: c })} />} label="Trust all Certs" />
                  <TextField disabled={certLocked && profileDraft.device_type === "fortigate"} label="Trusted-Cert (SHA256)" value={profileDraft.trusted_cert} onChange={(e) => setProfileDraft({ ...profileDraft, trusted_cert: e.target.value })} />
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={certLocked || !suggestedTrustedDigest}
                    onClick={() => {
                      if (!suggestedTrustedDigest) return;
                      const cur = profileDraft.trusted_cert.trim();
                      setProfileDraft({ ...profileDraft, trusted_cert: cur ? `${cur} ${suggestedTrustedDigest}` : suggestedTrustedDigest });
                    }}
                  >
                    Use latest digest from logs
                  </Button>
                </Stack>
              </Paper>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Paper sx={sectionSx()}>
                <SectionTitle title="Advanced" />
                <Stack p={2} spacing={1}>
                  <FormControlLabel control={<Checkbox checked={profileDraft.autostart} onChange={(_, c) => setProfileDraft({ ...profileDraft, autostart: c })} />} label="Connect on program start" />
                  <FormControlLabel control={<Checkbox checked={profileDraft.set_routes} onChange={(_, c) => setProfileDraft({ ...profileDraft, set_routes: c })} />} label="Set routes" />
                  <FormControlLabel control={<Checkbox checked={profileDraft.half_internet_routers} onChange={(_, c) => setProfileDraft({ ...profileDraft, half_internet_routers: c })} />} label="Half internet routes" />
                  <FormControlLabel control={<Checkbox checked={profileDraft.set_dns} onChange={(_, c) => setProfileDraft({ ...profileDraft, set_dns: c })} />} label="Set DNS" />
                  <FormControlLabel control={<Checkbox checked={profileDraft.debug} onChange={(_, c) => setProfileDraft({ ...profileDraft, debug: c })} />} label="Debug" />
                  <TextField label="Realm" value={profileDraft.realm} onChange={(e) => setProfileDraft({ ...profileDraft, realm: e.target.value })} />
                  <TextField label="OTP prompt string" value={profileDraft.otp_prompt} onChange={(e) => setProfileDraft({ ...profileDraft, otp_prompt: e.target.value })} />
                  <FormControlLabel control={<Checkbox checked={profileDraft.always_ask_otp} onChange={(_, c) => setProfileDraft({ ...profileDraft, always_ask_otp: c })} />} label="Always ask for OTP" />
                  <TextField label="OTP delay" type="number" value={profileDraft.otp_delay} onChange={(e) => setProfileDraft({ ...profileDraft, otp_delay: Number.parseInt(e.target.value, 10) || 0 })} />
                  <FormControlLabel control={<Checkbox checked={profileDraft.no_ftm_push} onChange={(_, c) => setProfileDraft({ ...profileDraft, no_ftm_push: c })} />} label="No FortiToken Mobile push" />
                </Stack>
              </Paper>
              <Paper sx={sectionSx()}>
                <SectionTitle title="PPPD" />
                <Stack p={2} spacing={1.5}>
                  <FormControlLabel control={<Checkbox checked={profileDraft.pppd_no_peerdns} onChange={(_, c) => setProfileDraft({ ...profileDraft, pppd_no_peerdns: c })} />} label="No peerdns" />
                  <FormControlLabel control={<Checkbox checked={profileDraft.pppd_accept_remote} onChange={(_, c) => setProfileDraft({ ...profileDraft, pppd_accept_remote: c })} />} label="Accept remote" />
                  <TextField label="Log File" value={profileDraft.pppd_log_file} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_log_file: e.target.value })} />
                  <TextField label="Plugin File" value={profileDraft.pppd_plugin_file} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_plugin_file: e.target.value })} />
                  <TextField label="Ifname" value={profileDraft.pppd_ifname} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_ifname: e.target.value })} />
                  <TextField label="Ip-Parameter" value={profileDraft.pppd_ipparam} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_ipparam: e.target.value })} />
                  <TextField label="Call name" value={profileDraft.pppd_call} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_call: e.target.value })} />
                </Stack>
              </Paper>
              <Paper sx={sectionSx()}>
                <SectionTitle title="SSL" />
                <Stack p={2} spacing={1.5}>
                  <FormControlLabel control={<Checkbox disabled={certLocked && profileDraft.device_type === "fortigate"} checked={profileDraft.insecure_ssl} onChange={(_, c) => setProfileDraft({ ...profileDraft, insecure_ssl: c })} />} label="Insecure SSL" />
                  <FormControlLabel control={<Checkbox disabled={certLocked && profileDraft.device_type === "fortigate"} checked={profileDraft.seclevel1} onChange={(_, c) => setProfileDraft({ ...profileDraft, seclevel1: c })} />} label="SecLevel1" />
                  <Select disabled={certLocked && profileDraft.device_type === "fortigate"} value={profileDraft.min_tls} onChange={(e) => setProfileDraft({ ...profileDraft, min_tls: e.target.value })}>
                    {["default", "1.0", "1.1", "1.2", "1.3"].map((v) => (
                      <MenuItem key={v} value={v}>
                        {v === "default" ? "Default" : v}
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveProfile()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={groupOpen} onClose={() => setGroupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{groupOriginalName ? `Edit VPN-Group - ${groupOriginalName}` : "Add VPN-Group"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Name" value={groupDraftName} onChange={(e) => setGroupDraftName(e.target.value)} />
            <Paper sx={sectionSx()}>
              <SectionTitle title="Members" />
              <List dense>
                {profiles.map((p) => {
                  const key = groupKey(p.origin, p.name);
                  return (
                    <ListItemButton
                      key={key}
                      onClick={() => {
                        const next = new Set(groupMembers);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        setGroupMembers(next);
                      }}
                    >
                      <Checkbox checked={groupMembers.has(key)} tabIndex={-1} />
                      <Box flex={1}>
                        <Typography variant="body2" fontWeight={700}>
                          {p.name}
                        </Typography>
                        <Typography variant="caption" color={colors.muted}>
                          {p.origin} / {p.device_type}
                        </Typography>
                      </Box>
                    </ListItemButton>
                  );
                })}
              </List>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGroupOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveGroup()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={loginOpen} onClose={() => setLoginOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>VPN Login</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <TextField autoFocus label="Username" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submitLogin()} />
            <TextField
              label="Password"
              type={showLoginPass ? "text" : "password"}
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitLogin()}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowLoginPass((v) => !v)}>
                      {showLoginPass ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="OTP"
              type={showLoginOtp ? "text" : "password"}
              value={loginOtp}
              onChange={(e) => setLoginOtp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitLogin()}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowLoginOtp((v) => !v)}>
                      {showLoginOtp ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoginOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void submitLogin()}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={barrOtpOpen} onClose={() => setBarrOtpOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>OTP-Token required</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Please provide your OTP-Token:"
            type={showBarrOtp ? "text" : "password"}
            value={barrOtpVal}
            onChange={(e) => setBarrOtpVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submitBarrOtp()}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowBarrOtp((v) => !v)}>
                    {showBarrOtp ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBarrOtpOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void submitBarrOtp()}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={gwCertDlg !== null} onClose={() => setGwCertDlg(null)} maxWidth="md" fullWidth>
        <DialogTitle>Gateway certificate validation failed</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" whiteSpace="pre-wrap" fontFamily="JetBrains Mono, monospace">
            {gwCertDlg?.body}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGwCertDlg(null)}>No</Button>
          <Button
            variant="contained"
            onClick={() => {
              const d = gwCertDlg;
              if (!d) return;
              void (async () => {
                try {
                  await window.fvpn.trustGatewayDigest(d.profileName, d.digest);
                  setGwCertDlg(null);
                  await refresh();
                } catch (e) {
                  alert((e as Error).message);
                }
              })();
            }}
          >
            Yes, whitelist
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={changelogOpen} onClose={() => setChangelogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Changelog</DialogTitle>
        <DialogContent dividers>
          <List dense>
            <ListItemButton>
              <Box>
                <Typography fontWeight={700}>0.1.0</Typography>
                <Typography variant="body2" color={colors.muted}>
                  Electron shell, OpenFortiGUI-compatible profiles/groups, Fortigate and Barracuda runners.
                </Typography>
              </Box>
            </ListItemButton>
          </List>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              void window.fvpn.markChangelogRead();
              setChangelogOpen(false);
              void refresh();
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={aboutOpen} onClose={() => setAboutOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>About FortiVPN GUI</DialogTitle>
        <DialogContent dividers>
          <Typography fontWeight={800}>FortiVPN GUI</Typography>
          <Typography variant="body2" color={colors.muted}>
            Electron desktop GUI compatible with OpenFortiGUI profile flows.
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2">Uses openfortivpn, barracudavpn, Electron, React and Material UI.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAboutOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={wizardOpen} onClose={() => setWizardOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>OpenFortiGUI initial setup</DialogTitle>
        <DialogContent dividers>
          {wizardStep === 0 ? (
            <Stack spacing={2}>
              <Alert severity="info">Welcome to FortiVPN GUI.</Alert>
              <Button variant="outlined" onClick={() => void runImport()}>
                Import from OpenFortiGUI
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <FormControlLabel control={<Checkbox checked={wizardUseStore} onChange={(_, c) => setWizardUseStore(c)} />} label="Uses system password manager" />
              <TextField label="AES-Key" value={wizardAesKey} onChange={(e) => setWizardAesKey(e.target.value)} />
              <TextField label="AES-IV" value={wizardAesIv} onChange={(e) => setWizardAesIv(e.target.value)} />
              <Button
                variant="outlined"
                onClick={() => {
                  setWizardAesKey(randKey());
                  setWizardAesIv(randKey());
                }}
              >
                Autogenerate keys
              </Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWizardOpen(false)}>Abort</Button>
          <Box flex={1} />
          <Button disabled={wizardStep === 0} onClick={() => setWizardStep(0)}>
            Back
          </Button>
          {wizardStep === 0 ? (
            <Button variant="contained" onClick={() => setWizardStep(1)}>
              Next
            </Button>
          ) : (
            <Button variant="contained" onClick={() => void finishWizard()}>
              Finish
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
