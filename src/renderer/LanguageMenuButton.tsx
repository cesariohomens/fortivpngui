import LanguageIcon from "@mui/icons-material/Language";
import { IconButton, Menu, Tooltip } from "@mui/material";
import { useState } from "react";
import type { LanguageSetting } from "../../shared/locale";
import { useI18n, useTranslation } from "./I18nProvider";
import { LanguageMenuItems, languageFlag } from "./languageUi";

export function LanguageMenuButton() {
  const { t } = useTranslation();
  const { language, systemLocale, setLanguage } = useI18n();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const pick = (next: LanguageSetting) => {
    setLanguage(next);
    void window.fvpn?.saveSettings?.({ language: next }).catch((e) => console.warn("[i18n] save failed", e));
    setAnchor(null);
  };

  return (
    <>
      <Tooltip title={t("settings.language")}>
        <IconButton
          size="small"
          aria-label={t("settings.language")}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ fontSize: "1.05rem", lineHeight: 1, minWidth: 34 }}
        >
          {language === "system" ? <LanguageIcon fontSize="small" /> : <span>{languageFlag(language, systemLocale)}</span>}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        disableScrollLock
        transitionDuration={{ enter: 0, exit: 0 }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <LanguageMenuItems t={t} systemLocale={systemLocale} selected={language} onSelect={pick} />
      </Menu>
    </>
  );
}
