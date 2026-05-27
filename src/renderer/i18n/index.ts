import type { LocaleCode } from "../../../shared/locale";
import { en, type Messages } from "./en";
import { pt } from "./pt";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { de } from "./de";

export type { Messages };
export { en };

const catalogs: Record<LocaleCode, Messages> = { en, pt, es, fr, it, de };

export function getMessages(locale: LocaleCode): Messages {
  return catalogs[locale] ?? en;
}

type Params = Record<string, string | number>;

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object" || !(p in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function createTranslator(locale: LocaleCode) {
  const messages = getMessages(locale);
  const fallback = en;
  return (key: string, params?: Params): string => {
    const template = getNested(messages as unknown as Record<string, unknown>, key) ?? getNested(fallback as unknown as Record<string, unknown>, key) ?? key;
    return interpolate(template, params);
  };
}

export type TranslateFn = ReturnType<typeof createTranslator>;

export function translateStatus(t: TranslateFn, state: string): string {
  if (state === "connected") return t("status.connected");
  if (state === "connecting") return t("status.connecting");
  if (state === "disconnected") return t("status.disconnected");
  return state;
}

export const LOCALE_FLAGS: Record<LocaleCode, string> = {
  en: "🇬🇧",
  pt: "🇵🇹",
  es: "🇪🇸",
  fr: "🇫🇷",
  it: "🇮🇹",
  de: "🇩🇪",
};

export const LOCALE_LABEL_KEYS: Record<LocaleCode, keyof Messages["settings"]> = {
  en: "languageEn",
  pt: "languagePt",
  es: "languageEs",
  fr: "languageFr",
  it: "languageIt",
  de: "languageDe",
};
