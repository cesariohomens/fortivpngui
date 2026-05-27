import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { parseLanguageSetting, resolveLocale, type LanguageSetting, type LocaleCode } from "../../shared/locale";
import { createTranslator, translateStatus as translateStatusFn, type TranslateFn } from "./i18n";

interface I18nContextValue {
  language: LanguageSetting;
  locale: LocaleCode;
  systemLocale: string;
  t: TranslateFn;
  translateStatus: (state: string) => string;
  setLanguage: (language: LanguageSetting) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useTranslation() {
  const { t, translateStatus, locale, language } = useI18n();
  return { t, translateStatus, locale, language };
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageSetting>("system");
  const [systemLocale, setSystemLocale] = useState("en");

  useEffect(() => {
    void (async () => {
      if (typeof window.fvpn === "undefined") return;
      try {
        const [sys, settings] = await Promise.all([window.fvpn.getSystemLocale(), window.fvpn.getSettings()]);
        setSystemLocale(sys);
        setLanguageState(parseLanguageSetting(settings.language));
      } catch {
        /* keep defaults */
      }
    })();
  }, []);

  const locale = useMemo(() => resolveLocale(language, systemLocale), [language, systemLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const translateStatus = useCallback((state: string) => translateStatusFn(t, state), [t]);

  const setLanguage = useCallback((next: LanguageSetting) => {
    setLanguageState(next);
    void window.fvpn?.saveSettings?.({ language: next }).catch((e) => console.warn("[i18n] save failed", e));
  }, []);

  const value = useMemo(
    () => ({ language, locale, systemLocale, t, translateStatus, setLanguage }),
    [language, locale, systemLocale, t, translateStatus, setLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
