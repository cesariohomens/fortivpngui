/** Supported UI locales (English is the fallback). */
export type LocaleCode = "en" | "pt" | "es" | "fr" | "it" | "de";

/** Stored in `gui/language` — `system` follows the OS locale. */
export type LanguageSetting = "system" | LocaleCode;

export const LOCALE_CODES: LocaleCode[] = ["en", "pt", "es", "fr", "it", "de"];

export function parseLanguageSetting(raw: unknown): LanguageSetting {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "system") return "system";
  if ((LOCALE_CODES as string[]).includes(s)) return s as LocaleCode;
  return "system";
}

/** Map OS locale (e.g. `pt-PT`, `de-DE`) to a supported locale. */
function resolveLocaleFromSystem(systemLocale: string): LocaleCode {
  const base = systemLocale.trim().toLowerCase().split(/[-_]/)[0];
  if (base === "pt") return "pt";
  if (base === "es") return "es";
  if (base === "fr") return "fr";
  if (base === "it") return "it";
  if (base === "de") return "de";
  if (base === "en") return "en";
  return "en";
}

export function resolveLocale(setting: LanguageSetting, systemLocale: string): LocaleCode {
  if (setting === "system") return resolveLocaleFromSystem(systemLocale);
  return setting;
}
