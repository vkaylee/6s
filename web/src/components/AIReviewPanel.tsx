import { useEffect, useState } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { type IssueItem, resolveTagLabel, type TagItem } from "../types/index.ts";

export type AIReviewResult = {
  verdict: "OK" | "REVIEW" | "MISMATCH";
  feedback: string;
  suggestion: { category?: string; cause_type?: string; tags?: string[] };
  used_vision: boolean;
};
type FollowUpTurn = { question: string; answer: string };

type AIReviewPanelProps = {
  review: AIReviewResult;
  currentIssue: IssueItem;
  tags: TagItem[];
  value: string;
  isAskingFollowUp: boolean;
  pendingFollowUpQuestion: string | null;
  streamingFollowUpAnswer: string;
  followUpCount: number;
  followUpLimit: number;
  followUpHistory: FollowUpTurn[];
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
  isAskingFollowUp,
  pendingFollowUpQuestion,
  streamingFollowUpAnswer,
  followUpCount,
  followUpLimit,
  followUpHistory,
  onFollowUpQuestionChange,
  onApplySuggestion,
  onFollowUp,
}: AIReviewPanelProps) {
  const { t, locale } = useI18nStore();
  const [displayedFeedback, setDisplayedFeedback] = useState("");
  const [isFeedbackRevealing, setIsFeedbackRevealing] = useState(Boolean(review.feedback));
  useEffect(() => {
    if (!review.feedback || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayedFeedback(review.feedback);
      setIsFeedbackRevealing(false);
      return;
    }
    let index = 0;
    let timeoutId: number | undefined;
    setDisplayedFeedback("");
    setIsFeedbackRevealing(true);
    const revealNext = () => {
      index += 1;
      setDisplayedFeedback(review.feedback.slice(0, index));
      if (index < review.feedback.length) {
        timeoutId = window.setTimeout(revealNext, 16);
      } else {
        setIsFeedbackRevealing(false);
      }
    };
    timeoutId = window.setTimeout(revealNext, 16);
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [review.feedback]);
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
  const limitReached = followUpCount >= followUpLimit;

  return (
    <div
      className={`animate-fade-in space-y-2 rounded-xl border p-3 text-xs [animation-duration:300ms] ${panelClass}`}
    >
      <span
        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-black text-white ${verdictClass}`}
      >
        {t(`issue_detail.ai_review_verdict_${review.verdict.toLowerCase()}`)}
      </span>
      {review.feedback && (
        <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{displayedFeedback}</p>
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
            const tagName = matchedTag ? resolveTagLabel(matchedTag, locale) : tagCode;
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
      {followUpHistory.length > 0 && (
        <div className="space-y-2" role="log" aria-label={t("issue_detail.ai_follow_up_title")}>
          {followUpHistory.map((turn) => (
            <div key={`${turn.question}-${turn.answer}`} className="space-y-1">
              <p className="ml-4 rounded-lg bg-violet-100 px-3 py-2 text-zinc-800 dark:bg-violet-950/50 dark:text-zinc-200">
                {turn.question}
              </p>
              <p className="mr-4 whitespace-pre-wrap rounded-lg bg-white/70 px-3 py-2 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
                {turn.answer}
              </p>
            </div>
          ))}
        </div>
      )}
      {(pendingFollowUpQuestion || isAskingFollowUp) && (
        <div className="space-y-1" role="log" aria-live="polite">
          {pendingFollowUpQuestion && (
            <p className="ml-4 rounded-lg bg-violet-100 px-3 py-2 text-zinc-800 dark:bg-violet-950/50 dark:text-zinc-200">
              {pendingFollowUpQuestion}
            </p>
          )}
          {isAskingFollowUp && (
            <p className="mr-4 whitespace-pre-wrap rounded-lg bg-white/70 px-3 py-2 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
              {streamingFollowUpAnswer || t("issue_detail.ai_follow_up_loading")}
            </p>
          )}
        </div>
      )}
      {!isAskingFollowUp && !isFeedbackRevealing && (
        <div className="space-y-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-700/70">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">
              {t("issue_detail.ai_follow_up_title")}
            </p>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {followUpCount}/{followUpLimit}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(event) => onFollowUpQuestionChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onFollowUp();
              }}
              maxLength={500}
              disabled={limitReached}
              placeholder={t("issue_detail.ai_follow_up_placeholder")}
              aria-label={t("issue_detail.ai_follow_up_title")}
              className="min-h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            />
            <button
              type="button"
              className="min-h-9 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onFollowUp()}
              disabled={!value.trim() || limitReached}
            >
              {t("issue_detail.ai_follow_up_send")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
