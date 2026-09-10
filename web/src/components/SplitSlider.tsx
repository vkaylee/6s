import { useRef, useState } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { AuthenticatedImage } from "./AuthenticatedImage.tsx";

interface SplitSliderProps {
  beforeUrl: string;
  afterUrl: string;
  onPhotoClick?: (type: "before" | "after") => void;
}

/**
 * Split Slider Before/After 4:3 industrial comparison (SPEC.md Section 9.8.B)
 */
export function SplitSlider({ beforeUrl, afterUrl, onPhotoClick }: SplitSliderProps) {
  const { t } = useI18nStore();
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPos(percent);
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    pointerStartRef.current = { x: clientX, y: clientY };
    isDraggingRef.current = false;
  };

  const checkDrag = (clientX: number, clientY: number) => {
    if (!pointerStartRef.current) return;
    const dx = Math.abs(clientX - pointerStartRef.current.x);
    const dy = Math.abs(clientY - pointerStartRef.current.y);
    if (dx > 6 || dy > 6) {
      isDraggingRef.current = true;
    }
  };

  const handlePointerUp = (clientX: number) => {
    if (!isDraggingRef.current && onPhotoClick && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const clickPercent = (x / rect.width) * 100;
      if (clickPercent < sliderPos) {
        onPhotoClick("before");
      } else {
        onPhotoClick("after");
      }
    }
    pointerStartRef.current = null;
    isDraggingRef.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    checkDrag(e.touches[0].clientX, e.touches[0].clientY);
    handleMove(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches.length > 0) {
      handlePointerUp(e.changedTouches[0].clientX);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      handlePointerDown(e.clientX, e.clientY);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      checkDrag(e.clientX, e.clientY);
      handleMove(e.clientX);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 0) {
      handlePointerUp(e.clientX);
    }
  };
  return (
    <div
      ref={containerRef}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(sliderPos)}
      tabIndex={0}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden select-none bg-zinc-900 touch-none shadow-md cursor-pointer"
    >
      {/* After image (Bottom layer) */}
      <AuthenticatedImage
        imageUrl={afterUrl}
        alt={t("slider.after_alt")}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div
        className={`absolute bottom-3 right-3 bg-emerald-600/90 text-white text-[10px] font-black px-2 py-1 rounded-md backdrop-blur-xs transition-opacity duration-150 ${
          sliderPos > 88 ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {t("slider.after")}
      </div>

      {/* Before image (Top layer, clipped by width) */}
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
        <div className="relative w-full h-full">
          <AuthenticatedImage
            imageUrl={beforeUrl}
            alt={t("slider.before_alt")}
            className="absolute inset-0 max-w-none h-full object-cover"
            style={{
              width: containerRef.current ? `${containerRef.current.clientWidth}px` : "100%",
            }}
          />
        </div>
      </div>
      <div
        className={`absolute bottom-3 left-3 bg-zinc-900/90 text-white text-[10px] font-black px-2 py-1 rounded-md backdrop-blur-xs transition-opacity duration-150 ${
          sliderPos < 12 ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {t("slider.before")}
      </div>

      {/* Draggable Divider Bar */}
      <div
        className="absolute inset-y-0 w-1 bg-white cursor-ew-resize shadow-2xl flex items-center justify-center -ml-0.5"
        style={{ left: `${sliderPos}%` }}
      >
        <div className="w-8 h-8 rounded-full bg-white text-zinc-900 shadow-xl border-2 border-zinc-200 flex items-center justify-center font-bold text-xs">
          ↔
        </div>
      </div>
    </div>
  );
}
