import { useEffect, useState } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { type SyncProgress, syncEngine } from "../sync/syncEngine.ts";
import { NavActions } from "./NavActions.tsx";

interface StatusBarProps {
  onOpenDrawer: () => void;
}

export function StatusBar({ onOpenDrawer }: StatusBarProps) {
  const { t } = useI18nStore();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [progress, setProgress] = useState<SyncProgress>({
    total: 0,
    completed: 0,
    currentName: "",
    percent: 100,
    isSyncing: false,
    conflictCount: 0,
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubscribe = syncEngine.subscribe((p) => {
      setProgress(p);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, []);

  const hasPending = progress.total > 0;

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 select-none shadow-sm">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex items-center space-x-2 text-left focus:outline-none"
        >
          <span
            className={`w-3.5 h-3.5 rounded-full ${
              isOnline
                ? hasPending
                  ? "bg-amber-500 animate-pulse"
                  : "bg-emerald-500"
                : "bg-rose-500"
            }`}
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              {isOnline ? (hasPending ? t("nav.syncing") : t("nav.online")) : t("nav.offline")}
            </span>
            {hasPending ? (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                Còn {progress.total - progress.completed} bản ghi chờ gửi
              </span>
            ) : (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Chạm để xem hàng đợi
              </span>
            )}
          </div>
        </button>

        <div className="flex items-center space-x-2">
          {progress.conflictCount > 0 && (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs px-2.5 py-1 rounded-full font-bold border border-amber-300 dark:border-amber-700 animate-bounce"
            >
              ⚠️ {progress.conflictCount}
            </button>
          )}
          <NavActions />
        </div>
      </div>

      {progress.isSyncing && (
        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1 relative overflow-hidden">
          <div
            className="bg-blue-600 h-1 transition-all duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
    </header>
  );
}
