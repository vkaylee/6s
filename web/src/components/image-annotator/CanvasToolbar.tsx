import { Circle, Pen, RotateCcw, Square, Trash2 } from "lucide-react";
import type { ToolMode } from "./useCanvasDrawing.ts";

type Translate = (path: string, params?: Record<string, string | number>) => string;

interface CanvasToolbarProps {
  tool: ToolMode;
  color: string;
  hasShapes: boolean;
  t: Translate;
  onToolChange: (tool: ToolMode) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
}

const colors = [
  { hex: "#e11d48", labelKey: "issue.color_red" },
  { hex: "#eab308", labelKey: "issue.color_yellow" },
  { hex: "#2563eb", labelKey: "issue.color_blue" },
  { hex: "#16a34a", labelKey: "issue.color_green" },
] as const;

export function CanvasToolbar({
  tool,
  color,
  hasShapes,
  t,
  onToolChange,
  onColorChange,
  onUndo,
  onClear,
}: CanvasToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs">
      <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => onToolChange("circle")}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 ${tool === "circle" ? "bg-rose-600 text-white shadow-sm" : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900"}`}
        >
          <Circle className="w-3.5 h-3.5" />
          <span>{t("issue.tool_circle")}</span>
        </button>
        <button
          type="button"
          onClick={() => onToolChange("rect")}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 ${tool === "rect" ? "bg-rose-600 text-white shadow-sm" : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900"}`}
        >
          <Square className="w-3.5 h-3.5" />
          <span>{t("issue.tool_rect")}</span>
        </button>
        <button
          type="button"
          onClick={() => onToolChange("pen")}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 ${tool === "pen" ? "bg-rose-600 text-white shadow-sm" : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900"}`}
        >
          <Pen className="w-3.5 h-3.5" />
          <span>{t("issue.tool_pen")}</span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {colors.map((item) => (
            <button
              key={item.hex}
              type="button"
              onClick={() => onColorChange(item.hex)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${color === item.hex ? "scale-110 border-zinc-900 dark:border-white shadow-md" : "border-transparent opacity-70 hover:opacity-100"}`}
              style={{ backgroundColor: item.hex }}
              aria-label={t(item.labelKey)}
            />
          ))}
        </div>
        <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />
        <button
          type="button"
          disabled={!hasShapes}
          onClick={onUndo}
          className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-1"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t("issue.tool_undo")}</span>
        </button>
        <button
          type="button"
          disabled={!hasShapes}
          onClick={onClear}
          className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{t("issue.tool_clear")}</span>
        </button>
      </div>
    </div>
  );
}
