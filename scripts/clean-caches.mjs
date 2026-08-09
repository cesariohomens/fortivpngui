#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = os.homedir();

const targets = [
  path.join(root, "dist"),
  path.join(root, "dist-electron"),
  path.join(root, "node_modules", ".vite"),
  path.join(root, "node_modules", ".cache"),
  ...[
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "blob_storage",
    "Shared Dictionary",
    "Service Worker",
    "Session Storage",
  ].map((name) => path.join(home, ".config", "fortivpngui", name)),
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
}
