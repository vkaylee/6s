import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client.ts";
import { LocationCombobox } from "../components/LocationCombobox.tsx";
import { SplitSlider } from "../components/SplitSlider.tsx";
import { type DraftResolve, saveDraftResolve } from "../db/indexeddb.ts";
import { useI18nStore } from "../i18n/index.ts";
import { useAuthStore } from "../store/authStore.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationItem,
  resolveI18n,
  S_CATEGORIES,
  type ScoreLogItem,
  type TagItem,
  UserRole,
} from "../types/index.ts";
import { compressImage } from "../utils/compress.ts";
import { haptics } from "../utils/haptics.ts";
import { resolvePhotoUrl } from "../utils/photo.ts";
import { CreateIssueModal } from "./CreateIssueModal.tsx";

interface IssueDetailModalProps {
  issue: IssueItem;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  locations?: LocationItem[];
  tags?: TagItem[];
}

export function IssueDetailModal({
  issue,
  isOpen,
  onClose,
  onRefresh,
  locations = [],
  tags = [],
}: IssueDetailModalProps) {
  const { t, locale: storeLocale } = useI18nStore();
  const locale = typeof window === "undefined" ? useI18nStore.getState().locale : storeLocale;
  const storeUser = useAuthStore((s) => s.user);
  const user = typeof window === "undefined" ? useAuthStore.getState().user : storeUser;
  const [currentIssue, setCurrentIssue] = useState<IssueItem>(issue);

  useEffect(() => {
    setCurrentIssue(issue);
  }, [issue]);

  const [isEditingFull, setIsEditingFull] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [scoreRating, setScoreRating] = useState<number>(3); // Default 3 stars (SPEC.md Section 9.8.B)
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmAction, setShowConfirmAction] = useState<"CLOSE" | "REOPEN" | "INVALID" | null>(
    null,
  );
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [issueScoreLogs, setIssueScoreLogs] = useState<ScoreLogItem[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);

  useEffect(() => {
    if (!isOpen || !issue?.id) {
      setIssueScoreLogs([]);
      return;
    }
    let isMounted = true;
    setLoadingScores(true);
    apiClient<ScoreLogItem[]>(`/api/issues/${issue.id}/score-logs`)
      .then((data) => {
        if (isMounted) {
          setIssueScoreLogs(data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIssueScoreLogs([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingScores(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, issue?.id]);

  // List of all viewable photos for this issue with category color badges
  const photoList = [
    currentIssue.photo_before
      ? {
          url: resolvePhotoUrl(currentIssue.photo_before, "before"),
          alt: t("issue_detail.photo_before_alt"),
          label: t("slider.before"),
          badgeClass: "bg-amber-500 text-zinc-950 font-black shadow-amber-500/20",
        }
      : null,
    currentIssue.photo_detail
      ? {
          url: resolvePhotoUrl(currentIssue.photo_detail, "detail"),
          alt: t("issue_detail.photo_detail_alt"),
          label: t("issue.photo_detail_label"),
          badgeClass: "bg-blue-500 text-white font-black shadow-blue-500/20",
        }
      : null,
    currentIssue.photo_after
      ? {
          url: resolvePhotoUrl(currentIssue.photo_after, "after"),
          alt: t("slider.after_alt"),
          label: t("slider.after"),
          badgeClass: "bg-emerald-500 text-zinc-950 font-black shadow-emerald-500/20",
        }
      : null,
  ].filter((p): p is { url: string; alt: string; label: string; badgeClass: string } => p !== null);

  const previewPhoto =
    previewIndex !== null && photoList[previewIndex] ? photoList[previewIndex] : null;

  // Reset pan & zoom when photo changes
  useEffect(() => {
    if (previewIndex !== null) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [previewIndex]);

  // Escape & Arrow keys listener for gallery navigation & modal closing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewIndex !== null) {
          setPreviewIndex(null);
        } else if (showConfirmAction) {
          setShowConfirmAction(null);
        } else {
          onClose();
        }
      } else if (previewIndex !== null) {
        if (e.key === "ArrowLeft") {
          setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : photoList.length - 1));
        } else if (e.key === "ArrowRight") {
          setPreviewIndex((prev) => (prev !== null && prev < photoList.length - 1 ? prev + 1 : 0));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewIndex, showConfirmAction, onClose, photoList.length]);

  // Prevent background body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Non-passive wheel listener to allow e.preventDefault()
  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoomScale((s) => Math.min(5, Math.max(0.5, Number((s + delta).toFixed(2)))));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [previewPhoto]);
  if (!isOpen) {
    return null;
  }

  const role = user?.role || UserRole.USER;
  const isSafetyIssue = currentIssue.category === IssueCategory.S6;

  // Edit Permission: Creator, Resolver, Admin, Safety Officer
  const canEdit =
    currentIssue.status === IssueStatus.OPEN &&
    (user?.id === currentIssue.creator_id ||
      (currentIssue.resolver_id && user?.id === currentIssue.resolver_id) ||
      role === UserRole.ADMIN ||
      role === UserRole.SAFETY_OFFICER);

  // RBAC Permission Check (SPEC.md Section 3.2 & 9.9.F)
  // Resolve: Anyone
  // Close: Admin or Safety (for 6S); Admin, Safety, or matching Line Leader (for 1S-5S)
  const canClose =
    role === UserRole.ADMIN ||
    role === UserRole.SAFETY_OFFICER ||
    (role === UserRole.LINE_LEADER &&
      !isSafetyIssue &&
      (!user?.assigned_location_code ||
        user.assigned_location_code === currentIssue.location_code));
  const closeDisabledReason =
    isSafetyIssue && role !== UserRole.ADMIN && role !== UserRole.SAFETY_OFFICER
      ? t("issue_detail.need_safety_officer")
      : role === UserRole.LINE_LEADER &&
          user?.assigned_location_code &&
          user.assigned_location_code !== currentIssue.location_code
        ? t("issue_detail.only_assigned_line")
        : role === UserRole.USER
          ? t("issue_detail.need_line_leader")
          : null;
  const handleQuickChangeCategory = async (newCat: IssueCategory) => {
    try {
      const updated = await apiClient<IssueItem>(`/api/issues/${currentIssue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCat }),
      });
      haptics.success();
      if (updated) {
        setCurrentIssue(updated);
      }
      setIsEditingCategory(false);
      onRefresh();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert("Không thể đổi phân loại issue");
    }
  };

  const handleQuickChangeLocation = async (newLocCode: string) => {
    if (!newLocCode || newLocCode === currentIssue.location_code) {
      setIsEditingLocation(false);
      return;
    }
    try {
      const updated = await apiClient<IssueItem>(`/api/issues/${currentIssue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_code: newLocCode }),
      });
      haptics.success();
      if (updated) {
        setCurrentIssue(updated);
      }
      setIsEditingLocation(false);
      onRefresh();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.update_location_error"));
    }
  };

  const handleResolveOfflineOrOnline = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setIsSubmitting(true);
      const compressed = await compressImage(file, { maxDimension: 1280, quality: 0.7 });

      // Save draft resolve in local IndexedDB (SPEC.md Section 7.2)
      const draft: DraftResolve = {
        resolved_client_uuid: crypto.randomUUID(),
        issue_id: currentIssue.id,
        expected_version: currentIssue.version,
        photo_after_blob: compressed,
        resolved_at: Date.now(),
        sync_status: "PENDING",
      };

      await saveDraftResolve(draft);
      haptics.success();
      syncEngine.triggerSync();
      await modalDialog.alert(t("issue.sync_resolve_msg"));
      onRefresh();
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert("Lỗi khi xử lý ảnh khắc phục");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmClose = async () => {
    setIsSubmitting(true);
    try {
      await apiClient(`/api/issues/${currentIssue.id}/close`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score_rating: scoreRating,
        }),
      });
      haptics.success();
      setShowConfirmAction(null);
      onRefresh();
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert("Duyệt đạt thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReopen = async () => {
    setIsSubmitting(true);
    try {
      await apiClient(`/api/issues/${currentIssue.id}/reopen`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reject_reason: rejectReason.trim() || "Chưa đạt yêu cầu 6S",
        }),
      });
      haptics.success();
      setShowConfirmAction(null);
      onRefresh();
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert("Mở lại issue thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmInvalid = async () => {
    setIsSubmitting(true);
    try {
      await apiClient(`/api/issues/${currentIssue.id}/invalidate`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reject_reason: rejectReason.trim() || "Báo cáo không đúng thực tế",
        }),
      });
      haptics.success();
      setShowConfirmAction(null);
      onRefresh();
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert("Bác bỏ thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOpenStatus = currentIssue.status === IssueStatus.OPEN;
  const isPendingReview = currentIssue.status === IssueStatus.PENDING_REVIEW;
  const isClosedStatus = currentIssue.status === IssueStatus.CLOSED;

  const statusBadge = isOpenStatus ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
      ⚠️ {t("status.OPEN")}
    </span>
  ) : isPendingReview ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
      ⏳ {t("status.PENDING_REVIEW")}
    </span>
  ) : isClosedStatus ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
      ✓ {t("status.CLOSED")}
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 shrink-0">
      {t("status.INVALID")}
    </span>
  );

  const dateLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 2xl:p-8 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      {/* Backdrop overlay button for a11y click-outside */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="fixed inset-0 w-full h-full cursor-default bg-transparent -z-10 focus:outline-hidden"
        tabIndex={-1}
      />
      <div className="w-full max-w-lg lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden sm:my-auto flex flex-col max-h-[95vh] lg:max-h-[90vh] 2xl:max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setIsEditingCategory(!isEditingCategory);
                  setIsEditingLocation(false);
                }}
                className="px-2.5 py-1 rounded-lg font-black text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 flex items-center space-x-1 shrink-0"
                title={t("issue_detail.quick_edit_category")}
              >
                <span>{currentIssue.category}</span>
                <span className="text-xs opacity-50">✎</span>
              </button>
            ) : (
              <span className="px-2.5 py-1 rounded-lg font-black text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 shrink-0">
                {currentIssue.category}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 min-w-0">
                <h2 className="font-bold text-base text-zinc-900 dark:text-zinc-100 truncate">
                  #{currentIssue.id} - {currentIssue.location_name || currentIssue.location_code}
                </h2>
                {canEdit && locations && locations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingLocation(!isEditingLocation);
                      setIsEditingCategory(false);
                    }}
                    className="text-xs text-zinc-400 hover:text-blue-600 p-0.5 shrink-0"
                    title={t("issue_detail.quick_edit_location")}
                  >
                    ✎
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-2 text-xs text-zinc-400">
                <span>{currentIssue.location_code}</span>
                <span>•</span>
                <span>v{currentIssue.version}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 shrink-0">
            {statusBadge}
            {canEdit && (
              <button
                type="button"
                onClick={() => setIsEditingFull(true)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 transition-colors flex items-center space-x-1"
                title={t("issue.edit")}
              >
                <span>✏️</span>
                <span className="hidden xs:inline">{t("issue.edit")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-600 font-bold min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>

        {/* In-place quick edit category drawer */}
        {isEditingCategory && (
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 grid grid-cols-3 gap-2">
            {S_CATEGORIES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => handleQuickChangeCategory(s.key)}
                className={`p-2 rounded-xl text-xs font-black min-h-[44px] border ${
                  currentIssue.category === s.key
                    ? "bg-zinc-900 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                }`}
              >
                {s.key} ({s.name_i18n ? resolveI18n(s.name_i18n, locale) : s.name})
              </button>
            ))}
          </div>
        )}

        {/* In-place quick edit location dropdown */}
        {isEditingLocation && locations && locations.length > 0 && (
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700">
            <LocationCombobox
              locations={locations}
              value={currentIssue.location_code}
              onChange={handleQuickChangeLocation}
            />
          </div>
        )}
        {/* Detail Content - 2 Columns on Desktop */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:grid lg:grid-cols-12 min-h-0">
          {/* Left Column: Visuals & Description (60% on 2K) */}
          <div className="lg:col-span-7 xl:col-span-7 2xl:col-span-8 p-4 lg:p-6 space-y-4 lg:overflow-y-auto lg:border-r border-zinc-200 dark:border-zinc-800">
            {/* Split Slider if After photo exists, otherwise show Before photo */}
            {currentIssue.photo_after ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("issue_detail.compare_slider_label")}
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    🔍 {t("issue_detail.tap_to_zoom")}
                  </span>
                </div>
                <SplitSlider
                  beforeUrl={resolvePhotoUrl(currentIssue.photo_before, "before")}
                  afterUrl={resolvePhotoUrl(currentIssue.photo_after, "after")}
                  onPhotoClick={(type) => {
                    setZoomScale(1);
                    if (type === "before") {
                      const idx = photoList.findIndex(
                        (p) => p.url === resolvePhotoUrl(currentIssue.photo_before, "before"),
                      );
                      setPreviewIndex(idx >= 0 ? idx : 0);
                    } else {
                      const idx = photoList.findIndex(
                        (p) => p.url === resolvePhotoUrl(currentIssue.photo_after, "after"),
                      );
                      setPreviewIndex(idx >= 0 ? idx : photoList.length - 1);
                    }
                  }}
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("issue_detail.photo_before_label")}
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    🔍 {t("issue_detail.tap_to_zoom")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setZoomScale(1);
                    const idx = photoList.findIndex(
                      (p) => p.url === resolvePhotoUrl(currentIssue.photo_before, "before"),
                    );
                    setPreviewIndex(idx >= 0 ? idx : 0);
                  }}
                  className="w-full text-left group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md focus:outline-hidden"
                >
                  <img
                    src={resolvePhotoUrl(currentIssue.photo_before, "before")}
                    alt={t("issue_detail.photo_before_alt")}
                    className="w-full aspect-[4/3] object-cover transition-transform group-hover:scale-101"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-xs">
                      🔍 {t("issue_detail.tap_to_zoom")}
                    </span>
                  </div>
                </button>
              </div>
            )}

            {/* Detail photo (Before) if available */}
            {currentIssue.photo_detail && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("issue_detail.photo_detail_label")}
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    🔍 {t("issue_detail.tap_to_zoom")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setZoomScale(1);
                    const idx = photoList.findIndex(
                      (p) => p.url === resolvePhotoUrl(currentIssue.photo_detail, "detail"),
                    );
                    setPreviewIndex(idx >= 0 ? idx : 1);
                  }}
                  className="w-full text-left group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md focus:outline-hidden"
                >
                  <img
                    src={resolvePhotoUrl(currentIssue.photo_detail, "detail")}
                    alt={t("issue_detail.photo_detail_alt")}
                    className="w-full aspect-[4/3] object-cover transition-transform group-hover:scale-101"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-xs">
                      🔍 {t("issue_detail.tap_to_zoom")}
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Information, Actions, Rating & Score Breakdown (40% on 2K) */}
          <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-4 p-4 lg:p-6 space-y-4 lg:overflow-y-auto bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Description & Tags */}
              <div className="p-4 bg-white dark:bg-zinc-800/80 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {t("issue_detail.reporter_label")} <strong>{currentIssue.creator_name}</strong>
                  </span>
                  <span>{new Date(currentIssue.created_at).toLocaleDateString(dateLocale)}</span>
                </div>
                <p className="text-sm text-zinc-800 dark:text-zinc-200 font-medium whitespace-pre-wrap">
                  {currentIssue.description || "Không có mô tả chi tiết."}
                </p>
                {/* Tags display */}
                {currentIssue.tags && currentIssue.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {currentIssue.tags.map((tagCode) => {
                      const matchedTag = tags.find((tg) => (tg.tag_code || tg.code) === tagCode);
                      const tagName = matchedTag
                        ? resolveI18n(
                            {
                              vi: matchedTag.label_vi || matchedTag.name_vi || tagCode,
                              zh: matchedTag.label_zh || matchedTag.name_zh || tagCode,
                              en: matchedTag.label_en || matchedTag.name_en || tagCode,
                            },
                            locale,
                          )
                        : tagCode;
                      return (
                        <span
                          key={tagCode}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300"
                        >
                          {`#${tagName}`}
                        </span>
                      );
                    })}
                  </div>
                )}
                {currentIssue.reject_reason && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-300">
                    <strong>{t("issue_detail.reject_reason_label")}</strong>{" "}
                    {currentIssue.reject_reason}
                  </div>
                )}
              </div>

              {/* Score Impact Breakdown Card */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                    📊 {t("issue_detail.score_breakdown_title")}
                  </span>
                  {currentIssue.score_rating && currentIssue.score_rating > 0 && (
                    <span className="text-xs text-amber-500 font-bold">
                      {"★".repeat(currentIssue.score_rating)}
                    </span>
                  )}
                </div>

                {loadingScores ? (
                  <div className="text-xs text-zinc-400 py-2 text-center">
                    {t("common.loading")}
                  </div>
                ) : issueScoreLogs.length === 0 ? (
                  <div className="text-xs text-zinc-400 py-1">
                    {t("issue_detail.score_breakdown_empty")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {issueScoreLogs.map((log) => {
                      const isPositive = log.points > 0;
                      const isLocation = log.target_type === "LOCATION";
                      return (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-1.5">
                              <span
                                className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                  isLocation
                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                    : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                }`}
                              >
                                {isLocation
                                  ? t("issue_detail.target_location")
                                  : t("issue_detail.target_user")}
                              </span>
                              <span className="font-bold text-zinc-800 dark:text-zinc-200">
                                {log.target_id}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {log.rule_description || log.rule_key}
                              {log.penalty_date && ` (${log.penalty_date})`}
                            </div>
                          </div>
                          <span
                            className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg ${
                              isPositive
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300"
                            }`}
                          >
                            {isPositive ? `+${log.points}` : log.points}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Bar (Integrated in sidebar for desktop, sticky/accessible) */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-2 shrink-0">
              {/* Action: Resolve (Upload after photo) */}
              {currentIssue.status === IssueStatus.OPEN && (
                <label className="cursor-pointer w-full bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2 shadow-lg">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={isSubmitting}
                    onChange={handleResolveOfflineOrOnline}
                    className="hidden"
                  />
                  <span>
                    📸{" "}
                    {isSubmitting
                      ? t("issue_detail.processing_image")
                      : t("issue_detail.capture_after")}
                  </span>
                </label>
              )}

              {/* Action: Close (Duyệt đạt) */}
              {currentIssue.status === IssueStatus.PENDING_REVIEW && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!canClose || isSubmitting}
                      onClick={() => setShowConfirmAction("CLOSE")}
                      className={`flex-1 font-black text-sm py-4 px-4 rounded-2xl min-h-[56px] flex items-center justify-center space-x-1 shadow-md transition ${
                        canClose
                          ? "bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white"
                          : "opacity-50 bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      }`}
                    >
                      <span>
                        {canClose
                          ? `✓ ${t("issue.approve").toUpperCase()}`
                          : `🔒 ${t("issue_detail.locked")}`}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={!canClose || isSubmitting}
                      onClick={() => setShowConfirmAction("REOPEN")}
                      className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 font-bold px-4 rounded-2xl min-h-[56px] text-xs disabled:opacity-40"
                    >
                      {t("issue.reopen")}
                    </button>
                  </div>
                  {!canClose && closeDisabledReason && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium px-1 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>{closeDisabledReason}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Action: Invalidate (Bác bỏ) */}
              {currentIssue.status === IssueStatus.OPEN &&
                (role === UserRole.ADMIN || role === UserRole.SAFETY_OFFICER) && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmAction(IssueStatus.INVALID)}
                    className="w-full text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold py-3 px-4 rounded-xl min-h-[44px] flex items-center justify-center border border-rose-200 dark:border-rose-900/60 transition gap-1.5"
                  >
                    <span>⛔</span>
                    <span>{t("issue_detail.invalidate_btn_label")}</span>
                  </button>
                )}
            </div>
          </div>
        </div>

        {/* Inline Action Confirmation Drawer (Glove Friendly, No Nested Modal Jump) */}
        {showConfirmAction && (
          <div className="border-t border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-850 p-4 space-y-3 animate-fade-in shadow-inner">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-zinc-900 dark:text-zinc-100">
                {showConfirmAction === "CLOSE"
                  ? t("issue_detail.confirm_close_title")
                  : showConfirmAction === "REOPEN"
                    ? t("issue_detail.confirm_reopen_title")
                    : t("issue_detail.confirm_invalid_title")}
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmAction(null)}
                className="text-zinc-400 hover:text-zinc-600 text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>
            {showConfirmAction === "CLOSE" && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800">
                <label className="block text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-2">
                  {t("issue_detail.kaizen_rating_label")}
                </label>
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setScoreRating(star)}
                      className={`w-11 h-11 rounded-xl font-black text-lg flex items-center justify-center transition-all ${
                        scoreRating >= star
                          ? "bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-105"
                          : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  {scoreRating === 5 && (
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 ml-2 animate-bounce">
                      {t("issue_detail.kaizen_excellent")}
                    </span>
                  )}
                </div>
              </div>
            )}

            {showConfirmAction === IssueStatus.INVALID && (
              <div className="space-y-2">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">{t("issue_detail.invalid_warning")}</p>
                    <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                      {t("issue_detail.invalid_guidance")}
                    </p>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={t("issue_detail.reason_placeholder")}
                  className="w-full bg-white dark:bg-zinc-900 border border-rose-300 dark:border-rose-700 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            )}

            {showConfirmAction === "REOPEN" && (
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t("issue_detail.reason_placeholder")}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-3 text-sm focus:outline-none"
              />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (showConfirmAction === "CLOSE") handleConfirmClose();
                  if (showConfirmAction === "REOPEN") handleConfirmReopen();
                  if (showConfirmAction === IssueStatus.INVALID) handleConfirmInvalid();
                }}
                className="flex-1 bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-black py-3 rounded-xl min-h-[48px] text-sm shadow-sm"
              >
                {t("common.confirm")}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmAction(null)}
                className="flex-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-xl min-h-[48px] text-sm"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* Fullscreen Image Previewer with Zoom */}
        {previewPhoto && (
          <div
            className="fixed inset-0 z-70 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
          >
            {/* Backdrop overlay button for a11y click-outside */}
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={() => {
                setPreviewIndex(null);
                setZoomScale(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="fixed inset-0 w-full h-full cursor-default bg-transparent -z-10 focus:outline-hidden"
              tabIndex={-1}
            />
            {/* Top Bar with High-Contrast Pill Badge & Gallery Indicator */}
            <div className="w-full flex items-center justify-between z-10 pointer-events-none">
              <div className="flex items-center gap-2.5 max-w-[75%] pointer-events-auto">
                <span
                  className={`px-3 py-1 rounded-full text-xs uppercase tracking-wider shadow-md ${previewPhoto.badgeClass}`}
                >
                  {previewPhoto.label}
                </span>
                {photoList.length > 1 && (
                  <span className="px-2.5 py-1 rounded-full bg-zinc-850 border border-zinc-700/80 text-xs font-bold text-zinc-300 shadow-sm shrink-0">
                    {(previewIndex ?? 0) + 1} / {photoList.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewIndex(null);
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="w-10 h-10 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white font-bold flex items-center justify-center transition-colors pointer-events-auto cursor-pointer"
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>

            {/* Image Container with Zoom, Mouse Wheel, Two-Finger Pinch & Drag/Pan */}
            <div
              ref={imageContainerRef}
              className="flex-1 w-full flex items-center justify-center overflow-hidden p-2 touch-none select-none cursor-grab active:cursor-grabbing"
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  touchDistanceRef.current = Math.hypot(dx, dy);
                } else if (e.touches.length === 1) {
                  dragStartRef.current = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                    panX: panOffset.x,
                    panY: panOffset.y,
                  };
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 2 && touchDistanceRef.current) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  const newDist = Math.hypot(dx, dy);
                  const ratio = newDist / touchDistanceRef.current;
                  touchDistanceRef.current = newDist;
                  setZoomScale((s) => Math.min(5, Math.max(0.5, Number((s * ratio).toFixed(2)))));
                } else if (e.touches.length === 1 && dragStartRef.current) {
                  const dx = e.touches[0].clientX - dragStartRef.current.x;
                  const dy = e.touches[0].clientY - dragStartRef.current.y;
                  setPanOffset({
                    x: dragStartRef.current.panX + dx,
                    y: dragStartRef.current.panY + dy,
                  });
                }
              }}
              onTouchEnd={() => {
                const now = Date.now();
                if (now - lastTapRef.current < 300) {
                  // Double tap detected for mobile
                  if (zoomScale > 1) {
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    setZoomScale(2.5);
                  }
                  lastTapRef.current = 0;
                } else {
                  lastTapRef.current = now;
                }

                if (zoomScale <= 1) {
                  if (panOffset.y > 100) {
                    // Swipe down to dismiss
                    setPreviewIndex(null);
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else if (photoList.length > 1 && panOffset.x < -80) {
                    // Swipe left -> Next photo
                    setPreviewIndex((prev) =>
                      prev !== null && prev < photoList.length - 1 ? prev + 1 : 0,
                    );
                    setPanOffset({ x: 0, y: 0 });
                  } else if (photoList.length > 1 && panOffset.x > 80) {
                    // Swipe right -> Prev photo
                    setPreviewIndex((prev) =>
                      prev !== null && prev > 0 ? prev - 1 : photoList.length - 1,
                    );
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    setPanOffset({ x: 0, y: 0 });
                  }
                }
                touchDistanceRef.current = null;
                dragStartRef.current = null;
              }}
              onMouseDown={(e) => {
                if (e.button === 0) {
                  dragStartRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                    panX: panOffset.x,
                    panY: panOffset.y,
                  };
                }
              }}
              onMouseMove={(e) => {
                if (dragStartRef.current) {
                  const dx = e.clientX - dragStartRef.current.x;
                  const dy = e.clientY - dragStartRef.current.y;
                  setPanOffset({
                    x: dragStartRef.current.panX + dx,
                    y: dragStartRef.current.panY + dy,
                  });
                }
              }}
              onMouseUp={() => {
                if (zoomScale <= 1) {
                  if (panOffset.y > 100) {
                    setPreviewIndex(null);
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else if (photoList.length > 1 && panOffset.x < -80) {
                    setPreviewIndex((prev) =>
                      prev !== null && prev < photoList.length - 1 ? prev + 1 : 0,
                    );
                    setPanOffset({ x: 0, y: 0 });
                  } else if (photoList.length > 1 && panOffset.x > 80) {
                    setPreviewIndex((prev) =>
                      prev !== null && prev > 0 ? prev - 1 : photoList.length - 1,
                    );
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    setPanOffset({ x: 0, y: 0 });
                  }
                }
                dragStartRef.current = null;
              }}
              onMouseLeave={() => {
                if (zoomScale <= 1) {
                  if (panOffset.y > 100) {
                    setPreviewIndex(null);
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    setPanOffset({ x: 0, y: 0 });
                  }
                }
                dragStartRef.current = null;
              }}
              onDoubleClick={() => {
                if (zoomScale > 1) {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                } else {
                  setZoomScale(2.5);
                }
              }}
            >
              <img
                key={previewPhoto.url}
                src={previewPhoto.url}
                alt={previewPhoto.alt}
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                }}
                className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-75 select-none pointer-events-none"
              />
            </div>
            {/* Bottom Controls */}
            {/* Bottom Controls with Next/Prev & Close */}
            <div className="flex items-center gap-2 p-2 bg-zinc-900/90 border border-zinc-700/60 rounded-2xl backdrop-blur-md z-10 shadow-2xl">
              {photoList.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewIndex((prev) =>
                        prev !== null && prev > 0 ? prev - 1 : photoList.length - 1,
                      );
                    }}
                    className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all cursor-pointer"
                    aria-label="Previous photo"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewIndex((prev) =>
                        prev !== null && prev < photoList.length - 1 ? prev + 1 : 0,
                      );
                    }}
                    className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-all cursor-pointer"
                    aria-label="Next photo"
                  >
                    ▶
                  </button>
                  <div className="w-px h-5 bg-zinc-700 mx-0.5" />
                </>
              )}
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))}
                disabled={zoomScale <= 0.5}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer"
              >
                ➖ {t("issue_detail.zoom_out")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all min-w-[60px] text-center cursor-pointer"
              >
                {Math.round(zoomScale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.min(4, Number((s + 0.25).toFixed(2))))}
                disabled={zoomScale >= 4}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer"
              >
                ➕ {t("issue_detail.zoom_in")}
              </button>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <button
                type="button"
                onClick={() => {
                  setPreviewIndex(null);
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-3.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                aria-label={t("common.close")}
              >
                <span>✕</span>
                <span>{t("common.close")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {isEditingFull && (
        <CreateIssueModal
          isOpen={isEditingFull}
          onClose={() => setIsEditingFull(false)}
          onSuccess={(updated) => {
            if (updated) {
              setCurrentIssue(updated);
            }
            setIsEditingFull(false);
            onRefresh();
          }}
          locations={locations}
          tags={tags}
          initialIssue={currentIssue}
        />
      )}
    </div>
  );
}
