import type { SupportedLocale } from "../i18n/index.ts";

export type I18nObject = Record<SupportedLocale, string>;

// ponytail: fallback vi hardcoded, add configurable default when multi-tenant.
export function resolveI18n(text: I18nObject | string, locale: SupportedLocale): string {
  if (typeof text === "string") return text;
  return text[locale] ?? text.vi;
}
