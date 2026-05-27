import ComputerIcon from "@mui/icons-material/Computer";
import { Box, MenuItem } from "@mui/material";
import { LOCALE_CODES, resolveLocale, type LanguageSetting } from "../../shared/locale";
import { LOCALE_FLAGS, LOCALE_LABEL_KEYS } from "./i18n";
import type { TranslateFn } from "./i18n";

export function LanguageRow({ flag, label }: { flag: React.ReactNode; label: string }) {
  return (
    <Box display="flex" alignItems="center" gap={1}>
      <Box component="span" sx={{ fontSize: "1.1rem", lineHeight: 1, width: 22, textAlign: "center", flexShrink: 0 }}>
        {flag}
      </Box>
      <span>{label}</span>
    </Box>
  );
}

export function languageLabel(t: TranslateFn, setting: LanguageSetting): string {
  if (setting === "system") return t("settings.languageSystem");
  return t(`settings.${LOCALE_LABEL_KEYS[setting]}`);
}

export function languageFlag(setting: LanguageSetting, systemLocale: string): React.ReactNode {
  if (setting === "system") return <ComputerIcon sx={{ fontSize: 18 }} />;
  return LOCALE_FLAGS[resolveLocale(setting, systemLocale)];
}

export function LanguageMenuItems({
  t,
  systemLocale,
  selected,
  onSelect,
}: {
  t: TranslateFn;
  systemLocale: string;
  selected: LanguageSetting;
  onSelect: (value: LanguageSetting) => void;
}) {
  const options: LanguageSetting[] = ["system", ...LOCALE_CODES];
  return (
    <>
      {options.map((value) => (
        <MenuItem key={value} selected={value === selected} onClick={() => onSelect(value)}>
          <LanguageRow flag={languageFlag(value, systemLocale)} label={languageLabel(t, value)} />
        </MenuItem>
      ))}
    </>
  );
}
