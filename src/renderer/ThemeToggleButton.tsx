import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import ComputerIcon from "@mui/icons-material/Computer";
import { IconButton, Tooltip } from "@mui/material";
import { useThemeMode } from "./ThemeModeProvider";

export function ThemeToggleButton() {
  const { mode, effectiveMode, cycleMode } = useThemeMode();

  const icon =
    mode === "dark" ? <DarkModeIcon fontSize="small" /> : mode === "light" ? <LightModeIcon fontSize="small" /> : <ComputerIcon fontSize="small" />;

  const title =
    mode === "system"
      ? `Theme: System (${effectiveMode === "dark" ? "dark" : "light"}) — click for dark`
      : mode === "dark"
        ? "Theme: Dark — click for light"
        : "Theme: Light — click for system";

  return (
    <Tooltip title={title}>
      <IconButton onClick={cycleMode} aria-label={title} size="small">
        {icon}
      </IconButton>
    </Tooltip>
  );
}
