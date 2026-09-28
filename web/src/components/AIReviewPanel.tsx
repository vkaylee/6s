import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18nStore } from "../i18n/index.ts";
import type { IssueItem, ProposedTagItem, TagItem } from "../types/index.ts";
import { AIFollowUpCard } from "./ai-review/AIFollowUpCard.tsx";
import { MarkdownText } from "./ai-review/AIReviewMarkdown.tsx";
import { AISuggestionCard } from "./ai-review/AISuggestionCard.tsx";

export type AIReviewResult = {
  verdict: "OK" | "REVIEW" | "MISMATCH";
  feedback: string;
  suggestion: {
    category?: string;
    cause_type?: string;
    tags?: string[];
    proposed_tags?: ProposedTagItem[];
  };
  used_vision: boolean;
};

type FollowUpTurn = { question: string; answer: string };

type AIReviewPanelProps = {
  review: AIReviewResult;
  currentIssue: IssueItem;
  tags: TagItem[];
  value: string;
  selectedProposedTags: ProposedTagItem[];
  onSelectedProposedTagsChange: (tags: ProposedTagItem[]) => void;
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

export function AIReviewPanel({
  review,
  currentIssue,
  tags,
  value,
  selectedProposedTags,
  onSelectedProposedTagsChange,
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
  const [isExpanded, setIsExpanded] = useState(true);
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

  return (
    <section
      id="ai-review-panel"
      className={`animate-fade-in space-y-2 rounded-xl border p-3 text-xs [animation-duration:300ms] ${panelClass}`}
      aria-labelledby="ai-review-title"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3
            id="ai-review-title"
            className="min-w-0 break-words text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-200"
          >
            {t("issue_detail.ai_review_panel_title")}
          </h3>
          <span
            className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-black text-white ${verdictClass}`}
          >
            {t(`issue_detail.ai_review_verdict_${review.verdict.toLowerCase()}`)}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex min-h-9 self-start items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-zinc-700 transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-200 dark:hover:bg-white/10 sm:self-auto"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          aria-controls="ai-review-content"
        >
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>
            {t(isExpanded ? "issue_detail.ai_review_collapse" : "issue_detail.ai_review_expand")}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div id="ai-review-content" className="space-y-2">
          {review.feedback && (
            <p className="text-zinc-800 dark:text-zinc-200">
              <MarkdownText
                text={displayedFeedback}
                tags={tags}
                proposedTags={review.suggestion.proposed_tags}
                locale={locale}
              />
            </p>
          )}

          <AISuggestionCard
            category={review.suggestion.category}
            causeType={review.suggestion.cause_type}
            tags={review.suggestion.tags}
            proposedTags={review.suggestion.proposed_tags}
            selectedProposedTags={selectedProposedTags}
            appliedTags={appliedTags}
            tagsCatalog={tags}
            locale={locale}
            t={t}
            onApplySuggestion={onApplySuggestion}
            onSelectedProposedTagsChange={onSelectedProposedTagsChange}
          />

          <AIFollowUpCard
            tags={tags}
            proposedTags={review.suggestion.proposed_tags}
            locale={locale}
            value={value}
            isAskingFollowUp={isAskingFollowUp}
            pendingFollowUpQuestion={pendingFollowUpQuestion}
            streamingFollowUpAnswer={streamingFollowUpAnswer}
            followUpCount={followUpCount}
            followUpLimit={followUpLimit}
            followUpHistory={followUpHistory}
            isFeedbackRevealing={isFeedbackRevealing}
            t={t}
            onFollowUpQuestionChange={onFollowUpQuestionChange}
            onFollowUp={onFollowUp}
          />
        </div>
      )}
    </section>
  );
}
