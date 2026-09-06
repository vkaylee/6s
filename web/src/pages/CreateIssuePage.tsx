import {
  ArrowLeft,
  Camera,
  Check,
  Clock,
  Info,
  MapPin,
  Pen,
  RotateCcw,
  ShieldAlert,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ImageAnnotatorModal } from "../components/ImageAnnotatorModal.tsx";
import { LocationCombobox } from "../components/LocationCombobox.tsx";
import { NavActions } from "../components/NavActions.tsx";
import { PageContainer } from "../components/PageContainer.tsx";
import { TaxonomySelectorModal } from "../components/TaxonomySelectorModal.tsx";
import type { DraftIssue } from "../db/indexeddb.ts";
import { saveDraftIssue } from "../db/indexeddb.ts";
import { useHeaderVisibility } from "../hooks/useHeaderVisibility.ts";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import {
  type CauseType,
  type I18nObject,
  IssueCategory,
  isBehaviorTag,
  type LocationItem,
  resolveI18n,
  resolveTagLabel,
  S_CATEGORIES,
  type TagItem,
} from "../types/index.ts";
import { compressImage } from "../utils/compress.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";

interface CreateIssuePageProps {
  locations: LocationItem[];
  tags: TagItem[];
  onSuccess: () => void;
}

export function CreateIssuePage({ locations, tags, onSuccess }: CreateIssuePageProps) {
  const { t, locale: storeLocale } = useI18nStore();
  const locale = typeof window === "undefined" ? useI18nStore.getState().locale : storeLocale;
  const [, setLocation] = useLocation();
  const isHeaderVisible = useHeaderVisibility();
  // Form states
  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [causeType, setCauseType] = useState<CauseType>("CONDITION");
  const [locationCode, setLocationCode] = useState(locations[0]?.code || "");
  const [localTags, setLocalTags] = useState<TagItem[]>(tags);

  // Sync tags prop from parent (e.g. after async fetch) into local state
  useEffect(() => {
    if (tags && tags.length > 0) {
      setLocalTags((prev) => {
        const existingCodes = new Set(prev.map((t) => t.tag_code));
        const newItems = tags.filter((t) => !existingCodes.has(t.tag_code));
        return newItems.length > 0 ? [...prev, ...newItems] : prev.length === 0 ? tags : prev;
      });
    }
  }, [tags]);
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

  // Recent locations from localStorage
  const [recentLocations, setRecentLocations] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("6s_recent_locations");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Validation errors
  const [touched, setTouched] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  // Annotation Modal state
  const [annotatorTarget, setAnnotatorTarget] = useState<"wide" | "detail" | null>(null);

  // Hidden file input refs for Retake / Re-upload
  const wideInputRef = useRef<HTMLInputElement | null>(null);
  const detailInputRef = useRef<HTMLInputElement | null>(null);

  // Taxonomy Modal state
  const [isTaxonomyOpen, setIsTaxonomyOpen] = useState(false);
  const [autoFeedback, setAutoFeedback] = useState<string | null>(null);
  // Category badge color styling map
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

  const handleSelectCategory = (cat: IssueCategory) => {
    setCategory(cat);
    setCategoryError(false);
    if (cat === IssueCategory.S5) {
      setCauseType("BEHAVIOR");
    } else if (cat !== IssueCategory.S6) {
      setCauseType("CONDITION");
    }
    if (cat === IssueCategory.S6) {
      haptics.safetyAlert();
    } else {
      haptics.success();
    }
  };

  const handleToggleTag = (tagCode: string) => {
    haptics.success();
    const tagObj = localTags.find((t) => t.tag_code === tagCode);
    if (tagObj && isBehaviorTag(tagCode, tagObj.category)) {
      setCauseType("BEHAVIOR");
    }

    if (selectedTags.includes(tagCode)) {
      setSelectedTags((prev) => prev.filter((c) => c !== tagCode));
    } else {
      setSelectedTags((prev) => [...prev, tagCode]);
      if (tagObj?.category) {
        const mappedCat = tagObj.category as IssueCategory;
        if (Object.values(IssueCategory).includes(mappedCat)) {
          setCategory(mappedCat);
          setCategoryError(false);
          setAutoFeedback(mappedCat);
          setTimeout(() => setAutoFeedback(null), 2500);
        }
      }
    }
  };
  const handleAddCustomTag = (newTag: TagItem) => {
    setLocalTags((prev) => [newTag, ...prev]);
  };
  const processImageFile = useCallback(
    async (file: File | Blob, isWide: boolean) => {
      try {
        const compressed = await compressImage(file, {
          maxDimension: 1280,
          quality: 0.7,
        });
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

  const handleCapturePhoto = async (e: React.ChangeEvent<HTMLInputElement>, isWide: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImageFile(file, isWide);
  };

  // Drag and drop handlers
  const handleDrop = async (e: React.DragEvent<HTMLElement>, isWide: boolean) => {
    e.preventDefault();
    if (isWide) setDragOverWide(false);
    else setDragOverDetail(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        await processImageFile(file, isWide);
      }
    }
  };

  // Global clipboard paste support (Ctrl+V)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            if (!photoBefore) {
              await processImageFile(file, true);
            } else if (!photoDetail) {
              await processImageFile(file, false);
            }
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [photoBefore, photoDetail, processImageFile]);

  // Auto-save draft timestamp indicator
  useEffect(() => {
    if (category || photoBefore || description.trim() || selectedTags.length > 0) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastDraftTime(timeStr);
    }
  }, [category, photoBefore, description, selectedTags]);

  // Save recent location to localStorage
  const updateRecentLocations = (code: string) => {
    if (!code) return;
    const next = [code, ...recentLocations.filter((c) => c !== code)].slice(0, 3);
    setRecentLocations(next);
    try {
      localStorage.setItem("6s_recent_locations", JSON.stringify(next));
    } catch {
      // ignore
    }
  };
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

  const handleSaveAnnotation = (newBlob: Blob, newPreview: string) => {
    if (annotatorTarget === "wide") {
      setPhotoBefore(newBlob);
      setPreviewBefore(newPreview);
    } else if (annotatorTarget === "detail") {
      setPhotoDetail(newBlob);
      setPreviewDetail(newPreview);
    }
  };

  const handleBack = async () => {
    if (photoBefore || photoDetail || description.trim()) {
      const confirmed = await modalDialog.confirm(
        "Bạn có chắc muốn hủy bỏ nội dung đang nhập không?",
        "Hủy báo cáo",
        true,
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
    if (!locationCode) {
      modalDialog.alert(t("issue.missing_location"));
      return;
    }

    if (hasError || !category || !photoBefore) {
      haptics.errorOrConflict();
      if (!category) {
        modalDialog.alert(t("issue.missing_category"));
      } else {
        modalDialog.alert(t("issue.missing_photo"));
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const clientUuid = crypto.randomUUID();
      const newDraft: DraftIssue = {
        client_uuid: clientUuid,
        category,
        cause_type: causeType,
        location_code: locationCode,
        tags: selectedTags,
        description: description.trim(),
        photo_before_blob: photoBefore,
        photo_detail_blob: photoDetail || undefined,
        created_at: Date.now(),
        sync_status: "PENDING",
      };
      await saveDraftIssue(newDraft);
      updateRecentLocations(locationCode);
      haptics.success();
      syncEngine.triggerSync();
      onSuccess();
      setLocation("/", { replace: true });
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert("Không thể lưu bản nháp vào IndexedDB");
    } finally {
      setIsSubmitting(false);
    }
  };
  // Keyboard shortcuts: 1-6 for categories, Ctrl+Enter / Cmd+Enter to submit, Esc to back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If inside an input or textarea, only check for Cmd/Ctrl+Enter
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
        return;
      }

      if (isInput) return;

      if (e.key === "Escape") {
        e.preventDefault();
        handleBack();
        return;
      }

      const keyMap: Record<string, IssueCategory> = {
        "1": IssueCategory.S1,
        "2": IssueCategory.S2,
        "3": IssueCategory.S3,
        "4": IssueCategory.S4,
        "5": IssueCategory.S5,
        "6": IssueCategory.S6,
      };

      if (keyMap[e.key]) {
        e.preventDefault();
        handleSelectCategory(keyMap[e.key]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSubmit, handleBack, handleSelectCategory]);

  const annotatorTitle: I18nObject = {
    vi: t("issue.annotator_title"),
    en: t("issue.annotator_title"),
    zh: t("issue.annotator_title"),
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-32">
      {/* Hidden file inputs for retake */}
      <input
        ref={wideInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleCapturePhoto(e, true)}
        className="hidden"
      />
      <input
        ref={detailInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleCapturePhoto(e, false)}
        className="hidden"
      />

      {/* Top Navigation Bar */}
      <header
        className={`sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-transform duration-300 ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <PageContainer className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={t("issue.back_aria")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
              <h1 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                {t("issue.create_title")}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {lastDraftTime && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium text-zinc-500">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>{t("issue.draft_saved_at", { time: lastDraftTime })}</span>
              </div>
            )}
            <NavActions />
            <button
              type="button"
              onClick={handleBack}
              className="text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-1"
            >
              {t("common.cancel")}
            </button>
          </div>
        </PageContainer>
      </header>

      {/* Main Responsive Grid Form */}
      <main className="py-4 sm:py-6">
        <PageContainer>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
            {/* Left Column (5/12 on LG/XL): Visual Proof & Context */}
            <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
              {/* Dual-Shot Context Section */}
              <section
                className={`bg-white dark:bg-zinc-900 rounded-3xl p-5 border shadow-sm space-y-3 transition-colors ${
                  touched && photoError
                    ? "border-rose-500 ring-2 ring-rose-500/20"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("issue.step_photos")}
                  </label>
                  {touched && photoError && (
                    <span className="text-xs font-bold text-rose-600 animate-pulse">
                      * {t("issue.missing_photo")}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
                  {/* Photo 1: Wide Shot (Mandatory) */}
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {t("issue.photo_wide_label")}
                      </span>
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-black">
                        {t("issue.photo_wide_required")}
                      </span>
                    </div>

                    {previewBefore ? (
                      <div className="relative rounded-2xl overflow-hidden aspect-[4/3] border border-zinc-200 dark:border-zinc-700 bg-zinc-950 group">
                        <img
                          src={previewBefore}
                          alt={t("issue.photo_wide_alt")}
                          className="w-full h-full object-cover"
                        />
                        {/* Overlay Controls */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() => setAnnotatorTarget("wide")}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-lg hover:bg-rose-700 flex items-center gap-1.5"
                          >
                            <Pen className="w-3.5 h-3.5" />
                            <span>{t("issue.photo_annotate_btn")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => wideInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-xl bg-white text-zinc-900 text-xs font-bold shadow-lg hover:bg-zinc-100 flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{t("issue.photo_retake_btn")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(true)}
                            className="p-2 rounded-xl bg-zinc-900/80 text-rose-400 hover:text-rose-300 font-bold"
                            title={t("issue.photo_remove_btn")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Always visible mobile action bar */}
                        <div className="sm:hidden absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/70 backdrop-blur-md rounded-xl p-1 text-white text-xs">
                          <button
                            type="button"
                            onClick={() => setAnnotatorTarget("wide")}
                            className="flex-1 py-1 text-center font-bold text-rose-400 hover:text-rose-300 flex items-center justify-center gap-1"
                          >
                            <Pen className="w-3 h-3" />
                            <span>{t("issue.photo_annotate_btn")}</span>
                          </button>
                          <span className="text-zinc-600">|</span>
                          <button
                            type="button"
                            onClick={() => wideInputRef.current?.click()}
                            className="flex-1 py-1 text-center font-bold flex items-center justify-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{t("issue.photo_retake_btn")}</span>
                          </button>
                          <span className="text-zinc-600">|</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(true)}
                            className="px-2.5 py-1 text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverWide(true);
                        }}
                        onDragLeave={() => setDragOverWide(false)}
                        onDrop={(e) => handleDrop(e, true)}
                        onClick={() => wideInputRef.current?.click()}
                        className={`w-full cursor-pointer border-2 border-dashed rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-4 text-center transition-all ${
                          dragOverWide
                            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 scale-[1.01]"
                            : "border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 bg-zinc-50 dark:bg-zinc-800/40"
                        }`}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 shadow-xs">
                          <Camera className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                          {t("issue.photo_wide_label")}
                        </span>
                        <span className="text-[11px] text-zinc-400 mt-1">
                          {dragOverWide
                            ? t("issue.drop_photo_active")
                            : causeType === "BEHAVIOR"
                              ? t("issue.photo_before_hint_behavior")
                              : t("issue.photo_before_hint_condition")}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Photo 2: Detail Shot (Optional) */}
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {t("issue.photo_detail_label")}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {t("issue.photo_detail_optional")}
                      </span>
                    </div>

                    {previewDetail ? (
                      <div className="relative rounded-2xl overflow-hidden aspect-[4/3] border border-zinc-200 dark:border-zinc-700 bg-zinc-950 group">
                        <img
                          src={previewDetail}
                          alt={t("issue.photo_detail_alt")}
                          className="w-full h-full object-cover"
                        />
                        {/* Overlay Controls */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() => setAnnotatorTarget("detail")}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-lg hover:bg-rose-700 flex items-center gap-1.5"
                          >
                            <Pen className="w-3.5 h-3.5" />
                            <span>{t("issue.photo_annotate_btn")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => detailInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-xl bg-white text-zinc-900 text-xs font-bold shadow-lg hover:bg-zinc-100 flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{t("issue.photo_retake_btn")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(false)}
                            className="p-2 rounded-xl bg-zinc-900/80 text-rose-400 hover:text-rose-300 font-bold"
                            title={t("issue.photo_remove_btn")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Always visible mobile action bar */}
                        <div className="sm:hidden absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/70 backdrop-blur-md rounded-xl p-1 text-white text-xs">
                          <button
                            type="button"
                            onClick={() => setAnnotatorTarget("detail")}
                            className="flex-1 py-1 text-center font-bold text-rose-400 hover:text-rose-300 flex items-center justify-center gap-1"
                          >
                            <Pen className="w-3 h-3" />
                            <span>{t("issue.photo_annotate_btn")}</span>
                          </button>
                          <span className="text-zinc-600">|</span>
                          <button
                            type="button"
                            onClick={() => detailInputRef.current?.click()}
                            className="flex-1 py-1 text-center font-bold flex items-center justify-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{t("issue.photo_retake_btn")}</span>
                          </button>
                          <span className="text-zinc-600">|</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(false)}
                            className="px-2.5 py-1 text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverDetail(true);
                        }}
                        onDragLeave={() => setDragOverDetail(false)}
                        onDrop={(e) => handleDrop(e, false)}
                        onClick={() => detailInputRef.current?.click()}
                        className={`w-full cursor-pointer border-2 border-dashed rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-4 text-center transition-all ${
                          dragOverDetail
                            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 scale-[1.01]"
                            : "border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 bg-zinc-50 dark:bg-zinc-800/40"
                        }`}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center mb-2 shadow-xs">
                          <Upload className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                          {t("issue.photo_detail_label")}
                        </span>
                        <span className="text-[11px] text-zinc-400 mt-1">
                          {dragOverDetail
                            ? t("issue.drop_photo_active")
                            : t("issue.drag_drop_photo")}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Location Selector (Enterprise Combobox) */}
              <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {t("issue.step_location")}
                </label>
                <LocationCombobox
                  locations={locations}
                  value={locationCode}
                  onChange={(val) => setLocationCode(val)}
                />
                {recentLocations.length > 0 && (
                  <div className="pt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-zinc-400 mr-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{t("issue.recent_locations")}</span>
                    </span>
                    {recentLocations.map((code) => {
                      const loc = locations.find((l) => l.code === code);
                      const isSelected = locationCode === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => {
                            setLocationCode(code);
                            haptics.selection();
                          }}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 ${
                            isSelected
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-blue-400"
                          }`}
                        >
                          <span>{loc ? loc.name_vi : code}</span>
                          <span className="text-[10px] opacity-70 font-mono">({code})</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Desktop Sticky Submit Action */}
              <div className="hidden lg:block pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  className={`w-full font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2.5 shadow-xl active:scale-[0.98] transition-all ${
                    category === IssueCategory.S6
                      ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30 ring-4 ring-rose-500/20 animate-pulse"
                      : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 shadow-zinc-900/20"
                  }`}
                >
                  {category === IssueCategory.S6 ? (
                    <ShieldAlert className="w-5 h-5" />
                  ) : (
                    <Check className="w-5 h-5" />
                  )}
                  <span>
                    {isSubmitting
                      ? t("issue.saving")
                      : category === IssueCategory.S6
                        ? t("issue.submit_safety")
                        : t("issue.submit_standard")}
                  </span>
                </button>
                <p className="text-[11px] text-center text-zinc-400 font-medium pt-1.5">
                  {t("issue.shortcuts_hint")}
                </p>
              </div>
            </div>

            {/* Right Column (7/12 on LG/XL): Unified 6S Categorization & Taxonomy Tags */}
            <div className="lg:col-span-7 space-y-5">
              {/* Unified 6S Card: Micro-hints + Selected Tags */}
              <section
                className={`bg-white dark:bg-zinc-900 rounded-3xl p-5 border shadow-sm space-y-4 transition-colors ${
                  touched && categoryError
                    ? "border-rose-500 ring-2 ring-rose-500/20"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("issue.step_category")}
                  </label>
                </div>

                {touched && categoryError && (
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    * {t("issue.missing_category")}
                  </p>
                )}

                {/* 1S-6S Enterprise 2x3 Grid with Clean Typography Hierarchy */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {S_CATEGORIES.map((s) => {
                    const isSelected = category === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleSelectCategory(s.key)}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[76px] ${
                          isSelected
                            ? s.isSafety
                              ? "bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-600/30 ring-2 ring-rose-400"
                              : "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900 shadow-md"
                            : s.isSafety
                              ? "bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 hover:border-rose-400 hover:bg-rose-50"
                              : "bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 hover:bg-zinc-100/60 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-base font-black tracking-tight">{s.key}</span>
                          <span className="text-xs font-bold opacity-85">
                            {s.name_i18n ? resolveI18n(s.name_i18n, locale) : s.name}
                          </span>
                        </div>
                        <div className="text-[11px] leading-snug font-medium opacity-85 mt-2">
                          {s.hint_i18n
                            ? resolveI18n(s.hint_i18n, locale)
                            : locale === "zh"
                              ? s.hint_zh
                              : s.hint_vi}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 6S Root Cause 1-Touch Selector: Condition vs Behavior */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      {t("issue.root_cause_title")}
                    </label>
                    <span className="text-[10px] text-zinc-400 font-medium">
                      {t("issue.root_cause_hint")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCauseType("CONDITION");
                        haptics.selection();
                      }}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[58px] ${
                        causeType === "CONDITION"
                          ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/30 shadow-xs"
                          : "bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">📦</span>
                        <span className="font-bold text-xs">{t("issue.cause_condition")}</span>
                      </div>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-400 leading-tight mt-1">
                        {t("issue.cause_condition_desc")}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCauseType("BEHAVIOR");
                        haptics.selection();
                      }}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[58px] ${
                        causeType === "BEHAVIOR"
                          ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500/30 shadow-xs"
                          : "bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">👤</span>
                        <span className="font-bold text-xs">{t("issue.cause_behavior")}</span>
                      </div>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-400 leading-tight mt-1">
                        {t("issue.cause_behavior_desc")}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Dynamic Contextual Guidance Card */}
                {category ? (
                  (() => {
                    const currentCatObj = S_CATEGORIES.find((s) => s.key === category);
                    const isSafety = currentCatObj?.isSafety;
                    const catName = currentCatObj?.name_i18n
                      ? resolveI18n(currentCatObj.name_i18n, locale)
                      : currentCatObj?.name;
                    const signs = currentCatObj?.description_i18n
                      ? resolveI18n(currentCatObj.description_i18n, locale)
                      : currentCatObj?.hint_vi;
                    const action = currentCatObj?.action_i18n
                      ? resolveI18n(currentCatObj.action_i18n, locale)
                      : "";
                    const categoryTags = [...localTags]
                      .filter((tg) => tg.category === category)
                      .sort((a, b) => (b.use_count || 0) - (a.use_count || 0))
                      .slice(0, 8);
                    return (
                      <div
                        className={`p-3.5 rounded-2xl border text-xs space-y-2.5 transition-all ${
                          isSafety
                            ? "bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-200"
                            : "bg-zinc-50/90 dark:bg-zinc-800/60 border-zinc-200/90 dark:border-zinc-700/80 text-zinc-800 dark:text-zinc-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-black">
                          {isSafety ? (
                            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          ) : (
                            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          )}
                          <span className="text-sm tracking-tight">
                            {category} - {catName}
                          </span>
                        </div>

                        {/* Signs & Action Grid */}
                        <div className="space-y-1.5 pl-6">
                          <div>
                            <span className="font-bold text-zinc-500 dark:text-zinc-400 mr-1.5 uppercase text-[10px] tracking-wider">
                              {t("issue.category_signs_label") || "Dấu hiệu"}:
                            </span>
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                              {signs}
                            </span>
                          </div>
                          {action && (
                            <div>
                              <span className="font-bold text-zinc-500 dark:text-zinc-400 mr-1.5 uppercase text-[10px] tracking-wider">
                                {t("issue.category_action_label") || "Hành động"}:
                              </span>
                              <span
                                className={`font-semibold ${
                                  isSafety
                                    ? "text-rose-700 dark:text-rose-300"
                                    : "text-zinc-900 dark:text-zinc-100"
                                }`}
                              >
                                {action}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Quick Suggested Tags */}
                        {categoryTags.length > 0 && (
                          <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 flex flex-wrap items-center gap-1.5 pl-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">
                              {t("issue.category_quick_tags_label") || "Gợi ý thẻ"}:
                            </span>
                            {categoryTags.map((tg) => {
                              const isChecked = selectedTags.includes(tg.tag_code);
                              const label = resolveTagLabel(tg, locale);
                              return (
                                <button
                                  key={tg.tag_code}
                                  type="button"
                                  onClick={() => handleToggleTag(tg.tag_code)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 ${
                                    isChecked
                                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                      : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                                  }`}
                                >
                                  {isChecked ? (
                                    <Check className="w-3 h-3 shrink-0" />
                                  ) : (
                                    <Tag className="w-2.5 h-2.5 opacity-60 shrink-0" />
                                  )}
                                  <span>{label}</span>
                                  {Boolean(tg.use_count && tg.use_count > 0) && (
                                    <span
                                      className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                                        isChecked
                                          ? "bg-blue-700 text-blue-100"
                                          : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
                                      }`}
                                    >
                                      {tg.use_count}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 flex items-start gap-2.5 text-xs">
                    <Info className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-zinc-600 dark:text-zinc-300 font-semibold">
                        {t("issue.select_category_placeholder") ||
                          "Chưa rõ chọn mục nào? Xem nhanh gợi ý:"}
                      </p>
                      <p className="text-zinc-400 font-medium text-[11px] leading-relaxed">
                        {t("issue.category_guide_summary") ||
                          "1S: Đồ thừa/Rác • 2S: Sai chỗ/Thiếu vạch • 3S: Bẩn/Rò rỉ • 4S: Hỏng chuẩn • 5S: Tác phong • 6S: Nguy hiểm/Cháy nổ"}
                      </p>
                    </div>
                  </div>
                )}
                {/* Auto feedback if triggered */}
                {autoFeedback && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 animate-fade-in">
                    <Check className="w-3.5 h-3.5" />
                    <span>{t("issue.auto_classified", { category: autoFeedback })}</span>
                  </div>
                )}

                {/* Issue Taxonomies Section inside card */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        {t("issue.quick_tags_title")}
                      </span>
                      <span className="text-[11px] font-bold text-zinc-400">
                        ({selectedTags.length})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsTaxonomyOpen(true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1.5 min-h-[36px]"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>{t("issue.add_tags_button") || "Thêm thẻ sự cố"}</span>
                    </button>
                  </div>

                  {/* Selected Tags Chips or Empty Placeholder */}
                  {selectedTags.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic py-1">
                      {t("issue.no_tags_selected") || "Chưa chọn thẻ lỗi nào"}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedTags.map((tagCode) => {
                        const tagObj = localTags.find((t) => t.tag_code === tagCode);
                        const badgeColor = tagObj?.category
                          ? categoryBadgeColors[tagObj.category] ||
                            "bg-zinc-100 text-zinc-700 border-zinc-200"
                          : "bg-zinc-100 text-zinc-700 border-zinc-200";

                        return (
                          <span
                            key={tagCode}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 shadow-sm"
                          >
                            <span>{tagObj ? resolveTagLabel(tagObj, locale) : tagCode}</span>
                            {tagObj?.category && (
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded border font-mono font-black ${badgeColor}`}
                              >
                                {tagObj.category}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleToggleTag(tagCode)}
                              aria-label="Remove tag"
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
              </section>

              {/* Description */}
              <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {t("issue.step_description")}
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("issue.description_placeholder")}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 text-base text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </section>
            </div>
          </div>
        </PageContainer>
      </main>

      {/* Bottom Sticky Action Bar on Mobile/Tablet (<1024px) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 z-30">
        <PageContainer className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className={`flex-1 font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2.5 shadow-xl active:scale-[0.98] transition-transform ${
              category === IssueCategory.S6
                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30 ring-4 ring-rose-500/20 animate-pulse"
                : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 shadow-zinc-900/20"
            }`}
          >
            {category === IssueCategory.S6 ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <Check className="w-5 h-5" />
            )}
            <span>
              {isSubmitting
                ? t("issue.saving")
                : category === IssueCategory.S6
                  ? t("issue.submit_safety")
                  : t("issue.submit_standard")}
            </span>
          </button>
        </PageContainer>
      </div>

      {/* Image Annotator Modal */}
      {annotatorTarget && (
        <ImageAnnotatorModal
          imageUrl={annotatorTarget === "wide" ? previewBefore || "" : previewDetail || ""}
          isOpen={true}
          title={annotatorTitle}
          onSave={handleSaveAnnotation}
          onClose={() => setAnnotatorTarget(null)}
        />
      )}

      {/* 6S Issue Taxonomy Selector Modal */}
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
