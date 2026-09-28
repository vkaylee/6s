import { ConflictModal } from "../components/ConflictModal.tsx";
import type { DraftResolve } from "../db/indexeddb.ts";
import { modalDialog } from "../store/dialogStore.ts";

interface AppSyncErrorsProps {
  masterDataError?: boolean;
  issuesError?: boolean;
  onRetryMasterData: () => void;
  onRetryIssues: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function AppSyncErrors({
  masterDataError,
  issuesError,
  onRetryMasterData,
  onRetryIssues,
  t,
}: AppSyncErrorsProps) {
  return (
    <>
      {masterDataError && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-2xl p-4"
        >
          <div>
            <p className="text-sm font-bold">{t("app.master_data_error_title")}</p>
            <p className="text-xs mt-1">{t("app.master_data_error_desc")}</p>
          </div>
          <button
            type="button"
            onClick={onRetryMasterData}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {issuesError && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-2xl p-4"
        >
          <div>
            <p className="text-sm font-bold">{t("app.load_error_title")}</p>
            <p className="text-xs mt-1">{t("app.load_error_desc")}</p>
          </div>
          <button
            type="button"
            onClick={onRetryIssues}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
          >
            {t("common.retry")}
          </button>
        </div>
      )}
    </>
  );
}

interface AppLeaderboardErrorProps {
  hasError?: boolean;
  onRetry: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function AppLeaderboardError({ hasError, onRetry, t }: AppLeaderboardErrorProps) {
  if (!hasError) return null;
  return (
    <div
      role="alert"
      className="mt-2 mb-3 flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 rounded-xl px-3 py-2 text-xs font-bold"
    >
      <span className="flex-1">{t("app.leaderboard_error_desc")}</span>
      <button
        type="button"
        onClick={onRetry}
        className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase"
      >
        {t("common.retry")}
      </button>
    </div>
  );
}

interface AppConflictResolutionProps {
  conflictItem: DraftResolve | null;
  onResolve: (item: null) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function AppConflictResolution({ conflictItem, onResolve, t }: AppConflictResolutionProps) {
  if (!conflictItem) return null;
  return (
    <ConflictModal
      resolveItem={conflictItem}
      serverVersion={2}
      onOverwrite={() => {
        modalDialog.success(t("conflict.overwrite_requested"));
        onResolve(null);
      }}
      onDiscard={() => {
        onResolve(null);
      }}
      onClose={() => onResolve(null)}
    />
  );
}
