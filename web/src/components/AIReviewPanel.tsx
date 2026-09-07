import { useI18nStore } from "../i18n/index.ts";
import { type IssueItem, resolveI18n, type TagItem } from "../types/index.ts";

export type AIReviewResult = {
  verdict: "OK" | "REVIEW" | "MISMATCH";
  feedback: string;
  suggestion: { category?: string; cause_type?: string; tags?: string[] };
  suggested_questions?: string[];
  used_vision: boolean;
};
type AIAnswer = { answer: string };

type AIReviewPanelProps = {
  review: AIReviewResult;
  currentIssue: IssueItem;
  tags: TagItem[];
  value: string;
  answer: AIAnswer | null;
  isAskingFollowUp: boolean;
  onFollowUpQuestionChange: (question: string) => void;
  onApplySuggestion: (patch: Record<string, unknown>) => void;
  onFollowUp: (question?: string) => void;
};

const actionClass =
  "inline-flex min-h-7 items-center gap-1 rounded-md border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-700 shadow-2xs transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:bg-zinc-800 dark:text-violet-300 dark:hover:bg-violet-950/60";

export function AIReviewPanel({
  review,
  currentIssue,
  tags,
  value,
  answer,
  isAskingFollowUp,
  onFollowUpQuestionChange,
  onApplySuggestion,
  onFollowUp,
}: AIReviewPanelProps) {
  const { t, locale } = useI18nStore();
  const panelClass =
    review.verdict === "OK"
      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900"
      : review.verdict === "MISMATCH"
        ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900"
        : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900";
  const verdictClass =
    review.verdict === "OK"
      ? "bg-emerald-600"
      : review.verdict === "MISMATCH"
        ? "bg-rose-600"
        : "bg-amber-500 text-zinc-950";
  const appliedTags = new Set(currentIssue.tags ?? []);
  const questionClass =
    "rounded-md border border-zinc-300 px-2 py-1 text-[11px] leading-4 text-zinc-700 transition hover:border-violet-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";
  return (
    <div className={`p-3 rounded-xl border text-xs space-y-2 ${panelClass}`}>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black text-white ${verdictClass}`}
      >
        {t(`issue_detail.ai_review_verdict_${review.verdict.toLowerCase()}`)}
      </span>
      {review.feedback && (
        <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{review.feedback}</p>
      )}
      {(review.suggestion.category || review.suggestion.cause_type) && (
        <div className="flex flex-wrap gap-1.5">
          {review.suggestion.category && (
            <button
              type="button"
              className={actionClass}
              onClick={() => onApplySuggestion({ category: review.suggestion.category })}
            >
              {t("issue_detail.ai_review_suggested_category")}: {review.suggestion.category} ·{" "}
              {t("issue_detail.ai_review_apply")}
            </button>
          )}
          {review.suggestion.cause_type && (
            <button
              type="button"
              className={actionClass}
              onClick={() => onApplySuggestion({ cause_type: review.suggestion.cause_type })}
            >
              {t("issue_detail.ai_review_suggested_cause")}: {review.suggestion.cause_type} ·{" "}
              {t("issue_detail.ai_review_apply")}
            </button>
          )}
        </div>
      )}
      {review.suggestion.tags && review.suggestion.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span>{t("issue_detail.ai_review_suggested_tags")}:</span>
          {review.suggestion.tags.map((tagCode) => {
            const matchedTag = tags.find((tg) => (tg.tag_code || tg.code) === tagCode);
            const tagName = matchedTag
              ? resolveI18n(
                  {
                    vi: matchedTag.label_vi || matchedTag.name_vi || tagCode,
                    zh: matchedTag.label_zh || matchedTag.name_zh || tagCode,
                    en: matchedTag.label_en || matchedTag.name_en || tagCode,
                  },
                  locale,
                )
              : tagCode;
            return (
              <button
                key={tagCode}
                type="button"
                className={actionClass}
                disabled={appliedTags.has(tagCode)}
                onClick={() => onApplySuggestion({ tags: [...appliedTags, tagCode] })}
              >
                {appliedTags.has(tagCode)
                  ? `✓ #${tagName} · ${t("issue_detail.ai_review_apply")}`
                  : `#${tagName} · ${t("issue_detail.ai_review_apply")}`}
              </button>
            );
          })}
        </div>
      )}
      <div className="border-t border-zinc-200/70 dark:border-zinc-700/70 pt-2 space-y-2">
        <p className="font-semibold text-zinc-700 dark:text-zinc-300">
          {t("issue_detail.ai_follow_up_title")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {review.suggested_questions?.map((question) => (
            <button
              key={question}
              type="button"
              className={questionClass}
              onClick={() => onFollowUp(question)}
              disabled={isAskingFollowUp}
            >
              {question}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(event) => onFollowUpQuestionChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onFollowUp();
            }}
            maxLength={500}
            placeholder={t("issue_detail.ai_follow_up_placeholder")}
            aria-label={t("issue_detail.ai_follow_up_title")}
            className="min-h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          />
          <button
            type="button"
            className="min-h-9 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onFollowUp()}
            disabled={isAskingFollowUp || !value.trim()}
          >
            {isAskingFollowUp
              ? t("issue_detail.ai_follow_up_loading")
              : t("issue_detail.ai_follow_up_send")}
          </button>
        </div>
        {answer && <p className="whitespace-pre-wrap">{answer.answer}</p>}
      </div>
    </div>
  );
}
