import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { TaxonomyAiSuggestions } from "../../components/taxonomy/TaxonomyAiSuggestions.tsx";
import type { CauseType, IssueCategory, ProposedTagItem, TagItem } from "../../types/index.ts";

interface IssueAiAssistantBannerProps {
  hasPhoto: boolean;
  hasLocation: boolean;
  hasDescription: boolean;
  aiEnabled: boolean | null;
  aiLoading: boolean;
  aiError: string | null;
  aiRequested: boolean;
  aiSuggestions: {
    existing_tags: string[];
    proposed_tags: ProposedTagItem[];
    category?: string | null;
    cause_type?: CauseType | string | null;
  };
  tags: TagItem[];
  selectedTags: string[];
  category: IssueCategory | null;
  causeType?: CauseType | null;
  onSuggest: () => void;
  onApplyAll?: () => void;
  onToggleTag: (tagCode: string) => void;
  onAddCustomTag?: (tag: TagItem) => void;
  onSelectCategory: (category: IssueCategory) => void;
  onSelectCauseType?: (causeType: CauseType) => void;
  translate: (key: string, params?: Record<string, string>) => string;
}

export function IssueAiAssistantBanner({
  hasPhoto,
  hasLocation,
  hasDescription,
  aiEnabled,
  aiLoading,
  aiError,
  aiRequested,
  aiSuggestions,
  tags,
  selectedTags,
  category,
  causeType,
  onSuggest,
  onApplyAll,
  onToggleTag,
  onAddCustomTag,
  onSelectCategory,
  onSelectCauseType,
  translate,
}: IssueAiAssistantBannerProps) {
  const totalTags = aiSuggestions.existing_tags.length + aiSuggestions.proposed_tags.length;
  const hasClassification = Boolean(aiSuggestions.category || aiSuggestions.cause_type);
  const hasSuggestions = hasClassification || totalTags > 0;
  const [showResults, setShowResults] = useState(hasSuggestions);

  useEffect(() => {
    if (hasSuggestions || aiError) setShowResults(true);
  }, [aiError, hasSuggestions]);

  if (aiEnabled === false) return null;

  const isSuccess = aiRequested && !aiLoading && !aiError && (category !== null || hasSuggestions);
  const canSuggest = Boolean(hasLocation && hasDescription && aiEnabled === true && !aiLoading);

  const getStatusText = () => {
    if (aiLoading) return translate("issue.ai_suggesting_from_description");
    if (aiError) return aiError;
    if (isSuccess) {
      return translate("issue.ai_banner_success_summary", {
        category: aiSuggestions.category || category || "6S",
        count: String(totalTags),
      });
    }
    if (canSuggest) {
      return hasPhoto
        ? translate("issue.ai_banner_hint_ready")
        : translate("issue.ai_banner_hint_ready_text");
    }
    if (!hasLocation && !hasDescription) return translate("issue.ai_banner_need_location_or_desc");
    if (!hasLocation) return translate("issue.ai_banner_need_location");
    return translate("issue.ai_banner_need_desc");
  };

  const stateClass = aiError
    ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
    : isSuccess
      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
      : canSuggest
        ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30"
        : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/70";

  const statusIcon = aiLoading ? (
    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
  ) : aiError ? (
    <AlertCircle className="h-5 w-5" aria-hidden="true" />
  ) : isSuccess ? (
    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
  ) : (
    <Sparkles className="h-5 w-5" aria-hidden="true" />
  );

  const readiness = [
    {
      key: "location",
      label: translate("issue.ai_banner_location"),
      ready: hasLocation,
      optional: false,
      tag: "",
    },
    {
      key: "description",
      label: translate("issue.ai_banner_description"),
      ready: hasDescription,
      optional: false,
      tag: "",
    },
    {
      key: "photo",
      label: translate("issue.ai_banner_photo"),
      ready: hasPhoto,
      optional: true,
      tag: translate("issue.ai_banner_optional_badge"),
    },
  ] as const;

  return (
    <div className={`rounded-2xl border p-3.5 shadow-sm ${stateClass}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
          {statusIcon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                {translate("issue.ai_banner_title")}
              </h3>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-900/60 dark:text-violet-200">
                {translate("issue.ai_banner_one_tap")}
              </span>
            </div>
            {hasSuggestions && !aiError && (
              <button
                type="button"
                onClick={() => setShowResults((visible) => !visible)}
                aria-expanded={showResults}
                aria-controls="ai-suggestions-details"
                aria-label={translate(
                  showResults ? "issue.ai_hide_suggestions" : "issue.ai_view_suggestions",
                )}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                {showResults ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
          <p
            className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300"
            aria-live="polite"
          >
            {getStatusText()}
          </p>
        </div>
      </div>

      <ul
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
        aria-label={translate("issue.ai_banner_requirements")}
      >
        {readiness.map((item) => (
          <li
            key={item.key}
            className={`flex min-h-9 items-center justify-center gap-1 rounded-lg border px-2 text-center text-[10px] font-bold leading-tight sm:min-h-8 ${
              item.ready
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : item.optional
                  ? "col-span-2 border-violet-200 bg-violet-50/50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300 sm:col-span-1"
                  : "border-zinc-200 bg-white/70 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400"
            }`}
          >
            {item.ready ? <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            <span>
              {item.label}
              {item.optional && !item.ready && item.tag ? ` (${item.tag})` : ""}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onSuggest}
          disabled={!canSuggest}
          aria-label={translate("issue.ai_suggest_description_aria")}
          aria-busy={aiLoading}
          className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60 ${
            canSuggest && !isSuccess
              ? "border-violet-600 bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:bg-violet-800"
              : "border-violet-300 bg-white text-violet-700 hover:bg-violet-50 active:bg-violet-100 dark:border-violet-700 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-zinc-800"
          }`}
        >
          {aiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>
            {aiLoading
              ? translate("issue.ai_suggesting_from_description")
              : isSuccess
                ? translate("issue.ai_banner_reanalyze")
                : translate("issue.ai_banner_action")}
          </span>
        </button>

        {isSuccess && onApplyAll && (
          <button
            type="button"
            onClick={onApplyAll}
            aria-label={translate("issue.ai_banner_apply_all")}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-violet-700 active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span>{translate("issue.ai_banner_apply_all")}</span>
          </button>
        )}
      </div>

      {showResults && (
        <div id="ai-suggestions-details">
          <TaxonomyAiSuggestions
            aiError={aiError}
            aiLoading={aiLoading}
            aiRequested={aiRequested}
            aiSuggestions={aiSuggestions}
            tags={tags}
            selectedTags={selectedTags}
            currentCategory={category}
            currentCauseType={causeType}
            onTagClick={(tag) => onToggleTag(tag.code || tag.tag_code || "")}
            onAddCustomTag={onAddCustomTag}
            onToggleTag={onToggleTag}
            onSelectCategory={onSelectCategory}
            onSelectCauseType={onSelectCauseType}
          />
        </div>
      )}
    </div>
  );
}
