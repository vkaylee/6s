import { Link } from "wouter";
import { PageContainer } from "../components/PageContainer.tsx";

interface AppNavigationProps {
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function AppNavigation({ t }: AppNavigationProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-30">
      <PageContainer className="flex items-center justify-between gap-3">
        <Link
          href="/issues/new"
          className="flex-1 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2 shadow-xl shadow-rose-600/30 transition-transform"
        >
          <span className="text-xl">📸</span>
          <span>{t("issue.create").toUpperCase()}</span>
        </Link>
      </PageContainer>
    </div>
  );
}
