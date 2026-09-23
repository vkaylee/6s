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

/** Resolves a location code to its localized name with a safe code fallback. */
export function resolveLocationNameByCode(
  locations: { code: string; name_vi?: string; name_zh?: string; name_en?: string }[],
  code: string,
  fallbackName = "",
  locale?: SupportedLocale,
): string {
  const location = locations.find((item) => item.code === code);
  return resolveLocationName(location ?? { name_vi: fallbackName }, locale) || code;
}

export function resolveIssueLocationName(
  issue: {
    location_name?: string;
    location_name_vi_snapshot?: string | null;
    location_name_zh_snapshot?: string | null;
    location_name_en_snapshot?: string | null;
  },
  locale?: SupportedLocale,
): string {
  const snapshot = {
    name_vi: issue.location_name_vi_snapshot || undefined,
    name_zh: issue.location_name_zh_snapshot || undefined,
    name_en: issue.location_name_en_snapshot || undefined,
  };
  return resolveLocationName(snapshot, locale) || issue.location_name || "";
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
  const vi = tag.name_vi || tag.label_vi || "";
  const zh = tag.name_zh || tag.label_zh || "";
  const en = tag.name_en || tag.label_en || "";
  const fallback = tag.code || tag.tag_code || "";

  if (targetLocale === "en") return en || vi || zh || fallback;
  if (targetLocale === "zh") return zh || vi || en || fallback;
  return vi || zh || en || fallback;
}
