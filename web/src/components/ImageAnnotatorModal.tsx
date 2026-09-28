import { Check, Edit, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { type I18nObject, resolveI18n } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { CanvasToolbar } from "./image-annotator/CanvasToolbar.tsx";
import { useCanvasDrawing } from "./image-annotator/useCanvasDrawing.ts";

interface ImageAnnotatorModalProps {
  imageUrl: string;
  isOpen: boolean;
  title: I18nObject;
  onSave: (newBlob: Blob, newPreviewUrl: string) => void;
  onClose: () => void;
}

export function ImageAnnotatorModal({
  imageUrl,
  isOpen,
  title,
  onSave,
  onClose,
}: ImageAnnotatorModalProps) {
  const { t } = useI18nStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const {
    tool,
    setTool,
    color,
    shapes,
    selectedShapeId,
    isMoving,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleColorChange,
    handleUndo,
    handleClear,
    redraw,
  } = useCanvasDrawing({ imageUrl, isOpen, canvasRef });

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

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    redraw();
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const newPreview = URL.createObjectURL(blob);
        onSave(blob, newPreview);
        haptics.success();
        onClose();
      },
      "image/jpeg",
      0.85,
    );
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-annotator-modal-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Edit className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="image-annotator-modal-title"
                className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100"
              >
                {resolveI18n(title)}
              </h2>
              <p className="text-[11px] text-zinc-500 font-medium">{t("issue.annotator_hint")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 bg-zinc-200/60 dark:bg-zinc-700/60"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <CanvasToolbar
          tool={tool}
          color={color}
          hasShapes={shapes.length > 0}
          t={t}
          onToolChange={setTool}
          onColorChange={handleColorChange}
          onUndo={handleUndo}
          onClear={handleClear}
        />

        <div className="flex-1 bg-zinc-950 flex items-center justify-center p-2 sm:p-4 overflow-hidden relative select-none touch-none">
          <canvas
            ref={canvasRef}
            onMouseDown={(event) => handlePointerDown(event.clientX, event.clientY)}
            onMouseMove={(event) => handlePointerMove(event.clientX, event.clientY)}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (touch) handlePointerDown(touch.clientX, touch.clientY);
            }}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              if (touch) handlePointerMove(touch.clientX, touch.clientY);
            }}
            onTouchEnd={handlePointerUp}
            onTouchCancel={handlePointerUp}
            className={`max-h-[60vh] max-w-full object-contain rounded-lg shadow-2xl border border-zinc-800 ${isMoving ? "cursor-grabbing" : selectedShapeId ? "cursor-grab" : "cursor-crosshair"}`}
          />
        </div>

        <div className="p-3 sm:p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 min-h-[44px]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30 min-h-[44px] flex items-center gap-1.5"
          >
            <Check className="w-4 h-4 font-black" />
            <span>{t("issue.annotator_save")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
