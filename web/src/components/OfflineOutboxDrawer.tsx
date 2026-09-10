import { useEffect, useState } from "react";
import {
  type DraftIssue,
  type DraftResolve,
  deleteDraftIssue,
  deleteDraftResolve,
  getAllDraftIssues,
  getAllDraftResolves,
} from "../db/indexeddb.ts";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import { haptics } from "../utils/haptics.ts";

interface OfflineOutboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onResolveConflict?: (resolve: DraftResolve) => void;
}

export function OfflineOutboxDrawer({
  isOpen,
  onClose,
  onResolveConflict,
}: OfflineOutboxDrawerProps) {
  const { t } = useI18nStore();
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [resolves, setResolves] = useState<DraftResolve[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allIssues, allResolves] = await Promise.all([
        getAllDraftIssues(),
        getAllDraftResolves(),
      ]);
      setIssues(allIssues);
      setResolves(allResolves);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleRetryAll = () => {
    haptics.success();
    syncEngine.triggerSync();
    setTimeout(loadData, 500);
  };

  const handleDeleteIssue = async (clientUuid: string) => {
    const ok = await modalDialog.confirm(t("outbox.discard_issue_confirm"), undefined, true);
    if (ok) {
      await deleteDraftIssue(clientUuid);
      loadData();
    }
  };

  const handleDeleteResolve = async (resolvedUuid: string) => {
    const ok = await modalDialog.confirm(t("outbox.discard_resolve_confirm"), undefined, true);
    if (ok) {
      await deleteDraftResolve(resolvedUuid);
      loadData();
    }
  };

  const total = issues.length + resolves.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 h-full flex flex-col shadow-2xl border-l border-zinc-200 dark:border-zinc-800">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {t("outbox.title", { total })}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("outbox.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 min-w-[44px] min-h-[44px] flex items-center justify-center text-xl font-bold"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading && (
            <div className="text-center py-8 text-zinc-500 text-sm">{t("outbox.reading")}</div>
          )}

          {!isLoading && total === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {t("outbox.empty_title")}
              </p>
              <p className="text-xs text-zinc-500 mt-1">{t("outbox.empty_desc")}</p>
            </div>
          )}

          {issues.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                {t("outbox.new_issues_title", { count: issues.length })}
              </h3>
              <div className="space-y-2">
                {issues.map((item) => (
                  <div
                    key={item.client_uuid}
                    className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center font-bold text-sm text-zinc-800 dark:text-zinc-200">
                        {item.category}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                          {item.location_code}
                        </div>
                        <div className="text-xs text-zinc-500 truncate max-w-[180px]">
                          {item.description || t("outbox.no_desc")}
                        </div>
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                            item.sync_status === "SYNCING"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : item.sync_status === "FAILED"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                          }`}
                        >
                          {item.sync_status}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`${t("outbox.discard")} ${item.location_code}`}
                      onClick={() => handleDeleteIssue(item.client_uuid)}
                      className="text-xs text-rose-600 hover:text-rose-800 font-bold p-2 min-h-[44px]"
                    >
                      {t("outbox.discard")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resolves.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                {t("outbox.resolves_title", { count: resolves.length })}
              </h3>
              <div className="space-y-2">
                {resolves.map((item) => (
                  <div
                    key={item.resolved_client_uuid}
                    className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        {t("outbox.resolve_issue_title", { id: item.issue_id })}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {t("outbox.expected_version", { version: item.expected_version })}
                      </div>
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                          item.sync_status === "CONFLICT"
                            ? "bg-amber-500 text-white animate-pulse"
                            : item.sync_status === "SYNCING"
                              ? "bg-blue-100 text-blue-800"
                              : item.sync_status === "FAILED"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-zinc-100 text-zinc-800"
                        }`}
                      >
                        {item.sync_status}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {item.sync_status === "CONFLICT" && onResolveConflict && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onResolveConflict(item);
                          }}
                          className="bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold min-h-[44px]"
                        >
                          {t("outbox.resolve_conflict")}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`${t("outbox.discard")} ${item.issue_id}`}
                        onClick={() => handleDeleteResolve(item.resolved_client_uuid)}
                      >
                        {t("outbox.discard")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {total > 0 && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleRetryAll}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold py-3.5 px-4 rounded-xl min-h-[56px] flex items-center justify-center space-x-2 shadow-lg"
            >
              <span>🔄 {t("outbox.retry_all")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
