import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import ComputerIcon from "@mui/icons-material/Computer";
import { IconButton, Tooltip } from "@mui/material";
import { useThemeMode } from "./ThemeModeProvider";
import { useTranslation } from "./I18nProvider";

export function ThemeToggleButton() {
  const { mode, effectiveMode, cycleMode } = useThemeMode();
  const { t } = useTranslation();

  const icon =
    mode === "dark" ? <DarkModeIcon fontSize="small" /> : mode === "light" ? <LightModeIcon fontSize="small" /> : <ComputerIcon fontSize="small" />;

  const title =
    mode === "system"
      ? t("theme.system", { effective: effectiveMode === "dark" ? t("theme.darkLabel") : t("theme.lightLabel") })
      : mode === "dark"
        ? t("theme.dark")
        : t("theme.light");

  return (
    <Tooltip title={title}>
      <IconButton onClick={cycleMode} aria-label={title} size="small">
        {icon}
      </IconButton>
    </Tooltip>
  );
}
