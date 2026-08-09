import { alpha, createTheme, type Theme } from "@mui/material";
import type { ResolvedThemeMode, ThemeTokens } from "../../shared/theme-tokens";

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
  secondaryContainer: string;
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
    secondaryContainer: t.secondaryContainer,
    warning: t.tertiary,
    connected: t.connected,
    disconnected: t.disconnected,
  };
}

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
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            // Flex dialogs + OverlayScrollbars hosts need a bounded height.
            minHeight: 0,
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
