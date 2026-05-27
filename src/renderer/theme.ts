import { alpha, createTheme, type Theme } from "@mui/material";
import type { ThemeMode } from "../../shared/types";
import { parseThemeMode } from "../../shared/theme";

export type { ThemeMode };
export type ResolvedThemeMode = "dark" | "light";

export { parseThemeMode };

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

/** Subset used by App layout helpers (derived from ThemeTokens). */
export interface AppColors {
  background: string;
  nav: string;
  surface: string;
  surfaceLow: string;
  surfaceHigh: string;
  outline: string;
  text: string;
  muted: string;
  primary: string;
  primaryContainer: string;
  secondaryContainer: string;
  error: string;
  warning: string;
  connected: string;
  disconnected: string;
}

export function tokensToAppColors(t: ThemeTokens): AppColors {
  return {
    background: t.background,
    nav: t.nav,
    surface: t.surfaceContainer,
    surfaceLow: t.surfaceLow,
    surfaceHigh: t.surfaceHigh,
    outline: t.outlineVariant,
    text: t.onSurface,
    muted: t.onSurfaceVariant,
    primary: t.primary,
    primaryContainer: t.primaryContainer,
    secondaryContainer: t.secondaryContainer,
    error: t.error,
    warning: t.tertiary,
    connected: t.connected,
    disconnected: t.disconnected,
  };
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

export function createAppTheme(tokens: ThemeTokens, resolved: ResolvedThemeMode): Theme {
  const dialogShadow = resolved === "dark" ? "0 8px 24px rgba(0, 0, 0, 0.4)" : "0 8px 24px rgba(26, 29, 36, 0.12)";

  return createTheme({
    palette: {
      mode: resolved,
      background: {
        default: tokens.background,
        paper: tokens.surfaceContainer,
      },
      primary: {
        main: tokens.primaryContainer,
        light: tokens.primary,
        dark: tokens.primaryHover,
        contrastText: resolved === "dark" ? "#fdfbff" : "#ffffff",
      },
      secondary: {
        main: tokens.secondary,
        dark: tokens.secondaryContainer,
        contrastText: resolved === "dark" ? "#163152" : "#1a3a5c",
      },
      error: {
        main: tokens.error,
        dark: tokens.errorContainer,
        contrastText: resolved === "dark" ? "#690005" : "#ffffff",
      },
      warning: {
        main: tokens.connecting,
        contrastText: resolved === "dark" ? "#331200" : "#ffffff",
      },
      success: {
        main: tokens.connected,
        contrastText: resolved === "dark" ? "#04160c" : "#ffffff",
      },
      text: {
        primary: tokens.onSurface,
        secondary: tokens.onSurfaceVariant,
      },
      divider: tokens.outlineVariant,
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      h4: { fontSize: 24, fontWeight: 700, lineHeight: "32px", letterSpacing: 0 },
      h5: { fontSize: 18, fontWeight: 700, lineHeight: "24px", letterSpacing: 0 },
      h6: { fontSize: 15, fontWeight: 700, lineHeight: "22px", letterSpacing: 0 },
      body1: { fontSize: 15, lineHeight: "22px", letterSpacing: 0 },
      body2: { fontSize: 13, lineHeight: "20px", letterSpacing: 0 },
      caption: { fontSize: 12, lineHeight: "16px", letterSpacing: 0 },
      button: { textTransform: "none", fontWeight: 700, letterSpacing: 0 },
      overline: { fontSize: 12, fontWeight: 700, lineHeight: "16px", letterSpacing: 0 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: tokens.background,
            color: tokens.onSurface,
            scrollbarColor: `${tokens.outlineVariant} ${tokens.surfaceLowest}`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: tokens.surfaceContainer,
            borderColor: tokens.outlineVariant,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            border: `1px solid ${tokens.outlineVariant}`,
            boxShadow: dialogShadow,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 32,
            paddingInline: 12,
          },
          containedPrimary: {
            backgroundColor: tokens.primaryContainer,
            "&:hover": { backgroundColor: tokens.primaryHover },
          },
          outlined: {
            borderColor: tokens.outlineVariant,
            color: tokens.onSurface,
            "&:hover": {
              borderColor: tokens.outline,
              backgroundColor: alpha(tokens.primary, 0.08),
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            color: tokens.onSurfaceVariant,
            "&:hover": {
              color: tokens.onSurface,
              backgroundColor: alpha(tokens.primary, 0.1),
            },
          },
          sizeSmall: {
            width: 30,
            height: 30,
            padding: 4,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            minHeight: 34,
            paddingTop: 4,
            paddingBottom: 4,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: "small",
          variant: "outlined",
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: tokens.surfaceLow,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: tokens.outlineVariant,
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: tokens.outline,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: tokens.primaryContainer,
              borderWidth: 1,
            },
          },
          input: {
            fontSize: 13,
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          select: { fontSize: 13, minHeight: "18px", paddingTop: 7, paddingBottom: 7 },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            border: `1px solid ${tokens.outlineVariant}`,
            backgroundColor: tokens.surfaceHigh,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            minHeight: 30,
            paddingTop: 5,
            paddingBottom: 5,
            fontSize: 13,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: alpha(tokens.outlineVariant, 0.8),
            fontSize: 13,
            padding: "6px 10px",
          },
          head: {
            color: tokens.onSurfaceVariant,
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0,
            backgroundColor: tokens.surfaceLow,
            padding: "7px 10px",
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&:hover": {
              backgroundColor: alpha(tokens.primary, 0.06),
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            backgroundColor: tokens.primary,
            height: 2,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            textTransform: "none",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 6,
            backgroundColor: tokens.surfaceHighest,
            color: tokens.onSurface,
            border: `1px solid ${tokens.outlineVariant}`,
            fontSize: 12,
          },
        },
      },
    },
  });
}

/** Legacy browser storage key (migrated once into main.conf). */
export const THEME_MODE_STORAGE_KEY = "fortivpngui-theme-mode";

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}
