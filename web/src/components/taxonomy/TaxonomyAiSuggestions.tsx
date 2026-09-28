import { useI18nStore } from "../../i18n/index.ts";
import {
  IssueCategory,
  type ProposedTagItem,
  resolveTagLabel,
  type TagItem,
} from "../../types/index.ts";
import { normalizeSearchText } from "../../utils/tagSearch.ts";

interface TaxonomyAiSuggestionsProps {
  aiError: string | null;
  aiLoading: boolean;
  aiRequested: boolean;
  aiSuggestions: {
    existing_tags: string[];
    proposed_tags: ProposedTagItem[];
  };
  tags: TagItem[];
  selectedTags: string[];
  onTagClick: (tag: TagItem) => void;
  onAddCustomTag?: (tag: TagItem) => void;
  onToggleTag: (tagCode: string) => void;
  onSelectCategory: (category: IssueCategory) => void;
}

export function TaxonomyAiSuggestions({
  aiError,
  aiLoading,
  aiRequested,
  aiSuggestions,
  tags,
  selectedTags,
  onTagClick,
  onAddCustomTag,
  onToggleTag,
  onSelectCategory,
}: TaxonomyAiSuggestionsProps) {
  const { t, locale } = useI18nStore();

  if (aiError) {
    return (
      <div className="mx-4 mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        {aiError}
      </div>
    );
  }

  if (
    !aiLoading &&
    aiRequested &&
    aiSuggestions.existing_tags.length === 0 &&
    aiSuggestions.proposed_tags.length === 0
  ) {
    return (
      <div className="mx-4 mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        {t("issue.ai_no_suggestions")}
      </div>
    );
  }

  if (aiSuggestions.existing_tags.length === 0 && aiSuggestions.proposed_tags.length === 0) {
    return null;
  }

  return (
    <div className="mx-4 mt-3 max-h-[30dvh] overflow-y-auto space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/20">
      {aiSuggestions.existing_tags.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-bold text-violet-800 dark:text-violet-300">
            {t("issue.ai_suggest_existing_title")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {aiSuggestions.existing_tags.map((code) => {
              const tag = tags.find((item) => (item.code || item.tag_code) === code);
              if (!tag) return null;
              const checked = selectedTags.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onTagClick(tag)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold min-h-[36px] ${
                    checked
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-violet-200 bg-white text-violet-900 dark:border-violet-800 dark:bg-zinc-900 dark:text-violet-200"
                  }`}
                >
                  {checked ? "✓ " : "+ "}#{resolveTagLabel(tag, locale)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {aiSuggestions.proposed_tags.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-bold text-violet-800 dark:text-violet-300">
            {t("issue.ai_suggest_proposed_title")}
          </p>
          <div className="flex flex-wrap gap-1.5">
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
                    if (!checked)
                      onAddCustomTag?.({
                        ...proposal,
                        code,
                        use_count: 0,
                        status: "PENDING",
                      });
                    onToggleTag(code);
                    if (
                      proposal.category &&
                      Object.values(IssueCategory).includes(proposal.category as IssueCategory)
                    ) {
                      onSelectCategory(proposal.category as IssueCategory);
                    }
                  }}
                  className={`rounded-lg border border-dashed px-2.5 py-1.5 text-xs font-bold min-h-[36px] ${
                    checked
                      ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                      : "border-amber-300 bg-white text-amber-900 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-200"
                  }`}
                >
                  {checked ? "✓ " : "+ "}⏳ {resolveTagLabel(proposal, locale)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
