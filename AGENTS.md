# FortiVPN GUI — agent guide

Desktop VPN client for **FortiGate** (`openfortivpn`). **Tauri 2** (Rust) backend + **React 19** / **Material UI** renderer. Config under `~/.fortivpngui/` (OpenFortiGUI-compatible INI).

## Commands

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Dev (HMR) | `npm run tauri:dev` |
| Build renderer | `npm run build` |
| Build app (deb/rpm/AppImage/Flatpak) | `npm run dist` |
| Debug binary | `cargo tauri build --debug` |

Main binary after build: `src-tauri/target/release/fortivpngui` (or `debug/`).

## Layout

| Path | Role |
|------|------|
| `src-tauri/` | Rust/Tauri main process: IPC commands, tray, VPN runners, settings, import |
| `src/renderer/` | React UI (`App.tsx`), `fvpn-bridge.ts` (Tauri ↔ `window.fvpn`), i18n, theme |
| `shared/` | Types, constants, theme tokens (shared at build time) |
| `resources/` | Sudoers template, Tauri packaging scripts (`packaging/`), icons |
| `flatpak/` | Flatpak manifest + AppStream metainfo (built from the `.deb` by `scripts/dist-flatpak.sh`) |
| `docs/` | Release notes, screenshots |

Bump **`CHANGELOG_REV`** in both `shared/constants.ts` and `src-tauri/src/config.rs` when in-app changelog content changes.

## Cursor rules (project)

Persistent agent instructions live in **[`.cursor/rules/`](.cursor/rules/)** (`.mdc` files with YAML frontmatter).

| Rule | Scope | Purpose |
|------|--------|---------|
| [`git-commits.mdc`](.cursor/rules/git-commits.mdc) | `alwaysApply: true` | No `Co-authored-by: Cursor …` in commits; optional [`.githooks/prepare-commit-msg`](.githooks/prepare-commit-msg) |

**Add or edit rules:** create a new `.mdc` under `.cursor/rules/`. Use the **create-rule** skill (`~/.cursor/skills-cursor/create-rule/SKILL.md`) for format and conventions.

Rules with `alwaysApply: true` apply in every session; others apply when matching `globs` are open.

## Cursor skills

### Project skills

Place repo-specific skills under **[`.cursor/skills/`](.cursor/skills/)**:

```
.cursor/skills/
  my-skill/
    SKILL.md
```

Each skill is a folder with a `SKILL.md` (YAML frontmatter + instructions). Agents should read the relevant `SKILL.md` when the task matches its description.

**Authoring:** follow **create-skill** (`~/.cursor/skills-cursor/create-skill/SKILL.md`).

### User skills (global)

Installed Cursor skills on this machine live in **`~/.cursor/skills-cursor/`**. Use when the task matches their description:

| Skill | Use when |
|-------|----------|
| `babysit` | PR triage, review comments, CI loop |
| `create-hook` | Cursor hooks (`.cursor/hooks.json`) |
| `create-rule` | New `.cursor/rules/*.mdc` |
| `create-skill` | New skill authoring |
| `loop` | Recurring / monitored shell tasks |
| `sdk` | `@cursor/sdk` programmatic agents |
| `split-to-prs` | Split work into reviewable PRs |
| `statusline` | CLI status line config |
| `update-cli-config` | `~/.cursor/cli-config.json` |

## Git

- Commit only when the user asks.
- No `Co-authored-by: Cursor <cursoragent@cursor.com>` (see [`git-commits.mdc`](.cursor/rules/git-commits.mdc)).
- Enable hook stripper locally: `git config core.hooksPath .githooks`

## Conventions

- Minimal diffs; match existing style in `src-tauri/` and `src/renderer/`.
- i18n: strings in `src/renderer/i18n/`; language setting in `main.conf` → `gui/language`.
- Theme tokens: `shared/theme-tokens.ts` (used by renderer and log windows).
- FortiGate VPN runs via `sudo openfortivpn`; packaged `.deb` may install `/etc/sudoers.d/fortivpngui`.
- Frontend talks to Rust only through `window.fvpn` (`src/renderer/fvpn-bridge.ts` → Tauri `invoke` / events).

For human-oriented docs, see [README.md](README.md).
