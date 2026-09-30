import { Info, ShieldAlert } from "lucide-react";
import type { SupportedLocale } from "../../i18n/index.ts";
import {
  CauseType,
  type CauseType as CauseTypeValue,
  type IssueCategory,
  resolveI18n,
  resolveTagLabel,
  S_CATEGORIES,
  type TagItem,
} from "../../types/index.ts";

interface IssueCategorySectionProps {
  category: IssueCategory | null;
  causeType: CauseTypeValue;
  tags: TagItem[];
  selectedTags: string[];
  locale: SupportedLocale;
  onSelectCategory: (category: IssueCategory) => void;
  onToggleTag: (tagCode: string) => void;
  onCauseTypeChange: (causeType: CauseTypeValue) => void;
  translate: (key: string, params?: Record<string, string>) => string;
  compact?: boolean;
  categoryError?: boolean;
}

export function IssueCategorySection({
  category,
  causeType,
  tags,
  selectedTags,
  locale,
  onSelectCategory,
  onToggleTag,
  onCauseTypeChange,
  translate,
  compact = false,
  categoryError = false,
}: IssueCategorySectionProps) {
  const currentCategory = S_CATEGORIES.find((item) => item.key === category);
  const categoryTags = tags
    .filter((tag) => tag.category === category)
    .sort((a, b) => (b.use_count || 0) - (a.use_count || 0))
    .slice(0, 8);
  const cardPadding = compact ? "p-3 min-h-[64px]" : "p-3.5 min-h-[76px]";

  return (
    <section className={compact ? "" : "space-y-4"}>
      <div className="flex items-center justify-between">
        <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
          {translate("issue.step_category")}
        </span>
      </div>
      {categoryError && (
        <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
          * {translate("issue.missing_category")}
        </p>
      )}
      <div
        className={`grid grid-cols-2 ${compact ? "sm:grid-cols-3 gap-2" : "sm:grid-cols-3 gap-3"}`}
      >
        {S_CATEGORIES.map((item) => {
          const isSelected = category === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectCategory(item.key)}
              className={`${cardPadding} rounded-2xl border text-left flex flex-col justify-between transition-all ${
                isSelected
                  ? item.isSafety
                    ? "bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-600/30 ring-2 ring-rose-400"
                    : "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900 shadow-md"
                  : item.isSafety
                    ? "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-300"
                    : "bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-black">{item.key}</span>
                <span className="text-xs font-bold opacity-80">
                  {item.name_i18n ? resolveI18n(item.name_i18n, locale) : item.name}
                </span>
              </div>
              <div className="text-[11px] leading-tight font-medium opacity-90 mt-1">
                {item.hint_i18n
                  ? resolveI18n(item.hint_i18n, locale)
                  : locale === "zh"
                    ? item.hint_zh
                    : item.hint_vi}
              </div>
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5 mt-3">
        <div className="flex items-center justify-between">
          <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
            {translate("issue.root_cause_title")}
          </span>
          <span className="text-[10px] text-zinc-400 font-medium">
            {translate("issue.root_cause_hint")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(CauseType).map((kind) => {
            const behavior = kind === CauseType.BEHAVIOR;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onCauseTypeChange(kind)}
                className={`p-2.5 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[52px] ${
                  causeType === kind
                    ? behavior
                      ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500/30 shadow-xs"
                      : "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/30 shadow-xs"
                    : "bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{behavior ? "👤" : "📦"}</span>
                  <span className="font-bold text-xs">
                    {translate(behavior ? "issue.cause_behavior" : "issue.cause_condition")}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 leading-tight mt-1 line-clamp-2">
                  {translate(behavior ? "issue.cause_behavior_desc" : "issue.cause_condition_desc")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {!compact && (
        <div>
          {category ? (
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-2.5 transition-all ${
                currentCategory?.isSafety
                  ? "bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-200"
                  : "bg-zinc-50/90 dark:bg-zinc-800/60 border-zinc-200/90 dark:border-zinc-700/80 text-zinc-800 dark:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2 font-black">
                {currentCategory?.isSafety ? (
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                )}
                <span className="text-sm tracking-tight">
                  {category} -{" "}
                  {currentCategory?.name_i18n
                    ? resolveI18n(currentCategory.name_i18n, locale)
                    : currentCategory?.name}
                </span>
              </div>
              <div className="space-y-1.5 pl-6">
                <div>
                  <span className="font-bold text-zinc-500 dark:text-zinc-400 mr-1.5 uppercase text-[10px] tracking-wider">
                    {translate("issue.category_signs_label")}:
                  </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {currentCategory?.description_i18n
                      ? resolveI18n(currentCategory.description_i18n, locale)
                      : currentCategory?.hint_vi}
                  </span>
                </div>
                {currentCategory?.action_i18n && (
                  <div>
                    <span className="font-bold text-zinc-500 dark:text-zinc-400 mr-1.5 uppercase text-[10px] tracking-wider">
                      {translate("issue.category_action_label")}:
                    </span>
                    <span className="font-semibold">
                      {resolveI18n(currentCategory.action_i18n, locale)}
                    </span>
                  </div>
                )}
              </div>
              {categoryTags.length > 0 && (
                <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 flex flex-wrap items-center gap-1.5 pl-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">
                    {translate("issue.category_quick_tags_label")}:
                  </span>
                  {categoryTags.map((tag) => {
                    const code = tag.code || tag.tag_code || "";
                    const checked = selectedTags.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => onToggleTag(code)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                          checked
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                        }`}
                      >
                        {resolveTagLabel(tag, locale)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 flex items-start gap-2.5 text-xs">
              <Info className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-zinc-600 dark:text-zinc-300 font-semibold">
                  {translate("issue.select_category_placeholder")}
                </p>
                <p className="text-zinc-400 font-medium text-[11px] leading-relaxed">
                  {translate("issue.category_guide_summary")}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
