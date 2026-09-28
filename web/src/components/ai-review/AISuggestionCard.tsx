import { type ProposedTagItem, resolveTagLabel, type TagItem } from "../../types/index.ts";

type Translate = (path: string, params?: Record<string, string | number>) => string;

const actionClass =
  "inline-flex min-h-7 items-center gap-1 rounded-md border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-700 shadow-2xs transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:bg-zinc-800 dark:text-violet-300 dark:hover:bg-violet-950/60";

interface AISuggestionCardProps {
  category?: string;
  causeType?: string;
  tags?: string[];
  proposedTags?: ProposedTagItem[];
  selectedProposedTags: ProposedTagItem[];
  appliedTags: Set<string>;
  tagsCatalog: TagItem[];
  locale: "vi" | "en" | "zh";
  t: Translate;
  onApplySuggestion: (patch: Record<string, unknown>) => void;
  onSelectedProposedTagsChange: (tags: ProposedTagItem[]) => void;
}

export function AISuggestionCard({
  category,
  causeType,
  tags,
  proposedTags,
  selectedProposedTags,
  appliedTags,
  tagsCatalog,
  locale,
  t,
  onApplySuggestion,
  onSelectedProposedTagsChange,
}: AISuggestionCardProps) {
  return (
    <>
      {(category || causeType) && (
        <div className="flex flex-wrap gap-1.5">
          {category && (
            <button
              type="button"
              className={actionClass}
              onClick={() => onApplySuggestion({ category })}
            >
              {t("issue_detail.ai_review_suggested_category")}: {category} ·{" "}
              {t("issue_detail.ai_review_apply")}
            </button>
          )}
          {causeType && (
            <button
              type="button"
              className={actionClass}
              onClick={() => onApplySuggestion({ cause_type: causeType })}
            >
              {t("issue_detail.ai_review_suggested_cause")}: {causeType} ·{" "}
              {t("issue_detail.ai_review_apply")}
            </button>
          )}
        </div>
      )}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span>{t("issue_detail.ai_review_suggested_tags")}:</span>
          {tags.map((tagCode) => {
            const matchedTag = tagsCatalog.find((tag) => tag.code === tagCode);
            const tagName = matchedTag ? resolveTagLabel(matchedTag, locale) : tagCode;
            const applied = appliedTags.has(tagCode);
            return (
              <button
                key={tagCode}
                type="button"
                className={actionClass}
                disabled={applied}
                onClick={() => onApplySuggestion({ tags: [...appliedTags, tagCode] })}
              >
                {applied
                  ? `✓ #${tagName} · ${t("issue_detail.ai_review_apply")}`
                  : `#${tagName} · ${t("issue_detail.ai_review_apply")}`}
              </button>
            );
          })}
        </div>
      )}
      {proposedTags && proposedTags.length > 0 && (
        <div className="space-y-1.5">
          <span>{t("issue_detail.ai_review_proposed_tags")}:</span>
          <div className="flex flex-wrap gap-1.5">
            {proposedTags.map((proposal) => {
              const selected = selectedProposedTags.some(
                (item) => item.name_vi === proposal.name_vi && item.category === proposal.category,
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
    </>
  );
}
