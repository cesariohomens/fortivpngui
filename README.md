# FortiVPN GUI

Desktop VPN client for **FortiGate** (via system [`openfortivpn`](https://github.com/adrienverge/openfortivpn)) and **Barracuda** (via `barracudavpn` if installed). UI is **Electron + React + Material UI / Material Icons**. Configuration lives under `~/.fortivpngui/` (compatible INI layout with OpenFortiGUI for easy import).

When you ship a new changelog entry, bump **`CHANGELOG_REV`** in both [`shared/constants.ts`](shared/constants.ts) and [`electron/config.ts`](electron/config.ts) so the in-app changelog prompt stays in sync.

## Requirements

- **Node.js** 20+ (for development)
- **Linux** with `openfortivpn`, `ppp`, and `sudo` installed for Fortigate tunnels
- Optional: `barracudavpn` for Barracuda profile type

## Development

```bash
npm ci
npm run build:electron   # compile main/preload
npm run electron:dev     # Vite on :5173 + Electron with hot reload
```

`npm start` and `npm run electron:dev` launch Electron with **`--no-sandbox`** so they work when `node_modules/electron/dist/chrome-sandbox` is not installed as setuid root (the default on many desktops). That avoids:

`The SUID sandbox helper binary was found, but is not configured correctly`

If you prefer the Chromium sandbox in development, fix permissions once (after each `npm install` that touches Electron):

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Then remove `--no-sandbox` from the `start` / `electron:dev` scripts in `package.json` if you want a stricter setup.

For a blank window, run with DevTools: `FORTIVPN_OPEN_DEVTOOLS=1 npm start` and check the Console.

Or production-like:

```bash
npm start                # build + electron --no-sandbox .
```

## Build Debian package

```bash
npm run dist
```

Output: `release/fortivpngui_<version>_amd64.deb` (large binary; use **Git LFS** or **GitHub Releases** if you commit artefacts to git).

Native module **keytar** is rebuilt for Electron via `electron-builder install-app-deps` (postinstall).

### Sudo (Fortigate)

`openfortivpn` must run as root. Install a sudoers snippet so your user can run it without a password (tighten host/user as needed):

```text
# /etc/sudoers.d/fortivpngui
youruser ALL=(root) NOPASSWD: /usr/bin/openfortivpn *
```

The trailing ` * ` is required: this app runs `sudo /usr/bin/openfortivpn -c /tmp/...` (and may add `--otp`, `-v`, etc.). A rule with only `/usr/bin/openfortivpn` and no ` * ` usually does **not** match that command line, so `sudo` can still prompt for a password or reject the invocation while the tunnel partially starts—leading to confusing auth or OTP behaviour.

`npm install` **postinstall** only runs `electron-builder install-app-deps` (rebuilds **keytar**); it does **not** change sudoers. The **`.deb`** runs `resources/deb/postinst.sh`, which installs the drop-in **`/etc/sudoers.d/fortivpngui`** (included from the main sudoers via `#includedir`). It does not append to `/etc/sudoers`; use `sudo visudo -f /etc/sudoers.d/fortivpngui` to inspect or edit that file.

A template is shipped as `resources/sudo/fortivpngui.sudoers` (review before installing).

FortiGate **email/SMS OTP** often needs the gateway to offer token mode instead of FortiToken Mobile push. In the profile editor, try **“no FTM push”** (`no-ftm-push`) and, if the token arrives late, increase **OTP delay** (`otp-delay`, seconds) to match your MFA flow.

## Import from OpenFortiGUI

Use **Settings → Import** or the first-run wizard to copy `~/.openfortigui/vpnprofiles/*.conf` and `vpngroups/*.conf` into `~/.fortivpngui/`.

## Licence

GPL-3.0 (same spirit as OpenFortiGUI). See upstream licences for `openfortivpn` and Electron stack.
