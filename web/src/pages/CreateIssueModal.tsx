import { Camera, Check, ShieldAlert, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../api/client.ts";
import { LocationCombobox } from "../components/LocationCombobox.tsx";
import { type DraftIssue, saveDraftIssue } from "../db/indexeddb.ts";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import {
  IssueCategory,
  type IssueItem,
  type LocationItem,
  resolveI18n,
  resolveTagLabel,
  S_CATEGORIES,
  type TagItem,
} from "../types/index.ts";
import { compressImage } from "../utils/compress.ts";
import { haptics } from "../utils/haptics.ts";
import { resolvePhotoUrl } from "../utils/photo.ts";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialIssue) {
      setCategory(initialIssue.category);
      setLocationCode(initialIssue.location_code);
      setSelectedTags(initialIssue.tags || []);
      setDescription(initialIssue.description || "");
      setPhotoBefore(null);
      setPhotoDetail(null);
      setPreviewBefore(resolvePhotoUrl(initialIssue.photo_before, "before"));
      setPreviewDetail(
        initialIssue.photo_detail ? resolvePhotoUrl(initialIssue.photo_detail, "detail") : null,
      );
    }
  }, [initialIssue]);

  if (!isOpen) {
    return null;
  }

  // Cascade tag filtering (SPEC.md Section 4.5): tags prioritized by chosen category
  const filteredTags = tags.filter((t) => !t.category || (category && t.category === category));

  const handleSelectCategory = (cat: IssueCategory) => {
    setCategory(cat);
    if (cat === IssueCategory.S6) {
      haptics.safetyAlert();
    } else {
      haptics.success();
    }
  };

  const handleToggleTag = (tagCode: string) => {
    haptics.success();
    const tagObj = tags.find((t) => t.tag_code === tagCode);

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
        formData.append("location_code", locationCode);
        formData.append("description", description.trim());
        formData.append("tags", JSON.stringify(selectedTags));
        if (photoBefore) {
          formData.append("photo_before", photoBefore, "before.jpg");
        }
        if (photoDetail) {
          formData.append("photo_detail", photoDetail, "detail.jpg");
        }
        const updated = await apiClient<IssueItem>(`/api/issues/${initialIssue.id}`, {
          method: "PATCH",
          body: formData,
        });

        haptics.success();
        onSuccess(updated);
        onClose();
      } else {
        // Create flow
        const clientUuid = crypto.randomUUID();
        const newDraft: DraftIssue = {
          client_uuid: clientUuid,
          category,
          location_code: locationCode,
          tags: selectedTags,
          description: description.trim(),
          photo_before_blob: photoBefore as Blob,
          photo_detail_blob: photoDetail || undefined,
          created_at: Date.now(),
          sync_status: "PENDING",
        };

        // Save immediately to local IndexedDB (Zero loading screen block, SPEC.md Section 9.3)
        await saveDraftIssue(newDraft);
        haptics.success();

        // Trigger background sync
        syncEngine.triggerSync();

        onSuccess();
        onClose();
      }
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(
        initialIssue ? "Không thể cập nhật báo cáo" : "Không thể lưu bản nháp vào IndexedDB",
      );
      setIsSubmitting(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
              {initialIssue ? t("issue.edit_title") : t("issue.create_title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* 1S - 6S Selection with Micro-hints (SPEC.md Section 4.5) */}
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {t("issue.step_category")}
            </label>
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
          </div>

          {/* Location Selection */}
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {t("issue.step_location")}
            </label>
            <LocationCombobox
              locations={locations}
              value={locationCode}
              onChange={(val) => setLocationCode(val)}
            />
          </div>

          {/* Dual-Shot Context: Wide + Detail Photo (SPEC.md Section 9.7) */}
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {t("issue.step_photos")}
            </label>
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
                    <img
                      src={previewBefore}
                      alt={t("issue.photo_wide_alt")}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <Camera className="w-6 h-6 mb-1 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {t("issue.photo_wide_label")}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {t("issue.photo_wide_required")}
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
                    <img
                      src={previewDetail}
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
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                {t("issue.step_tags", { category: category || "" })}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {filteredTags.map((tag) => {
                  const isChecked = selectedTags.includes(tag.tag_code);
                  return (
                    <button
                      key={tag.tag_code}
                      type="button"
                      onClick={() => handleToggleTag(tag.tag_code)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] border ${
                        isChecked
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {resolveTagLabel(tag, locale)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
              {t("issue.step_description")}
            </label>
            <textarea
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
