import { Languages, Moon, Sun } from "lucide-react";
import { useI18nStore } from "../i18n/index.ts";
import { useThemeStore } from "../store/themeStore.ts";
import { InstallPrompt } from "./InstallPrompt.tsx";
export function NavActions() {
  const { locale, setLocale, t } = useI18nStore();
  const { isDark, toggleTheme } = useThemeStore();

  return (
    <div className="flex items-center space-x-1.5" data-testid="nav-actions">
      <InstallPrompt />

      <button
        type="button"
        data-testid="lang-toggle"
        onClick={() => {
          const nextLocale = locale === "vi" ? "en" : locale === "en" ? "zh" : "vi";
          setLocale(nextLocale);
        }}
        className="flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-transparent px-1.5 text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        title={t("nav.language")}
        aria-label={`${t("nav.language")}: ${locale}`}
      >
        <Languages className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-[10px] font-medium uppercase tracking-wide">{locale}</span>
      </button>

      <button
        type="button"
        data-testid="theme-toggle"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? t("nav.theme_light") : t("nav.theme_dark")}
        onClick={toggleTheme}
        title={isDark ? t("nav.theme_light") : t("nav.theme_dark")}
        className="relative block h-[22px] w-10 shrink-0 rounded-[11px] border border-zinc-300 bg-zinc-100 transition-colors hover:border-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-zinc-600 dark:bg-zinc-800"
      >
        <span
          className={`absolute left-px top-px flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-full bg-white shadow-sm transition-transform duration-200 dark:bg-zinc-950 ${
            isDark ? "translate-x-[18px]" : "translate-x-0"
          }`}
        >
          {isDark ? (
            <Moon className="h-3 w-3 text-zinc-600 dark:text-zinc-200" aria-hidden="true" />
          ) : (
            <Sun className="h-3 w-3 text-amber-500" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  );
}
