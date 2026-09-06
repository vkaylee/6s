import { Check, Search, Tag, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { IssueCategory, S_CATEGORIES, type TagItem } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";

interface TaxonomySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tags: TagItem[];
  selectedTags: string[];
  currentCategory: IssueCategory | null;
  onToggleTag: (tagCode: string) => void;
  onSelectCategory: (category: IssueCategory) => void;
  onAddCustomTag?: (tag: TagItem) => void;
}
function normalizeSearchText(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .trim();
}

const categoryBadgeColors: Record<string, string> = {
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

export function TaxonomySelectorModal({
  isOpen,
  onClose,
  tags,
  selectedTags,
  currentCategory,
  onToggleTag,
  onSelectCategory,
  onAddCustomTag,
}: TaxonomySelectorModalProps) {
  const { t } = useI18nStore();
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (currentCategory && tags.some((t) => t.category === currentCategory)) {
      return currentCategory;
    }
    return "ALL";
  });
  const [autoFeedback, setAutoFeedback] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");

  // Reset/sync tab with currentCategory whenever modal opens
  useEffect(() => {
    if (isOpen) {
      // If category is selected and has matching tags, switch to it, otherwise default to ALL
      if (currentCategory && tags.some((t) => t.category === currentCategory)) {
        setActiveTab(currentCategory);
      } else {
        setActiveTab("ALL");
      }
      setTagQuery("");
    }
  }, [isOpen, currentCategory, tags]);
  const queryNorm = useMemo(() => normalizeSearchText(tagQuery), [tagQuery]);
  const isSearching = queryNorm.length > 0;

  const visibleTags = useMemo(() => {
    return tags.filter((tg) => {
      const matchTab = isSearching || activeTab === "ALL" || tg.category === activeTab;
      if (!matchTab) return false;
      if (!isSearching) return true;

      const labelViNorm = normalizeSearchText(tg.label_vi);
      const labelZh = tg.label_zh.toLowerCase();
      const labelEn = tg.label_en ? normalizeSearchText(tg.label_en) : "";
      const tagCode = tg.tag_code.toLowerCase();

      return (
        labelViNorm.includes(queryNorm) ||
        labelZh.includes(tagQuery.toLowerCase().trim()) ||
        labelEn.includes(queryNorm) ||
        tagCode.includes(queryNorm)
      );
    });
  }, [tags, isSearching, activeTab, queryNorm, tagQuery]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTagClick = (tag: TagItem) => {
    onToggleTag(tag.tag_code);
    if (tag.category) {
      const cat = tag.category as IssueCategory;
      if (Object.values(IssueCategory).includes(cat)) {
        onSelectCategory(cat);
        setAutoFeedback(cat);
        setTimeout(() => setAutoFeedback(null), 2000);
      }
    }
  };

  const handleCreateCustom = () => {
    const trimmed = tagQuery.trim();
    if (!trimmed) return;

    const codeSlug = `c_${normalizeSearchText(trimmed).replace(/[^a-z0-9]+/g, "_")}`.slice(0, 48);
    const assignedCat =
      (activeTab !== "ALL" ? (activeTab as IssueCategory) : currentCategory) || IssueCategory.S3;

    const newTag: TagItem = {
      tag_code: codeSlug,
      category: assignedCat,
      label_vi: trimmed,
      label_zh: trimmed,
      label_en: trimmed,
    };

    if (onAddCustomTag) {
      onAddCustomTag(newTag);
    }
    onToggleTag(codeSlug);
    onSelectCategory(assignedCat);
    setAutoFeedback(assignedCat);
    setTimeout(() => setAutoFeedback(null), 2000);
    setTagQuery("");
    haptics.success();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:p-4">
      {/* Clickable Backdrop overlay button for a11y & instant dismiss */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss backdrop"
        tabIndex={-1}
        className="fixed inset-0 w-full h-full cursor-default bg-transparent -z-10 focus:outline-none"
      />
      <div className="w-full sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{t("issue.tags_modal_title")}</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {t("issue.tags_modal_desc")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Search & Category Filter Bar */}
        <div className="p-4 space-y-3 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
          {/* Instant Search Bar */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder={t("issue.tag_search_placeholder")}
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-8 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            />
            {tagQuery && (
              <button
                type="button"
                onClick={() => setTagQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* S Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors min-h-[34px] ${
                activeTab === "ALL"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {t("issue.filter_all_tags", { count: tags.length })}
            </button>
            {S_CATEGORIES.map((s) => {
              const isTabActive = activeTab === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActiveTab(s.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all min-h-[34px] border ${
                    isTabActive
                      ? s.isSafety
                        ? "bg-rose-600 border-rose-600 text-white shadow-sm shadow-rose-600/20"
                        : "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/20"
                      : s.isSafety
                        ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                        : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                  }`}
                >
                  {s.key}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback alert */}
        {autoFeedback && (
          <div className="mx-4 mt-3 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 animate-fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>{t("issue.auto_classified", { category: autoFeedback })}</span>
          </div>
        )}

        {/* Tag List Body */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[48vh] sm:max-h-[44vh]">
          {visibleTags.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-xs text-zinc-400 font-medium">{t("issue.no_tags_found")}</p>
              {tagQuery.trim() && (
                <button
                  type="button"
                  onClick={handleCreateCustom}
                  className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold text-xs hover:bg-blue-100 min-h-[40px]"
                >
                  {t("issue.add_custom_tag", { query: tagQuery.trim() })}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {visibleTags.map((tag) => {
                const isChecked = selectedTags.includes(tag.tag_code);
                const badgeColor =
                  categoryBadgeColors[tag.category] || "bg-zinc-100 text-zinc-700 border-zinc-200";

                return (
                  <button
                    key={tag.tag_code}
                    type="button"
                    onClick={() => handleTagClick(tag)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all min-h-[40px] border flex items-center gap-1.5 ${
                      isChecked
                        ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20 ring-2 ring-blue-400"
                        : "bg-white dark:bg-zinc-800/90 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:border-blue-400 active:scale-95"
                    }`}
                  >
                    <span>
                      {tag.label_vi} / {tag.label_zh}
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
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
            {t("issue.tags_selected_count", { count: selectedTags.length })}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md shadow-blue-600/20 min-h-[40px]"
          >
            {t("issue.tags_apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
