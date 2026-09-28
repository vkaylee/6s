import { useI18nStore } from "../../i18n/index.ts";
import { IssueCategory, isBehaviorTag, resolveTagLabel, type TagItem } from "../../types/index.ts";
import { highlightSegments } from "../../utils/tagSearch.ts";

export const categoryBadgeColors: Record<string, string> = {
  [IssueCategory.S1]:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300",
  [IssueCategory.S2]:
    "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300",
  [IssueCategory.S3]:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300",
  [IssueCategory.S4]:
    "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300",
  [IssueCategory.S5]:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300",
  [IssueCategory.S6]:
    "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300",
};

interface TaxonomyTagListProps {
  visibleTags: TagItem[];
  selectedTags: string[];
  isSearching: boolean;
  tagQuery: string;
  onTagClick: (tag: TagItem) => void;
  onCreateCustom: () => void;
}

export function TaxonomyTagList({
  visibleTags,
  selectedTags,
  isSearching,
  tagQuery,
  onTagClick,
  onCreateCustom,
}: TaxonomyTagListProps) {
  const { t, locale } = useI18nStore();

  if (visibleTags.length === 0) {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-xs text-zinc-400 font-medium">{t("issue.no_tags_found")}</p>
        {tagQuery.trim() && (
          <button
            type="button"
            onClick={onCreateCustom}
            className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold text-xs hover:bg-blue-100 min-h-[40px]"
          >
            {t("issue.add_custom_tag", { query: tagQuery.trim() })}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {visibleTags.map((tag) => {
        const code = tag.code || tag.tag_code || "";
        const isChecked = selectedTags.includes(code);
        const isBehavior = isBehaviorTag(code, tag.category);
        const badgeColor =
          (tag.category && categoryBadgeColors[tag.category]) ||
          "bg-zinc-100 text-zinc-700 border-zinc-200";

        return (
          <button
            key={code || tag.label_vi || tag.label_en || "tag"}
            type="button"
            onClick={() => onTagClick(tag)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all min-h-[40px] border flex items-center gap-1.5 ${
              isChecked
                ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20 ring-2 ring-blue-400"
                : "bg-white dark:bg-zinc-800/90 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:border-blue-400 active:scale-95"
            }`}
          >
            <span
              className="text-xs shrink-0"
              title={isBehavior ? t("issue.badge_behavior") : t("issue.badge_condition")}
            >
              {isBehavior ? "👤" : "📦"}
            </span>
            <span>
              {isSearching
                ? highlightSegments(resolveTagLabel(tag, locale), tagQuery).map((seg) =>
                    seg.match ? (
                      <mark
                        key={seg.start}
                        className={
                          isChecked
                            ? "bg-white/30 text-white font-black rounded-xs px-0.5"
                            : "bg-amber-200 dark:bg-amber-900/60 text-amber-950 dark:text-amber-100 font-black rounded-xs px-0.5"
                        }
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={seg.start}>{seg.text}</span>
                    ),
                  )
                : resolveTagLabel(tag, locale)}
            </span>
            {tag.category && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-black ${
                  isChecked ? "bg-white/20 text-white border-white/30" : badgeColor
                }`}
              >
                {tag.category}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
