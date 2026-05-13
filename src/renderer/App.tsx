import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
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
  Toolbar,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import SettingsIcon from "@mui/icons-material/Settings";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import ListAltIcon from "@mui/icons-material/ListAlt";
import ArticleIcon from "@mui/icons-material/Article";
import InputIcon from "@mui/icons-material/Input";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import type { VpnProfile, VpnGroup, MainSettings, VpnStartCredentials } from "../../shared/types";
import { CHANGELOG_REV } from "../../shared/constants";

const emptyProfile = (): VpnProfile => ({
  name: "",
  origin: "local",
  device_type: "fortigate",
  gateway_host: "",
  gateway_port: 443,
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
  verify_cert: true,
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

export default function App() {
  const [tab, setTab] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<VpnProfile[]>([]);
  const [groups, setGroups] = useState<VpnGroup[]>([]);
  const [settings, setSettings] = useState<MainSettings | null>(null);
  const [ofvPath, setOfvPath] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<{ t: number; name: string; line: string }[]>([]);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<VpnProfile>(emptyProfile());

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupDraft, setGroupDraft] = useState<VpnGroup>({ name: "", localMembers: [], globalMembers: [] });
  const [groupLocalText, setGroupLocalText] = useState("");
  const [groupGlobalText, setGroupGlobalText] = useState("");

  const [loginOpen, setLoginOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState<string | null>(null);
  /** OpenFortiGUI-style `vpnLogin`: before connect when OTP always required, or after log challenge. */
  const [loginKind, setLoginKind] = useState<"always" | "challenge" | null>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  /** Challenge opened from explicit "No OTP" line vs generic auth failure. */
  const [loginChallengeExplicitOtp, setLoginChallengeExplicitOtp] = useState(false);
  const lastOtpChallengeLogKey = useRef<string>("");
  /** Last Fortigate `startVpn` for this profile passed an OTP to the backend (avoid re-opening modal on generic auth errors after an OTP retry). */
  const fortigateLastConnectHadOtp = useRef<Record<string, boolean>>({});
  const [showProfilePassword, setShowProfilePassword] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showLoginOtp, setShowLoginOtp] = useState(false);

  const [barrOtpOpen, setBarrOtpOpen] = useState(false);
  const [barrOtpTarget, setBarrOtpTarget] = useState<string | null>(null);
  const [barrOtpVal, setBarrOtpVal] = useState("");
  const [showBarrOtp, setShowBarrOtp] = useState(false);

  const [profileFilter, setProfileFilter] = useState("");
  const [profileCtx, setProfileCtx] = useState<{ top: number; left: number; name: string } | null>(null);

  const [gwCertDlg, setGwCertDlg] = useState<{ profileName: string; digest: string; body: string } | null>(null);

  const [changelogOpen, setChangelogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  /** Avoid reopening wizard/changelog on every refresh() — stacked modals steal focus (e.g. profile dialog). */
  const settingsPromptsDone = useRef(false);

  const refresh = useCallback(async () => {
    setBootError(null);
    try {
      if (typeof window.fvpn === "undefined") {
        throw new Error("API do processo principal não disponível (preload não expôs window.fvpn).");
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
      for (const x of p) {
        st[x.name] = await window.fvpn.vpnStatus(x.name);
      }
      setStatus(st);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBootError(msg);
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!settings || settingsPromptsDone.current) return;
    settingsPromptsDone.current = true;
    if (settings.setupwizard) setWizardOpen(true);
    if (settings.changelogrev_read < CHANGELOG_REV) setChangelogOpen(true);
  }, [settings]);

  useEffect(() => {
    const unsub = window.fvpn.onAppNavigate((ev) => {
      if (typeof ev.tab === "number") setTab(ev.tab);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    return window.fvpn.onGatewayCertPrompt((ev) => setGwCertDlg(ev));
  }, []);

  useEffect(() => {
    const unsubLog = window.fvpn.onVpnLog((ev) => {
      setLogs((prev) => {
        const next = [...prev, { t: Date.now(), name: ev.name, line: ev.line }];
        return next.slice(-400);
      });
    });
    const unsubStatus = window.fvpn.onVpnStatus((ev) => {
      setStatus((prev) => ({ ...prev, [ev.name]: ev.state }));
    });
    return () => {
      unsubLog();
      unsubStatus();
    };
  }, []);

  /** When not using "Always ask OTP", open login modal if logs show missing OTP or common auth failures without cookie (often 2FA or wrong password). */
  useEffect(() => {
    if (loginOpen) return;
    if (!profiles.length) return;

    const explicitOtpNeed = (line: string) => /No OTP specified|No token specified/i.test(line);
    const authFailMaybeOtp = (line: string) =>
      /Could not authenticate to (?:the )?gateway/i.test(line) || /No cookie given/i.test(line);

    for (let i = logs.length - 1; i >= Math.max(0, logs.length - 24); i--) {
      const e = logs[i];
      const ex = explicitOtpNeed(e.line);
      const af = authFailMaybeOtp(e.line);
      if (!ex && !af) continue;
      if (af && fortigateLastConnectHadOtp.current[e.name]) continue;

      const key = `${e.t}|${e.name}|${e.line}`;
      if (key === lastOtpChallengeLogKey.current) continue;

      const p = profiles.find((x) => x.name === e.name);
      if (!p || p.device_type !== "fortigate" || p.always_ask_otp) continue;

      lastOtpChallengeLogKey.current = key;
      setLoginChallengeExplicitOtp(ex);
      setLoginKind("challenge");
      setLoginTarget(e.name);
      setLoginUser(p.username);
      setLoginPass(p.password);
      setLoginOtp("");
      setShowLoginPass(false);
      setShowLoginOtp(false);
      setLoginOpen(true);
      return;
    }
  }, [logs, loginOpen, profiles]);

  const suggestedTrustedDigest = useMemo(() => {
    const name = profileDraft.name.trim();
    if (!name || !profileOpen) return null;
    for (let i = logs.length - 1; i >= 0; i--) {
      const e = logs[i];
      if (e.name !== name) continue;
      const m = e.line.match(/--trusted-cert\s+([0-9a-fA-F]{64})\b|trusted-cert\s*=\s*([0-9a-fA-F]{64})\b/);
      if (m) return (m[1] || m[2]).toLowerCase();
    }
    for (let i = logs.length - 1; i >= 0; i--) {
      const e = logs[i];
      if (e.name !== name) continue;
      if (!/trusted-cert|sha256 digest/i.test(e.line)) continue;
      const m2 = e.line.match(/\b([0-9a-fA-F]{64})\b/);
      if (m2) return m2[1].toLowerCase();
    }
    return null;
  }, [logs, profileDraft.name, profileOpen]);

  const filteredProfiles = useMemo(() => {
    const q = profileFilter.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.gateway_host.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.device_type.toLowerCase().includes(q) ||
        p.origin.toLowerCase().includes(q)
    );
  }, [profiles, profileFilter]);

  const displayedProfiles = settings?.show_search ? filteredProfiles : profiles;

  const startVpnFlow = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    if (p.device_type === "barracuda") {
      if (p.always_ask_otp) {
        setBarrOtpTarget(name);
        setBarrOtpVal("");
        setShowBarrOtp(false);
        setBarrOtpOpen(true);
        return;
      }
      try {
        await window.fvpn.startVpn(name);
      } catch (e) {
        alert((e as Error).message);
      }
      return;
    }
    if (p.always_ask_otp) {
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

  const closeLoginDialog = () => {
    setShowLoginPass(false);
    setShowLoginOtp(false);
    setLoginKind(null);
    setLoginOpen(false);
    setLoginTarget(null);
    setLoginChallengeExplicitOtp(false);
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
    if (loginOtp.trim()) {
      fortigateLastConnectHadOtp.current[loginTarget] = true;
    }
    const creds: VpnStartCredentials = {
      username: loginUser.trim(),
      password: loginPass,
      otp: loginOtp,
    };
    try {
      await window.fvpn.startVpn(loginTarget, creds);
    } catch (e) {
      alert((e as Error).message);
    }
    closeLoginDialog();
  };

  const stopVpn = async (name: string) => {
    await window.fvpn.stopVpn(name);
    setLogs((prev) => prev.filter((l) => l.name !== name));
  };

  const saveProfile = async () => {
    try {
      await window.fvpn.saveProfile(profileDraft);
      setShowProfilePassword(false);
      setProfileOpen(false);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteProfile = async (name: string) => {
    if (!confirm(`Delete profile "${name}"?`)) return;
    await window.fvpn.deleteProfile(name);
    await refresh();
  };

  const editProfile = (p: VpnProfile) => {
    setShowProfilePassword(false);
    setProfileDraft({ ...p });
    setProfileOpen(true);
  };

  const newProfile = () => {
    setShowProfilePassword(false);
    setProfileDraft(emptyProfile());
    setProfileOpen(true);
  };

  const duplicateProfile = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    let newName = `${p.name} copy`;
    let n = 2;
    while (profiles.some((x) => x.name === newName)) {
      newName = `${p.name} copy ${n}`;
      n += 1;
    }
    const copy: VpnProfile = { ...p, name: newName, origin: "local" };
    try {
      await window.fvpn.saveProfile(copy);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const closeBarrOtpDialog = () => {
    setShowBarrOtp(false);
    setBarrOtpOpen(false);
    setBarrOtpTarget(null);
    setBarrOtpVal("");
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
    closeBarrOtpDialog();
  };

  const saveGroup = async () => {
    const g: VpnGroup = {
      name: groupDraft.name.trim(),
      localMembers: groupLocalText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      globalMembers: groupGlobalText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      await window.fvpn.saveGroup(g);
      setGroupOpen(false);
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const editGroup = (g: VpnGroup) => {
    setGroupDraft({ ...g });
    setGroupLocalText(g.localMembers.join(", "));
    setGroupGlobalText(g.globalMembers.join(", "));
    setGroupOpen(true);
  };

  const newGroup = () => {
    setGroupDraft({ name: "", localMembers: [], globalMembers: [] });
    setGroupLocalText("");
    setGroupGlobalText("");
    setGroupOpen(true);
  };

  const deleteGroup = async (name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return;
    await window.fvpn.deleteGroup(name);
    await refresh();
  };

  const duplicateGroupByName = async (name: string) => {
    try {
      const newName = await window.fvpn.duplicateGroup(name);
      await refresh();
      alert(`Duplicated group as "${newName}".`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const logGroupLine = (line: string) => {
    setLogs((prev) => [...prev, { t: Date.now(), name: "(group)", line }].slice(-400));
    console.warn(line);
  };

  const connectAllGroup = async (g: VpnGroup) => {
    const names = [...new Set([...g.localMembers, ...g.globalMembers])];
    for (const n of names) {
      const p = profiles.find((x) => x.name === n);
      if (!p) {
        logGroupLine(`[group "${g.name}"] Member profile not found: ${n}`);
        continue;
      }
      if (p.device_type === "fortigate" && !ofvPath) {
        logGroupLine(`[group "${g.name}"] Skipping ${n} (openfortivpn not found).`);
        continue;
      }
      if (p.always_ask_otp) {
        logGroupLine(`[group "${g.name}"] Skipping ${n} (interactive OTP required).`);
        continue;
      }
      if (status[n] === "connected" || status[n] === "connecting") continue;
      try {
        await window.fvpn.startVpn(n);
      } catch (e) {
        logGroupLine(`[group "${g.name}"] connect failed for ${n}: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const disconnectAllGroup = async (g: VpnGroup) => {
    const names = [...new Set([...g.localMembers, ...g.globalMembers])];
    for (const n of names) {
      if (!profiles.some((x) => x.name === n)) {
        logGroupLine(`[group "${g.name}"] Member profile not found: ${n}`);
        continue;
      }
      await window.fvpn.stopVpn(n);
    }
  };

  const mergeOfgMain = async () => {
    const next = await window.fvpn.mergeOpenfortiguiMain();
    if (!next) alert("No ~/.openfortigui/main.conf or no mappable keys found.");
    else {
      setSettings(next);
      alert("Merged compatible keys from OpenFortiGUI main.conf.");
    }
  };

  const saveSettingsUi = async (partial: Partial<MainSettings>) => {
    const s = await window.fvpn.saveSettings(partial);
    setSettings(s);
  };

  const runImport = async () => {
    const r = await window.fvpn.importOpenfortigui();
    alert(
      `Imported ${r.profilesCopied} profiles, ${r.groupsCopied} groups.\n` +
        (r.errors.length ? `Errors:\n${r.errors.join("\n")}` : "")
    );
    await refresh();
  };

  const closeWizard = async (done: boolean) => {
    if (done) await window.fvpn.saveSettings({ setupwizard: false });
    setWizardOpen(false);
  };

  const changelogBody = useMemo(
    () => (
      <List dense>
        <ListItem>
          <ListItemText primary="0.1.0" secondary="Initial FortiVPN GUI: Electron shell, openfortivpn motor, Material Icons, import from OpenFortiGUI." />
        </ListItem>
      </List>
    ),
    []
  );

  if (bootError) {
    return (
      <Box p={3}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {bootError}
        </Alert>
        <Typography variant="body2" color="text.secondary" paragraph>
          Se estiveres a correr a app instalada pelo .deb, confirma que <code>dist/</code> foi incluído no pacote. Em desenvolvimento, corre{" "}
          <code>npm run build</code> antes de <code>npm start</code>.
        </Typography>
        <Button variant="contained" onClick={() => void refresh()}>
          Tentar outra vez
        </Button>
      </Box>
    );
  }

  if (!settings) {
    return (
      <Box p={2}>
        <Typography>Loading…</Typography>
      </Box>
    );
  }

  const certLocked = settings.disallow_unsecure_certificates;

  return (
    <Box display="flex" flexDirection="column" height="100vh" bgcolor="background.default">
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            FortiVPN GUI
          </Typography>
          <IconButton color="inherit" onClick={() => setChangelogOpen(true)} title="Changelog">
            <ArticleIcon />
          </IconButton>
          <IconButton color="inherit" onClick={() => void refresh()} title="Refresh">
            <ListAltIcon />
          </IconButton>
        </Toolbar>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          <Tab icon={<ListAltIcon />} iconPosition="start" label="Profiles" />
          <Tab icon={<GroupWorkIcon />} iconPosition="start" label="Groups" />
          <Tab icon={<SettingsIcon />} iconPosition="start" label="Settings" />
          <Tab icon={<InputIcon />} iconPosition="start" label="Logs" />
        </Tabs>
      </AppBar>

      {!ofvPath && (
        <Alert severity="error" sx={{ m: 1 }}>
          <code>openfortivpn</code> not found in PATH. Install the <code>openfortivpn</code> package (Fortigate profiles need it).
        </Alert>
      )}

      <Box flex={1} overflow="auto" p={2}>
        {tab === 0 && (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={newProfile}>
                Add profile
              </Button>
              {settings.show_search ? (
                <TextField
                  size="small"
                  label="Search profiles"
                  placeholder="Name, gateway, user…"
                  value={profileFilter}
                  onChange={(e) => setProfileFilter(e.target.value)}
                  sx={{ minWidth: 220, flex: 1 }}
                />
              ) : null}
            </Stack>
            <Table size="small" component={Paper}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Gateway</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Device</TableCell>
                  <TableCell>Origin</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedProfiles.map((p) => (
                  <TableRow
                    key={`${p.origin}-${p.name}`}
                    hover
                    onDoubleClick={() => {
                      if (!settings.connect_on_dblclick) return;
                      if (status[p.name] === "connected" || status[p.name] === "connecting") return;
                      if (p.device_type === "fortigate" && !ofvPath) return;
                      void startVpnFlow(p.name);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setProfileCtx({ top: e.clientY, left: e.clientX, name: p.name });
                    }}
                  >
                    <TableCell>{p.name}</TableCell>
                    <TableCell>
                      {p.gateway_host}:{p.gateway_port}
                    </TableCell>
                    <TableCell>{p.username}</TableCell>
                    <TableCell>{p.device_type}</TableCell>
                    <TableCell>{p.origin}</TableCell>
                    <TableCell>{status[p.name] || "disconnected"}</TableCell>
                    <TableCell align="right">
                      {status[p.name] === "connected" || status[p.name] === "connecting" ? (
                        <IconButton size="small" onClick={() => void stopVpn(p.name)} title="Disconnect">
                          <LinkOffIcon fontSize="small" />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="small"
                          disabled={p.device_type === "fortigate" && !ofvPath}
                          onClick={() => void startVpnFlow(p.name)}
                          title="Connect"
                        >
                          <LinkIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton size="small" disabled={p.origin === "global"} onClick={() => editProfile(p)} title="Edit">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" disabled={p.origin === "global"} onClick={() => void deleteProfile(p.name)} title="Delete">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Menu
              open={profileCtx !== null}
              onClose={() => setProfileCtx(null)}
              anchorReference="anchorPosition"
              anchorPosition={profileCtx === null ? undefined : { top: profileCtx.top, left: profileCtx.left }}
            >
              <MenuItem
                disabled={(() => {
                  const pe = profiles.find((q) => q.name === profileCtx?.name);
                  return !!pe && pe.device_type === "fortigate" && !ofvPath;
                })()}
                onClick={() => {
                  const n = profileCtx?.name;
                  setProfileCtx(null);
                  if (n) void startVpnFlow(n);
                }}
              >
                Connect
              </MenuItem>
              <MenuItem
                onClick={() => {
                  const n = profileCtx?.name;
                  setProfileCtx(null);
                  if (n) void stopVpn(n);
                }}
              >
                Disconnect
              </MenuItem>
              <MenuItem
                disabled={profiles.find((x) => x.name === profileCtx?.name)?.origin === "global"}
                onClick={() => {
                  const pe = profiles.find((x) => x.name === profileCtx?.name);
                  setProfileCtx(null);
                  if (pe) editProfile(pe);
                }}
              >
                Edit profile
              </MenuItem>
              <MenuItem
                onClick={() => {
                  const n = profileCtx?.name;
                  setProfileCtx(null);
                  if (n) void duplicateProfile(n);
                }}
              >
                Duplicate profile
              </MenuItem>
            </Menu>
            {profiles.length > 0 && settings.show_search && filteredProfiles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No profiles match the search filter.
              </Typography>
            ) : null}
            <Typography variant="caption" color="text.secondary" display="block">
              Right-click a row for Connect / Duplicate (OpenFortiGUI-style). Double-click to connect when the connect-on-double-click option is
              enabled in Settings.
            </Typography>
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={newGroup}>
              Add group
            </Button>
            <Table size="small" component={Paper}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Local members</TableCell>
                  <TableCell>Global members</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.name}>
                    <TableCell>{g.name}</TableCell>
                    <TableCell>{g.localMembers.join(", ")}</TableCell>
                    <TableCell>{g.globalMembers.join(", ")}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        title="Connect all members"
                        onClick={() => void connectAllGroup(g)}
                      >
                        <LinkIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        title="Disconnect all members"
                        onClick={() => void disconnectAllGroup(g)}
                      >
                        <LinkOffIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => void duplicateGroupByName(g.name)} title="Duplicate group">
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
                ))}
              </TableBody>
            </Table>
          </Stack>
        )}

        {tab === 2 && (
          <Stack spacing={2} maxWidth={720}>
            <Typography variant="subtitle1">Main</Typography>
            <FormControlLabel
              control={<Checkbox checked={settings.debug} onChange={(_, c) => void saveSettingsUi({ debug: c })} />}
              label="Debug (verbose logs; can be noisy under load)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.use_system_password_store}
                  onChange={(_, c) => void saveSettingsUi({ use_system_password_store: c })}
                />
              }
              label="Use system password store (keytar / Secret Service) for VPN passwords"
            />
            <TextField
              label="AES key (local password encryption)"
              fullWidth
              disabled={settings.use_system_password_store}
              value={settings.aeskey}
              onChange={(e) => setSettings({ ...settings, aeskey: e.target.value })}
              onBlur={() => void saveSettingsUi({ aeskey: settings.aeskey })}
              helperText="Only used when not using the system password store. Changing this invalidates stored passwords in local .conf files."
            />
            <TextField
              label="AES IV"
              fullWidth
              disabled={settings.use_system_password_store}
              value={settings.aesiv}
              onChange={(e) => setSettings({ ...settings, aesiv: e.target.value })}
              onBlur={() => void saveSettingsUi({ aesiv: settings.aesiv })}
            />
            <FormControlLabel
              control={<Checkbox checked={settings.sudo_preserve_env} onChange={(_, c) => void saveSettingsUi({ sudo_preserve_env: c })} />}
              label="sudo -E (preserve environment) when launching openfortivpn"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.disallow_unsecure_certificates}
                  onChange={(_, c) => void saveSettingsUi({ disallow_unsecure_certificates: c })}
                />
              }
              label="Disallow insecure certificates (locks trust-all, insecure SSL, trusted digest overrides in profile editor)"
            />
            <FormControlLabel
              control={
                <Checkbox checked={settings.show_search} onChange={(_, c) => void saveSettingsUi({ show_search: c })} />
              }
              label="Show profile search field (OpenFortiGUI main/show_search)"
            />
            <Divider />
            <Typography variant="subtitle1">Paths (tilde allowed)</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Changing paths may require restart so the app reloads profiles from the new directories.
            </Typography>
            <TextField
              label="Local profiles"
              fullWidth
              value={settings.localvpnprofiles}
              onChange={(e) => setSettings({ ...settings, localvpnprofiles: e.target.value })}
              onBlur={() => void saveSettingsUi({ localvpnprofiles: settings.localvpnprofiles })}
            />
            <TextField
              label="Global profiles"
              fullWidth
              value={settings.globalvpnprofiles}
              onChange={(e) => setSettings({ ...settings, globalvpnprofiles: e.target.value })}
              onBlur={() => void saveSettingsUi({ globalvpnprofiles: settings.globalvpnprofiles })}
            />
            <TextField
              label="Local groups"
              fullWidth
              value={settings.localvpngroups}
              onChange={(e) => setSettings({ ...settings, localvpngroups: e.target.value })}
              onBlur={() => void saveSettingsUi({ localvpngroups: settings.localvpngroups })}
            />
            <TextField
              label="Logs directory"
              fullWidth
              value={settings.logs}
              onChange={(e) => setSettings({ ...settings, logs: e.target.value })}
              onBlur={() => void saveSettingsUi({ logs: settings.logs })}
              helperText="VPN process output is mirrored here; the same lines are appended under this directory in logs/vpn/*.log (rotated at ~2 MiB)."
            />
            <TextField
              label="init.d path (legacy / packaging)"
              fullWidth
              value={settings.initd}
              onChange={(e) => setSettings({ ...settings, initd: e.target.value })}
              onBlur={() => void saveSettingsUi({ initd: settings.initd })}
            />
            <Divider />
            <Typography variant="subtitle1">GUI</Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.start_minimized}
                  onChange={(_, c) => void saveSettingsUi({ start_minimized: c })}
                />
              }
              label="Start minimized (tray only until you open the window)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.disable_notifications}
                  onChange={(_, c) => void saveSettingsUi({ disable_notifications: c })}
                />
              }
              label="Disable notifications when the window is hidden or minimized (desktop / tray balloon)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.connect_on_dblclick}
                  onChange={(_, c) => void saveSettingsUi({ connect_on_dblclick: c })}
                />
              }
              label="Connect on double-click (profiles table)"
            />
            <Divider />
            <Typography variant="subtitle1">Checks</Typography>
            <FormControlLabel
              control={<Checkbox checked={settings.sudopresenv} onChange={(_, c) => void saveSettingsUi({ sudopresenv: c })} />}
              label="sudo preserve-env check acknowledged (OpenFortiGUI checks/sudopresenv)"
            />
            <Divider />
            <Button variant="outlined" sx={{ alignSelf: "flex-start" }} onClick={() => void mergeOfgMain()}>
              Merge keys from ~/.openfortigui/main.conf
            </Button>
            <Button variant="outlined" onClick={() => void runImport()}>
              Import profiles &amp; groups from ~/.openfortigui
            </Button>
          </Stack>
        )}

        {tab === 3 && (
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="outlined"
                size="small"
                startIcon={<ClearAllIcon />}
                disabled={logs.length === 0}
                onClick={() => setLogs([])}
              >
                CLEAR LOG
              </Button>
            </Stack>
            <Paper sx={{ p: 1, fontFamily: "monospace", fontSize: 12, maxHeight: "70vh", overflow: "auto" }}>
              {logs.length === 0 ? (
                <Typography color="text.secondary">VPN process output will appear here.</Typography>
              ) : (
                logs.map((l, i) => (
                  <div key={i}>
                    [{l.name}] {l.line}
                  </div>
                ))
              )}
            </Paper>
          </Stack>
        )}
      </Box>

      <Dialog
        open={profileOpen}
        onClose={() => {
          setShowProfilePassword(false);
          setProfileOpen(false);
        }}
        maxWidth="md"
        fullWidth
        scroll="paper"
        disableEnforceFocus
        disableAutoFocus
      >
        <DialogTitle>{profileDraft.name ? `Edit ${profileDraft.name}` : "New profile"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Name"
              required
              value={profileDraft.name}
              onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })}
            />
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 72 }}>
                Device
              </Typography>
              <Select
                size="small"
                value={profileDraft.device_type}
                onChange={(e) => setProfileDraft({ ...profileDraft, device_type: e.target.value as VpnProfile["device_type"] })}
              >
                <MenuItem value="fortigate">Fortigate (openfortivpn)</MenuItem>
                <MenuItem value="barracuda">Barracuda (barracudavpn)</MenuItem>
              </Select>
            </Stack>
            <TextField
              label="Gateway host"
              value={profileDraft.gateway_host}
              onChange={(e) => setProfileDraft({ ...profileDraft, gateway_host: e.target.value })}
            />
            <TextField
              label="Gateway port"
              type="number"
              value={profileDraft.gateway_port}
              onChange={(e) => setProfileDraft({ ...profileDraft, gateway_port: parseInt(e.target.value, 10) || 443 })}
            />
            <TextField
              label="Username"
              value={profileDraft.username}
              onChange={(e) => setProfileDraft({ ...profileDraft, username: e.target.value })}
            />
            <TextField
              label="Password"
              type={showProfilePassword ? "text" : "password"}
              value={profileDraft.password}
              onChange={(e) => setProfileDraft({ ...profileDraft, password: e.target.value })}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showProfilePassword ? "Hide password" : "Show password"}
                      edge="end"
                      onClick={() => setShowProfilePassword((v) => !v)}
                      size="small"
                    >
                      {showProfilePassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField label="Realm" value={profileDraft.realm} onChange={(e) => setProfileDraft({ ...profileDraft, realm: e.target.value })} />
            <FormControlLabel
              control={<Checkbox checked={profileDraft.set_routes} onChange={(_, c) => setProfileDraft({ ...profileDraft, set_routes: c })} />}
              label="Set routes"
            />
            <FormControlLabel
              control={<Checkbox checked={profileDraft.set_dns} onChange={(_, c) => setProfileDraft({ ...profileDraft, set_dns: c })} />}
              label="Set DNS"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={profileDraft.half_internet_routers}
                  onChange={(_, c) => setProfileDraft({ ...profileDraft, half_internet_routers: c })}
                />
              }
              label="Half internet routes"
            />
            {certLocked && profileDraft.device_type === "fortigate" ? (
              <Alert severity="info">
                Insecure certificate options are disabled in application settings (OpenFortiGUI disallow insecure certificates).
              </Alert>
            ) : null}
            <FormControlLabel
              control={<Checkbox checked={profileDraft.verify_cert} onChange={(_, c) => setProfileDraft({ ...profileDraft, verify_cert: c })} />}
              label="Verify gateway certificate"
              disabled={certLocked && profileDraft.device_type === "fortigate"}
            />
            <FormControlLabel
              control={
                <Checkbox checked={profileDraft.insecure_ssl} onChange={(_, c) => setProfileDraft({ ...profileDraft, insecure_ssl: c })} />
              }
              label="Insecure SSL"
              disabled={certLocked && profileDraft.device_type === "fortigate"}
            />
            <FormControlLabel
              control={
                <Checkbox checked={profileDraft.always_ask_otp} onChange={(_, c) => setProfileDraft({ ...profileDraft, always_ask_otp: c })} />
              }
              label="Always ask OTP"
            />
            <TextField
              label="OTP prompt substring"
              value={profileDraft.otp_prompt}
              onChange={(e) => setProfileDraft({ ...profileDraft, otp_prompt: e.target.value })}
            />
            <TextField
              label="OTP delay (seconds)"
              type="number"
              value={profileDraft.otp_delay}
              onChange={(e) => setProfileDraft({ ...profileDraft, otp_delay: parseInt(e.target.value, 10) || 0 })}
              helperText="Seconds to wait before sending the OTP in the second HTTP step (gives the gateway time to send email/SMS)."
            />
            <FormControlLabel
              control={
                <Checkbox checked={profileDraft.no_ftm_push} onChange={(_, c) => setProfileDraft({ ...profileDraft, no_ftm_push: c })} />
              }
              label="No FortiToken Mobile push (prefer email/SMS/app token)"
            />
            <TextField
              label="CA file"
              fullWidth
              disabled={certLocked && profileDraft.device_type === "fortigate"}
              value={profileDraft.ca_file}
              onChange={(e) => setProfileDraft({ ...profileDraft, ca_file: e.target.value })}
            />
            <TextField
              label="User cert"
              fullWidth
              disabled={certLocked && profileDraft.device_type === "fortigate"}
              value={profileDraft.user_cert}
              onChange={(e) => setProfileDraft({ ...profileDraft, user_cert: e.target.value })}
            />
            <TextField
              label="User key"
              fullWidth
              disabled={certLocked && profileDraft.device_type === "fortigate"}
              value={profileDraft.user_key}
              onChange={(e) => setProfileDraft({ ...profileDraft, user_key: e.target.value })}
            />
            <TextField
              label="Trusted cert digest(s)"
              fullWidth
              disabled={certLocked && profileDraft.device_type === "fortigate"}
              value={profileDraft.trusted_cert}
              onChange={(e) => setProfileDraft({ ...profileDraft, trusted_cert: e.target.value })}
              helperText="Cole o SHA-256 de 64 caracteres que o openfortivpn mostra nas logs (ou use o botão abaixo). Vários digest: separados por espaço ou vírgula."
              placeholder="27462064e6e3f7109ad80a0a35317280fe574903f261aae66b4eae75f9a81a03"
            />
            <Button
              size="small"
              variant="outlined"
              disabled={certLocked || !suggestedTrustedDigest || profileDraft.device_type !== "fortigate"}
              onClick={() => {
                const d = suggestedTrustedDigest;
                if (!d) return;
                const cur = profileDraft.trusted_cert.trim();
                const parts = cur.split(/[\s,]+/).filter(Boolean).map((x) => x.trim().toLowerCase());
                if (parts.includes(d)) return;
                setProfileDraft({ ...profileDraft, trusted_cert: cur ? `${cur} ${d}` : d });
              }}
            >
              {`Usar digest da última mensagem nas logs (${profileDraft.name.trim() || "perfil"})`}
            </Button>
            <FormControlLabel
              control={
                <Checkbox checked={profileDraft.trust_all_gw_certs} onChange={(_, c) => setProfileDraft({ ...profileDraft, trust_all_gw_certs: c })} />
              }
              label="Trust all gateway certs (insecure)"
              disabled={certLocked && profileDraft.device_type === "fortigate"}
            />
            <FormControlLabel
              control={<Checkbox checked={profileDraft.debug} onChange={(_, c) => setProfileDraft({ ...profileDraft, debug: c })} />}
              label="Verbose openfortivpn (-v)"
            />
            <FormControlLabel
              control={<Checkbox checked={profileDraft.autostart} onChange={(_, c) => setProfileDraft({ ...profileDraft, autostart: c })} />}
              label="Autostart when the app loads (all profiles with this flag, except OTP-only profiles; Fortigate requires openfortivpn)"
            />
            <TextField
              label="Min TLS"
              value={profileDraft.min_tls}
              disabled={certLocked && profileDraft.device_type === "fortigate"}
              onChange={(e) => setProfileDraft({ ...profileDraft, min_tls: e.target.value })}
            />
            <FormControlLabel
              control={<Checkbox checked={profileDraft.seclevel1} onChange={(_, c) => setProfileDraft({ ...profileDraft, seclevel1: c })} />}
              label="TLS seclevel 1"
              disabled={certLocked && profileDraft.device_type === "fortigate"}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setShowProfilePassword(false);
              setProfileOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void saveProfile()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={groupOpen} onClose={() => setGroupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{groupDraft.name ? `Edit group ${groupDraft.name}` : "New group"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" value={groupDraft.name} onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })} />
            <TextField
              label="Local members (profile names, comma or newline)"
              multiline
              minRows={3}
              value={groupLocalText}
              onChange={(e) => setGroupLocalText(e.target.value)}
            />
            <TextField
              label="Global members (profile names, comma or newline)"
              multiline
              minRows={2}
              value={groupGlobalText}
              onChange={(e) => setGroupGlobalText(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGroupOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveGroup()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={gwCertDlg !== null} onClose={() => setGwCertDlg(null)} maxWidth="md" fullWidth>
        <DialogTitle>Gateway certificate</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
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
                  const r = await window.fvpn.trustGatewayDigest(d.profileName, d.digest);
                  setGwCertDlg(null);
                  if (r === "profile") {
                    setLogs((p) =>
                      [
                        ...p,
                        {
                          t: Date.now(),
                          name: d.profileName,
                          line: "[fortivpngui] Trusted digest saved to profile. Connect again.",
                        },
                      ].slice(-400)
                    );
                  } else if (r === "cache") {
                    setLogs((p) =>
                      [
                        ...p,
                        {
                          t: Date.now(),
                          name: d.profileName,
                          line: "[fortivpngui] Gateway digest saved to gw_cert.cache (Trust all). Connect again.",
                        },
                      ].slice(-400)
                    );
                  } else {
                    alert("Digest was not saved (check profile exists and is a Fortigate profile).");
                  }
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

      <Dialog open={loginOpen} onClose={closeLoginDialog} maxWidth="xs" fullWidth>
        <DialogTitle>VPN login</DialogTitle>
        <DialogContent>
          {loginKind === "challenge" ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The gateway reported a missing token, no session cookie, or authentication failure. Adjust username, password, or realm if needed,
              enter the current one-time code if your account uses 2FA, then connect again (same flow as the OpenFortiGUI credential dialog).
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              This profile is set to always ask for credentials before connecting (username, password, and one-time password when applicable).
            </Typography>
          )}
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              autoFocus
              label="Username"
              fullWidth
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              margin="dense"
            />
            <TextField
              label="Password"
              fullWidth
              type={showLoginPass ? "text" : "password"}
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              margin="dense"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showLoginPass ? "Hide password" : "Show password"}
                      edge="end"
                      onClick={() => setShowLoginPass((v) => !v)}
                      size="small"
                    >
                      {showLoginPass ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="One-time password"
              fullWidth
              type={showLoginOtp ? "text" : "password"}
              value={loginOtp}
              onChange={(e) => setLoginOtp(e.target.value)}
              margin="dense"
              helperText={loginKind === "always" ? "Required for this profile." : "Required if the log indicated a missing OTP/token."}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showLoginOtp ? "Hide one-time password" : "Show one-time password"}
                      edge="end"
                      onClick={() => setShowLoginOtp((v) => !v)}
                      size="small"
                    >
                      {showLoginOtp ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeLoginDialog}>Cancel</Button>
          <Button variant="contained" onClick={() => void submitLogin()}>
            Connect
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={barrOtpOpen} onClose={closeBarrOtpDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Barracuda one-time password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This Barracuda profile uses static OTP mode (OpenFortiGUI-style). Enter the current code before connecting.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="One-time password"
            fullWidth
            type={showBarrOtp ? "text" : "password"}
            value={barrOtpVal}
            onChange={(e) => setBarrOtpVal(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showBarrOtp ? "Hide one-time password" : "Show one-time password"}
                    edge="end"
                    onClick={() => setShowBarrOtp((v) => !v)}
                    size="small"
                  >
                    {showBarrOtp ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBarrOtpDialog}>Cancel</Button>
          <Button variant="contained" onClick={() => void submitBarrOtp()}>
            Connect
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={changelogOpen} onClose={() => setChangelogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Changelog</DialogTitle>
        <DialogContent>{changelogBody}</DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              void window.fvpn.markChangelogRead();
              setChangelogOpen(false);
              void refresh();
            }}
          >
            Mark as read
          </Button>
          <Button variant="contained" onClick={() => setChangelogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={wizardOpen} onClose={() => void closeWizard(false)}>
        <DialogTitle>Welcome</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            FortiVPN GUI stores configuration under <code>~/.fortivpngui</code> and uses the system <code>openfortivpn</code> binary for Fortigate
            VPNs.
          </Typography>
          <Typography gutterBottom>You can import profiles and groups from OpenFortiGUI (~/.openfortigui).</Typography>
          <Button sx={{ mt: 1 }} variant="outlined" onClick={() => void runImport()}>
            Import from OpenFortiGUI
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void closeWizard(false)}>Later</Button>
          <Button variant="contained" onClick={() => void closeWizard(true)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
