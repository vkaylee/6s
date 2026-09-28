import { X } from "lucide-react";
import type { SupportedLocale } from "../../i18n/index.ts";
import {
  IssueCategory,
  type ProposedTagItem,
  resolveTagLabel,
  type TagItem,
  TagStatus,
} from "../../types/index.ts";

export const CATEGORY_BADGE_COLORS: Record<string, string> = {
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

interface IssueTaxonomySectionProps {
  tags: TagItem[];
  selectedTags: string[];
  locale: SupportedLocale;
  onToggleTag: (tagCode: string) => void;
  translate: (key: string, params?: Record<string, string>) => string;
  compact?: boolean;
  category?: IssueCategory | null;
  onOpenSelector?: () => void;
  proposedTags?: ProposedTagItem[];
}

export function IssueTaxonomySection({
  tags,
  selectedTags,
  locale,
  onToggleTag,
  translate,
  compact = false,
  category = null,
  onOpenSelector,
  proposedTags = [],
}: IssueTaxonomySectionProps) {
  if (compact) {
    if (tags.length === 0) return null;
    return (
      <div>
        <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
          {translate("issue.step_tags", { category: category || "" })}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const code = tag.code || tag.tag_code || "";
            const isChecked = selectedTags.includes(code);
            const isPending = tag.status === TagStatus.PENDING;
            return (
              <button
                key={code}
                type="button"
                onClick={() => onToggleTag(code)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] border ${
                  isPending ? "border-dashed" : ""
                } ${
                  isChecked
                    ? isPending
                      ? "bg-amber-600 border-amber-600 text-white"
                      : "bg-blue-600 border-blue-600 text-white"
                    : isPending
                      ? "bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-300"
                      : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {isPending ? `⏳ #${resolveTagLabel(tag, locale)}` : resolveTagLabel(tag, locale)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            {translate("issue.quick_tags_title")}
          </span>
          <span className="text-[11px] font-bold text-zinc-400">({selectedTags.length})</span>
        </div>

        {onOpenSelector && (
          <button
            type="button"
            onClick={onOpenSelector}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1.5 min-h-[36px]"
          >
            <span>{translate("issue.add_tags_button")}</span>
          </button>
        )}
      </div>

      {selectedTags.length === 0 ? (
        <p className="text-xs text-zinc-400 italic py-1">{translate("issue.no_tags_selected")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedTags.map((tagCode) => {
            const tagObj = tags.find((t) => (t.code || t.tag_code) === tagCode);
            const badgeColor = tagObj?.category
              ? CATEGORY_BADGE_COLORS[tagObj.category] ||
                "bg-zinc-100 text-zinc-700 border-zinc-200"
              : "bg-zinc-100 text-zinc-700 border-zinc-200";

            const isPending =
              tagObj?.status === TagStatus.PENDING ||
              proposedTags.some((pt) => pt.name_vi === (tagObj?.name_vi || tagCode));
            return (
              <span
                key={tagCode}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold text-zinc-800 dark:text-zinc-200 shadow-sm ${
                  isPending
                    ? "bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 border-dashed"
                    : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
                }`}
              >
                {isPending && <span className="text-amber-500 text-[11px]">⏳</span>}
                <span>{tagObj ? resolveTagLabel(tagObj, locale) : tagCode}</span>
                {tagObj?.category && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded border font-mono font-black ${badgeColor}`}
                  >
                    {tagObj.category}
                  </span>
                )}
                {isPending && (
                  <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    {translate("issue.tag_status_pending")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onToggleTag(tagCode)}
                  aria-label={translate("issue.remove_tag")}
                  className="ml-0.5 text-zinc-400 hover:text-rose-500 font-bold text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
