import type { ThemeMode } from "./types.js";

export type ResolvedThemeMode = "dark" | "light";

export interface ThemeTokens {
  background: string;
  surface: string;
  surfaceLowest: string;
  surfaceLow: string;
  surfaceContainer: string;
  surfaceHigh: string;
  surfaceHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  nav: string;
  primary: string;
  primaryContainer: string;
  primaryHover: string;
  secondary: string;
  secondaryContainer: string;
  tertiary: string;
  error: string;
  errorContainer: string;
  connected: string;
  connecting: string;
  disconnected: string;
}

export const darkTokens: ThemeTokens = {
  background: "#131313",
  surface: "#131313",
  surfaceLowest: "#0e0e0e",
  surfaceLow: "#1c1b1b",
  surfaceContainer: "#201f1f",
  surfaceHigh: "#2a2a2a",
  surfaceHighest: "#353534",
  onSurface: "#e5e2e1",
  onSurfaceVariant: "#c1c6d5",
  outline: "#8b919e",
  outlineVariant: "#414753",
  nav: "#001c3a",
  primary: "#a7c8ff",
  primaryContainer: "#0074d9",
  primaryHover: "#005eb2",
  secondary: "#afc8f0",
  secondaryContainer: "#2f486a",
  tertiary: "#ffb68e",
  error: "#ffb4ab",
  errorContainer: "#93000a",
  connected: "#32d583",
  connecting: "#ffca5c",
  disconnected: "#8b919e",
};

export const lightTokens: ThemeTokens = {
  background: "#f4f6fa",
  surface: "#ffffff",
  surfaceLowest: "#eef1f6",
  surfaceLow: "#f0f2f6",
  surfaceContainer: "#ffffff",
  surfaceHigh: "#e8ecf2",
  surfaceHighest: "#dce2ec",
  onSurface: "#1a1d24",
  onSurfaceVariant: "#5c6478",
  outline: "#8a93a8",
  outlineVariant: "#c8d0de",
  nav: "#e8f0fb",
  primary: "#005eb8",
  primaryContainer: "#0066cc",
  primaryHover: "#004d99",
  secondary: "#3d5a80",
  secondaryContainer: "#d6e4f5",
  tertiary: "#c45c00",
  error: "#ba1a1a",
  errorContainer: "#ffdad6",
  connected: "#1b7f4a",
  connecting: "#9a6700",
  disconnected: "#8a93a8",
};

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

export function themeTokensForMode(mode: ThemeMode, prefersDark: boolean): ThemeTokens {
  return resolveThemeMode(mode, prefersDark) === "dark" ? darkTokens : lightTokens;
}
