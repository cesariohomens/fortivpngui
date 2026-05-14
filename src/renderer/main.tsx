import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, GlobalStyles, ThemeProvider, alpha, createTheme } from "@mui/material";
import App from "./App";

const colors = {
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
  connected: "#2fd37a",
  connecting: "#ffca5c",
  disconnected: "#8b919e",
};

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: colors.background,
      paper: colors.surfaceContainer,
    },
    primary: {
      main: colors.primaryContainer,
      light: colors.primary,
      dark: colors.primaryHover,
      contrastText: "#fdfbff",
    },
    secondary: {
      main: colors.secondary,
      dark: colors.secondaryContainer,
      contrastText: "#163152",
    },
    error: {
      main: colors.error,
      dark: colors.errorContainer,
      contrastText: "#690005",
    },
    warning: {
      main: colors.connecting,
      contrastText: "#331200",
    },
    success: {
      main: colors.connected,
      contrastText: "#04160c",
    },
    text: {
      primary: colors.onSurface,
      secondary: colors.onSurfaceVariant,
    },
    divider: colors.outlineVariant,
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
          background: colors.background,
          color: colors.onSurface,
          scrollbarColor: `${colors.outlineVariant} ${colors.surfaceLowest}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: colors.surfaceContainer,
          borderColor: colors.outlineVariant,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: `1px solid ${colors.outlineVariant}`,
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 8,
          minHeight: 34,
          paddingInline: 14,
        },
        containedPrimary: {
          backgroundColor: colors.primaryContainer,
          "&:hover": { backgroundColor: colors.primaryHover },
        },
        outlined: {
          borderColor: colors.outlineVariant,
          color: colors.onSurface,
          "&:hover": {
            borderColor: colors.outline,
            backgroundColor: alpha(colors.primary, 0.08),
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          color: colors.onSurfaceVariant,
          "&:hover": {
            color: colors.onSurface,
            backgroundColor: alpha(colors.primary, 0.1),
          },
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
          backgroundColor: colors.surfaceLow,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: colors.outlineVariant,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: colors.outline,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: colors.primaryContainer,
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
        select: { fontSize: 13 },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          border: `1px solid ${colors.outlineVariant}`,
          backgroundColor: colors.surfaceHigh,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: alpha(colors.outlineVariant, 0.8),
          fontSize: 13,
        },
        head: {
          color: colors.onSurfaceVariant,
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0,
          backgroundColor: colors.surfaceLow,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: alpha(colors.primary, 0.06),
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
          backgroundColor: colors.primary,
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
          backgroundColor: colors.surfaceHighest,
          color: colors.onSurface,
          border: `1px solid ${colors.outlineVariant}`,
          fontSize: 12,
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          "html, body, #root": {
            width: "100%",
            height: "100%",
            margin: 0,
            background: colors.background,
          },
          "*": { boxSizing: "border-box" },
          "code, pre, .mono": {
            fontFamily: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
          },
        }}
      />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
