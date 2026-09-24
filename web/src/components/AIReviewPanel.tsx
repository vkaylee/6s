import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { type SupportedLocale, useI18nStore } from "../i18n/index.ts";
import {
  type IssueItem,
  type ProposedTagItem,
  resolveTagLabel,
  type TagItem,
} from "../types/index.ts";

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

const actionClass =
  "inline-flex min-h-7 items-center gap-1 rounded-md border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-700 shadow-2xs transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:bg-zinc-800 dark:text-violet-300 dark:hover:bg-violet-950/60";

function resolveAIResponseLocale(text: string, fallbackLocale: SupportedLocale): SupportedLocale {
  if (/[\u3400-\u9fff]/u.test(text)) return "zh";
  if (/[ăâđêôơưĂÂĐÊÔƠƯà-ỹÀ-Ỹ]/u.test(text)) return "vi";
  if (/[A-Za-z]/u.test(text)) return "en";
  return fallbackLocale;
}

function TagPill({ code, tag, locale }: { code: string; tag: TagItem; locale: SupportedLocale }) {
  const label = resolveTagLabel(tag, locale);
  return (
    <span
      className="mx-0.5 inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-200"
      title={code}
    >
      {label}
    </span>
  );
}

function renderInlineMarkdown(
  text: string,
  tags: TagItem[],
  proposedTags: ProposedTagItem[],
  locale: SupportedLocale,
): ReactNode[] {
  const parts: ReactNode[] = [];
  const tagsByAlias: Record<string, TagItem> = {};
  for (const tag of tags) {
    const aliases = [tag.code, tag.tag_code, tag.name_vi, tag.name_zh, tag.name_en];
    for (const alias of aliases) {
      if (alias?.trim()) tagsByAlias[alias.trim()] = tag;
    }
  }
  for (const proposal of proposedTags) {
    const tag: TagItem = {
      code: proposal.name_vi,
      name_vi: proposal.name_vi,
      name_zh: proposal.name_zh,
      name_en: proposal.name_en,
    };
    for (const alias of [proposal.name_vi, proposal.name_zh, proposal.name_en]) {
      if (alias?.trim()) tagsByAlias[alias.trim()] = tag;
    }
  }
  const aliases = Object.keys(tagsByAlias).sort((a, b) => b.length - a.length);
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAliases = aliases.map(escapeRegex);
  const openingWrappers = "'\"‘“([{<«‹「『（【《〈";
  const closingWrappers = "'\"’”)]}>»›」』）】》〉";
  const wrapperPattern = (wrappers: string) => `(?:${[...wrappers].map(escapeRegex).join("|")})`;
  const aliasPattern = escapedAliases.join("|");
  const wrappedTagPattern = `${wrapperPattern(openingWrappers)}[ \\t]*#?(?:${aliasPattern})[ \\t]*${wrapperPattern(closingWrappers)}`;
  const tagPattern = escapedAliases.length
    ? `(?<![\\p{L}\\p{N}_-])(?:${wrappedTagPattern}|#?(?:${aliasPattern}))(?![\\p{L}\\p{N}_-])`
    : "(?!x)x";
  const pattern = new RegExp(
    "(`[^`]+`|\\*\\*[^*]+\\*\\*|__[^_]+__|\\*[^*]+\\*|_[^_]+_|\\[[^\\]]+\\]\\(https?:\\/\\/[^)]+\\)|" +
      tagPattern +
      ")",
    "gu",
  );
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    const unwrapped = value.replace(
      new RegExp(
        `^(?:\\s|${wrapperPattern(openingWrappers)})+|(?:\\s|${wrapperPattern(closingWrappers)})+$`,
        "gu",
      ),
      "",
    );
    const directAlias = unwrapped.startsWith("#") ? unwrapped.slice(1) : unwrapped;
    const directTag = tagsByAlias[directAlias];
    const inlineAlias = value.startsWith("`") && value.endsWith("`") ? value.slice(1, -1) : "";
    const inlineTag = inlineAlias ? tagsByAlias[inlineAlias] : undefined;
    if (directTag) {
      parts.push(
        <TagPill key={`${index}-tag`} code={directAlias} tag={directTag} locale={locale} />,
      );
    } else if (inlineTag) {
      parts.push(
        <TagPill key={`${index}-tag`} code={inlineAlias} tag={inlineTag} locale={locale} />,
      );
    } else if (value.startsWith("`") && value.endsWith("`")) {
      parts.push(
        <code
          key={`${index}-code`}
          className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-700/70"
        >
          {inlineAlias}
        </code>,
      );
    } else if (
      (value.startsWith("**") && value.endsWith("**")) ||
      (value.startsWith("__") && value.endsWith("__"))
    ) {
      parts.push(<strong key={`${index}-strong`}>{value.slice(2, -2)}</strong>);
    } else if (
      (value.startsWith("*") && value.endsWith("*")) ||
      (value.startsWith("_") && value.endsWith("_"))
    ) {
      parts.push(<em key={`${index}-em`}>{value.slice(1, -1)}</em>);
    } else {
      const link = value.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      parts.push(
        link ? (
          <a
            key={`${index}-link`}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {link[1]}
          </a>
        ) : (
          value
        ),
      );
    }
    lastIndex = index + value.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function MarkdownText({
  text,
  tags,
  proposedTags = [],
  locale,
}: {
  text: string;
  tags: TagItem[];
  proposedTags?: ProposedTagItem[];
  locale: SupportedLocale;
}) {
  const lines = text.split("\n");
  const responseLocale = resolveAIResponseLocale(text, locale);
  return (
    <span className="block space-y-1">
      {lines.map((line) => {
        const heading = line.match(/^\s{0,3}#{1,3}\s+(.+)$/);
        const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        const content = heading?.[1] ?? bullet?.[1] ?? ordered?.[1] ?? line;
        const rendered = renderInlineMarkdown(content, tags, proposedTags, responseLocale);
        return (
          <Fragment key={line}>
            {heading ? (
              <strong className="block">{rendered}</strong>
            ) : bullet ? (
              <span className="block pl-3 before:mr-1 before:content-['•']">{rendered}</span>
            ) : ordered ? (
              <span className="block pl-3">{rendered}</span>
            ) : (
              rendered
            )}
            {line !== lines[lines.length - 1] && !heading && !bullet && !ordered && <br />}
          </Fragment>
        );
      })}
    </span>
  );
}

function AnimatedLoadingText({ text }: { text: string }) {
  const label = text.replace(/\.{3,}$/, "");
  return (
    <span className="inline-flex items-baseline">
      {label}
      <span className="ml-0.5 inline-flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="inline-block animate-bounce text-violet-500"
            style={{ animationDelay: `${dot * 150}ms` }}
          >
            .
          </span>
        ))}
      </span>
    </span>
  );
}

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
  const limitReached = followUpCount >= followUpLimit;

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
                const matchedTag = tags.find((tg) => tg.code === tagCode);
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
          {review.suggestion.proposed_tags && review.suggestion.proposed_tags.length > 0 && (
            <div className="space-y-1.5">
              <span>{t("issue_detail.ai_review_proposed_tags")}:</span>
              <div className="flex flex-wrap gap-1.5">
                {review.suggestion.proposed_tags.map((proposal) => {
                  const selected = selectedProposedTags.some(
                    (item) =>
                      item.name_vi === proposal.name_vi && item.category === proposal.category,
                  );
                  const tagName =
                    proposal.name_vi || proposal.name_en || proposal.name_zh || proposal.category;
                  return (
                    <button
                      key={`${proposal.category}-${proposal.name_vi}`}
                      type="button"
                      className={actionClass}
                      disabled={selected}
                      onClick={() => {
                        const next = [...selectedProposedTags, proposal];
                        onSelectedProposedTagsChange(next);
                        onApplySuggestion({ tags: [...appliedTags], proposed_tags: next });
                      }}
                    >
                      {selected ? `✓ #${tagName}` : `+ #${tagName}`} · {proposal.category}
                      {!selected && ` · ${t("issue_detail.ai_review_apply")}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
                      proposedTags={review.suggestion.proposed_tags}
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
                        proposedTags={review.suggestion.proposed_tags}
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
        </div>
      )}
    </section>
  );
}
