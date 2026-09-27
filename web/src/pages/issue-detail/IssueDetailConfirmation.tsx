import { AlertTriangle, ClipboardList, X } from "lucide-react";
import type React from "react";
import { type IssueItem, IssueStatus, type TeamItem } from "../../types/index.ts";
import type { ConfirmAction } from "./types.ts";

export interface IssueDetailConfirmationView {
  showConfirmAction: ConfirmAction | null;
  t: (path: string, params?: Record<string, string | number>) => string;
  setShowConfirmAction: React.Dispatch<React.SetStateAction<ConfirmAction | null>>;
  deleteReason: string;
  setDeleteReason: React.Dispatch<React.SetStateAction<string>>;
  rejectReason: string;
  setRejectReason: React.Dispatch<React.SetStateAction<string>>;
  mutationsOnline: boolean;
  causeType: "BEHAVIOR" | "CONDITION";
  scoreRating: number;
  setScoreRating: React.Dispatch<React.SetStateAction<number>>;
  canVerifyCause: boolean;
  currentIssue: IssueItem;
  closeCauseTeamId: number | null;
  setCloseCauseTeamId: React.Dispatch<React.SetStateAction<number | null>>;
  teams: TeamItem[];
  isSubmitting: boolean;
  recoveryPending: boolean;
  handleConfirmClose: () => Promise<void>;
  handleConfirmReopen: () => Promise<void>;
  handleConfirmInvalid: () => Promise<void>;
  handleConfirmDelete: () => Promise<void>;
  handleConfirmRestore: () => Promise<void>;
}
export function IssueDetailConfirmation({ view }: { view: IssueDetailConfirmationView }) {
  const {
    showConfirmAction,
    t,
    setShowConfirmAction,
    deleteReason,
    setDeleteReason,
    rejectReason,
    setRejectReason,
    mutationsOnline,
    causeType,
    scoreRating,
    setScoreRating,
    canVerifyCause,
    currentIssue,
    closeCauseTeamId,
    setCloseCauseTeamId,
    teams,
    isSubmitting,
    recoveryPending,
    handleConfirmClose,
    handleConfirmReopen,
    handleConfirmInvalid,
    handleConfirmDelete,
    handleConfirmRestore,
  } = view;
  if (!showConfirmAction) return null;
  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 space-y-3 animate-fade-in shadow-inner">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-sm text-zinc-900 dark:text-zinc-100">
          {showConfirmAction === "CLOSE"
            ? t("issue_detail.confirm_close_title")
            : showConfirmAction === "REOPEN"
              ? t("issue_detail.confirm_reopen_title")
              : showConfirmAction === IssueStatus.INVALID
                ? t("issue_detail.confirm_invalid_title")
                : showConfirmAction === "DELETE"
                  ? t("issue_detail.delete_confirm_title")
                  : t("issue_detail.restore_confirm_title")}
        </h3>
        <button
          type="button"
          onClick={() => setShowConfirmAction(null)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {showConfirmAction === "DELETE" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <p>{t("issue_detail.delete_score_warning")}</p>
          </div>
          <label className="block space-y-1 text-xs font-bold text-zinc-700 dark:text-zinc-300">
            <span>{t("issue_detail.delete_reason_label")}</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder={t("issue_detail.delete_reason_placeholder")}
              className="w-full rounded-xl border border-rose-300 bg-white p-3 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:border-rose-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          {!mutationsOnline && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("issue_detail.delete_offline")}
            </p>
          )}
        </div>
      )}
      {showConfirmAction === "RESTORE" && (
        <p className="text-xs text-zinc-700 dark:text-zinc-300">
          {t("issue_detail.delete_score_warning")}
        </p>
      )}
      {showConfirmAction === "CLOSE" && (
        <div className="space-y-3">
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 text-xs space-y-2">
            <div className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <ClipboardList
                className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
                aria-hidden="true"
              />
              <span>{t("issue_detail.close_checklist_title")}</span>
            </div>
            <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-4 h-4 dark:border-zinc-600 dark:bg-zinc-900 dark:checked:bg-blue-600 dark:focus:ring-offset-zinc-900"
              />
              <span>
                {causeType === "BEHAVIOR"
                  ? t("issue_detail.check_behavior_corrected")
                  : t("issue_detail.check_condition_resolved")}
              </span>
            </label>
            <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-4 h-4 dark:border-zinc-600 dark:bg-zinc-900 dark:checked:bg-blue-600 dark:focus:ring-offset-zinc-900"
              />
              <span>{t("issue_detail.check_recurrence_prevented")}</span>
            </label>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/70">
            <span className="block text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-2">
              {t("issue_detail.kaizen_rating_label")}
            </span>
            <div className="flex items-center space-x-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setScoreRating(star)}
                  aria-label={`${star}/5`}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 ${
                    scoreRating >= star
                      ? "bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-105"
                      : "bg-zinc-200 text-zinc-400 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-400"
                  }`}
                >
                  <span className="text-lg font-black leading-none" aria-hidden="true">
                    ★
                  </span>
                </button>
              ))}
              {scoreRating === 5 && (
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 ml-2 animate-bounce">
                  {t("issue_detail.kaizen_excellent")}
                </span>
              )}
            </div>
          </div>

          {canVerifyCause && currentIssue.cause_status === "UNVERIFIED" && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800/70 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="block text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                  {t("issue.close_cause_verification_title")}
                </span>
                <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                  {t("issue.optional_for_scoring")}
                </span>
              </div>
              <select
                value={closeCauseTeamId ?? ""}
                onChange={(event) =>
                  setCloseCauseTeamId(event.target.value ? Number(event.target.value) : null)
                }
                aria-label={t("issue.close_cause_verification_title")}
                className="min-h-[44px] w-full rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-amber-400"
              >
                <option
                  value=""
                  className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100"
                >
                  {t("issue.no_cause_team")}
                </option>
                {teams
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100"
                    >
                      {item.name} ({item.code})
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}

      {showConfirmAction === IssueStatus.INVALID && (
        <div className="space-y-2">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">{t("issue_detail.invalid_warning")}</p>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                {t("issue_detail.invalid_guidance")}
              </p>
            </div>
          </div>
          <textarea
            rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("issue_detail.reason_placeholder")}
            className="w-full bg-white dark:bg-zinc-900 border border-rose-300 dark:border-rose-700 rounded-xl p-3 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      )}

      {showConfirmAction === "REOPEN" && (
        <textarea
          rows={2}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder={t("issue_detail.reason_placeholder")}
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-3 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSubmitting || recoveryPending}
          onClick={() => {
            if (showConfirmAction === "CLOSE") handleConfirmClose();
            if (showConfirmAction === "REOPEN") handleConfirmReopen();
            if (showConfirmAction === IssueStatus.INVALID) handleConfirmInvalid();
            if (showConfirmAction === "DELETE") handleConfirmDelete();
            if (showConfirmAction === "RESTORE") handleConfirmRestore();
          }}
          className={`flex-1 font-black py-3 rounded-xl min-h-[48px] text-sm shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
            showConfirmAction === "CLOSE"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-emerald-600/20"
              : showConfirmAction === IssueStatus.INVALID
                ? "bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-500 shadow-rose-600/20"
                : "bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900"
          }`}
        >
          {t("common.confirm")}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => setShowConfirmAction(null)}
          className="flex-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-xl min-h-[48px] text-sm transition disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
