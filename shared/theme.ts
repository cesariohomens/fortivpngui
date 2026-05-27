import type { ThemeMode } from "./types.js";

export function parseThemeMode(raw: unknown): ThemeMode {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "light" || s === "system") return s;
  return "dark";
}
