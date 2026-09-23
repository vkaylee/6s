import { Camera, Check, ShieldAlert, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client.ts";
import { AuthenticatedImage } from "../components/AuthenticatedImage.tsx";
import { LocationCombobox } from "../components/LocationCombobox.tsx";
import { ResponsibilityPicker } from "../components/ResponsibilityPicker.tsx";
import { type DraftIssue, saveDraftIssue } from "../db/indexeddb.ts";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import {
  type CauseType,
  detectCauseType,
  IssueCategory,
  type IssueItem,
  isBehaviorTag,
  type LocationItem,
  resolveI18n,
  resolveTagLabel,
  S_CATEGORIES,
  type TagItem,
} from "../types/index.ts";
import { compressImage } from "../utils/compress.ts";
import { haptics } from "../utils/haptics.ts";
import { resolvePhotoUrl } from "../utils/photo.ts";
import { generateUuid } from "../utils/uuid.ts";

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: LocationItem[];
  tags: TagItem[];
  onSuccess: (updatedIssue?: IssueItem) => void;
  initialIssue?: IssueItem | null;
}
export function CreateIssueModal({
  isOpen,
  onClose,
  onSuccess,
  locations,
  tags,
  initialIssue,
}: CreateIssueModalProps) {
  const { t, locale: storeLocale } = useI18nStore();
  const locale = typeof window === "undefined" ? useI18nStore.getState().locale : storeLocale;
  const [category, setCategory] = useState<IssueCategory | null>(initialIssue?.category || null);
  const [causeType, setCauseType] = useState<CauseType>(() =>
    detectCauseType(initialIssue?.category, initialIssue?.tags),
  );
  const [locationCode, setLocationCode] = useState(
    initialIssue?.location_code || locations[0]?.code || "",
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(initialIssue?.tags || []);
  const [description, setDescription] = useState(initialIssue?.description || "");
  const [photoBefore, setPhotoBefore] = useState<Blob | null>(null);
  const [photoDetail, setPhotoDetail] = useState<Blob | null>(null);
  const [previewBefore, setPreviewBefore] = useState<string | null>(
    initialIssue ? resolvePhotoUrl(initialIssue.photo_before, "before") : null,
  );
  const [previewDetail, setPreviewDetail] = useState<string | null>(
    initialIssue?.photo_detail ? resolvePhotoUrl(initialIssue.photo_detail, "detail") : null,
  );
  const [assetId, setAssetId] = useState<number | null>(initialIssue?.asset_id ?? null);
  const [assignedTeamId, setAssignedTeamId] = useState<number | null>(
    initialIssue?.assigned_team_id ?? null,
  );
  const [assigneeId, setAssigneeId] = useState<number | null>(initialIssue?.assignee_id ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialIssue) {
      setCategory(initialIssue.category);
      setCauseType(detectCauseType(initialIssue.category, initialIssue.tags));
      setLocationCode(initialIssue.location_code);
      setSelectedTags(initialIssue.tags || []);
      setDescription(initialIssue.description || "");
      setPhotoBefore(null);
      setPhotoDetail(null);
      setAssetId(initialIssue.asset_id ?? null);
      setAssignedTeamId(initialIssue.assigned_team_id ?? null);
      setAssigneeId(initialIssue.assignee_id ?? null);
      setPreviewBefore(resolvePhotoUrl(initialIssue.photo_before, "before"));
      setPreviewDetail(
        initialIssue.photo_detail ? resolvePhotoUrl(initialIssue.photo_detail, "detail") : null,
      );
    }
  }, [initialIssue]);

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
      ).filter((element) => !element.hasAttribute("aria-hidden"));
    focusables()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeDialog = (document.activeElement as HTMLElement | null)?.closest(
        '[role="dialog"]',
      );
      const eventDialog = (event.target as HTMLElement | null)?.closest('[role="dialog"]');
      if ((activeDialog && activeDialog !== dialog) || (eventDialog && eventDialog !== dialog))
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  // Cascade tag filtering (SPEC.md Section 4.5): tags prioritized by chosen category
  const filteredTags = tags.filter((t) => !t.category || (category && t.category === category));

  const handleSelectCategory = (cat: IssueCategory) => {
    setCategory(cat);
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
    const tagObj = tags.find((t) => (t.code || t.tag_code) === tagCode);
    if (tagObj && isBehaviorTag(tagCode, tagObj.category)) {
      setCauseType("BEHAVIOR");
    }

    if (selectedTags.includes(tagCode)) {
      setSelectedTags(selectedTags.filter((t) => t !== tagCode));
    } else {
      setSelectedTags([...selectedTags, tagCode]);
      if (tagObj?.category) {
        const catMap: Record<string, IssueCategory> = {
          [IssueCategory.S1]: IssueCategory.S1,
          [IssueCategory.S2]: IssueCategory.S2,
          [IssueCategory.S3]: IssueCategory.S3,
          [IssueCategory.S4]: IssueCategory.S4,
          [IssueCategory.S5]: IssueCategory.S5,
          [IssueCategory.S6]: IssueCategory.S6,
        };
        const mappedCategory = catMap[tagObj.category];
        if (mappedCategory && (!category || category !== mappedCategory)) {
          handleSelectCategory(mappedCategory);
        }
      }
    }
  };

  const handleCapturePhoto = async (e: React.ChangeEvent<HTMLInputElement>, isWide: boolean) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const compressed = await compressImage(file, { maxDimension: 1280, quality: 0.7 });
      const previewUrl = URL.createObjectURL(compressed);
      if (isWide) {
        setPhotoBefore(compressed);
        setPreviewBefore(previewUrl);
      } else {
        setPhotoDetail(compressed);
        setPreviewDetail(previewUrl);
      }
      haptics.success();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue.compress_error"));
    }
  };

  const handleSubmit = async () => {
    if (!category) {
      modalDialog.alert(t("issue.missing_category"));
      return;
    }
    if (!locationCode) {
      modalDialog.alert(t("issue.missing_location"));
      return;
    }
    if (!initialIssue && !photoBefore) {
      modalDialog.alert(t("issue.missing_photo"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (initialIssue) {
        // Edit flow
        const formData = new FormData();
        formData.append("category", category);
        formData.append("cause_type", causeType);
        formData.append("location_code", locationCode);
        formData.append("description", description.trim());
        formData.append("tags", JSON.stringify(selectedTags));
        if (photoBefore) {
          formData.append("photo_before", photoBefore, "before.jpg");
        }
        if (photoDetail) {
          formData.append("photo_detail", photoDetail, "detail.jpg");
        }
        const classificationUpdated = await apiClient<IssueItem>(`/api/issues/${initialIssue.id}`, {
          method: "PATCH",
          body: formData,
        });

        const responsibilityChanged =
          assetId !== (initialIssue.asset_id ?? null) ||
          assignedTeamId !== (initialIssue.assigned_team_id ?? null) ||
          assigneeId !== (initialIssue.assignee_id ?? null);
        const updated = responsibilityChanged
          ? await apiClient<IssueItem>(`/api/issues/${initialIssue.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expected_version: classificationUpdated?.version ?? initialIssue.version,
                asset_id: assetId,
                assigned_team_id: assignedTeamId,
                assignee_id: assigneeId,
              }),
            })
          : classificationUpdated;

        haptics.success();
        onSuccess(updated);
        onClose();
      } else {
        // Create flow
        const capturedLocation = locations.find((location) => location.code === locationCode);
        const newDraft: DraftIssue = {
          client_uuid: generateUuid(),
          category,
          cause_type: causeType,
          location_code: locationCode,
          location_name_vi_snapshot: capturedLocation?.name_vi,
          location_name_zh_snapshot: capturedLocation?.name_zh,
          location_name_en_snapshot: capturedLocation?.name_en,
          location_snapshot_source: capturedLocation ? "CLIENT_CAPTURE" : undefined,
          asset_id: assetId,
          assigned_team_id: assignedTeamId,
          assignee_id: assigneeId,
          tags: selectedTags,
          description: description.trim(),
          photo_before_blob: photoBefore as Blob,
          photo_detail_blob: photoDetail || undefined,
          created_at: Date.now(),
          sync_status: "PENDING",
        };

        await saveDraftIssue(newDraft);
        haptics.success();

        syncEngine.triggerSync();

        onSuccess();
        onClose();
      }
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(initialIssue ? t("issue.update_error") : t("issue.draft_save_error"));
      setIsSubmitting(false);
    }
  };
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-issue-modal-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto"
    >
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-auto flex flex-col h-[94dvh] sm:h-auto sm:max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
            <h2
              id="create-issue-modal-title"
              className="text-lg font-black text-zinc-900 dark:text-zinc-100"
            >
              {initialIssue ? t("issue.edit_title") : t("issue.create_title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-5">
          {/* 1S - 6S Selection with Micro-hints (SPEC.md Section 4.5) */}
          <div>
            <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {t("issue.step_category")}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {S_CATEGORIES.map((s) => {
                const isSelected = category === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleSelectCategory(s.key)}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[64px] ${
                      isSelected
                        ? s.isSafety
                          ? "bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-600/30 ring-2 ring-rose-400"
                          : "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900 shadow-md"
                        : s.isSafety
                          ? "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-300"
                          : "bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-black">{s.key}</span>
                      <span className="text-xs font-bold opacity-80">
                        {s.name_i18n ? resolveI18n(s.name_i18n, locale) : s.name}
                      </span>
                    </div>
                    <div className="text-[11px] leading-tight font-medium opacity-90 mt-1">
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
            <div className="space-y-1.5 mt-3">
              <div className="flex items-center justify-between">
                <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {t("issue.root_cause_title")}
                </span>
                <span className="text-[10px] text-zinc-400 font-medium">
                  {t("issue.root_cause_hint")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCauseType("CONDITION");
                    haptics.selection();
                  }}
                  className={`p-2.5 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[52px] ${
                    causeType === "CONDITION"
                      ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/30 shadow-xs"
                      : "bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📦</span>
                    <span className="font-bold text-xs">{t("issue.cause_condition")}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 leading-tight mt-1 truncate">
                    {t("issue.cause_condition_desc")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCauseType("BEHAVIOR");
                    haptics.selection();
                  }}
                  className={`p-2.5 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[52px] ${
                    causeType === "BEHAVIOR"
                      ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500/30 shadow-xs"
                      : "bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">👤</span>
                    <span className="font-bold text-xs">{t("issue.cause_behavior")}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 leading-tight mt-1 truncate">
                    {t("issue.cause_behavior_desc")}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Location Selection */}
          <div>
            <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {t("issue.step_location")}
            </span>
            <LocationCombobox
              locations={locations}
              value={locationCode}
              onChange={(val) => setLocationCode(val)}
            />
          </div>
          {initialIssue && (
            <ResponsibilityPicker
              locationCode={locationCode}
              assetId={assetId}
              assignedTeamId={assignedTeamId}
              assigneeId={assigneeId}
              onAssetChange={setAssetId}
              onTeamChange={setAssignedTeamId}
              onAssigneeChange={setAssigneeId}
              disabled={isSubmitting}
            />
          )}

          {/* Dual-Shot Context: Wide + Detail Photo (SPEC.md Section 9.7) */}
          <div>
            <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {t("issue.step_photos")}
            </span>
            <div className="grid grid-cols-2 gap-3">
              {/* Wide Shot (Mandatory) */}
              <div className="flex flex-col">
                <label className="cursor-pointer border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-2 text-center bg-zinc-50 dark:bg-zinc-800/40 relative overflow-hidden">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleCapturePhoto(e, true)}
                    className="hidden"
                  />
                  {previewBefore ? (
                    <AuthenticatedImage
                      imageUrl={previewBefore}
                      alt={t("issue.photo_wide_alt")}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <Camera className="w-6 h-6 mb-1 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {t("issue.photo_wide_label")}
                      </span>
                      <span className="text-[10px] text-zinc-400 mt-1 line-clamp-1">
                        {causeType === "BEHAVIOR"
                          ? t("issue.photo_before_hint_behavior")
                          : t("issue.photo_before_hint_condition")}
                      </span>
                    </>
                  )}
                </label>
              </div>

              {/* Detail Shot (Optional) */}
              <div className="flex flex-col">
                <label className="cursor-pointer border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-2 text-center bg-zinc-50 dark:bg-zinc-800/40 relative overflow-hidden">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleCapturePhoto(e, false)}
                    className="hidden"
                  />
                  {previewDetail ? (
                    <AuthenticatedImage
                      imageUrl={previewDetail}
                      alt={t("issue.photo_detail_alt")}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 mb-1 text-zinc-400" />
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {t("issue.photo_detail_label")}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {t("issue.photo_detail_optional")}
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>

          {/* Cascade Tags */}
          {filteredTags.length > 0 && (
            <div>
              <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                {t("issue.step_tags", { category: category || "" })}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {filteredTags.map((tag) => {
                  const code = tag.code || tag.tag_code || "";
                  const isChecked = selectedTags.includes(code);
                  const isPending = tag.status === "PENDING";
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleToggleTag(code)}
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
                      {isPending
                        ? `⏳ #${resolveTagLabel(tag, locale)}`
                        : resolveTagLabel(tag, locale)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
              {t("issue.step_description")}
            </span>
            <textarea
              id="create-issue-description"
              aria-label={t("issue.step_description")}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("issue.description_placeholder")}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-base text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Bottom Sticky Action Bar (Glove Friendly 56px, SPEC.md Section 9.1) */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className={`w-full font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2.5 shadow-xl active:scale-[0.98] transition-transform ${
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
                : initialIssue
                  ? t("issue.save_changes")
                  : category === IssueCategory.S6
                    ? t("issue.submit_safety")
                    : t("issue.submit_standard")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
