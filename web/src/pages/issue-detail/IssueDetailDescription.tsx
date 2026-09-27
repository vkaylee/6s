import { Languages, Loader2, Sparkles } from "lucide-react";
import { TagLabel } from "../../components/TagLabel.tsx";
import type { IssueItem, TagItem } from "../../types/index.ts";
import type { ModalTab } from "./types.ts";

export interface IssueDetailDescriptionView {
  currentIssue: IssueItem;
  tags?: TagItem[];
  activeTab: ModalTab;
  locale: string;
  dateLocale: string;
  translatedDesc: string | null;
  showOriginal: boolean;
  translatedLangRef: React.MutableRefObject<string>;
  aiEnabled: boolean | null;
  isReviewing: boolean;
  handleAIReview: () => Promise<void>;
  isTranslating: boolean;
  handleTranslate: () => Promise<void>;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function IssueDetailDescription({
  currentIssue,
  tags = [],
  activeTab,
  locale,
  dateLocale,
  translatedDesc,
  showOriginal,
  translatedLangRef,
  aiEnabled,
  isReviewing,
  handleAIReview,
  isTranslating,
  handleTranslate,
  t,
}: IssueDetailDescriptionView) {
  if (activeTab !== "overview" && activeTab !== "ai") return null;

  return (
    <div className="space-y-2.5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-700 dark:bg-zinc-800/80">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {t("issue_detail.reporter_label")} <strong>{currentIssue.creator_name}</strong>
          </span>
          <span>{new Date(currentIssue.created_at).toLocaleDateString(dateLocale)}</span>
        </div>
      </div>
      {translatedDesc && translatedLangRef.current === locale && !showOriginal ? (
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1 rounded-md border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 shadow-2xs dark:border-indigo-800/80 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Sparkles
              className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400"
              aria-hidden="true"
            />
            <span>{t("issue_detail.translated_badge", { lang: locale.toUpperCase() })}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {translatedDesc}
          </p>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {currentIssue.description || t("issue.no_description")}
        </p>
      )}
      {currentIssue.tags && currentIssue.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {currentIssue.tags.map((tagCode) => (
            <TagLabel
              key={tagCode}
              code={tagCode}
              tags={currentIssue.tag_details?.length ? currentIssue.tag_details : tags}
              className="inline-flex items-center rounded-md bg-zinc-200/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-700/80 dark:text-zinc-300"
            />
          ))}
        </div>
      )}
      <div className="border-t border-zinc-100 pt-3 dark:border-zinc-700/70">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          <span>{t("issue_detail.ai_tools_label")}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {aiEnabled === false ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              {t("issue_detail.ai_disabled_reason")}
            </p>
          ) : (
            <button
              type="button"
              onClick={handleAIReview}
              disabled={aiEnabled !== true || isReviewing}
              aria-disabled={aiEnabled !== true}
              aria-busy={isReviewing}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-violet-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[132px] dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              {isReviewing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isReviewing ? t("issue_detail.ai_reviewing") : t("issue_detail.ai_review_btn")}
              </span>
            </button>
          )}
          {currentIssue.description && (
            <button
              type="button"
              onClick={handleTranslate}
              disabled={aiEnabled !== true || isTranslating}
              aria-disabled={aiEnabled !== true}
              aria-busy={isTranslating}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 text-sm font-semibold text-indigo-700 transition-[background-color,border-color,transform] duration-150 hover:border-indigo-400 hover:bg-indigo-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[132px] dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/70"
            >
              {isTranslating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Languages className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isTranslating
                  ? t("issue_detail.translating")
                  : translatedDesc && translatedLangRef.current === locale
                    ? showOriginal
                      ? t("issue_detail.translate_btn")
                      : t("issue_detail.show_original")
                    : t("issue_detail.translate_btn")}
              </span>
            </button>
          )}
        </div>
      </div>
      {currentIssue.reject_reason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <strong>{t("issue_detail.reject_reason_label")}</strong> {currentIssue.reject_reason}
        </div>
      )}
    </div>
  );
}
