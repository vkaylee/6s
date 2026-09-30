import { ZoomIn } from "lucide-react";
import { AuthenticatedImage } from "../../components/AuthenticatedImage.tsx";
import { SplitSlider } from "../../components/SplitSlider.tsx";
import type { AuthenticatedImageError } from "../../hooks/useAuthenticatedImageUrl.ts";
import type { IssueItem } from "../../types/index.ts";
import { hasDistinctPhoto, resolvePhotoUrl } from "../../utils/photo.ts";
import type { IssueDetailPhotoItem } from "./types.ts";

export interface IssueDetailMediaView {
  currentIssue: IssueItem;
  t: (path: string, params?: Record<string, string | number>) => string;
  anyPhotoError: AuthenticatedImageError | null;
  photoList: IssueDetailPhotoItem[];
  setPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setBeforePhotoError: React.Dispatch<React.SetStateAction<AuthenticatedImageError | null>>;
  setDetailPhotoError: React.Dispatch<React.SetStateAction<AuthenticatedImageError | null>>;
}

export function IssueDetailMedia({ view }: { view: IssueDetailMediaView }) {
  const {
    currentIssue,
    t,
    anyPhotoError,
    photoList,
    setPreviewIndex,
    setBeforePhotoError,
    setDetailPhotoError,
  } = view;

  return (
    <div className="lg:col-span-7 xl:col-span-7 2xl:col-span-8 p-4 lg:p-6 space-y-4 lg:overflow-y-auto lg:border-r border-zinc-200 dark:border-zinc-800">
      {/* Split Slider if After photo exists, otherwise show Before photo */}
      {currentIssue.photo_after ? (
        <SplitSlider
          beforeUrl={resolvePhotoUrl(
            currentIssue.photo_before,
            "before",
            currentIssue.deleted_at != null ? "deleted" : "active",
          )}
          afterUrl={resolvePhotoUrl(
            currentIssue.photo_after,
            "after",
            currentIssue.deleted_at != null ? "deleted" : "active",
          )}
          onPhotoClick={(type) => {
            const photoUrl = resolvePhotoUrl(
              type === "before" ? currentIssue.photo_before : currentIssue.photo_after,
              type,
              currentIssue.deleted_at != null ? "deleted" : "active",
            );
            const idx = photoList.findIndex((p) => p.url === photoUrl);
            setPreviewIndex(idx >= 0 ? idx : 0);
          }}
        />
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
              {t("issue_detail.photo_before_label")}
            </span>
            {!anyPhotoError && (
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                <ZoomIn className="h-3 w-3" aria-hidden="true" />
                <span>{t("issue_detail.tap_to_zoom")}</span>
              </span>
            )}
          </div>
          <div
            className="group relative w-full overflow-hidden rounded-2xl border border-zinc-200 shadow-md dark:border-zinc-800"
            onErrorCapture={() => setBeforePhotoError("UNKNOWN")}
          >
            <AuthenticatedImage
              imageUrl={resolvePhotoUrl(
                currentIssue.photo_before,
                "before",
                currentIssue.deleted_at != null ? "deleted" : "active",
              )}
              alt={t("issue_detail.photo_before_alt")}
              compact={false}
              onError={() => setBeforePhotoError("UNKNOWN")}
              onErrorStateChange={setBeforePhotoError}
              className={`w-full aspect-[4/3] object-cover transition-transform ${
                anyPhotoError ? "" : "group-hover:scale-101"
              }`}
            />
            {!anyPhotoError && (
              <button
                type="button"
                aria-label={t("issue_detail.tap_to_zoom")}
                onClick={() => {
                  const idx = photoList.findIndex(
                    (p) =>
                      p.url ===
                      resolvePhotoUrl(
                        currentIssue.photo_before,
                        "before",
                        currentIssue.deleted_at != null ? "deleted" : "active",
                      ),
                  );
                  setPreviewIndex(idx >= 0 ? idx : 0);
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              >
                <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100">
                  {t("issue_detail.tap_to_zoom")}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Detail photo (Before) if available */}
      {hasDistinctPhoto(currentIssue.photo_detail, currentIssue.photo_before) && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
              {t("issue_detail.photo_detail_label")}
            </span>
            {!anyPhotoError && (
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                <ZoomIn className="h-3 w-3" aria-hidden="true" />
                <span>{t("issue_detail.tap_to_zoom")}</span>
              </span>
            )}
          </div>
          <div
            className="group relative w-full overflow-hidden rounded-2xl border border-zinc-200 shadow-md dark:border-zinc-800"
            onErrorCapture={() => setDetailPhotoError("UNKNOWN")}
          >
            <AuthenticatedImage
              imageUrl={resolvePhotoUrl(
                currentIssue.photo_detail,
                "detail",
                currentIssue.deleted_at != null ? "deleted" : "active",
              )}
              alt={t("issue_detail.photo_detail_alt")}
              compact={false}
              onError={() => setDetailPhotoError("UNKNOWN")}
              onErrorStateChange={setDetailPhotoError}
              className={`w-full aspect-[4/3] object-cover transition-transform ${
                anyPhotoError ? "" : "group-hover:scale-101"
              }`}
            />
            {!anyPhotoError && (
              <button
                type="button"
                aria-label={t("issue_detail.tap_to_zoom")}
                onClick={() => {
                  const idx = photoList.findIndex(
                    (p) =>
                      p.url ===
                      resolvePhotoUrl(
                        currentIssue.photo_detail,
                        "detail",
                        currentIssue.deleted_at != null ? "deleted" : "active",
                      ),
                  );
                  setPreviewIndex(idx >= 0 ? idx : 1);
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              >
                <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100">
                  {t("issue_detail.tap_to_zoom")}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
