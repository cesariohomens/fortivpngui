#!/usr/bin/env node
/**
 * Capture English UI screenshots into docs/images/{dark,light}-imageXX.png.
 *
 * Usage: npm run screenshots
 *
 * Uses an isolated FORTIVPNGUI_CONFIG_DIR so ~/.fortivpngui is never touched.
 * Requires a working DISPLAY (or xvfb-run on headless CI).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const imagesDir = path.join(root, "docs", "images");
const electronBin = path.join(root, "node_modules", ".bin", "electron");

const THEMES = ["dark", "light"];

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      ...opts,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function clearPngs(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".png")) fs.unlinkSync(path.join(dir, name));
  }
}

function themeRows(theme, ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i];
    const b = ids[i + 1];
    const left = `![](docs/images/${theme}-image${a}.png)`;
    const right = b ? `![](docs/images/${theme}-image${b}.png)` : "";
    rows.push(`| ${left} | ${right} |`);
  }
  return rows;
}

function updateReadme(byTheme) {
  const readmePath = path.join(root, "README.md");
  let readme = fs.readFileSync(readmePath, "utf8");

  const sections = [];
  for (const theme of THEMES) {
    const ids = byTheme[theme] || [];
    if (ids.length === 0) continue;
    const label = theme === "dark" ? "Dark" : "Light";
    sections.push(
      `### ${label}`,
      "",
      "| Screenshot | Screenshot |",
      "|:---:|:---:|",
      ...themeRows(theme, ids),
      ""
    );
  }

  const block = [
    "## Screenshots",
    "",
    "PNG files live in [`docs/images/`](docs/images/). Regenerate with `npm run screenshots` (English UI, isolated config, **dark** and **light** themes).",
    "",
    ...sections,
  ].join("\n");

  const re = /## Screenshots\r?\n[\s\S]*?(?=\r?\n---\r?\n)/;
  if (!re.test(readme)) {
    throw new Error("Could not find ## Screenshots section in README.md");
  }
  const replaced = readme.replace(re, `${block}\n`);
  if (replaced !== readme) {
    fs.writeFileSync(readmePath, replaced);
    const total = THEMES.reduce((n, t) => n + (byTheme[t]?.length || 0), 0);
    console.log(`[screenshots] README.md updated (${total} images, dark + light tables)`);
  } else {
    console.log(`[screenshots] README.md already up to date`);
  }
}

async function main() {
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    console.warn("[screenshots] No DISPLAY/WAYLAND_DISPLAY set; capture may fail. Use xvfb-run if headless.");
  }

  console.log("[screenshots] building app…");
  await run("npm", ["run", "build"]);

  console.log("[screenshots] clearing docs/images/*.png…");
  clearPngs(imagesDir);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fortivpngui-shots-"));
  const configDir = path.join(tmpRoot, ".fortivpngui");
  fs.mkdirSync(configDir, { recursive: true });

  const env = {
    ...process.env,
    FORTIVPNGUI_CONFIG_DIR: configDir,
    FORTIVPNGUI_CAPTURE_SCREENSHOTS: imagesDir,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  };

  console.log(`[screenshots] config: ${configDir}`);
  console.log(`[screenshots] output: ${imagesDir}`);
  console.log("[screenshots] launching Electron capture…");

  await new Promise((resolve, reject) => {
    const child = spawn(electronBin, ["--no-sandbox", "."], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`electron exited with ${code}`));
    });
  });

  const byTheme = { dark: [], light: [] };
  for (const name of fs.readdirSync(imagesDir).sort()) {
    const m = name.match(/^(dark|light)-image(\d+)\.png$/);
    if (!m) continue;
    byTheme[m[1]].push(m[2]);
  }
  for (const theme of THEMES) {
    byTheme[theme].sort();
  }

  const total = byTheme.dark.length + byTheme.light.length;
  if (total === 0) {
    throw new Error("No dark-/light-imageXX.png files were written");
  }
  console.log(
    `[screenshots] generated: dark=${byTheme.dark.map((i) => `image${i}`).join(", ")}; light=${byTheme.light.map((i) => `image${i}`).join(", ")}`
  );
  updateReadme(byTheme);

  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
