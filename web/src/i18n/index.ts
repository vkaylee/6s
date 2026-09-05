import { create } from "zustand";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import zh from "./locales/zh.json";

export type SupportedLocale = "vi" | "en" | "zh";

export type TranslationDict = typeof vi;

const dictionaries: Record<SupportedLocale, TranslationDict> = {
  vi,
  en,
  zh,
};

interface I18nState {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

const STORAGE_KEY = "app_locale";

function getInitialLocale(): SupportedLocale {
  if (typeof window === "undefined") return "vi";
  const stored = localStorage.getItem(STORAGE_KEY) as SupportedLocale | null;
  if (stored && (stored === "vi" || stored === "en" || stored === "zh")) {
    return stored;
  }
  return "vi";
}

function resolvePath(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export const useI18nStore = create<I18nState>((set, get) => ({
  locale: getInitialLocale(),
  setLocale: (locale: SupportedLocale) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    }
    set({ locale });
  },
  t: (path: string, params?: Record<string, string | number>) => {
    const { locale } = get();
    const currentDict = dictionaries[locale] ?? dictionaries.vi;
    let template = resolvePath(currentDict, path) ?? resolvePath(dictionaries.vi, path) ?? path;

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        template = template.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
      }
    }
    return template;
  },
}));

export function t(path: string, params?: Record<string, string | number>): string {
  return useI18nStore.getState().t(path, params);
}
