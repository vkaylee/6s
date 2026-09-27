import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthenticatedImage } from "../../components/AuthenticatedImage.tsx";
import type { IssueDetailPhotoItem } from "./types.ts";

interface IssuePhotoPreviewDialogProps {
  previewIndex: number;
  photoList: IssueDetailPhotoItem[];
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  t: (path: string) => string;
}

export function IssuePhotoPreviewDialog({
  previewIndex,
  photoList,
  onClose,
  onSelectIndex,
  t,
}: IssuePhotoPreviewDialogProps) {
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const photoDialogRef = useRef<HTMLDivElement>(null);
  const photoTriggerRef = useRef<HTMLElement | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const previewPhoto = photoList[previewIndex] ?? null;

  // Reset pan & zoom when photo changes
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, [previewIndex]);

  // Focus trap & restore for photo dialog
  useEffect(() => {
    photoTriggerRef.current = document.activeElement as HTMLElement | null;
    const dialog = photoDialogRef.current;
    if (!dialog) return;

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    );
    focusables[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const active = document.activeElement;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
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
      const trigger = photoTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
      photoTriggerRef.current = null;
    };
  }, []);

  // Escape & Arrow keys listener for gallery navigation & dialog closing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        onSelectIndex(previewIndex > 0 ? previewIndex - 1 : photoList.length - 1);
      } else if (e.key === "ArrowRight") {
        onSelectIndex(previewIndex < photoList.length - 1 ? previewIndex + 1 : 0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewIndex, photoList.length, onClose, onSelectIndex]);

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
  }, []);

  const toggleZoom = () => {
    if (zoomScale > 1) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setZoomScale(2.5);
    }
  };

  const handleSwipeRelease = () => {
    if (zoomScale <= 1) {
      if (panOffset.y > 100) {
        onClose();
      } else if (photoList.length > 1 && panOffset.x < -80) {
        onSelectIndex(previewIndex < photoList.length - 1 ? previewIndex + 1 : 0);
        setPanOffset({ x: 0, y: 0 });
      } else if (photoList.length > 1 && panOffset.x > 80) {
        onSelectIndex(previewIndex > 0 ? previewIndex - 1 : photoList.length - 1);
        setPanOffset({ x: 0, y: 0 });
      } else {
        setPanOffset({ x: 0, y: 0 });
      }
    }
  };

  if (!previewPhoto) return null;

  return (
    <div
      ref={photoDialogRef}
      className="fixed inset-0 z-70 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-photo-preview-title"
    >
      <h2 id="issue-photo-preview-title" className="sr-only">
        {t("issue_detail.photo_preview")}
      </h2>
      {/* Backdrop overlay button for a11y click-outside */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="fixed inset-0 w-full h-full cursor-default bg-transparent -z-10"
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
            <span className="px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700/80 text-xs font-bold text-zinc-300 shadow-sm shrink-0">
              {previewIndex + 1} / {photoList.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white font-bold flex items-center justify-center transition-colors pointer-events-auto cursor-pointer"
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Image Container with Zoom, Mouse Wheel, Two-Finger Pinch & Drag/Pan */}
      <div
        role="application"
        aria-label={t("issue_detail.photo_preview")}
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
            toggleZoom();
            lastTapRef.current = 0;
          } else {
            lastTapRef.current = now;
          }
          handleSwipeRelease();
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
          handleSwipeRelease();
          dragStartRef.current = null;
        }}
        onMouseLeave={() => {
          if (zoomScale <= 1) {
            if (panOffset.y > 100) {
              onClose();
            } else {
              setPanOffset({ x: 0, y: 0 });
            }
          }
          dragStartRef.current = null;
        }}
        onDoubleClick={toggleZoom}
      >
        <AuthenticatedImage
          imageUrl={previewPhoto.url}
          alt={previewPhoto.alt}
          compact={false}
          style={{
            transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
          }}
          className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-75 select-none pointer-events-none"
        />
      </div>

      {/* Bottom Controls with Next/Prev & Close */}
      <div className="flex items-center gap-2 p-2 bg-zinc-900/90 border border-zinc-700/60 rounded-2xl backdrop-blur-md z-10 shadow-2xl">
        {photoList.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => {
                onSelectIndex(previewIndex > 0 ? previewIndex - 1 : photoList.length - 1);
              }}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-zinc-800 text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={t("issue_detail.previous_photo")}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectIndex(previewIndex < photoList.length - 1 ? previewIndex + 1 : 0);
              }}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-zinc-800 text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={t("issue_detail.next_photo")}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="h-5 w-px bg-zinc-700 mx-0.5" />
          </>
        )}
        <button
          type="button"
          onClick={() => setZoomScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))}
          disabled={zoomScale <= 0.5}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-zinc-700 disabled:opacity-40 cursor-pointer"
          aria-label={t("issue_detail.zoom_out")}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          {t("issue_detail.zoom_out")}
        </button>
        <button
          type="button"
          onClick={() => {
            setZoomScale(1);
            setPanOffset({ x: 0, y: 0 });
          }}
          className="min-h-11 min-w-[60px] rounded-xl bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200 transition-all hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
          aria-label={t("issue_detail.reset_zoom")}
        >
          {Math.round(zoomScale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setZoomScale((s) => Math.min(4, Number((s + 0.25).toFixed(2))))}
          disabled={zoomScale >= 4}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-zinc-700 disabled:opacity-40 cursor-pointer"
          aria-label={t("issue_detail.zoom_in")}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t("issue_detail.zoom_in")}
        </button>
        <div className="w-px h-5 bg-zinc-700 mx-0.5" />
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span>{t("common.close")}</span>
        </button>
      </div>
    </div>
  );
}
