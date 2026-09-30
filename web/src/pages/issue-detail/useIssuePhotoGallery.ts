import { useEffect, useState } from "react";
import type { AuthenticatedImageError } from "../../hooks/useAuthenticatedImageUrl.ts";
import type { IssueItem } from "../../types/index.ts";
import { hasDistinctPhoto, resolvePhotoUrl } from "../../utils/photo.ts";
import type { IssueDetailPhotoItem } from "./types.ts";

export interface UseIssuePhotoGalleryProps {
  currentIssue: IssueItem;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function useIssuePhotoGallery({ currentIssue, t }: UseIssuePhotoGalleryProps) {
  const [beforePhotoError, setBeforePhotoError] = useState<AuthenticatedImageError | null>(null);
  const [detailPhotoError, setDetailPhotoError] = useState<AuthenticatedImageError | null>(null);
  const anyPhotoError = beforePhotoError || detailPhotoError;
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    setBeforePhotoError(null);
    setDetailPhotoError(null);
  }, [currentIssue.id, currentIssue.photo_before, currentIssue.photo_detail]);

  const photoList: IssueDetailPhotoItem[] = [
    currentIssue.photo_before
      ? {
          url: resolvePhotoUrl(
            currentIssue.photo_before,
            "before",
            currentIssue.deleted_at != null ? "deleted" : "active",
          ),
          alt: t("issue_detail.photo_before_alt"),
          label: t("slider.before"),
          badgeClass: "bg-amber-500 text-zinc-950 font-black shadow-amber-500/20",
        }
      : null,
    hasDistinctPhoto(currentIssue.photo_detail, currentIssue.photo_before)
      ? {
          url: resolvePhotoUrl(
            currentIssue.photo_detail,
            "detail",
            currentIssue.deleted_at != null ? "deleted" : "active",
          ),
          alt: t("issue_detail.photo_detail_alt"),
          label: t("issue.photo_detail_label"),
          badgeClass: "bg-blue-500 text-white font-black shadow-blue-500/20",
        }
      : null,
    currentIssue.photo_after
      ? {
          url: resolvePhotoUrl(
            currentIssue.photo_after,
            "after",
            currentIssue.deleted_at != null ? "deleted" : "active",
          ),
          alt: t("slider.after_alt"),
          label: t("slider.after"),
          badgeClass: "bg-emerald-500 text-zinc-950 font-black shadow-emerald-500/20",
        }
      : null,
  ].filter((p): p is IssueDetailPhotoItem => p !== null);

  return {
    beforePhotoError,
    setBeforePhotoError,
    detailPhotoError,
    setDetailPhotoError,
    anyPhotoError,
    previewIndex,
    setPreviewIndex,
    photoList,
  };
}
