import { FormControl, InputLabel, MenuItem, Select, type SelectChangeEvent } from "@mui/material";
import { LOCALE_CODES, type LanguageSetting } from "../../shared/locale";
import { LOCALE_FLAGS, LOCALE_LABEL_KEYS } from "./i18n";
import { useI18n, useTranslation } from "./I18nProvider";
import { LanguageRow, languageFlag, languageLabel } from "./languageUi";

export function LanguageSelect({ value, onChange }: { value: LanguageSetting; onChange: (v: LanguageSetting) => void }) {
  const { t } = useTranslation();
  const { systemLocale } = useI18n();

  const handleChange = (e: SelectChangeEvent<LanguageSetting>) => {
    onChange(e.target.value as LanguageSetting);
  };

  return (
    <FormControl fullWidth size="small">
      <InputLabel id="language-select-label">{t("settings.language")}</InputLabel>
      <Select
        labelId="language-select-label"
        label={t("settings.language")}
        value={value}
        onChange={handleChange}
        renderValue={(selected) => (
          <LanguageRow flag={languageFlag(selected, systemLocale)} label={languageLabel(t, selected)} />
        )}
      >
        <MenuItem value="system">
          <LanguageRow flag={languageFlag("system", systemLocale)} label={t("settings.languageSystem")} />
        </MenuItem>
        {LOCALE_CODES.map((code) => (
          <MenuItem key={code} value={code}>
            <LanguageRow flag={LOCALE_FLAGS[code]} label={t(`settings.${LOCALE_LABEL_KEYS[code]}`)} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
