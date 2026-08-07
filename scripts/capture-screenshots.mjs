#!/usr/bin/env node
/**
 * Capture English UI screenshots into docs/images/imageXX.png.
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

function updateReadme(count) {
  const readmePath = path.join(root, "README.md");
  let readme = fs.readFileSync(readmePath, "utf8");
  const rows = [];
  for (let i = 1; i <= count; i += 2) {
    const a = String(i).padStart(2, "0");
    const b = i + 1 <= count ? String(i + 1).padStart(2, "0") : null;
    if (b) {
      rows.push(`| ![](docs/images/image${a}.png) | ![](docs/images/image${b}.png) |`);
    } else {
      rows.push(`| ![](docs/images/image${a}.png) | |`);
    }
  }
  const block = [
    "## Screenshots",
    "",
    "PNG files live in [`docs/images/`](docs/images/). Regenerate with `npm run screenshots` (English UI, isolated config).",
    "",
    "| Screenshot | Screenshot |",
    "|:---:|:---:|",
    ...rows,
    "",
  ].join("\n");

  const re = /## Screenshots\r?\n[\s\S]*?(?=\r?\n---\r?\n)/;
  if (!re.test(readme)) {
    throw new Error("Could not find ## Screenshots section in README.md");
  }
  const replaced = readme.replace(re, `${block}\n`);
  if (replaced !== readme) {
    fs.writeFileSync(readmePath, replaced);
    console.log(`[screenshots] README.md updated (${count} images)`);
  } else {
    console.log(`[screenshots] README.md already up to date (${count} images)`);
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

  const pngs = fs
    .readdirSync(imagesDir)
    .filter((n) => /^image\d+\.png$/.test(n))
    .sort();
  if (pngs.length === 0) {
    throw new Error("No imageXX.png files were written");
  }
  console.log(`[screenshots] generated: ${pngs.join(", ")}`);
  updateReadme(pngs.length);

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
