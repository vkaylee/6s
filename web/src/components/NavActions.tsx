import { useI18nStore } from "../i18n/index.ts";
import { useThemeStore } from "../store/themeStore.ts";

export function NavActions() {
  const { locale, setLocale, t } = useI18nStore();
  const { isDark, toggleTheme } = useThemeStore();

  return (
    <div className="flex items-center space-x-2" data-testid="nav-actions">
      <button
        type="button"
        data-testid="lang-toggle"
        onClick={() => {
          const nextLocale = locale === "vi" ? "en" : locale === "en" ? "zh" : "vi";
          setLocale(nextLocale);
        }}
        className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-black min-h-[44px] flex items-center justify-center border border-zinc-200 dark:border-zinc-700 uppercase"
        title={t("nav.language")}
      >
        {locale}
      </button>

      <button
        type="button"
        data-testid="theme-toggle"
        onClick={toggleTheme}
        className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-sm font-bold min-w-[44px] min-h-[44px] flex items-center justify-center border border-zinc-200 dark:border-zinc-700"
        title={isDark ? t("nav.theme_light") : t("nav.theme_dark")}
      >
        {isDark ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
