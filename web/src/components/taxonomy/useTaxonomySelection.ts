import { useEffect, useMemo, useState } from "react";
import { suggestTags } from "../../api/operations.ts";
import { useAiStatus } from "../../hooks/useAiStatus.ts";
import { useI18nStore } from "../../i18n/index.ts";
import { IssueCategory, type ProposedTagItem, type TagItem } from "../../types/index.ts";
import { haptics } from "../../utils/haptics.ts";
import { normalizeSearchText, searchTags } from "../../utils/tagSearch.ts";

interface TaxonomySelectionOptions {
  isOpen: boolean;
  tags: TagItem[];
  selectedTags?: string[];
  currentCategory: IssueCategory | null;
  onToggleTag: (tagCode: string) => void;
  onSelectCategory: (category: IssueCategory) => void;
  onAddCustomTag?: (tag: TagItem) => void;
}

export function useTaxonomySelection({
  isOpen,
  tags,
  selectedTags: _selectedTags,
  currentCategory,
  onToggleTag,
  onSelectCategory,
  onAddCustomTag,
}: TaxonomySelectionOptions) {
  const { t } = useI18nStore();
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (currentCategory && tags.some((tag) => tag.category === currentCategory)) {
      return currentCategory;
    }
    return "ALL";
  });
  const [autoFeedback, setAutoFeedback] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRequested, setAiRequested] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    existing_tags: string[];
    proposed_tags: ProposedTagItem[];
  }>({ existing_tags: [], proposed_tags: [] });
  const aiEnabled = useAiStatus();
  const suggestionCategory =
    currentCategory ?? (activeTab !== "ALL" ? (activeTab as IssueCategory) : null);
  const queryNorm = useMemo(() => normalizeSearchText(tagQuery), [tagQuery]);
  const isSearching = queryNorm.length > 0;
  const visibleTags = useMemo(() => {
    const scoped =
      isSearching || activeTab === "ALL" ? tags : tags.filter((tag) => tag.category === activeTab);
    return searchTags(scoped, tagQuery);
  }, [tags, isSearching, activeTab, tagQuery]);

  const handleAiSuggest = async () => {
    if (aiEnabled !== true || aiLoading || !tagQuery.trim()) return;
    setAiLoading(true);
    setAiRequested(true);
    setAiError(null);
    setAiSuggestions({ existing_tags: [], proposed_tags: [] });
    try {
      setAiSuggestions(
        await suggestTags({
          query: tagQuery.trim(),
          category: suggestionCategory ?? undefined,
          description: "",
        }),
      );
    } catch {
      setAiError(t("issue.ai_suggest_failed"));
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (currentCategory && tags.some((tag) => tag.category === currentCategory)) {
      setActiveTab(currentCategory);
    } else {
      setActiveTab("ALL");
    }
    setTagQuery("");
    setAiSuggestions({ existing_tags: [], proposed_tags: [] });
    setAiError(null);
    setAiRequested(false);
  }, [isOpen, currentCategory, tags]);

  useEffect(() => {
    setAiSuggestions({ existing_tags: [], proposed_tags: [] });
    setAiError(null);
    setAiRequested(false);
  }, [tagQuery, suggestionCategory]);

  const handleTagClick = (tag: TagItem) => {
    const code = tag.code || tag.tag_code || "";
    if (!code) return;
    onToggleTag(code);
    if (tag.category) {
      const category = tag.category as IssueCategory;
      if (Object.values(IssueCategory).includes(category)) {
        onSelectCategory(category);
        setAutoFeedback(category);
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
      code: codeSlug,
      category: assignedCat,
      name_vi: trimmed,
      name_zh: trimmed,
      name_en: trimmed,
      use_count: 0,
    };
    onAddCustomTag?.(newTag);
    onToggleTag(codeSlug);
    onSelectCategory(assignedCat);
    setAutoFeedback(assignedCat);
    setTimeout(() => setAutoFeedback(null), 2000);
    setTagQuery("");
    haptics.success();
  };

  return {
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
    suggestionCategory,
    handleAiSuggest,
    visibleTags,
    isSearching,
    handleTagClick,
    handleCreateCustom,
  };
}
