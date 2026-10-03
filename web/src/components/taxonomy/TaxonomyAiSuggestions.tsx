import { Check, Clock3, Sparkles } from "lucide-react";
import { useI18nStore } from "../../i18n/index.ts";
import {
  CauseType,
  IssueCategory,
  type ProposedTagItem,
  resolveTagLabel,
  type TagItem,
  TagStatus,
} from "../../types/index.ts";
import { normalizeSearchText } from "../../utils/tagSearch.ts";

export interface TaxonomyAiSuggestionState {
  existing_tags: string[];
  proposed_tags: ProposedTagItem[];
  category?: string | null;
  cause_type?: CauseType | string | null;
}

interface TaxonomyAiSuggestionsProps {
  aiError: string | null;
  aiLoading: boolean;
  aiRequested: boolean;
  aiSuggestions: TaxonomyAiSuggestionState;
  tags: TagItem[];
  selectedTags: string[];
  currentCategory?: IssueCategory | null;
  currentCauseType?: CauseType | null;
  onTagClick: (tag: TagItem) => void;
  onAddCustomTag?: (tag: TagItem) => void;
  onToggleTag: (tagCode: string) => void;
  onSelectCategory: (category: IssueCategory) => void;
  onSelectCauseType?: (causeType: CauseType) => void;
}

export function TaxonomyAiSuggestions({
  aiError,
  aiLoading,
  aiRequested,
  aiSuggestions,
  tags,
  selectedTags,
  currentCategory,
  currentCauseType,
  onTagClick,
  onAddCustomTag,
  onToggleTag,
  onSelectCategory,
  onSelectCauseType,
}: TaxonomyAiSuggestionsProps) {
  const { t, locale } = useI18nStore();
  const hasClassification = Boolean(aiSuggestions.category || aiSuggestions.cause_type);
  const hasTags = aiSuggestions.existing_tags.length > 0 || aiSuggestions.proposed_tags.length > 0;

  if (aiError) {
    return (
      <div
        role="alert"
        className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
      >
        {aiError}
      </div>
    );
  }

  if (!aiLoading && aiRequested && !hasClassification && !hasTags) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        {t("issue.ai_no_suggestions")}
      </div>
    );
  }

  if (!hasClassification && !hasTags) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-zinc-200/90 bg-white/70 p-3 dark:border-zinc-700 dark:bg-zinc-950/30">
      {hasClassification && (
        <section aria-labelledby="ai-classification-title" className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300"
              aria-hidden="true"
            />
            <h4
              id="ai-classification-title"
              className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
            >
              {t("issue.ai_suggested_classification")}
            </h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {aiSuggestions.category && (
              <button
                type="button"
                onClick={() => onSelectCategory(aiSuggestions.category as IssueCategory)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors ${
                  currentCategory === aiSuggestions.category
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-violet-300 hover:bg-violet-50/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-violet-700"
                }`}
              >
                {currentCategory === aiSuggestions.category ? (
                  <Check
                    className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                )}
                <span>
                  {t("issue.ai_category_label")}: {aiSuggestions.category}
                </span>
              </button>
            )}
            {aiSuggestions.cause_type && (
              <button
                type="button"
                onClick={() => onSelectCauseType?.(aiSuggestions.cause_type as CauseType)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors ${
                  currentCauseType === aiSuggestions.cause_type
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-violet-300 hover:bg-violet-50/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-violet-700"
                }`}
              >
                {currentCauseType === aiSuggestions.cause_type ? (
                  <Check
                    className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                )}
                <span>
                  {t("issue.ai_cause_label")}:{" "}
                  {aiSuggestions.cause_type === CauseType.BEHAVIOR
                    ? t("issue.badge_behavior")
                    : t("issue.badge_condition")}
                </span>
              </button>
            )}
          </div>
        </section>
      )}
      {aiSuggestions.existing_tags.length > 0 && (
        <section aria-labelledby="ai-approved-tags-title" className="space-y-2">
          <h4
            id="ai-approved-tags-title"
            className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
          >
            {t("issue.ai_suggest_existing_title")}
          </h4>
          <div className="flex flex-wrap gap-2">
            {aiSuggestions.existing_tags.map((code) => {
              const tag = tags.find((item) => (item.code || item.tag_code) === code);
              if (!tag) return null;
              const checked = selectedTags.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onTagClick(tag)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                    checked
                      ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-violet-300 hover:bg-violet-50/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  }`}
                >
                  {checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  <span>#{resolveTagLabel(tag, locale)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {aiSuggestions.proposed_tags.length > 0 && (
        <section aria-labelledby="ai-proposed-tags-title" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4
              id="ai-proposed-tags-title"
              className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
            >
              {t("issue.ai_suggest_proposed_title")}
            </h4>
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              {t("issue.ai_pending_review")}
            </span>
          </div>
          <div className="space-y-2">
            {aiSuggestions.proposed_tags.map((proposal) => {
              const code =
                `c_${normalizeSearchText(proposal.name_vi).replace(/[^a-z0-9]+/g, "_")}`.slice(
                  0,
                  48,
                );
              const checked = selectedTags.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    if (!checked) {
                      onAddCustomTag?.({
                        ...proposal,
                        code,
                        use_count: 0,
                        status: TagStatus.PENDING,
                      });
                    }
                    onToggleTag(code);
                    if (
                      proposal.category &&
                      Object.values(IssueCategory).includes(proposal.category as IssueCategory)
                    ) {
                      onSelectCategory(proposal.category as IssueCategory);
                    }
                  }}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs font-bold transition-colors ${
                    checked
                      ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
                      : "border-amber-300 bg-amber-50/40 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200"
                  }`}
                >
                  {checked ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 overflow-wrap-anywhere">
                    {resolveTagLabel(proposal, locale)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
