import { type SupportedLocale, useI18nStore } from "../i18n/index.ts";

export type I18nObject = Record<SupportedLocale, string>;

// ponytail: fallback vi hardcoded, add configurable default when multi-tenant.
export function resolveI18n(text: I18nObject | string, locale?: SupportedLocale): string {
  if (typeof text === "string") return text;
  const targetLocale = locale ?? useI18nStore.getState().locale;
  return text[targetLocale] ?? text.vi;
}
