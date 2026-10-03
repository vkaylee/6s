import { useCallback, useRef, useState } from "react";
import { type SuggestTagsInput, suggestTags } from "../../api/operations.ts";
import { useAiStatus } from "../../hooks/useAiStatus.ts";
import { CauseType, IssueCategory, type ProposedTagItem, type TagItem } from "../../types/index.ts";
import { normalizeSearchText } from "../../utils/tagSearch.ts";

export interface AiSuggestionsState {
  existing_tags: string[];
  proposed_tags: ProposedTagItem[];
  category?: string | null;
  cause_type?: CauseType | string | null;
}

interface UseDescriptionAiSuggestionsProps {
  description: string;
  locationSelected: boolean;
  photoBlob?: Blob | null;
  category: IssueCategory | null;
  causeType?: CauseType | null;
  isCauseTypeManual?: boolean;
  selectedTags: string[];
  tags: TagItem[];
  onSelectCategory: (category: IssueCategory) => void;
  onSuggestCauseType?: (causeType: CauseType) => void;
  onAddTags: (existingCodes: string[], proposedTags: ProposedTagItem[]) => void;
  translate: (key: string, params?: Record<string, string>) => string;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

export function useDescriptionAiSuggestions({
  description,
  locationSelected,
  photoBlob,
  category,
  causeType,
  isCauseTypeManual = false,
  selectedTags,
  tags,
  onSelectCategory,
  onSuggestCauseType,
  onAddTags,
  translate,
}: UseDescriptionAiSuggestionsProps) {
  const aiEnabled = useAiStatus();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRequested, setAiRequested] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionsState>({
    existing_tags: [],
    proposed_tags: [],
    category: null,
    cause_type: null,
  });
  const categoryRef = useRef(category);
  const causeTypeRef = useRef(causeType);
  const isCauseTypeManualRef = useRef(isCauseTypeManual);
  const selectedTagsRef = useRef(selectedTags);
  const tagsRef = useRef(tags);
  const aiSuggestionsRef = useRef(aiSuggestions);
  aiSuggestionsRef.current = aiSuggestions;
  categoryRef.current = category;
  causeTypeRef.current = causeType;
  isCauseTypeManualRef.current = isCauseTypeManual;
  selectedTagsRef.current = selectedTags;
  tagsRef.current = tags;
  const suggestFromDescription = useCallback(async () => {
    const query = description.trim();
    if (!locationSelected || !query || aiEnabled !== true || aiLoading) return;

    setAiLoading(true);
    setAiRequested(true);
    setAiError(null);
    setAiSuggestions({
      existing_tags: [],
      proposed_tags: [],
      category: null,
      cause_type: null,
    });
    try {
      const payload: SuggestTagsInput = {
        query,
        description: query,
        category: categoryRef.current,
      };
      if (causeTypeRef.current) {
        payload.cause_type = causeTypeRef.current;
      }
      if (photoBlob) {
        payload.image_data_url = await blobToDataUrl(photoBlob);
      }

      const suggestions = await suggestTags(payload);
      const validExistingCodes = Array.from(
        new Set(
          suggestions.existing_tags.filter((code) =>
            tagsRef.current.some((tag) => (tag.code || tag.tag_code) === code),
          ),
        ),
      );
      const validProposals = suggestions.proposed_tags.filter((proposal) =>
        Object.values(IssueCategory).includes(proposal.category as IssueCategory),
      );
      const suggestedCategory =
        suggestions.category &&
        Object.values(IssueCategory).includes(suggestions.category as IssueCategory)
          ? (suggestions.category as IssueCategory)
          : null;
      const suggestedCauseType =
        suggestions.cause_type &&
        Object.values(CauseType).includes(suggestions.cause_type as CauseType)
          ? (suggestions.cause_type as CauseType)
          : null;

      const nextSuggestions = {
        existing_tags: validExistingCodes,
        proposed_tags: validProposals,
        category: suggestions.category ?? null,
        cause_type: suggestions.cause_type ?? null,
      };
      aiSuggestionsRef.current = nextSuggestions;
      setAiSuggestions(nextSuggestions);

      if (!categoryRef.current) {
        let targetCategory = suggestedCategory;
        if (!targetCategory) {
          const inferredCategory = [
            ...validExistingCodes
              .map(
                (code) =>
                  tagsRef.current.find((tag) => (tag.code || tag.tag_code) === code)?.category,
              )
              .filter(Boolean),
            ...validProposals.map((proposal) => proposal.category),
          ].find((value) => Object.values(IssueCategory).includes(value as IssueCategory));
          if (inferredCategory) targetCategory = inferredCategory as IssueCategory;
        }
        if (targetCategory) onSelectCategory(targetCategory);
      }

      const isCauseDefaultOrEmpty =
        !isCauseTypeManualRef.current &&
        (!causeTypeRef.current || causeTypeRef.current === CauseType.CONDITION);
      if (isCauseDefaultOrEmpty && suggestedCauseType) {
        onSuggestCauseType?.(suggestedCauseType);
      }

      if (
        selectedTagsRef.current.length === 0 &&
        (validExistingCodes.length > 0 || validProposals.length > 0)
      ) {
        onAddTags(validExistingCodes, validProposals);
      }
    } catch {
      setAiError(translate("issue.ai_suggest_failed"));
    } finally {
      setAiLoading(false);
    }
  }, [
    aiEnabled,
    aiLoading,
    description,
    locationSelected,
    onAddTags,
    onSelectCategory,
    onSuggestCauseType,
    photoBlob,
    translate,
  ]);

  const applyAllSuggestions = useCallback(() => {
    const currentAi = aiSuggestionsRef.current;
    if (!categoryRef.current) {
      let targetCat: IssueCategory | null = null;
      if (
        currentAi.category &&
        Object.values(IssueCategory).includes(currentAi.category as IssueCategory)
      ) {
        targetCat = currentAi.category as IssueCategory;
      } else {
        const inferred = [
          ...currentAi.existing_tags
            .map((code) => tagsRef.current.find((t) => (t.code || t.tag_code) === code)?.category)
            .filter(Boolean),
          ...currentAi.proposed_tags.map((p) => p.category),
        ].find((v) => Object.values(IssueCategory).includes(v as IssueCategory));
        if (inferred) targetCat = inferred as IssueCategory;
      }
      if (targetCat) onSelectCategory(targetCat);
    }

    const isCauseDefaultOrEmpty =
      !isCauseTypeManualRef.current &&
      (!causeTypeRef.current || causeTypeRef.current === CauseType.CONDITION);
    if (
      isCauseDefaultOrEmpty &&
      currentAi.cause_type &&
      Object.values(CauseType).includes(currentAi.cause_type as CauseType)
    ) {
      onSuggestCauseType?.(currentAi.cause_type as CauseType);
    }

    const unselectedExisting = currentAi.existing_tags.filter(
      (code) => !selectedTagsRef.current.includes(code),
    );
    const unselectedProposed = currentAi.proposed_tags.filter((proposal) => {
      const code = `c_${normalizeSearchText(proposal.name_vi).replace(/[^a-z0-9]+/g, "_")}`.slice(
        0,
        48,
      );
      return !selectedTagsRef.current.includes(code);
    });
    if (unselectedExisting.length > 0 || unselectedProposed.length > 0) {
      onAddTags(unselectedExisting, unselectedProposed);
    }
  }, [onAddTags, onSelectCategory, onSuggestCauseType]);

  return {
    aiEnabled,
    aiLoading,
    aiError,
    aiRequested,
    aiSuggestions,
    suggestFromDescription,
    applyAllSuggestions,
  };
}
