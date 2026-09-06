import { Link } from "wouter";
import { NavActions } from "../components/NavActions.tsx";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";

export function NotFoundPage() {
  const { t } = useI18nStore();

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans flex flex-col justify-between">
      <header className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <PageContainer className="flex items-center justify-between">
          <span className="text-sm font-black text-zinc-800 dark:text-zinc-200">
            {t("nav.title")}
          </span>
          <NavActions />
        </PageContainer>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="text-5xl font-black text-rose-600">404</div>
          <h1 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
            {t("not_found.title")}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {t("not_found.description")}
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-black transition-transform active:scale-95 shadow-md"
            >
              ← {t("not_found.back_home")}
            </Link>
          </div>
        </div>
      </main>

      <footer className="p-4 text-center text-[11px] text-zinc-400">6S Management System</footer>
    </div>
  );
}
