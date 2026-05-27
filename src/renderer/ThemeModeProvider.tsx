import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CssBaseline, GlobalStyles, ThemeProvider } from "@mui/material";
import { parseThemeMode } from "../../shared/theme";
import type { ThemeMode } from "../../shared/types";
import {
  createAppTheme,
  darkTokens,
  lightTokens,
  resolveThemeMode,
  tokensToAppColors,
  THEME_MODE_STORAGE_KEY,
  type AppColors,
  type ResolvedThemeMode,
} from "./theme";

interface ThemeModeContextValue {
  mode: ThemeMode;
  effectiveMode: ResolvedThemeMode;
  cycleMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);
const AppColorsContext = createContext<AppColors>(tokensToAppColors(darkTokens));

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used within ThemeModeProvider");
  return ctx;
}

export function useAppColors(): AppColors {
  return useContext(AppColorsContext);
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [prefersDark, setPrefersDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    void (async () => {
      if (typeof window.fvpn === "undefined") return;
      try {
        const s = await window.fvpn.getSettings();
        let next = parseThemeMode(s.theme_mode);
        try {
          const legacy = localStorage.getItem(THEME_MODE_STORAGE_KEY);
          if (legacy === "light" || legacy === "system" || legacy === "dark") {
            next = legacy;
            await window.fvpn.saveSettings({ theme_mode: next });
            localStorage.removeItem(THEME_MODE_STORAGE_KEY);
          }
        } catch {
          /* ignore */
        }
        setMode(next);
      } catch {
        /* keep default dark */
      }
    })();
  }, []);

  const effectiveMode = resolveThemeMode(mode, prefersDark);
  const tokens = effectiveMode === "dark" ? darkTokens : lightTokens;
  const appColors = useMemo(() => tokensToAppColors(tokens), [effectiveMode]);
  const muiTheme = useMemo(() => createAppTheme(tokens, effectiveMode), [effectiveMode]);

  const setThemeMode = useCallback((next: ThemeMode) => {
    setMode(next);
  }, []);

  const cycleMode = useCallback(() => {
    setMode((current) => {
      const next: ThemeMode = current === "dark" ? "light" : current === "light" ? "system" : "dark";
      void window.fvpn?.saveSettings?.({ theme_mode: next }).catch((e) => console.warn("[theme] save failed", e));
      return next;
    });
  }, []);

  const modeCtx = useMemo(
    () => ({ mode, effectiveMode, cycleMode, setThemeMode }),
    [mode, effectiveMode, cycleMode, setThemeMode]
  );

  return (
    <ThemeModeContext.Provider value={modeCtx}>
      <AppColorsContext.Provider value={appColors}>
        <ThemeProvider theme={muiTheme}>
          <CssBaseline />
          <GlobalStyles
            styles={{
              "html, body, #root": {
                width: "100%",
                height: "100%",
                margin: 0,
                background: tokens.background,
              },
              "*": { boxSizing: "border-box" },
              "code, pre, .mono": {
                fontFamily: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
              },
            }}
          />
          {children}
        </ThemeProvider>
      </AppColorsContext.Provider>
    </ThemeModeContext.Provider>
  );
}
