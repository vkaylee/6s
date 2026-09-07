import { type SupportedLocale, useI18nStore } from "../i18n/index.ts";

export type I18nObject = Record<SupportedLocale, string>;

// ponytail: fallback vi hardcoded, add configurable default when multi-tenant.
export function resolveI18n(text: I18nObject | string, locale?: SupportedLocale): string {
  if (typeof text === "string") return text;
  const targetLocale = locale ?? useI18nStore.getState().locale;
  return text[targetLocale] ?? text.vi;
}

export function resolveLocationName(
  location: { name_vi?: string; name_zh?: string; name_en?: string },
  locale?: SupportedLocale,
): string {
  const targetLocale = locale ?? useI18nStore.getState().locale;
  if (targetLocale === "zh") return location.name_zh || location.name_vi || location.name_en || "";
  if (targetLocale === "en") return location.name_en || location.name_vi || location.name_zh || "";
  return location.name_vi || location.name_zh || location.name_en || "";
}
export function resolveTagLabel(
  tag: {
    label_vi?: string;
    label_zh?: string;
    label_en?: string;
    name_vi?: string;
    name_zh?: string;
    name_en?: string;
    tag_code?: string;
    code?: string;
  },
  locale?: SupportedLocale,
): string {
  const targetLocale = locale ?? useI18nStore.getState().locale;
  const vi = tag.label_vi || tag.name_vi || "";
  const zh = tag.label_zh || tag.name_zh || "";
  const en = tag.label_en || tag.name_en || "";
  const fallback = tag.tag_code || tag.code || "";

  if (targetLocale === "en") return en || vi || zh || fallback;
  if (targetLocale === "zh") return zh || vi || en || fallback;
  return vi || zh || en || fallback;
}
