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
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Link,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArticleIcon from "@mui/icons-material/Article";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import InfoIcon from "@mui/icons-material/Info";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import StopIcon from "@mui/icons-material/Stop";
import TuneIcon from "@mui/icons-material/Tune";
import TranslateIcon from "@mui/icons-material/Translate";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import type { MainSettings, VpnGroup, VpnProfile, VpnStartCredentials, VpnTrafficStats } from "../../shared/types";
import { APP_AUTHOR, APP_LICENSE, APP_NAME, APP_REPOSITORY, APP_VERSION, CHANGELOG_REV } from "../../shared/constants";
import brandingMark from "../../build/icons/512x512.png";
import { scheduleAfterOverlayClose } from "./scheduleAfterOverlayClose";
import { useAppColors, useThemeMode } from "./ThemeModeProvider";
import { ThemeToggleButton } from "./ThemeToggleButton";
import { LanguageMenuButton } from "./LanguageMenuButton";
import { useI18n, useTranslation } from "./I18nProvider";
import { LanguageSelect } from "./LanguageSelect";
import { parseThemeMode } from "../../shared/theme";
import { parseLanguageSetting } from "../../shared/locale";
import type { AppColors } from "./theme";

type ViewId = "vpn" | "groups" | "settings";
type OtpPhase = "idle" | "prompt" | "awaiting_auth" | "wrong_otp";

const NAME_RE = /^[a-zA-ZäöüÄÖÜ0-9 \-_]{3,}$/;
const navWidth = 224;

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
  set_dns: false,
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

function statusColor(state: string, colors: AppColors): string {
  if (state === "connected") return colors.connected;
  if (state === "connecting") return colors.warning;
  return colors.disconnected;
}

function sectionSx(colors: AppColors) {
  return {
    bgcolor: colors.surface,
    border: `1px solid ${colors.outline}`,
    borderRadius: 2,
    overflow: "hidden",
  };
}

function SectionTitle({ icon, title, action }: { icon?: React.ReactNode; title: string; action?: React.ReactNode }) {
  const colors = useAppColors();
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
  const colors = useAppColors();
  const { translateStatus } = useTranslation();
  return (
    <Chip
      size="small"
      label={translateStatus(state || "disconnected")}
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
          bgcolor: statusColor(state, colors),
          ml: 1,
        },
      }}
    />
  );
}

export default function App() {
  const colors = useAppColors();
  const { setThemeMode } = useThemeMode();
  const { t, setLanguage } = useI18n();
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
  /** True when openfortivpn is blocked on stdin waiting for 2FA (same as terminal after the prompt). */
  const [loginOtpViaStdin, setLoginOtpViaStdin] = useState(false);
  const [loginOtpPhase, setLoginOtpPhase] = useState<OtpPhase>("idle");
  const lastOtpChallengeLogKey = useRef("");
  const fortigateLastConnectHadOtp = useRef<Record<string, boolean>>({});
  /** After the user dismisses the Fortigate OTP dialog, ignore older log lines so the effect does not reopen from stale "Could not authenticate" entries (different `t` → different key). */
  const fortiOtpChallengeDismissedAt = useRef<Record<string, number>>({});
  const connectProfileRequest = useRef<(name: string) => void>(() => {});
  const profilesRef = useRef<VpnProfile[]>([]);
  const loginOpenRef = useRef(false);
  const loginTargetRef = useRef<string | null>(null);
  const loginOtpViaStdinRef = useRef(false);
  const loginOtpPhaseRef = useRef<OtpPhase>("idle");

  const [gwCertDlg, setGwCertDlg] = useState<{ profileName: string; digest: string; body: string } | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAesKey, setWizardAesKey] = useState("");
  const [wizardAesIv, setWizardAesIv] = useState("");
  const [wizardUseStore, setWizardUseStore] = useState(false);
  /** Long-form import output (kept as a dialog). Transient messages use `notify` + Snackbar instead of native `alert()`. */
  const [importResultText, setImportResultText] = useState<string | null>(null);
  const [notifyText, setNotifyText] = useState<string | null>(null);
  const notify = useCallback((message: string) => setNotifyText(message), []);
  const settingsPromptsDone = useRef(false);

  const refresh = useCallback(async () => {
    setBootError(null);
    try {
      if (typeof window.fvpn === "undefined") {
        throw new Error(t("notify.apiUnavailable"));
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
    setThemeMode(parseThemeMode(settings.theme_mode));
    setLanguage(parseLanguageSetting(settings.language));
    setWizardAesKey(settings.aeskey);
    setWizardAesIv(settings.aesiv);
    setWizardUseStore(settings.use_system_password_store);
    if (settingsPromptsDone.current) return;
    settingsPromptsDone.current = true;
    if (!settings.setupwizard) setWizardOpen(true);
    if (settings.changelogrev_read < CHANGELOG_REV) setChangelogOpen(true);
  }, [settings, setThemeMode, setLanguage]);

  useEffect(() => {
    return window.fvpn.onAppNavigate((ev) => {
      if (ev.tab === 0) setView("vpn");
      if (ev.tab === 1) setView("groups");
      if (ev.tab === 2) setView("settings");
    });
  }, []);

  useEffect(() => window.fvpn.onAppConnectProfile((ev) => connectProfileRequest.current(ev.name)), []);

  useEffect(() => window.fvpn.onGatewayCertPrompt((ev) => setGwCertDlg(ev)), []);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    loginOpenRef.current = loginOpen;
    loginTargetRef.current = loginTarget;
    loginOtpViaStdinRef.current = loginOtpViaStdin;
    loginOtpPhaseRef.current = loginOtpPhase;
  }, [loginOpen, loginTarget, loginOtpViaStdin, loginOtpPhase]);

  useEffect(() => {
    return window.fvpn.onFortigateStdinOtpPrompt((ev) => {
      const name = ev.name;
      const phase = loginOtpPhaseRef.current;
      if (phase === "wrong_otp") return;
      if (phase === "awaiting_auth") {
        if (loginTargetRef.current !== name) return;
        fortigateLastConnectHadOtp.current[name] = false;
        setLoginOtpPhase("prompt");
      } else if (phase === "prompt" && loginOpenRef.current && loginTargetRef.current === name) {
        return;
      }
      const profile = profilesRef.current.find((x) => x.name === name);
      if (!profile) return;
      if (profile.device_type === "fortigate") {
        if (profile.always_ask_otp) return;
        setLoginOtpPhase("prompt");
        setLoginOtpViaStdin(true);
        setLoginChallengeExplicitOtp(true);
        setLoginKind("challenge");
        setLoginTarget(name);
        setLoginUser(profile.username);
        setLoginPass(profile.password);
        setLoginOtp("");
        setLoginOpen(true);
      } else if (profile.device_type === "barracuda") {
        if (!profile.always_ask_otp) return;
        setLoginOtpPhase("prompt");
        setLoginOtpViaStdin(true);
        setLoginChallengeExplicitOtp(true);
        setLoginKind("challenge");
        setLoginTarget(name);
        setLoginUser(profile.username);
        setLoginPass(profile.password);
        setLoginOtp("");
        setLoginOpen(true);
      }
    });
  }, []);

  useEffect(() => {
    const unsubLog = window.fvpn.onVpnLog((ev) => {
      setLogs((prev) => [...prev, { t: Date.now(), name: ev.name, line: ev.line, stream: ev.stream }].slice(-500));
    });
    const unsubStatus = window.fvpn.onVpnStatus((ev) => {
      setStatus((prev) => ({ ...prev, [ev.name]: ev.state }));
      if (ev.state === "connected" && loginTargetRef.current === ev.name) {
        const phase = loginOtpPhaseRef.current;
        if (phase === "awaiting_auth" || phase === "prompt") {
          fortigateLastConnectHadOtp.current[ev.name] = false;
          setLoginOtpPhase("idle");
          setLoginOpen(false);
          setLoginKind(null);
          setLoginTarget(null);
          setLoginOtpViaStdin(false);
          setLoginOtp("");
        }
      }
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
    if (!profiles.length) return;
    const explicitOtpNeed = (line: string) => /No OTP specified|No token specified/i.test(line);
    const authFailMaybeOtp = (line: string) => /Could not authenticate to (?:the )?gateway/i.test(line) || /No cookie given/i.test(line);

    for (let i = logs.length - 1; i >= Math.max(0, logs.length - 24); i -= 1) {
      const e = logs[i];
      const explicit = explicitOtpNeed(e.line);
      const maybeAuth = authFailMaybeOtp(e.line);
      if (!explicit && !maybeAuth) continue;
      const key = `${e.t}|${e.name}|${e.line}`;
      if (key === lastOtpChallengeLogKey.current) continue;
      const profile = profiles.find((x) => x.name === e.name);
      if (!profile || profile.device_type !== "fortigate") continue;

      const phase = loginOtpPhaseRef.current;
      const target = loginTargetRef.current;

      if (maybeAuth && target === e.name && phase === "awaiting_auth") {
        lastOtpChallengeLogKey.current = key;
        setLoginOtpPhase("wrong_otp");
        setLoginOpen(true);
        return;
      }

      if (phase === "awaiting_auth" || phase === "wrong_otp" || phase === "prompt") continue;
      if (loginOpenRef.current) continue;
      if (maybeAuth && fortigateLastConnectHadOtp.current[e.name]) continue;
      if (profile.always_ask_otp) continue;

      const dismissed = fortiOtpChallengeDismissedAt.current[e.name];
      if (dismissed !== undefined && e.t <= dismissed) continue;

      lastOtpChallengeLogKey.current = key;
      setLoginOtpPhase("prompt");
      setLoginOtpViaStdin(false);
      setLoginChallengeExplicitOtp(explicit);
      setLoginKind("challenge");
      setLoginTarget(e.name);
      setLoginUser(profile.username);
      setLoginPass(profile.password);
      setLoginOtp("");
      setLoginOpen(true);
      return;
    }
  }, [logs, loginOpen, loginOtpPhase, profiles]);

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

  const selectedConnectionState =
    view === "vpn" && selectedProfile
      ? status[selectedProfile.name] || "disconnected"
      : view === "groups" && selectedGroup
        ? groupStatus(selectedGroup)
        : "disconnected";
  const selectedConnectionActive = selectedConnectionState === "connected" || selectedConnectionState === "connecting";

  const logGroupLine = (line: string) => {
    setLogs((prev) => [...prev, { t: Date.now(), name: "(group)", line }].slice(-500));
    console.warn(line);
  };

  const isProfileActive = (name: string) => status[name] === "connected" || status[name] === "connecting";

  const startVpnFlow = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    if (p.device_type === "fortigate" && !ofvPath) {
      notify(t("notify.ofvNotFound"));
      return;
    }
    if (p.device_type === "fortigate" && p.always_ask_otp) {
      lastOtpChallengeLogKey.current = "";
      delete fortiOtpChallengeDismissedAt.current[name];
      setLoginOtpPhase("prompt");
      setLoginOtpViaStdin(false);
      setLoginKind("always");
      setLoginTarget(name);
      setLoginUser(p.username);
      setLoginPass(p.password);
      setLoginOtp("");
      setLoginChallengeExplicitOtp(false);
      setLoginOpen(true);
      return;
    }
    lastOtpChallengeLogKey.current = "";
    fortigateLastConnectHadOtp.current[name] = false;
    delete fortiOtpChallengeDismissedAt.current[name];
    setLoginOtpPhase("idle");
    setLoginOtpViaStdin(false);
    try {
      await window.fvpn.startVpn(name);
    } catch (e) {
      notify((e as Error).message);
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
      notify(t("notify.mustDisconnect"));
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
      notify(t("notify.invalidVpnName"));
      return;
    }
    if (!profileDraft.gateway_host.trim()) {
      notify(t("notify.missingGateway"));
      return;
    }
    if (!profileDraft.gateway_port) {
      notify(t("notify.missingGatewayPort"));
      return;
    }
    if (credentialsEnabled && !profileDraft.username.trim()) {
      notify(t("notify.missingUsername"));
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
      notify((e as Error).message);
    }
  };

  const deleteProfile = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    if (p.origin === "global") {
      notify(t("notify.globalProfileNoDelete"));
      return;
    }
    const st = status[name];
    if (st === "connected" || st === "connecting") {
      notify(t("notify.mustDisconnect"));
      return;
    }
    if (!confirm(t("notify.confirmDeleteVpn", { name }))) return;
    await window.fvpn.deleteProfile(name);
    if (selectedProfileName === name) setSelectedProfileName(null);
    await refresh();
  };

  const duplicateProfile = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    const proposed = `${p.name}${t("profile.copySuffix")}`;
    const newName = prompt(t("notify.promptNewVpnName"), proposed);
    if (!newName) return;
    try {
      await window.fvpn.saveProfile({ ...p, name: newName.trim(), origin: "local" });
      setSelectedProfileName(newName.trim());
      await refresh();
    } catch (e) {
      notify((e as Error).message);
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
      notify(t("notify.missingGroupName"));
      return;
    }
    const localMembers: string[] = [];
    const globalMembers: string[] = [];
    for (const key of groupMembers) {
      const [origin, memberName] = key.split(":") as ["local" | "global", string];
      const p = profiles.find((x) => x.name === memberName && x.origin === origin);
      if (!p || !p.username || !p.password) {
        notify(t("notify.groupMemberMissingCreds", { name: memberName }));
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
      notify((e as Error).message);
    }
  };

  const deleteGroup = async (name: string) => {
    if (!confirm(t("notify.confirmDeleteGroup", { name }))) return;
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
      notify((e as Error).message);
    }
  };

  const connectGroup = async (g: VpnGroup) => {
    for (const name of uniq([...g.localMembers, ...g.globalMembers])) {
      const p = profiles.find((x) => x.name === name);
      if (!p) {
        logGroupLine(t("log.groupMemberNotFound", { group: g.name, name }));
        continue;
      }
      if (p.device_type === "fortigate" && !ofvPath) {
        logGroupLine(t("log.groupSkipOfv", { group: g.name, name }));
        continue;
      }
      if (p.always_ask_otp) {
        logGroupLine(t("log.groupSkipOtp", { group: g.name, name }));
        continue;
      }
      if (status[name] === "connected" || status[name] === "connecting") continue;
      try {
        await window.fvpn.startVpn(name);
      } catch (e) {
        logGroupLine(t("log.groupConnectFailed", { group: g.name, name, message: (e as Error).message }));
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const disconnectGroup = async (g: VpnGroup) => {
    for (const name of uniq([...g.localMembers, ...g.globalMembers])) await window.fvpn.stopVpn(name);
  };

  const submitLogin = async () => {
    if (!loginTarget || !loginKind) return;
    if (loginKind === "challenge" && loginOtpViaStdin) {
      if (!loginOtp.trim()) {
        notify(t("notify.enterOtp"));
        return;
      }
      const ok = await window.fvpn.submitFortigateStdinOtp(loginTarget, loginOtp.trim());
      if (!ok) {
        notify(t("notify.tokenSendFailed"));
        return;
      }
      fortigateLastConnectHadOtp.current[loginTarget] = true;
      setLoginOtpPhase("awaiting_auth");
      setLoginOpen(false);
      setLoginOtp("");
      return;
    }
    if (!loginUser.trim()) {
      notify(t("notify.profileNoUsername"));
      return;
    }
    if (loginKind === "always" && !loginOtp.trim()) {
      notify(t("notify.enterOtp"));
      return;
    }
    if (loginKind === "challenge" && loginChallengeExplicitOtp && !loginOtp.trim()) {
      notify(t("notify.enterOtp"));
      return;
    }
    if (loginOtp.trim()) fortigateLastConnectHadOtp.current[loginTarget] = true;
    const creds: VpnStartCredentials = { username: loginUser.trim(), password: loginPass, otp: loginOtp.trim() };
    try {
      await window.fvpn.startVpn(loginTarget, creds);
    } catch (e) {
      notify((e as Error).message);
      return;
    }
    setLoginOtpPhase("awaiting_auth");
    setLoginOpen(false);
    setLoginOtp("");
  };

  const cancelLogin = async () => {
    const target = loginTarget;
    const now = Date.now();
    if (target) {
      fortiOtpChallengeDismissedAt.current[target] = now;
      fortigateLastConnectHadOtp.current[target] = false;
    }
    setLoginOtpPhase("idle");
    setLoginOpen(false);
    setLoginKind(null);
    setLoginTarget(null);
    setLoginOtpViaStdin(false);
    setLoginOtp("");
    if (!target) return;
    try {
      await window.fvpn.stopVpn(target);
    } catch (e) {
      console.warn("[login] stop after cancel failed", e);
    }
  };

  const disconnectAfterWrongOtp = async () => {
    await cancelLogin();
  };

  const requestNewOtp = async () => {
    const target = loginTarget;
    if (!target) return;
    await window.fvpn.resetOtpPrompt(target);
    lastOtpChallengeLogKey.current = "";
    fortigateLastConnectHadOtp.current[target] = false;
    setLoginOtp("");
    setLoginOtpPhase("prompt");
    setLoginOpen(true);
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
    try {
      const r = await window.fvpn.importOpenfortigui();
      await refresh();
      setImportResultText(
        `${t("import.result", { profiles: r.profilesCopied, groups: r.groupsCopied })}${r.errors.length ? `\n\n${t("import.errorsHeader")}\n${r.errors.join("\n")}` : ""}`
      );
    } catch (e) {
      setImportResultText(`${t("import.failed")}\n\n${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const mergeOfgMain = async () => {
    const next = await window.fvpn.mergeOpenfortiguiMain();
    if (!next) notify(t("notify.noOfgMain"));
    else setSettings(next);
  };

  const finishWizard = async () => {
    if (wizardAesKey.length !== 16 || wizardAesIv.length !== 16) {
      notify(t("notify.aesKeyIvLength"));
      return;
    }
    await saveSettingsUi({ aeskey: wizardAesKey, aesiv: wizardAesIv, use_system_password_store: wizardUseStore, setupwizard: true });
    setWizardOpen(false);
  };

  const toolbarConnectionToggle = () => {
    if (view === "vpn" && selectedProfile) {
      if (selectedConnectionActive) void stopVpn(selectedProfile.name);
      else void startVpnFlow(selectedProfile.name);
    }
    if (view === "groups" && selectedGroup) {
      if (selectedConnectionActive) void disconnectGroup(selectedGroup);
      else void connectGroup(selectedGroup);
    }
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
          {t("common.tryAgain")}
        </Button>
      </Box>
    );
  }

  if (!settings) {
    return (
      <Box p={2} bgcolor={colors.background} minHeight="100vh">
        <Typography>{t("common.loading")}</Typography>
      </Box>
    );
  }

  const certLocked = settings.disallow_unsecure_certificates;

  const renderProfileTable = (title: string, items: VpnProfile[]) => (
    <Paper sx={sectionSx(colors)}>
      <SectionTitle
        icon={<VpnKeyIcon fontSize="small" sx={{ color: colors.primary }} />}
        title={title}
        action={<Chip size="small" label={t("table.profileCount", { count: items.length })} sx={{ bgcolor: colors.surfaceHigh, color: colors.muted }} />}
      />
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 820 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("table.status")}</TableCell>
              <TableCell>{t("table.name")}</TableCell>
              <TableCell>{t("table.device")}</TableCell>
              <TableCell>{t("table.gateway")}</TableCell>
              <TableCell>{t("table.user")}</TableCell>
              <TableCell>{t("table.traffic")}</TableCell>
              <TableCell align="right">{t("table.actions")}</TableCell>
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
                    <Chip size="small" label={p.device_type === "fortigate" ? t("device.fortigate") : t("device.barracuda")} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {p.gateway_host}:{p.gateway_port}
                  </TableCell>
                  <TableCell>{p.username}</TableCell>
                  <TableCell sx={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {formatBytes(traffic?.bytes_read)} / {formatBytes(traffic?.bytes_written)}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={active ? t("toolbar.disconnect") : t("toolbar.connect")}>
                      <IconButton
                        size="small"
                        color={active ? "error" : "primary"}
                        disabled={p.device_type === "fortigate" && !ofvPath && !active}
                        onClick={() => void (active ? stopVpn(p.name) : startVpnFlow(p.name))}
                      >
                        {active ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("toolbar.edit")}>
                      <span>
                        <IconButton size="small" disabled={p.origin === "global" || active} onClick={() => editProfile(p)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={t("toolbar.copy")}>
                      <IconButton size="small" onClick={() => void duplicateProfile(p.name)}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("toolbar.delete")}>
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
        py={2}
      >
        <Box px={1.5} mb={2} display="flex" alignItems="center" gap={1}>
          <Box
            component="img"
            src={brandingMark}
            alt="FortiVPN GUI"
            width={36}
            height={36}
            sx={{ objectFit: "contain", flexShrink: 0, display: "block" }}
          />
          <Box minWidth={0}>
            <Typography variant="body2" color={colors.primary} fontWeight={800} lineHeight={1.1} noWrap>
              FortiVPN GUI
            </Typography>
            <Typography variant="caption" color={colors.muted} noWrap display="block">
              v{APP_VERSION}
            </Typography>
          </Box>
        </Box>
        <Stack px={1} spacing={0.25}>
          {[
            ["vpn", t("nav.vpn"), <VpnKeyIcon />],
            ["groups", t("nav.groups"), <GroupWorkIcon />],
            ["settings", t("nav.settings"), <SettingsIcon />],
          ].map(([id, label, icon]) => (
            <ListItemButton
              key={id as string}
              selected={view === id}
              onClick={() => setView(id as ViewId)}
              sx={{
                borderRadius: 1.5,
                minHeight: 32,
                py: 0.25,
                px: 1,
                color: view === id ? colors.primary : colors.muted,
                "&.Mui-selected": { bgcolor: colors.secondaryContainer, color: colors.text },
              }}
            >
              <Box mr={1} display="flex" alignItems="center" sx={{ "& svg": { fontSize: 19 } }}>
                {icon}
              </Box>
              <Typography variant="body2" fontWeight={view === id ? 700 : 500}>
                {label as string}
              </Typography>
            </ListItemButton>
          ))}
        </Stack>
        <Box flex={1} />
        <Stack px={1} spacing={0.25}>
          <ListItemButton sx={{ borderRadius: 1.5, minHeight: 32, py: 0.25, px: 1, color: colors.muted }} onClick={() => setAboutOpen(true)}>
            <InfoIcon sx={{ mr: 1, fontSize: 19 }} />
            <Typography variant="body2">{t("nav.about")}</Typography>
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
            {view === "vpn" ? t("header.vpnProfiles") : view === "groups" ? t("header.vpnGroups") : t("header.settings")}
          </Typography>
          <LanguageMenuButton />
          <ThemeToggleButton />
          <Tooltip title={t("toolbar.changelog")}>
            <IconButton onClick={() => setChangelogOpen(true)}>
              <ArticleIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("toolbar.refresh")}>
            <IconButton onClick={() => void refresh()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {!ofvPath && (
          <Alert severity="error" sx={{ m: 2 }}>
            {t("alert.ofvNotFound")}
          </Alert>
        )}

        <Box p={3}>
          {(view === "vpn" || view === "groups") && (
            <Stack direction="row" flexWrap="wrap" gap={1} mb={2} p={1} sx={sectionSx(colors)}>
              <Button
                variant={selectedConnectionActive ? "contained" : "outlined"}
                color={selectedConnectionActive ? "error" : "primary"}
                startIcon={selectedConnectionActive ? <StopIcon /> : <PlayArrowIcon />}
                onClick={toolbarConnectionToggle}
                disabled={view === "vpn" ? !selectedProfile : !selectedGroup}
              >
                {selectedConnectionActive ? t("toolbar.disconnect") : t("toolbar.connect")}
              </Button>
              <Divider orientation="vertical" flexItem />
              <Button startIcon={<AddIcon />} onClick={(e) => setAddMenuAnchor(e.currentTarget)}>
                {t("toolbar.add")}
              </Button>
              <Button startIcon={<EditIcon />} onClick={toolbarEdit} disabled={view === "vpn" ? !selectedProfile || selectedProfile.origin === "global" || isProfileActive(selectedProfile.name) : !selectedGroup}>
                {t("toolbar.edit")}
              </Button>
              <Button startIcon={<ContentCopyIcon />} onClick={toolbarCopy} disabled={view === "vpn" ? !selectedProfile : !selectedGroup}>
                {t("toolbar.copy")}
              </Button>
              <Button
                startIcon={<SearchIcon />}
                onClick={() => void saveSettingsUi({ show_search: !settings.show_search })}
                disabled={view !== "vpn"}
                sx={{ color: settings.show_search ? colors.primary : undefined }}
              >
                {t("toolbar.search")}
              </Button>
              <Divider orientation="vertical" flexItem />
              <Button startIcon={<DeleteIcon />} onClick={toolbarDelete} disabled={view === "vpn" ? !selectedProfile || selectedProfile.origin === "global" || isProfileActive(selectedProfile.name) : !selectedGroup} color="error">
                {t("toolbar.delete")}
              </Button>
              <Button
                startIcon={<FolderOpenIcon />}
                disabled={(view === "vpn" && !selectedProfile) || (view === "groups" && !selectedGroup)}
                onClick={() => {
                  if (view === "vpn" && selectedProfile) void window.fvpn.openVpnLog(selectedProfile.name);
                  else if (view === "groups" && selectedGroup) void window.fvpn.openLogsDir();
                }}
              >
                {t("toolbar.logs")}
              </Button>
            </Stack>
          )}

          {view === "vpn" && (
            <Stack spacing={2}>
              {settings.show_search && (
                <TextField
                  size="small"
                  placeholder={t("profile.searchPlaceholder")}
                  value={profileFilter}
                  onChange={(e) => setProfileFilter(e.target.value)}
                  InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: colors.muted }} /> }}
                />
              )}
              {renderProfileTable(t("profile.localTitle"), localProfiles)}
              {renderProfileTable(t("profile.globalTitle"), globalProfiles)}
            </Stack>
          )}

          {view === "groups" && (
            <Paper sx={sectionSx(colors)}>
              <SectionTitle icon={<GroupWorkIcon fontSize="small" sx={{ color: colors.primary }} />} title={t("group.title")} />
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 680 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("table.status")}</TableCell>
                      <TableCell>{t("table.name")}</TableCell>
                      <TableCell>{t("table.vpns")}</TableCell>
                      <TableCell align="right">{t("table.actions")}</TableCell>
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
                            <IconButton size="small" color={st === "connected" || st === "connecting" ? "error" : "primary"} onClick={() => void (st === "connected" || st === "connecting" ? disconnectGroup(g) : connectGroup(g))}>
                              {st === "connected" || st === "connecting" ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
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
              <Paper sx={sectionSx(colors)}>
                <SectionTitle icon={<TranslateIcon fontSize="small" sx={{ color: colors.primary }} />} title={t("settings.language")} />
                <Stack p={2}>
                  <LanguageSelect
                    value={parseLanguageSetting(settings.language)}
                    onChange={(language) => {
                      setLanguage(language);
                      void saveSettingsUi({ language });
                    }}
                  />
                </Stack>
              </Paper>
              <Paper sx={sectionSx(colors)}>
                <SectionTitle icon={<SettingsIcon fontSize="small" sx={{ color: colors.primary }} />} title={t("settings.main")} />
                <Stack p={2} spacing={1.5}>
                  <FormControlLabel control={<Checkbox checked={settings.debug} onChange={(_, c) => void saveSettingsUi({ debug: c })} />} label={t("settings.debug")} />
                  <FormControlLabel control={<Checkbox checked={settings.use_system_password_store} onChange={(_, c) => void saveSettingsUi({ use_system_password_store: c })} />} label={t("settings.passwordManager")} />
                  <TextField label={t("settings.aesKey")} value={settings.aeskey} disabled={settings.use_system_password_store} onChange={(e) => setSettings({ ...settings, aeskey: e.target.value })} onBlur={() => void saveSettingsUi({ aeskey: settings.aeskey })} />
                  <TextField label={t("settings.aesIv")} value={settings.aesiv} disabled={settings.use_system_password_store} onChange={(e) => setSettings({ ...settings, aesiv: e.target.value })} onBlur={() => void saveSettingsUi({ aesiv: settings.aesiv })} />
                  <FormControlLabel control={<Checkbox checked={settings.sudo_preserve_env} onChange={(_, c) => void saveSettingsUi({ sudo_preserve_env: c })} />} label={t("settings.sudoPreserveEnv")} />
                  <FormControlLabel control={<Checkbox checked={settings.disallow_unsecure_certificates} onChange={(_, c) => void saveSettingsUi({ disallow_unsecure_certificates: c })} />} label={t("settings.disallowInsecureCerts")} />
                </Stack>
              </Paper>
              <Paper sx={sectionSx(colors)}>
                <SectionTitle icon={<FolderOpenIcon fontSize="small" sx={{ color: colors.primary }} />} title={t("settings.paths")} />
                <Stack p={2} spacing={1.5}>
                  {[
                    ["localvpnprofiles", t("settings.localVpnProfiles")],
                    ["localvpngroups", t("settings.localVpnGroups")],
                    ["globalvpnprofiles", t("settings.globalVpnProfiles")],
                    ["logs", t("settings.logs")],
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
              <Paper sx={sectionSx(colors)}>
                <SectionTitle icon={<TuneIcon fontSize="small" sx={{ color: colors.primary }} />} title={t("settings.gui")} />
                <Stack p={2} spacing={1}>
                  <FormControlLabel control={<Checkbox checked={settings.start_minimized} onChange={(_, c) => void saveSettingsUi({ start_minimized: c })} />} label={t("settings.startMinimized")} />
                  <FormControlLabel control={<Checkbox checked={settings.disable_notifications} onChange={(_, c) => void saveSettingsUi({ disable_notifications: c })} />} label={t("settings.disableNotifications")} />
                  <FormControlLabel control={<Checkbox checked={settings.connect_on_dblclick} onChange={(_, c) => void saveSettingsUi({ connect_on_dblclick: c })} />} label={t("settings.connectOnDblclick")} />
                  <FormControlLabel control={<Checkbox checked={settings.show_search} onChange={(_, c) => void saveSettingsUi({ show_search: c })} />} label={t("settings.showSearch")} />
                  <Typography variant="body2" color={colors.muted}>
                    {t("settings.themeHint", { mode: settings.theme_mode })}
                  </Typography>
                  <Stack direction="row" gap={1}>
                    <Button variant="outlined" onClick={() => void mergeOfgMain()}>
                      {t("settings.mergeOfgMain")}
                    </Button>
                    <Button variant="outlined" onClick={() => void runImport()}>
                      {t("settings.importOfg")}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            </Stack>
          )}
        </Box>
      </Box>

      <Menu
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={() => setAddMenuAnchor(null)}
        disableScrollLock
        transitionDuration={{ enter: 0, exit: 0 }}
      >
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null);
            scheduleAfterOverlayClose(() => openNewProfile());
          }}
        >
          {t("menu.vpn")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null);
            scheduleAfterOverlayClose(() => openNewGroup());
          }}
        >
          {t("menu.vpnGroup")}
        </MenuItem>
      </Menu>

      <Menu
        open={profileCtx !== null}
        onClose={() => setProfileCtx(null)}
        anchorReference="anchorPosition"
        anchorPosition={profileCtx ? { top: profileCtx.top, left: profileCtx.left } : undefined}
        disableScrollLock
        transitionDuration={{ enter: 0, exit: 0 }}
      >
        <MenuItem
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) scheduleAfterOverlayClose(() => void startVpnFlow(name));
          }}
        >
          {t("menu.connect")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) void stopVpn(name);
          }}
        >
          {t("menu.disconnect")}
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={profiles.find((p) => p.name === profileCtx?.name)?.origin === "global" || Boolean(profileCtx?.name && isProfileActive(profileCtx.name))}
          onClick={() => {
            const p = profiles.find((x) => x.name === profileCtx?.name);
            setProfileCtx(null);
            if (p) scheduleAfterOverlayClose(() => editProfile(p));
          }}
        >
          {t("toolbar.edit")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) scheduleAfterOverlayClose(() => void duplicateProfile(name));
          }}
        >
          {t("toolbar.copy")}
        </MenuItem>
        <MenuItem
          disabled={profiles.find((p) => p.name === profileCtx?.name)?.origin === "global" || Boolean(profileCtx?.name && isProfileActive(profileCtx.name))}
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) scheduleAfterOverlayClose(() => void deleteProfile(name));
          }}
        >
          {t("toolbar.delete")}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            const name = profileCtx?.name;
            setProfileCtx(null);
            if (name) scheduleAfterOverlayClose(() => void window.fvpn.openVpnLog(name));
          }}
        >
          {t("menu.viewLogs")}
        </MenuItem>
      </Menu>

      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle display="flex" alignItems="center" gap={1}>
          <EditIcon sx={{ color: colors.primary }} />
          {profileOriginalName ? t("editor.editVpn", { name: profileOriginalName }) : t("editor.addVpn")}
          <Box flex={1} />
          <IconButton onClick={() => setProfileOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Tabs value={profileEditorTab} onChange={(_, v) => setProfileEditorTab(v)} sx={{ px: 3 }}>
          <Tab icon={<TuneIcon />} iconPosition="start" label={t("editor.preferences")} />
          <Tab icon={<SettingsIcon />} iconPosition="start" label={t("editor.options")} />
        </Tabs>
        <DialogContent dividers>
          {profileDraft.device_type === "barracuda" && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {t("editor.barracudaInfo")}
            </Alert>
          )}
          {profileEditorTab === 0 ? (
            <Stack spacing={2}>
              <Paper sx={sectionSx(colors)}>
                <SectionTitle icon={<TuneIcon fontSize="small" sx={{ color: colors.primary }} />} title={t("editor.common")} />
                <Stack p={2} spacing={2}>
                  <TextField
                    autoFocus={!profileOriginalName}
                    label={t("table.name")}
                    value={profileDraft.name}
                    onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })}
                  />
                  <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                    <TextField label={t("editor.vpnServer")} fullWidth value={profileDraft.gateway_host} onChange={(e) => setProfileDraft({ ...profileDraft, gateway_host: e.target.value })} />
                    <Select value={profileDraft.device_type} onChange={(e) => setProfileDraft({ ...profileDraft, device_type: e.target.value as VpnProfile["device_type"] })} sx={{ minWidth: 180 }}>
                      <MenuItem value="fortigate">{t("device.fortigate")}</MenuItem>
                      <MenuItem value="barracuda">{t("device.barracuda")}</MenuItem>
                    </Select>
                    <TextField label={t("editor.vpnPort")} type="number" value={profileDraft.gateway_port} onChange={(e) => setProfileDraft({ ...profileDraft, gateway_port: Number.parseInt(e.target.value, 10) || 10443 })} sx={{ maxWidth: 140 }} />
                  </Stack>
                  <FormControlLabel control={<Checkbox checked={profileDraft.persistent} onChange={(_, c) => setProfileDraft({ ...profileDraft, persistent: c })} />} label={t("editor.reconnectOnDisconnect")} />
                </Stack>
              </Paper>
              <Paper sx={sectionSx(colors)}>
                <SectionTitle
                  icon={<VpnKeyIcon fontSize="small" sx={{ color: colors.primary }} />}
                  title={t("editor.credentials")}
                  action={<FormControlLabel control={<Checkbox checked={credentialsEnabled} onChange={(_, c) => setCredentialsEnabled(c)} />} label={t("common.enabled")} />}
                />
                <Stack p={2} spacing={2}>
                  <TextField disabled={!credentialsEnabled} label={t("editor.username")} value={profileDraft.username} onChange={(e) => setProfileDraft({ ...profileDraft, username: e.target.value })} />
                  <TextField
                    disabled={!credentialsEnabled}
                    label={t("editor.password")}
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
              <Paper sx={sectionSx(colors)}>
                <SectionTitle
                  title={t("editor.certificate")}
                  action={<FormControlLabel control={<Checkbox checked={certificateEnabled} disabled={certLocked && profileDraft.device_type === "fortigate"} onChange={(_, c) => setCertificateEnabled(c)} />} label={t("common.enabled")} />}
                />
                <Stack p={2} spacing={2}>
                  <TextField disabled={!certificateEnabled || (certLocked && profileDraft.device_type === "fortigate")} label={t("editor.userCert")} value={profileDraft.user_cert} onChange={(e) => setProfileDraft({ ...profileDraft, user_cert: e.target.value })} />
                  <TextField disabled={!certificateEnabled || (certLocked && profileDraft.device_type === "fortigate")} label={t("editor.userKey")} value={profileDraft.user_key} onChange={(e) => setProfileDraft({ ...profileDraft, user_key: e.target.value })} />
                  <TextField disabled={!certificateEnabled || (certLocked && profileDraft.device_type === "fortigate")} label={t("editor.caFile")} value={profileDraft.ca_file} onChange={(e) => setProfileDraft({ ...profileDraft, ca_file: e.target.value })} />
                </Stack>
              </Paper>
              <Paper sx={sectionSx(colors)}>
                <SectionTitle title={t("editor.gwValidation")} />
                <Stack p={2} spacing={2}>
                  <FormControlLabel control={<Checkbox disabled={certLocked && profileDraft.device_type === "fortigate"} checked={profileDraft.trust_all_gw_certs} onChange={(_, c) => setProfileDraft({ ...profileDraft, trust_all_gw_certs: c })} />} label={t("editor.trustAllCerts")} />
                  <TextField disabled={certLocked && profileDraft.device_type === "fortigate"} label={t("editor.trustedCert")} value={profileDraft.trusted_cert} onChange={(e) => setProfileDraft({ ...profileDraft, trusted_cert: e.target.value })} />
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
                    {t("editor.useLatestDigest")}
                  </Button>
                </Stack>
              </Paper>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Paper sx={sectionSx(colors)}>
                <SectionTitle title={t("editor.advanced")} />
                <Stack p={2} spacing={1}>
                  <FormControlLabel control={<Checkbox checked={profileDraft.autostart} onChange={(_, c) => setProfileDraft({ ...profileDraft, autostart: c })} />} label={t("editor.connectOnStart")} />
                  <FormControlLabel control={<Checkbox checked={profileDraft.set_routes} onChange={(_, c) => setProfileDraft({ ...profileDraft, set_routes: c })} />} label={t("editor.setRoutes")} />
                  <FormControlLabel control={<Checkbox checked={profileDraft.half_internet_routers} onChange={(_, c) => setProfileDraft({ ...profileDraft, half_internet_routers: c })} />} label={t("editor.halfInternetRoutes")} />
                  <FormControlLabel control={<Checkbox checked={profileDraft.set_dns} onChange={(_, c) => setProfileDraft({ ...profileDraft, set_dns: c })} />} label={t("editor.setDns")} />
                  <FormControlLabel control={<Checkbox checked={profileDraft.debug} onChange={(_, c) => setProfileDraft({ ...profileDraft, debug: c })} />} label={t("settings.debug")} />
                  <TextField label={t("editor.realm")} value={profileDraft.realm} onChange={(e) => setProfileDraft({ ...profileDraft, realm: e.target.value })} />
                  <TextField
                    label={t("editor.otpPrompt")}
                    value={profileDraft.otp_prompt}
                    onChange={(e) => setProfileDraft({ ...profileDraft, otp_prompt: e.target.value })}
                    helperText={t("editor.otpPromptHelp")}
                    fullWidth
                  />
                  <FormControlLabel control={<Checkbox checked={profileDraft.always_ask_otp} onChange={(_, c) => setProfileDraft({ ...profileDraft, always_ask_otp: c })} />} label={t("editor.alwaysAskOtp")} />
                  <TextField label={t("editor.otpDelay")} type="number" value={profileDraft.otp_delay} onChange={(e) => setProfileDraft({ ...profileDraft, otp_delay: Number.parseInt(e.target.value, 10) || 0 })} />
                  <FormControlLabel control={<Checkbox checked={profileDraft.no_ftm_push} onChange={(_, c) => setProfileDraft({ ...profileDraft, no_ftm_push: c })} />} label={t("editor.noFtmPush")} />
                </Stack>
              </Paper>
              <Paper sx={sectionSx(colors)}>
                <SectionTitle title={t("editor.pppd")} />
                <Stack p={2} spacing={1.5}>
                  <FormControlLabel control={<Checkbox checked={profileDraft.pppd_no_peerdns} onChange={(_, c) => setProfileDraft({ ...profileDraft, pppd_no_peerdns: c })} />} label={t("editor.noPeerdns")} />
                  <FormControlLabel control={<Checkbox checked={profileDraft.pppd_accept_remote} onChange={(_, c) => setProfileDraft({ ...profileDraft, pppd_accept_remote: c })} />} label={t("editor.acceptRemote")} />
                  <TextField label={t("editor.logFile")} value={profileDraft.pppd_log_file} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_log_file: e.target.value })} />
                  <TextField label={t("editor.pluginFile")} value={profileDraft.pppd_plugin_file} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_plugin_file: e.target.value })} />
                  <TextField label={t("editor.ifname")} value={profileDraft.pppd_ifname} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_ifname: e.target.value })} />
                  <TextField label={t("editor.ipParam")} value={profileDraft.pppd_ipparam} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_ipparam: e.target.value })} />
                  <TextField label={t("editor.callName")} value={profileDraft.pppd_call} onChange={(e) => setProfileDraft({ ...profileDraft, pppd_call: e.target.value })} />
                </Stack>
              </Paper>
              <Paper sx={sectionSx(colors)}>
                <SectionTitle title={t("editor.ssl")} />
                <Stack p={2} spacing={1.5}>
                  <FormControlLabel control={<Checkbox disabled={certLocked && profileDraft.device_type === "fortigate"} checked={profileDraft.insecure_ssl} onChange={(_, c) => setProfileDraft({ ...profileDraft, insecure_ssl: c })} />} label={t("editor.insecureSsl")} />
                  <FormControlLabel control={<Checkbox disabled={certLocked && profileDraft.device_type === "fortigate"} checked={profileDraft.seclevel1} onChange={(_, c) => setProfileDraft({ ...profileDraft, seclevel1: c })} />} label={t("editor.secLevel1")} />
                  <Select disabled={certLocked && profileDraft.device_type === "fortigate"} value={profileDraft.min_tls} onChange={(e) => setProfileDraft({ ...profileDraft, min_tls: e.target.value })}>
                    {["default", "1.0", "1.1", "1.2", "1.3"].map((v) => (
                      <MenuItem key={v} value={v}>
                        {v === "default" ? t("common.default") : v}
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={() => void saveProfile()}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={groupOpen} onClose={() => setGroupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{groupOriginalName ? t("group.edit", { name: groupOriginalName }) : t("group.add")}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField autoFocus={!groupOriginalName} label={t("table.name")} value={groupDraftName} onChange={(e) => setGroupDraftName(e.target.value)} />
            <Paper sx={sectionSx(colors)}>
              <SectionTitle title={t("group.members")} />
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
          <Button onClick={() => setGroupOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={() => void saveGroup()}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={loginOpen}
        onClose={(_, reason) => {
          if (loginOtpPhase === "wrong_otp") return;
          if (reason === "backdropClick" || reason === "escapeKeyDown") void cancelLogin();
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{loginOtpPhase === "wrong_otp" ? t("login.otpFailedTitle") : t("login.otpTitle")}</DialogTitle>
        <DialogContent>
          {loginOtpPhase === "wrong_otp" ? (
            <Typography variant="body2" color={colors.muted}>
              {t("login.otpFailedBody")}
            </Typography>
          ) : (
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              label={t("login.otpLabel")}
              type="password"
              value={loginOtp}
              onChange={(e) => setLoginOtp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitLogin()}
            />
          )}
        </DialogContent>
        <DialogActions>
          {loginOtpPhase === "wrong_otp" ? (
            <>
              <Button color="error" onClick={() => void disconnectAfterWrongOtp()}>
                {t("toolbar.disconnect")}
              </Button>
              <Button variant="contained" onClick={() => void requestNewOtp()}>
                {t("login.requestNewOtp")}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => void cancelLogin()}>{t("common.cancel")}</Button>
              <Button variant="contained" onClick={() => void submitLogin()}>
                {t("login.submit")}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={gwCertDlg !== null} onClose={() => setGwCertDlg(null)} maxWidth="md" fullWidth>
        <DialogTitle>{t("gwCert.title")}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" whiteSpace="pre-wrap" fontFamily="JetBrains Mono, monospace">
            {gwCertDlg?.body}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGwCertDlg(null)}>{t("common.no")}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const d = gwCertDlg;
              if (!d) return;
              void (async () => {
                try {
                  const saved = await window.fvpn.trustGatewayDigest(d.profileName, d.digest);
                  if (!saved) {
                    notify(t("notify.digestWhitelistFailed"));
                    setGwCertDlg(null);
                    await refresh();
                    return;
                  }
                  await window.fvpn.stopVpn(d.profileName);
                  setGwCertDlg(null);
                  await refresh();
                  await startVpnFlow(d.profileName);
                } catch (e) {
                  notify((e as Error).message);
                }
              })();
            }}
          >
            {t("gwCert.whitelist")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        maxWidth="sm"
        fullWidth
        scroll="paper"
        PaperProps={{
          sx: {
            maxHeight: "min(520px, calc(100vh - 64px))",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <DialogTitle sx={{ flexShrink: 0 }}>{t("changelog.title")}</DialogTitle>
        <DialogContent dividers sx={{ overflowY: "auto", flex: "1 1 auto" }}>
          <List dense>
            <ListItemButton sx={{ alignItems: "flex-start", py: 1.5 }}>
              <Box>
                <Typography fontWeight={700}>0.2.1</Typography>
                <Typography variant="body2" color={colors.muted} component="div" sx={{ mt: 0.5 }}>
                  <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                    <li>{t("changelog.v021LogTheme")}</li>
                    <li>{t("changelog.v021ChangelogScroll")}</li>
                  </Box>
                </Typography>
              </Box>
            </ListItemButton>
            <ListItemButton sx={{ alignItems: "flex-start", py: 1.5 }}>
              <Box>
                <Typography fontWeight={700}>0.2.0</Typography>
                <Typography variant="body2" color={colors.muted} component="div" sx={{ mt: 0.5 }}>
                  <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                    <li>{t("changelog.v020I18n")}</li>
                    <li>Light theme and header theme toggle (dark, light, system) with moon, sun, and computer icons.</li>
                    <li>Theme preference saved in <code>~/.fortivpngui/main.conf</code> (<code>gui/theme_mode</code>).</li>
                    <li>FortiGate OTP: one prompt per reconnect cycle; invalid OTP offers disconnect or request a new code (no prompt loop).</li>
                    <li>
                      .deb install/upgrade: postinst stops running instances and removes <code>~/.config/fortivpngui</code> (Electron cache) so the new
                      package loads without a reboot; VPN data in <code>~/.fortivpngui/</code> is kept.
                    </li>
                  </Box>
                </Typography>
              </Box>
            </ListItemButton>
            <ListItemButton sx={{ alignItems: "flex-start", py: 1.5 }}>
              <Box>
                <Typography fontWeight={700}>0.1.0</Typography>
                <Typography variant="body2" color={colors.muted} sx={{ mt: 0.5 }}>
                  Electron shell, OpenFortiGUI-compatible profiles/groups, Fortigate and Barracuda runners.
                </Typography>
              </Box>
            </ListItemButton>
          </List>
        </DialogContent>
        <DialogActions sx={{ flexShrink: 0 }}>
          <Button
            onClick={() => {
              void window.fvpn.markChangelogRead();
              setChangelogOpen(false);
              void refresh();
            }}
          >
            {t("common.ok")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: colors.surface,
              border: `1px solid ${colors.outline}`,
              borderRadius: 3,
              backgroundImage: "none",
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            py: 1.5,
            px: 2,
            borderBottom: `1px solid ${colors.outline}`,
            color: colors.text,
            fontWeight: 700,
            fontSize: "1rem",
          }}
        >
          {t("about.title")}
          <Box flex={1} />
          <IconButton size="small" onClick={() => setAboutOpen(false)} aria-label={t("common.close")} sx={{ color: colors.muted }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 3, pt: 0, pb: 2 }}>
          <Stack alignItems="center" spacing={2} sx={{ pt: 5 }}>
            <Box
              component="img"
              src={brandingMark}
              alt=""
              width={72}
              height={72}
              sx={{
                objectFit: "contain",
                borderRadius: 2.5,
                border: `1px solid ${colors.outline}`,
                bgcolor: colors.nav,
                p: 1,
              }}
            />
            <Typography variant="h5" fontWeight={800} color={colors.text} textAlign="center">
              {APP_NAME}
            </Typography>
            <Box
              component="span"
              sx={{
                display: "inline-block",
                px: 1.5,
                py: 0.5,
                borderRadius: 999,
                bgcolor: colors.surfaceLow,
                border: `1px solid ${colors.outline}`,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: "0.8rem",
                color: colors.primary,
              }}
            >
              {t("common.version")} {APP_VERSION}
            </Box>
            <Typography variant="body2" color={colors.muted} textAlign="center" lineHeight={1.6} maxWidth={340}>
              {t("about.description")}
            </Typography>
            <Box
              sx={{
                width: "100%",
                maxWidth: 400,
                border: `1px solid ${colors.outline}`,
                borderRadius: 2,
                overflow: "hidden",
                bgcolor: colors.surfaceLow,
                alignSelf: "stretch",
              }}
            >
              {[
                [t("about.credits"), APP_AUTHOR || "—"],
                [
                  t("about.git"),
                  <Link
                    key="git"
                    href={APP_REPOSITORY}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    sx={{
                      display: "block",
                      color: colors.primary,
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      textAlign: "right",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {APP_REPOSITORY.replace(/^https:\/\//, "")}
                  </Link>,
                ],
                [t("about.license"), APP_LICENSE],
              ].map(([label, value], i) => (
                <Box
                  key={String(label)}
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: typeof value === "string" ? "center" : "flex-start",
                    gap: 2,
                    px: 2,
                    py: 1.25,
                    borderTop: i > 0 ? `1px solid ${colors.outline}` : "none",
                  }}
                >
                  <Typography variant="body2" color={colors.muted} fontWeight={500} sx={{ flexShrink: 0, width: 56 }}>
                    {label}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                    {typeof value === "string" ? (
                      <Typography variant="body2" color={colors.text} fontWeight={600} component="span" sx={{ display: "block" }}>
                        {value}
                      </Typography>
                    ) : (
                      value
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
            <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1} pt={0.5}>
              {["Electron", "React", "Material UI"].map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    bgcolor: colors.surfaceHigh,
                    border: `1px solid ${colors.outline}`,
                    color: colors.muted,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: "0.7rem",
                    height: 26,
                  }}
                />
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", px: 3, pb: 2.5, pt: 0 }}>
          <Button
            variant="outlined"
            onClick={() => setAboutOpen(false)}
            sx={{
              minWidth: 120,
              borderColor: colors.outline,
              color: colors.text,
              "&:hover": { borderColor: colors.muted, bgcolor: colors.surfaceLow },
            }}
          >
            {t("common.close")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={wizardOpen} onClose={() => setWizardOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("wizard.title")}</DialogTitle>
        <DialogContent dividers>
          {wizardStep === 0 ? (
            <Stack spacing={2}>
              <Alert severity="info">{t("wizard.welcome")}</Alert>
              <Button variant="outlined" onClick={() => void runImport()}>
                {t("wizard.importOfg")}
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <FormControlLabel control={<Checkbox checked={wizardUseStore} onChange={(_, c) => setWizardUseStore(c)} />} label={t("wizard.usePasswordManager")} />
              <TextField label={t("settings.aesKey")} value={wizardAesKey} onChange={(e) => setWizardAesKey(e.target.value)} />
              <TextField label={t("settings.aesIv")} value={wizardAesIv} onChange={(e) => setWizardAesIv(e.target.value)} />
              <Button
                variant="outlined"
                onClick={() => {
                  setWizardAesKey(randKey());
                  setWizardAesIv(randKey());
                }}
              >
                {t("wizard.autogenerateKeys")}
              </Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWizardOpen(false)}>{t("wizard.abort")}</Button>
          <Box flex={1} />
          <Button disabled={wizardStep === 0} onClick={() => setWizardStep(0)}>
            {t("wizard.back")}
          </Button>
          {wizardStep === 0 ? (
            <Button variant="contained" onClick={() => setWizardStep(1)}>
              {t("wizard.next")}
            </Button>
          ) : (
            <Button variant="contained" onClick={() => void finishWizard()}>
              {t("wizard.finish")}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={importResultText !== null} onClose={() => setImportResultText(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("import.title")}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" component="pre" sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", m: 0 }}>
            {importResultText}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setImportResultText(null)}>
            {t("common.ok")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notifyText !== null}
        autoHideDuration={9000}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          setNotifyText(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="warning"
          onClose={() => setNotifyText(null)}
          variant="outlined"
          sx={{ maxWidth: 520, whiteSpace: "pre-wrap", bgcolor: colors.surface, color: colors.text, borderColor: colors.outline }}
        >
          {notifyText}
        </Alert>
      </Snackbar>
    </Box>
  );
}
