import { useI18nStore } from "../i18n/index.ts";
import { useThemeStore } from "../store/themeStore.ts";

export function NavActions() {
  const { locale, setLocale, t } = useI18nStore();
  const { isDark, toggleTheme } = useThemeStore();

  return (
    <div className="flex items-center space-x-1.5" data-testid="nav-actions">
      <button
        type="button"
        data-testid="lang-toggle"
        onClick={() => {
          const nextLocale = locale === "vi" ? "en" : locale === "en" ? "zh" : "vi";
          setLocale(nextLocale);
        }}
        className="px-2 py-1 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[11px] font-black flex items-center justify-center border border-zinc-200 dark:border-zinc-700 uppercase transition-colors min-w-[34px]"
        title={t("nav.language")}
      >
        {locale}
      </button>

      <button
        type="button"
        data-testid="theme-toggle"
        onClick={toggleTheme}
        className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold flex items-center justify-center border border-zinc-200 dark:border-zinc-700 transition-colors"
        title={isDark ? t("nav.theme_light") : t("nav.theme_dark")}
      >
        {isDark ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
