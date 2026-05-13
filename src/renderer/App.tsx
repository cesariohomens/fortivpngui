import { useCallback, useEffect, useMemo, useState } from "react";
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
  List,
  ListItem,
  ListItemText,
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
import type { VpnProfile, VpnGroup, MainSettings } from "../../shared/types";
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

  const [otpOpen, setOtpOpen] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpTarget, setOtpTarget] = useState<string | null>(null);

  const [changelogOpen, setChangelogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

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
      if (s.setupwizard) setWizardOpen(true);
      if (s.changelogrev_read < CHANGELOG_REV) setChangelogOpen(true);
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

  const startVpnFlow = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p) return;
    if (p.always_ask_otp) {
      setOtpTarget(name);
      setOtpValue("");
      setOtpOpen(true);
      return;
    }
    try {
      await window.fvpn.startVpn(name);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const submitOtp = async () => {
    if (!otpTarget) return;
    try {
      await window.fvpn.startVpn(otpTarget, otpValue || undefined);
    } catch (e) {
      alert((e as Error).message);
    }
    setOtpOpen(false);
    setOtpTarget(null);
  };

  const stopVpn = async (name: string) => {
    await window.fvpn.stopVpn(name);
  };

  const saveProfile = async () => {
    try {
      await window.fvpn.saveProfile(profileDraft);
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
    setProfileDraft({ ...p });
    setProfileOpen(true);
  };

  const newProfile = () => {
    setProfileDraft(emptyProfile());
    setProfileOpen(true);
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
            <Stack direction="row" spacing={1}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={newProfile}>
                Add profile
              </Button>
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
                {profiles.map((p) => (
                  <TableRow key={`${p.origin}-${p.name}`}>
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
            <Typography variant="subtitle1">Application</Typography>
            <FormControlLabel
              control={<Checkbox checked={settings.debug} onChange={(_, c) => void saveSettingsUi({ debug: c })} />}
              label="Debug logging"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.start_minimized}
                  onChange={(_, c) => void saveSettingsUi({ start_minimized: c })}
                />
              }
              label="Start minimized"
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
            <FormControlLabel
              control={
                <Checkbox checked={settings.sudo_preserve_env} onChange={(_, c) => void saveSettingsUi({ sudo_preserve_env: c })} />
              }
              label="sudo -E (preserve environment) when launching openfortivpn"
            />
            <Divider />
            <Typography variant="subtitle1">Paths (tilde allowed)</Typography>
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
            <Divider />
            <Button variant="outlined" onClick={() => void runImport()}>
              Import profiles &amp; groups from ~/.openfortigui
            </Button>
          </Stack>
        )}

        {tab === 3 && (
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
        )}
      </Box>

      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth="md" fullWidth scroll="paper">
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
              type="password"
              value={profileDraft.password}
              onChange={(e) => setProfileDraft({ ...profileDraft, password: e.target.value })}
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
            <FormControlLabel
              control={<Checkbox checked={profileDraft.verify_cert} onChange={(_, c) => setProfileDraft({ ...profileDraft, verify_cert: c })} />}
              label="Verify gateway certificate"
            />
            <FormControlLabel
              control={
                <Checkbox checked={profileDraft.insecure_ssl} onChange={(_, c) => setProfileDraft({ ...profileDraft, insecure_ssl: c })} />
              }
              label="Insecure SSL"
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
            />
            <TextField label="CA file" fullWidth value={profileDraft.ca_file} onChange={(e) => setProfileDraft({ ...profileDraft, ca_file: e.target.value })} />
            <TextField
              label="User cert"
              fullWidth
              value={profileDraft.user_cert}
              onChange={(e) => setProfileDraft({ ...profileDraft, user_cert: e.target.value })}
            />
            <TextField
              label="User key"
              fullWidth
              value={profileDraft.user_key}
              onChange={(e) => setProfileDraft({ ...profileDraft, user_key: e.target.value })}
            />
            <TextField
              label="Trusted cert digest(s)"
              fullWidth
              value={profileDraft.trusted_cert}
              onChange={(e) => setProfileDraft({ ...profileDraft, trusted_cert: e.target.value })}
            />
            <FormControlLabel
              control={
                <Checkbox checked={profileDraft.trust_all_gw_certs} onChange={(_, c) => setProfileDraft({ ...profileDraft, trust_all_gw_certs: c })} />
              }
              label="Trust all gateway certs (insecure)"
            />
            <FormControlLabel
              control={<Checkbox checked={profileDraft.debug} onChange={(_, c) => setProfileDraft({ ...profileDraft, debug: c })} />}
              label="Verbose openfortivpn (-v)"
            />
            <FormControlLabel
              control={<Checkbox checked={profileDraft.autostart} onChange={(_, c) => setProfileDraft({ ...profileDraft, autostart: c })} />}
              label="Autostart (UI only — start on login not wired in this build)"
            />
            <TextField
              label="Min TLS"
              value={profileDraft.min_tls}
              onChange={(e) => setProfileDraft({ ...profileDraft, min_tls: e.target.value })}
            />
            <FormControlLabel
              control={<Checkbox checked={profileDraft.seclevel1} onChange={(_, c) => setProfileDraft({ ...profileDraft, seclevel1: c })} />}
              label="TLS seclevel 1"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileOpen(false)}>Cancel</Button>
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

      <Dialog open={otpOpen} onClose={() => setOtpOpen(false)}>
        <DialogTitle>OTP</DialogTitle>
        <DialogContent>
          <TextField autoFocus margin="dense" label="One-time password" fullWidth value={otpValue} onChange={(e) => setOtpValue(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOtpOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void submitOtp()}>
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
