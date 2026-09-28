import type { ProposedTagItem, TagItem } from "../../types/index.ts";
import { AnimatedLoadingText, MarkdownText } from "./AIReviewMarkdown.tsx";

type Translate = (path: string, params?: Record<string, string | number>) => string;
type FollowUpTurn = { question: string; answer: string };

interface AIFollowUpCardProps {
  tags: TagItem[];
  proposedTags?: ProposedTagItem[];
  locale: "vi" | "en" | "zh";
  value: string;
  isAskingFollowUp: boolean;
  pendingFollowUpQuestion: string | null;
  streamingFollowUpAnswer: string;
  followUpCount: number;
  followUpLimit: number;
  followUpHistory: FollowUpTurn[];
  isFeedbackRevealing: boolean;
  t: Translate;
  onFollowUpQuestionChange: (question: string) => void;
  onFollowUp: (question?: string) => void;
}

export function AIFollowUpCard({
  tags,
  proposedTags,
  locale,
  value,
  isAskingFollowUp,
  pendingFollowUpQuestion,
  streamingFollowUpAnswer,
  followUpCount,
  followUpLimit,
  followUpHistory,
  isFeedbackRevealing,
  t,
  onFollowUpQuestionChange,
  onFollowUp,
}: AIFollowUpCardProps) {
  const limitReached = followUpCount >= followUpLimit;
  return (
    <>
      {followUpHistory.length > 0 && (
        <div className="space-y-2" role="log" aria-label={t("issue_detail.ai_follow_up_title")}>
          {followUpHistory.map((turn) => (
            <div key={`${turn.question}-${turn.answer}`} className="space-y-1">
              <p className="ml-4 rounded-lg bg-violet-100 px-3 py-2 text-zinc-800 dark:bg-violet-950/50 dark:text-zinc-200">
                {turn.question}
              </p>
              <p className="mr-4 rounded-lg bg-white/70 px-3 py-2 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
                <MarkdownText
                  text={turn.answer}
                  tags={tags}
                  proposedTags={proposedTags}
                  locale={locale}
                />
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
            <p className="mr-4 rounded-lg bg-white/70 px-3 py-2 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
              {streamingFollowUpAnswer ? (
                <>
                  <MarkdownText
                    text={streamingFollowUpAnswer}
                    tags={tags}
                    proposedTags={proposedTags}
                    locale={locale}
                  />
                  <span
                    className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-violet-500 align-text-bottom"
                    aria-hidden="true"
                  />
                </>
              ) : (
                <AnimatedLoadingText text={t("issue_detail.ai_follow_up_loading")} />
              )}
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
              className="min-h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            />
            <button
              type="button"
              className="min-h-9 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onFollowUp()}
              disabled={!value.trim() || limitReached}
            >
              {t("issue_detail.ai_follow_up_send")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
