import { Check, Search, Sparkles, Tag, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { type IssueCategory, resolveTagLabel, S_CATEGORIES, type TagItem } from "../types/index.ts";
import { TaxonomyAiSuggestions } from "./taxonomy/TaxonomyAiSuggestions.tsx";
import { TaxonomyTagList } from "./taxonomy/TaxonomyTagList.tsx";
import { useTaxonomySelection } from "./taxonomy/useTaxonomySelection.ts";

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
  const { t, locale } = useI18nStore();
  const {
    activeTab,
    setActiveTab,
    autoFeedback,
    tagQuery,
    setTagQuery,
    isSearchFocused,
    setIsSearchFocused,
    aiLoading,
    aiError,
    aiRequested,
    aiSuggestions,
    aiEnabled,
    handleAiSuggest,
    visibleTags,
    isSearching,
    handleTagClick,
    handleCreateCustom,
  } = useTaxonomySelection({
    isOpen,
    tags,
    selectedTags,
    currentCategory,
    onToggleTag,
    onSelectCategory,
    onAddCustomTag,
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  // Escape closes; Tab cycles inside the dialog and focus returns to the opener.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      );
    focusables()[0]?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="taxonomy-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:p-4"
    >
      {/* Clickable Backdrop overlay button for a11y & instant dismiss */}
      <button
        type="button"
        aria-label={t("common.close")}
        className="fixed inset-0 w-full h-full cursor-default bg-transparent -z-10 focus:outline-none"
      />
      <div
        className={`w-full sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col transition-all duration-200 ${
          isSearchFocused || tagQuery.trim() ? "h-[94dvh]" : "h-[85dvh]"
        } sm:h-auto sm:max-h-[82vh]`}
      >
        {/* Header - collapses subtitle when searching on mobile */}
        <div
          className={`border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between transition-all ${
            isSearchFocused || tagQuery.trim() ? "p-3 sm:p-5" : "p-4 sm:p-5"
          }`}
        >
          <div>
            <h2
              id="taxonomy-modal-title"
              className="text-base font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
            >
              <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{t("issue.tags_modal_title")}</span>
            </h2>
            {!(isSearchFocused || tagQuery.trim()) && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {t("issue.tags_modal_desc")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {/* Search & Category Filter Bar */}
        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
          {/* Instant Search Bar + AI Suggest Button */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-3 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={tagQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                onChange={(e) => setTagQuery(e.target.value)}
                placeholder={t("issue.tag_search_placeholder")}
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-8 py-2.5 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[42px]"
              />
              {tagQuery && (
                <button
                  type="button"
                  onClick={() => setTagQuery("")}
                  aria-label={t("common.close")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-1"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleAiSuggest}
              title={
                aiEnabled === false
                  ? t("admin.ai_disabled_reason")
                  : aiEnabled === null
                    ? t("issue.ai_status_loading")
                    : undefined
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-bold text-white min-h-[42px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {aiLoading ? t("issue.ai_suggesting_tags") : t("issue.ai_suggest_tags_btn")}
            </button>
          </div>

          {/* S Category Pills */}
          <div
            className={`${tagQuery.trim() ? "hidden sm:flex" : "flex"} items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar`}
          >
            <button
              type="button"
              onClick={() => setActiveTab("ALL")}
              aria-pressed={activeTab === "ALL"}
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
                  aria-pressed={isTabActive}
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

        {/* AI Suggestions Box */}
        <TaxonomyAiSuggestions
          aiError={aiError}
          aiLoading={aiLoading}
          aiRequested={aiRequested}
          aiSuggestions={aiSuggestions}
          tags={tags}
          selectedTags={selectedTags}
          onTagClick={handleTagClick}
          onAddCustomTag={onAddCustomTag}
          onToggleTag={onToggleTag}
          onSelectCategory={onSelectCategory}
        />
        {/* Pending tags section */}
        {tags.some((t) => t.status === "PENDING") && (
          <div className="mx-4 mt-3 p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20">
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 mb-1.5">
              {t("issue.tag_pending_section")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags
                .filter((t) => t.status === "PENDING")
                .map((tag) => {
                  const code = tag.code || tag.tag_code || "";
                  const isChecked = selectedTags.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleTagClick(tag)}
                      className={`px-2.5 py-1.5 rounded-lg border border-dashed text-xs font-bold min-h-[34px] flex items-center gap-1 ${
                        isChecked
                          ? "bg-amber-500 border-amber-600 text-white"
                          : "bg-white dark:bg-zinc-900 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200"
                      }`}
                    >
                      <span>⏳</span>
                      <span>#{resolveTagLabel(tag, locale)}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Feedback alert */}
        {autoFeedback && (
          <div className="mx-4 mt-3 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 animate-fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>{t("issue.auto_classified", { category: autoFeedback })}</span>
          </div>
        )}

        {/* Tag List Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <TaxonomyTagList
            visibleTags={visibleTags}
            selectedTags={selectedTags}
            isSearching={isSearching}
            tagQuery={tagQuery}
            onTagClick={handleTagClick}
            onCreateCustom={handleCreateCustom}
          />
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
