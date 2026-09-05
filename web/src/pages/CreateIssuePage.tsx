import { useState } from "react";
import { useLocation } from "wouter";
import { NavActions } from "../components/NavActions.tsx";
import { PageContainer } from "../components/PageContainer.tsx";
import type { DraftIssue } from "../db/indexeddb.ts";
import { saveDraftIssue } from "../db/indexeddb.ts";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import {
  IssueCategory,
  type LocationItem,
  resolveI18n,
  S_CATEGORIES,
  type TagItem,
} from "../types/index.ts";
import { compressImage } from "../utils/compress.ts";
import { haptics } from "../utils/haptics.ts";

interface CreateIssuePageProps {
  locations: LocationItem[];
  tags: TagItem[];
  onSuccess: () => void;
}

export function CreateIssuePage({ locations, tags, onSuccess }: CreateIssuePageProps) {
  const { t, locale: storeLocale } = useI18nStore();
  const locale = typeof window === "undefined" ? useI18nStore.getState().locale : storeLocale;
  const [, setLocation] = useLocation();
  const [category, setCategory] = useState<IssueCategory>(IssueCategory.S6);
  const [locationCode, setLocationCode] = useState(locations[0]?.code || "");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [photoBefore, setPhotoBefore] = useState<Blob | null>(null);
  const [photoDetail, setPhotoDetail] = useState<Blob | null>(null);
  const [previewBefore, setPreviewBefore] = useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cascade tag filtering (SPEC.md Section 4.5): tags prioritized by chosen category
  const filteredTags = tags.filter((tg) => !tg.category || tg.category === category);

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
    if (selectedTags.includes(tagCode)) {
      setSelectedTags(selectedTags.filter((tg) => tg !== tagCode));
    } else {
      setSelectedTags([...selectedTags, tagCode]);
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

  const handleBack = async () => {
    if (photoBefore || photoDetail || description.trim()) {
      const confirmed = await modalDialog.confirm(
        "Bạn có chắc muốn hủy bỏ nội dung đang nhập không?",
        "Hủy báo cáo",
        true,
      );
      if (!confirmed) return;
    }
    setLocation("/");
  };

  const handleSubmit = async () => {
    if (!locationCode) {
      modalDialog.alert(t("issue.missing_location"));
      return;
    }
    if (!photoBefore) {
      modalDialog.alert(t("issue.missing_photo"));
      return;
    }

    setIsSubmitting(true);
    try {
      const clientUuid = crypto.randomUUID();
      const newDraft: DraftIssue = {
        client_uuid: clientUuid,
        category,
        location_code: locationCode,
        tags: selectedTags,
        description: description.trim(),
        photo_before_blob: photoBefore,
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
      setLocation("/");
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert("Không thể lưu bản nháp vào IndexedDB");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <PageContainer className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-lg font-bold"
              aria-label={t("issue.back_aria")}
            >
              ←
            </button>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
              <h1 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                {t("issue.create_title")}
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-2">
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

      {/* Main Form Body */}
      <main className="py-4">
        <PageContainer className="space-y-6">
          {/* 1S - 6S Selection with Micro-hints (SPEC.md Section 4.5) */}
          <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {t("issue.step_category")}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {S_CATEGORIES.map((s) => {
                const isSelected = category === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleSelectCategory(s.key)}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[72px] ${
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
          </section>

          {/* Location Selection */}
          <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {t("issue.step_location")}
            </label>
            <select
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 text-base font-bold text-zinc-900 dark:text-zinc-100 min-h-[56px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {locations.map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {loc.name_vi} ({loc.code}) - {loc.name_zh}
                </option>
              ))}
            </select>
          </section>

          {/* Dual-Shot Context: Wide + Detail Photo (SPEC.md Section 9.7) */}
          <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {t("issue.step_photos")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Wide Shot (Mandatory) */}
              <div className="flex flex-col">
                <label className="cursor-pointer border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-2 text-center bg-zinc-50 dark:bg-zinc-800/40 relative overflow-hidden transition-colors">
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
                      <span className="text-3xl mb-1">📷</span>
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
                <label className="cursor-pointer border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-2 text-center bg-zinc-50 dark:bg-zinc-800/40 relative overflow-hidden transition-colors">
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
                      <span className="text-3xl mb-1">🔍</span>
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
          </section>

          {/* Cascade Tags */}
          {filteredTags.length > 0 && (
            <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                {t("issue.step_tags", { category })}
              </label>
              <div className="flex flex-wrap gap-2">
                {filteredTags.map((tag) => {
                  const isChecked = selectedTags.includes(tag.tag_code);
                  return (
                    <button
                      key={tag.tag_code}
                      type="button"
                      onClick={() => handleToggleTag(tag.tag_code)}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] border ${
                        isChecked
                          ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20"
                          : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {tag.label_vi} / {tag.label_zh}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Description */}
          <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {t("issue.step_description")}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("issue.description_placeholder")}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 text-base text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </section>
        </PageContainer>
      </main>

      {/* Bottom Sticky Action Bar (Glove Friendly 64px, SPEC.md Section 9.1) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 z-30">
        <PageContainer className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className={`flex-1 font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2 shadow-xl active:scale-[0.98] transition-transform ${
              category === IssueCategory.S6
                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30 ring-4 ring-rose-500/20 animate-pulse"
                : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 shadow-zinc-900/20"
            }`}
          >
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
    </div>
  );
}
