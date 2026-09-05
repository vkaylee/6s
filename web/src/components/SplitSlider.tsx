import { useRef, useState } from "react";
import { useI18nStore } from "../i18n/index.ts";

interface SplitSliderProps {
  beforeUrl: string;
  afterUrl: string;
}

/**
 * Split Slider Before/After 4:3 industrial comparison (SPEC.md Section 9.8.B)
 */
export function SplitSlider({ beforeUrl, afterUrl }: SplitSliderProps) {
  const { t } = useI18nStore();
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPos(percent);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      handleMove(e.clientX);
    }
  };

  return (
    <div
      ref={containerRef}
      onTouchMove={handleTouchMove}
      onMouseMove={handleMouseMove}
      className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden select-none bg-zinc-900 touch-none shadow-md"
    >
      {/* After image (Bottom layer) */}
      <img
        src={afterUrl}
        alt={t("slider.after_alt")}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute bottom-3 right-3 bg-emerald-600/90 text-white text-[10px] font-black px-2 py-1 rounded-md backdrop-blur-xs">
        {t("slider.after")}
      </div>

      {/* Before image (Top layer, clipped by width) */}
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
        <div className="relative w-full h-full">
          <img
            src={beforeUrl}
            alt={t("slider.before_alt")}
            className="absolute inset-0 max-w-none h-full object-cover"
            style={{
              width: containerRef.current ? `${containerRef.current.clientWidth}px` : "100%",
            }}
          />
        </div>
      </div>
      <div className="absolute bottom-3 left-3 bg-zinc-900/90 text-white text-[10px] font-black px-2 py-1 rounded-md backdrop-blur-xs">
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
