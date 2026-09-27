import { Ban, Camera, Check, LockKeyhole } from "lucide-react";
import { hasCapability, type UserProfile } from "../../store/authStore.ts";
import { type CauseType, IssueStatus } from "../../types/index.ts";
import type { ConfirmAction } from "./types.ts";

export interface IssueDetailActionBarView {
  status?: IssueStatus;
  isDeleted: boolean;
  canResolveIssue: boolean;
  canCloseIssue: boolean;
  closeDisabledReason: string | null;
  causeType: CauseType;
  user: UserProfile | null;
  isSubmitting: boolean;
  handleResolveOfflineOrOnline: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  setShowConfirmAction: React.Dispatch<React.SetStateAction<ConfirmAction | null>>;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function IssueDetailActionBar({
  status,
  isDeleted,
  canResolveIssue,
  canCloseIssue,
  closeDisabledReason,
  causeType,
  user,
  isSubmitting,
  handleResolveOfflineOrOnline,
  setShowConfirmAction,
  t,
}: IssueDetailActionBarView) {
  if (isDeleted) return null;

  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 lg:-mx-6 lg:-mb-6 p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:p-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-zinc-800/80 flex flex-col gap-2 shrink-0 z-10 shadow-xs">
      {status === IssueStatus.OPEN &&
        (canResolveIssue || hasCapability(user, "issue:invalidate")) && (
          <div className="flex items-stretch gap-2 w-full min-w-0">
            {canResolveIssue && (
              <label
                title={
                  causeType === "BEHAVIOR"
                    ? t("issue.photo_after_hint_behavior")
                    : t("issue.photo_after_hint_condition")
                }
                className="cursor-pointer flex-1 min-w-0 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black py-2.5 px-3 sm:px-4 rounded-2xl min-h-[56px] flex items-center justify-center shadow-md transition select-none"
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={isSubmitting}
                  onChange={handleResolveOfflineOrOnline}
                  className="hidden"
                />
                <span className="inline-flex items-center justify-center gap-2 min-w-0 text-center">
                  <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="text-xs sm:text-sm font-black tracking-wide leading-tight text-center">
                    {isSubmitting
                      ? t("issue_detail.processing_image")
                      : t("issue_detail.capture_after")}
                  </span>
                </span>
              </label>
            )}

            {hasCapability(user, "issue:invalidate") && (
              <button
                type="button"
                onClick={() => setShowConfirmAction(IssueStatus.INVALID)}
                title={t("issue_detail.invalidate_btn_label")}
                aria-label={t("issue_detail.invalidate_btn_label")}
                className={`inline-flex items-center justify-center rounded-2xl min-h-[56px] border border-rose-200 dark:border-rose-900/60 bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-98 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                  canResolveIssue
                    ? "w-14 shrink-0 px-0"
                    : "w-full py-2.5 px-4 text-xs font-bold gap-1.5"
                }`}
              >
                <Ban className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className={canResolveIssue ? "sr-only" : "inline"}>
                  {t("issue_detail.invalidate_btn_label")}
                </span>
              </button>
            )}
          </div>
        )}

      {status === IssueStatus.PENDING_REVIEW &&
        (canCloseIssue ? (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmAction("CLOSE")}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-sm py-4 px-4 rounded-2xl min-h-[56px] flex items-center justify-center space-x-1 shadow-md transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>{t("issue.approve").toUpperCase()}</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmAction("REOPEN")}
                className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 font-bold px-4 rounded-2xl min-h-[56px] text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("issue.reopen")}
              </button>
            </div>
          </div>
        ) : (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">{t("status.PENDING_REVIEW")}</p>
              <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">
                {closeDisabledReason}
              </p>
            </div>
          </div>
        ))}
    </div>
  );
}
