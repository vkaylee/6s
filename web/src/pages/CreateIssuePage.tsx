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
  type CauseType,
  IssueCategory,
  isBehaviorTag,
  type LocationItem,
  type ProposedTagItem,
  type TagItem,
} from "../types/index.ts";
import { compressImage } from "../utils/compress.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";
import { generateUuid } from "../utils/uuid.ts";
import { IssueAnnotatorModal } from "./create-issue/IssueAnnotatorModal.tsx";
import { IssueCategorySection } from "./create-issue/IssueCategorySection.tsx";
import { IssueDescriptionSection } from "./create-issue/IssueDescriptionSection.tsx";
import { IssueLocationSection } from "./create-issue/IssueLocationSection.tsx";
import { IssueMediaAttachments } from "./create-issue/IssueMediaAttachments.tsx";
import { IssuePageHeader } from "./create-issue/IssuePageHeader.tsx";
import { IssueSubmitButton } from "./create-issue/IssueSubmitButton.tsx";
import { IssueTaxonomySection } from "./create-issue/IssueTaxonomySection.tsx";

interface CreateIssuePageProps {
  locations: LocationItem[];
  tags: TagItem[];
  onSuccess: () => void;
}

export function CreateIssuePage({ locations, tags, onSuccess }: CreateIssuePageProps) {
  useHeaderVisibility();
  const { t, locale: storeLocale } = useI18nStore();
  const locale = typeof window === "undefined" ? useI18nStore.getState().locale : storeLocale;
  const [, setLocation] = useLocation();

  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [causeType, setCauseType] = useState<CauseType>("CONDITION");
  const [locationCode, setLocationCode] = useState(locations[0]?.code || "");
  const [localTags, setLocalTags] = useState<TagItem[]>(tags);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [photoBefore, setPhotoBefore] = useState<Blob | null>(null);
  const [photoDetail, setPhotoDetail] = useState<Blob | null>(null);
  const [previewBefore, setPreviewBefore] = useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastDraftTime, setLastDraftTime] = useState<string | null>(null);
  const [dragOverWide, setDragOverWide] = useState(false);
  const [dragOverDetail, setDragOverDetail] = useState(false);
  const [recentLocations, setRecentLocations] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("6s_recent_locations");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [touched, setTouched] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [annotatorTarget, setAnnotatorTarget] = useState<"wide" | "detail" | null>(null);
  const [proposedTags, setProposedTags] = useState<ProposedTagItem[]>([]);
  const [isTaxonomyOpen, setIsTaxonomyOpen] = useState(false);
  const [autoFeedback, setAutoFeedback] = useState<string | null>(null);

  const wideInputRef = useRef<HTMLInputElement>(null);
  const detailInputRef = useRef<HTMLInputElement>(null);
  const effectiveLocationCode = locationCode || locations[0]?.code || "";

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

  const updateRecentLocations = (code: string) => {
    if (!code) return;
    const next = [code, ...recentLocations.filter((item) => item !== code)].slice(0, 3);
    setRecentLocations(next);
    try {
      localStorage.setItem("6s_recent_locations", JSON.stringify(next));
    } catch {
      // Storage is optional
    }
  };

  const handleSelectCategory = useCallback((cat: IssueCategory) => {
    setCategory(cat);
    setCategoryError(false);
    if (cat === IssueCategory.S5) setCauseType("BEHAVIOR");
    else if (cat !== IssueCategory.S6) setCauseType("CONDITION");
    if (cat === IssueCategory.S6) haptics.safetyAlert();
    else haptics.success();
  }, []);

  const handleToggleTag = useCallback(
    (tagCode: string) => {
      haptics.success();
      const tagObj = localTags.find((item) => (item.code || item.tag_code) === tagCode);
      if (tagObj && isBehaviorTag(tagCode, tagObj.category)) setCauseType("BEHAVIOR");
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
      setLocalTags((prev) => [{ ...newTag, status: "PENDING" }, ...prev]);
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
    if (isWide) {
      setPhotoBefore(null);
      setPreviewBefore(null);
      if (wideInputRef.current) wideInputRef.current.value = "";
    } else {
      setPhotoDetail(null);
      setPreviewDetail(null);
      if (detailInputRef.current) detailInputRef.current.value = "";
    }
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
    let hasError = false;
    if (!category) {
      setCategoryError(true);
      hasError = true;
    }
    if (!photoBefore) {
      setPhotoError(true);
      hasError = true;
    }
    if (!effectiveLocationCode) {
      modalDialog.alert(t("issue.missing_location"));
      return;
    }
    if (hasError || !category || !photoBefore) {
      haptics.errorOrConflict();
      modalDialog.alert(t(!category ? "issue.missing_category" : "issue.missing_photo"));
      return;
    }
    setIsSubmitting(true);
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
        location_snapshot_source: capturedLocation ? "CLIENT_CAPTURE" : undefined,
        asset_id: null,
        assigned_team_id: null,
        assignee_id: null,
        tags: selectedTags,
        proposed_tags: proposedTags.length ? proposedTags : undefined,
        description: description.trim(),
        photo_before_blob: photoBefore,
        photo_detail_blob: photoDetail || undefined,
        created_at: Date.now(),
        sync_status: "PENDING",
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
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-32">
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
            <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
              <section
                className={`bg-white dark:bg-zinc-900 rounded-3xl p-5 border shadow-sm space-y-3 ${touched && photoError ? "border-rose-500 ring-2 ring-rose-500/20" : "border-zinc-200 dark:border-zinc-800"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("issue.step_photos")}
                  </span>
                  {touched && photoError && (
                    <span className="text-xs font-bold text-rose-600 animate-pulse">
                      * {t("issue.missing_photo")}
                    </span>
                  )}
                </div>
                <IssueMediaAttachments
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
                />
              </section>
              <IssueLocationSection
                locations={locations}
                value={effectiveLocationCode}
                onChange={setLocationCode}
                recentLocations={recentLocations}
                locale={locale}
                translate={translate}
              />
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
            <div className="lg:col-span-7 space-y-5">
              <section
                className={`bg-white dark:bg-zinc-900 rounded-3xl p-5 border shadow-sm space-y-4 ${touched && categoryError ? "border-rose-500 ring-2 ring-rose-500/20" : "border-zinc-200 dark:border-zinc-800"}`}
              >
                <IssueCategorySection
                  category={category}
                  causeType={causeType}
                  tags={localTags}
                  selectedTags={selectedTags}
                  locale={locale}
                  onSelectCategory={handleSelectCategory}
                  onToggleTag={handleToggleTag}
                  onCauseTypeChange={(cause) => {
                    setCauseType(cause);
                    haptics.selection();
                  }}
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
              <IssueDescriptionSection
                value={description}
                onChange={setDescription}
                translate={translate}
              />
            </div>
          </div>
        </PageContainer>
      </main>
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 z-30">
        <PageContainer>
          <IssueSubmitButton
            category={category}
            isSubmitting={isSubmitting}
            onClick={() => void handleSubmit()}
            translate={translate}
          />
        </PageContainer>
      </div>
      <IssueAnnotatorModal
        target={annotatorTarget}
        previewBefore={previewBefore}
        previewDetail={previewDetail}
        onSave={(blob, preview, target) => {
          if (target === "wide") {
            setPhotoBefore(blob);
            setPreviewBefore(preview);
          } else {
            setPhotoDetail(blob);
            setPreviewDetail(preview);
          }
        }}
        onClose={() => setAnnotatorTarget(null)}
        translate={translate}
      />
      <TaxonomySelectorModal
        isOpen={isTaxonomyOpen}
        onClose={() => setIsTaxonomyOpen(false)}
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
