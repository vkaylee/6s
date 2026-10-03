import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { PageContainer } from "../components/PageContainer.tsx";
import { TaxonomySelectorModal } from "../components/TaxonomySelectorModal.tsx";
import { type DraftIssue, saveDraftIssue } from "../db/indexeddb.ts";
import { useHeaderVisibility } from "../hooks/useHeaderVisibility.ts";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import {
  CauseType,
  type CauseType as CauseTypeValue,
  IssueCategory,
  isBehaviorTag,
  type LocationItem,
  LocationSnapshotSource,
  type ProposedTagItem,
  SyncStatus,
  type TagItem,
  TagStatus,
} from "../types/index.ts";
import { compressImage } from "../utils/compress.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";
import { normalizeSearchText } from "../utils/tagSearch.ts";
import { generateUuid } from "../utils/uuid.ts";
import { IssueAiAssistantBanner } from "./create-issue/IssueAiAssistantBanner.tsx";
import { IssueAnnotatorModal } from "./create-issue/IssueAnnotatorModal.tsx";
import { IssueCategorySection } from "./create-issue/IssueCategorySection.tsx";
import { IssueDescriptionSection } from "./create-issue/IssueDescriptionSection.tsx";
import { IssueLocationSection } from "./create-issue/IssueLocationSection.tsx";
import { IssueMobileSubmitBar } from "./create-issue/IssueMobileSubmitBar.tsx";
import { IssuePageHeader } from "./create-issue/IssuePageHeader.tsx";
import { IssuePhotoSection } from "./create-issue/IssuePhotoSection.tsx";
import { IssueSubmitButton } from "./create-issue/IssueSubmitButton.tsx";
import { IssueTaxonomySection } from "./create-issue/IssueTaxonomySection.tsx";
import { useDescriptionAiSuggestions } from "./create-issue/useDescriptionAiSuggestions.ts";
import { useIssueLocationState } from "./create-issue/useIssueLocationState.ts";

interface CreateIssuePageProps {
  locations: LocationItem[];
  tags: TagItem[];
  onSuccess: () => void;
}
export function CreateIssuePage({ locations, tags, onSuccess }: CreateIssuePageProps) {
  useHeaderVisibility();
  const { t } = useI18nStore();
  const locale = useI18nStore.getState().locale;
  const [, setLocation] = useLocation();
  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [causeType, setCauseType] = useState<CauseTypeValue>(CauseType.CONDITION);
  const causeTypeManualRef = useRef(false);
  const [localTags, setLocalTags] = useState<TagItem[]>(tags);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [photoBefore, setPhotoBefore] = useState<Blob | null>(null);
  const [photoDetail, setPhotoDetail] = useState<Blob | null>(null);
  const [previewBefore, setPreviewBefore] = useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastDraftTime, setLastDraftTime] = useState<string | null>(null);
  const {
    locationCode,
    setLocationCode,
    recentLocations,
    effectiveLocationCode,
    updateRecentLocations,
  } = useIssueLocationState(locations);
  const [dragOverWide, setDragOverWide] = useState(false);
  const [dragOverDetail, setDragOverDetail] = useState(false);
  const [touched, setTouched] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [annotatorTarget, setAnnotatorTarget] = useState<"wide" | "detail" | null>(null);
  const [proposedTags, setProposedTags] = useState<ProposedTagItem[]>([]);
  const [isTaxonomyOpen, setIsTaxonomyOpen] = useState(false);
  const [autoFeedback, setAutoFeedback] = useState<string | null>(null);
  const handleCloseTaxonomy = useCallback(() => setIsTaxonomyOpen(false), []);
  const wideInputRef = useRef<HTMLInputElement>(null);
  const detailInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tags.length === 0) return;
    setLocalTags((prev) => {
      const existingCodes = new Set(prev.map((item) => item.code || item.tag_code));
      const newItems = tags.filter((item) => !existingCodes.has(item.code || item.tag_code));
      return newItems.length > 0 ? [...prev, ...newItems] : prev.length === 0 ? tags : prev;
    });
  }, [tags]);
  useEffect(() => {
    if (!locationCode && locations[0]?.code) setLocationCode(locations[0].code);
  }, [locations, locationCode]);
  useEffect(() => {
    if (category || photoBefore || description.trim() || selectedTags.length > 0) {
      setLastDraftTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }
  }, [category, photoBefore, description, selectedTags]);
  const handleSelectCategory = useCallback((cat: IssueCategory) => {
    setCategory(cat);
    setCategoryError(false);
    if (cat === IssueCategory.S5) setCauseType(CauseType.BEHAVIOR);
    else if (cat !== IssueCategory.S6) setCauseType(CauseType.CONDITION);
    if (cat === IssueCategory.S6) haptics.safetyAlert();
    else haptics.success();
  }, []);

  const handleSelectCauseType = useCallback((nextCauseType: CauseTypeValue) => {
    setCauseType(nextCauseType);
    causeTypeManualRef.current = true;
    haptics.selection();
  }, []);
  const handleToggleTag = useCallback(
    (tagCode: string) => {
      haptics.success();
      const tagObj = localTags.find((item) => (item.code || item.tag_code) === tagCode);
      if (tagObj && isBehaviorTag(tagCode, tagObj.category)) setCauseType(CauseType.BEHAVIOR);
      setSelectedTags((prev) =>
        prev.includes(tagCode) ? prev.filter((item) => item !== tagCode) : [...prev, tagCode],
      );
      if (
        tagObj?.category &&
        Object.values(IssueCategory).includes(tagObj.category as IssueCategory)
      ) {
        const mapped = tagObj.category as IssueCategory;
        setCategory(mapped);
        setCategoryError(false);
        setAutoFeedback(mapped);
        setTimeout(() => setAutoFeedback(null), 2500);
      }
    },
    [localTags],
  );

  const handleAddCustomTag = useCallback(
    (newTag: TagItem) => {
      const code = newTag.code || newTag.tag_code;
      if (!code) return;
      setLocalTags((prev) => [{ ...newTag, status: TagStatus.PENDING }, ...prev]);
      setProposedTags((prev) => {
        if (prev.some((item) => item.name_vi === newTag.name_vi)) return prev;
        return [
          ...prev,
          {
            name_vi: newTag.name_vi || code,
            name_zh: newTag.name_zh || newTag.name_vi || code,
            name_en: newTag.name_en || newTag.name_vi || code,
            category: newTag.category || category || IssueCategory.S3,
          },
        ];
      });
    },
    [category],
  );
  const handleAddAiTags = useCallback(
    (existingCodes: string[], proposals: ProposedTagItem[]) => {
      const seen = new Set<string>();
      const pending = proposals
        .map((p) => ({
          ...p,
          code: `c_${normalizeSearchText(p.name_vi).replace(/[^a-z0-9]+/g, "_")}`.slice(0, 48),
          use_count: 0,
          status: TagStatus.PENDING,
        }))
        .filter((t) => !seen.has(t.code) && Boolean(seen.add(t.code)));
      for (const t of pending) {
        if (!localTags.some((tag) => (tag.code || tag.tag_code) === t.code)) handleAddCustomTag(t);
      }
      setSelectedTags((prev) =>
        Array.from(new Set([...prev, ...existingCodes, ...pending.map((t) => t.code)])),
      );
    },
    [handleAddCustomTag, localTags],
  );

  const {
    aiEnabled,
    aiLoading,
    aiError,
    aiRequested,
    aiSuggestions,
    suggestFromDescription,
    applyAllSuggestions,
  } = useDescriptionAiSuggestions({
    description,
    locationSelected: Boolean(effectiveLocationCode),
    photoBlob: photoBefore,
    category,
    causeType,
    isCauseTypeManual: causeTypeManualRef.current,
    selectedTags,
    tags: localTags,
    onSelectCategory: handleSelectCategory,
    onSuggestCauseType: setCauseType,
    onAddTags: handleAddAiTags,
    translate: t,
  });

  const processImageFile = useCallback(
    async (file: File | Blob, isWide: boolean) => {
      try {
        const compressed = await compressImage(file, { maxDimension: 1280, quality: 0.7 });
        const previewUrl = URL.createObjectURL(compressed);
        if (isWide) {
          setPhotoBefore(compressed);
          setPreviewBefore(previewUrl);
          setPhotoError(false);
          setAnnotatorTarget("wide");
        } else {
          setPhotoDetail(compressed);
          setPreviewDetail(previewUrl);
          setAnnotatorTarget("detail");
        }
        haptics.success();
      } catch {
        haptics.errorOrConflict();
        modalDialog.alert(t("issue.compress_error"));
      }
    },
    [t],
  );

  const handleDrop = async (event: React.DragEvent<HTMLElement>, isWide: boolean) => {
    event.preventDefault();
    isWide ? setDragOverWide(false) : setDragOverDetail(false);
    const file = event.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) await processImageFile(file, isWide);
  };

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      for (const item of event.clipboardData?.items ?? []) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file && !photoBefore) await processImageFile(file, true);
        else if (file && !photoDetail) await processImageFile(file, false);
        break;
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [photoBefore, photoDetail, processImageFile]);

  const handleRemovePhoto = (isWide: boolean) => {
    (isWide ? setPhotoBefore : setPhotoDetail)(null);
    (isWide ? setPreviewBefore : setPreviewDetail)(null);
    const input = isWide ? wideInputRef.current : detailInputRef.current;
    if (input) input.value = "";
    haptics.selection();
  };

  const handleBack = async () => {
    if (photoBefore || photoDetail || description.trim()) {
      const confirmed = await modalDialog.confirm(
        t("issue.cancel_confirm_message"),
        t("issue.cancel_confirm_title"),
      );
      if (!confirmed) return;
    }
    goBack("/");
  };

  const handleSubmit = async () => {
    setTouched(true);
    const hasError = !category || !photoBefore;
    if (!category) setCategoryError(true);
    if (!photoBefore) setPhotoError(true);
    if (!effectiveLocationCode) return void modalDialog.alert(t("issue.missing_location"));
    if (hasError || !category || !photoBefore) {
      haptics.errorOrConflict();
      return void modalDialog.alert(
        t(!category ? "issue.missing_category" : "issue.missing_photo"),
      );
    }
    try {
      const capturedLocation = locations.find((item) => item.code === effectiveLocationCode);
      const newDraft: DraftIssue = {
        client_uuid: generateUuid(),
        category,
        cause_type: causeType,
        location_code: effectiveLocationCode,
        location_name_vi_snapshot: capturedLocation?.name_vi,
        location_name_zh_snapshot: capturedLocation?.name_zh,
        location_name_en_snapshot: capturedLocation?.name_en,
        location_snapshot_source: capturedLocation
          ? LocationSnapshotSource.CLIENT_CAPTURE
          : undefined,
        asset_id: null,
        assigned_team_id: null,
        assignee_id: null,
        tags: selectedTags,
        proposed_tags: proposedTags.length ? proposedTags : undefined,
        description: description.trim(),
        photo_before_blob: photoBefore,
        photo_detail_blob: photoDetail || undefined,
        created_at: Date.now(),
        sync_status: SyncStatus.PENDING,
      };
      await saveDraftIssue(newDraft);
      updateRecentLocations(effectiveLocationCode);
      haptics.success();
      syncEngine.triggerSync();
      onSuccess();
      setLocation("/", { replace: true });
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue.draft_save_error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSubmit();
      } else if (!isInput && event.key === "Escape") {
        event.preventDefault();
        void handleBack();
      } else if (!isInput && /^[1-6]$/.test(event.key)) {
        event.preventDefault();
        handleSelectCategory(`S${event.key}` as IssueCategory);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
  const translate = (key: string, params?: Record<string, string>) => t(key, params);

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-36 lg:pb-12">
      <input
        ref={wideInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void processImageFile(f, true);
        }}
        className="hidden"
      />
      <input
        ref={detailInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void processImageFile(f, false);
        }}
        className="hidden"
      />
      <IssuePageHeader
        lastDraftTime={lastDraftTime}
        onBack={() => void handleBack()}
        translate={translate}
      />
      <main className="py-4 sm:py-6">
        <PageContainer>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-8 items-start">
            <div className="space-y-5">
              <IssuePhotoSection
                causeType={causeType}
                previewBefore={previewBefore}
                previewDetail={previewDetail}
                translate={translate}
                onCapture={(e, isWide) => {
                  const f = e.target.files?.[0];
                  if (f) void processImageFile(f, isWide);
                }}
                onDrop={handleDrop}
                onRemove={handleRemovePhoto}
                onAnnotate={setAnnotatorTarget}
                wideInputRef={wideInputRef}
                detailInputRef={detailInputRef}
                dragOverWide={dragOverWide}
                dragOverDetail={dragOverDetail}
                onDragOver={(wide) => (wide ? setDragOverWide(true) : setDragOverDetail(true))}
                onDragLeave={(wide) => (wide ? setDragOverWide(false) : setDragOverDetail(false))}
                touched={touched}
                photoError={photoError}
              />
              <IssueLocationSection
                locations={locations}
                value={effectiveLocationCode}
                onChange={setLocationCode}
                recentLocations={recentLocations}
                locale={locale}
                translate={translate}
              />
            </div>
            <div className="space-y-5">
              <IssueDescriptionSection
                value={description}
                onChange={setDescription}
                translate={translate}
              />
              <section
                className={`bg-white dark:bg-zinc-900 rounded-3xl p-5 border shadow-sm space-y-4 ${touched && categoryError ? "border-rose-500 ring-2 ring-rose-500/20" : "border-zinc-200 dark:border-zinc-800"}`}
              >
                <IssueAiAssistantBanner
                  hasPhoto={Boolean(photoBefore)}
                  hasLocation={Boolean(effectiveLocationCode)}
                  hasDescription={Boolean(description?.trim && description.trim().length > 0)}
                  aiEnabled={aiEnabled}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  aiRequested={aiRequested}
                  aiSuggestions={aiSuggestions}
                  tags={localTags}
                  selectedTags={selectedTags}
                  category={category}
                  causeType={causeType}
                  onSuggest={() => void suggestFromDescription()}
                  onApplyAll={applyAllSuggestions}
                  onToggleTag={handleToggleTag}
                  onAddCustomTag={handleAddCustomTag}
                  onSelectCategory={handleSelectCategory}
                  onSelectCauseType={handleSelectCauseType}
                  translate={translate}
                />
                <IssueCategorySection
                  category={category}
                  causeType={causeType}
                  tags={localTags}
                  selectedTags={selectedTags}
                  locale={locale}
                  onSelectCategory={handleSelectCategory}
                  onToggleTag={handleToggleTag}
                  onCauseTypeChange={handleSelectCauseType}
                  translate={translate}
                  categoryError={touched && categoryError}
                />
                {autoFeedback && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>{t("issue.auto_classified", { category: autoFeedback })}</span>
                  </div>
                )}
                <IssueTaxonomySection
                  tags={localTags}
                  selectedTags={selectedTags}
                  locale={locale}
                  onToggleTag={handleToggleTag}
                  translate={translate}
                  category={category}
                  onOpenSelector={() => setIsTaxonomyOpen(true)}
                  proposedTags={proposedTags}
                />
              </section>
              <div className="hidden lg:block pt-2">
                <IssueSubmitButton
                  category={category}
                  isSubmitting={isSubmitting}
                  onClick={() => void handleSubmit()}
                  translate={translate}
                />
                <p className="text-[11px] text-center text-zinc-400 font-medium pt-1.5">
                  {t("issue.shortcuts_hint")}
                </p>
              </div>
            </div>
          </div>
        </PageContainer>
      </main>
      <IssueMobileSubmitBar
        category={category}
        isSubmitting={isSubmitting}
        onSubmit={() => void handleSubmit()}
        translate={translate}
      />
      <IssueAnnotatorModal
        target={annotatorTarget}
        previewBefore={previewBefore}
        previewDetail={previewDetail}
        onSave={(blob, preview, target) => {
          const isWide = target === "wide";
          (isWide ? setPhotoBefore : setPhotoDetail)(blob);
          (isWide ? setPreviewBefore : setPreviewDetail)(preview);
        }}
        onClose={() => setAnnotatorTarget(null)}
        translate={translate}
      />
      <TaxonomySelectorModal
        isOpen={isTaxonomyOpen}
        onClose={handleCloseTaxonomy}
        tags={localTags}
        selectedTags={selectedTags}
        currentCategory={category}
        onToggleTag={handleToggleTag}
        onSelectCategory={handleSelectCategory}
        onAddCustomTag={handleAddCustomTag}
      />
    </div>
  );
}
