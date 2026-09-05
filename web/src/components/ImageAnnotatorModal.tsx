import { useEffect, useRef, useState } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { type I18nObject, resolveI18n } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";

interface ImageAnnotatorModalProps {
  imageUrl: string;
  isOpen: boolean;
  title: I18nObject;
  onSave: (newBlob: Blob, newPreviewUrl: string) => void;
  onClose: () => void;
}

type ToolMode = "circle" | "rect" | "pen";

interface StrokePoint {
  x: number;
  y: number;
}

interface ShapeItem {
  id: string;
  type: ToolMode;
  color: string;
  lineWidth: number;
  points: StrokePoint[];
  start?: StrokePoint;
  end?: StrokePoint;
}

// Bounding box helper
function getShapeBounds(shape: ShapeItem): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (shape.type === "pen") {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of shape.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }
  if (shape.start && shape.end) {
    return {
      minX: Math.min(shape.start.x, shape.end.x),
      minY: Math.min(shape.start.y, shape.end.y),
      maxX: Math.max(shape.start.x, shape.end.x),
      maxY: Math.max(shape.start.y, shape.end.y),
    };
  }
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

type CornerType = "nw" | "ne" | "se" | "sw";

interface ResizeHandle {
  corner: CornerType;
  point: StrokePoint;
}

function getResizeHandles(shape: ShapeItem): ResizeHandle[] {
  if (shape.type === "pen" || !shape.start || !shape.end) return [];
  const { minX, minY, maxX, maxY } = getShapeBounds(shape);
  return [
    { corner: "nw", point: { x: minX, y: minY } },
    { corner: "ne", point: { x: maxX, y: minY } },
    { corner: "se", point: { x: maxX, y: maxY } },
    { corner: "sw", point: { x: minX, y: maxY } },
  ];
}

function findResizeHandleAtPoint(pt: StrokePoint, shape: ShapeItem): CornerType | null {
  const handles = getResizeHandles(shape);
  const touchRadius = 28; // easy touch target for mobile/factory gloves
  for (const h of handles) {
    if (Math.hypot(pt.x - h.point.x, pt.y - h.point.y) <= touchRadius) {
      return h.corner;
    }
  }
  return null;
}

function isPointInShape(pt: StrokePoint, shape: ShapeItem): boolean {
  const { minX, minY, maxX, maxY } = getShapeBounds(shape);
  const padding = 24; // Easy touch target for factory gloves
  return (
    pt.x >= minX - padding &&
    pt.x <= maxX + padding &&
    pt.y >= minY - padding &&
    pt.y <= maxY + padding
  );
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [tool, setTool] = useState<ToolMode>("circle");
  const [color, setColor] = useState<string>("#e11d48"); // default red/rose
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [resizingCorner, setResizingCorner] = useState<CornerType | null>(null);

  const currentShapeRef = useRef<ShapeItem | null>(null);
  const moveStartPointRef = useRef<StrokePoint | null>(null);
  const originalShapeRef = useRef<ShapeItem | null>(null);
  const activeCornerRef = useRef<CornerType | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Load base image
  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageObjRef.current = img;
      setImageLoaded(true);
      setShapes([]);
      setSelectedShapeId(null);
    };
    img.src = imageUrl;
  }, [isOpen, imageUrl]);

  // Redraw canvas whenever shapes, active shape, or selection change
  const redraw = (extraShape?: ShapeItem | null) => {
    const canvas = canvasRef.current;
    const img = imageObjRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const allShapes = (extraShape ? [...shapes, extraShape] : shapes).filter(Boolean);

    for (const shape of allShapes) {
      if (!shape) continue;
      const isSelected = shape.id === selectedShapeId;

      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (shape.type === "pen" && shape.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.stroke();
      } else if (shape.type === "circle" && shape.start && shape.end) {
        const radiusX = Math.abs(shape.end.x - shape.start.x) / 2;
        const radiusY = Math.abs(shape.end.y - shape.start.y) / 2;
        const centerX = Math.min(shape.start.x, shape.end.x) + radiusX;
        const centerY = Math.min(shape.start.y, shape.end.y) + radiusY;

        ctx.beginPath();
        ctx.ellipse(
          centerX,
          centerY,
          Math.max(radiusX, 4),
          Math.max(radiusY, 4),
          0,
          0,
          2 * Math.PI,
        );
        ctx.stroke();
      } else if (shape.type === "rect" && shape.start && shape.end) {
        const x = Math.min(shape.start.x, shape.end.x);
        const y = Math.min(shape.start.y, shape.end.y);
        const w = Math.abs(shape.end.x - shape.start.x);
        const h = Math.abs(shape.end.y - shape.start.y);

        ctx.beginPath();
        ctx.strokeRect(x, y, w, h);
      }

      // Draw bounding selection and 4 resize handles whenever a shape is selected
      if (isSelected) {
        const { minX, minY, maxX, maxY } = getShapeBounds(shape);
        const pad = 8;
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);

        // 4 corner handles for intuitive resizing
        const handles = getResizeHandles(shape);
        for (const h of handles) {
          ctx.setLineDash([]);
          ctx.fillStyle = "#2563eb";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5;
          const size = 16;
          ctx.beginPath();
          ctx.arc(h.point.x, h.point.y, size / 2, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  };

  useEffect(() => {
    if (imageLoaded) {
      const canvas = canvasRef.current;
      const img = imageObjRef.current;
      if (canvas && img) {
        canvas.width = img.naturalWidth || 1280;
        canvas.height = img.naturalHeight || 960;
        redraw();
      }
    }
  }, [imageLoaded, shapes, selectedShapeId, tool]);

  const getCanvasPoint = (clientX: number, clientY: number): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    const pt = getCanvasPoint(clientX, clientY);
    if (!pt) return;

    // Priority 1: Check if tapping resize handle on currently selected shape
    if (selectedShapeId) {
      const currentSelected = shapes.find((s) => s.id === selectedShapeId);
      if (currentSelected) {
        const corner = findResizeHandleAtPoint(pt, currentSelected);
        if (corner) {
          setResizingCorner(corner);
          activeCornerRef.current = corner;
          moveStartPointRef.current = pt;
          originalShapeRef.current = JSON.parse(JSON.stringify(currentSelected));
          haptics.selection();
          return;
        }
      }
    }

    // Priority 2: Check if tapping on any shape body (selected or unselected) -> Move / Select
    const clickedShape = [...shapes].reverse().find((s) => isPointInShape(pt, s));
    if (clickedShape) {
      setSelectedShapeId(clickedShape.id);
      setIsMoving(true);
      moveStartPointRef.current = pt;
      originalShapeRef.current = JSON.parse(JSON.stringify(clickedShape));
      haptics.selection();
      return;
    }

    // Priority 3: Tapping empty area -> Deselect current shape and start drawing new shape
    setSelectedShapeId(null);
    setIsDrawing(true);
    const newShape: ShapeItem = {
      id: crypto.randomUUID(),
      type: tool,
      color,
      lineWidth: 6,
      points: [pt],
      start: pt,
      end: pt,
    };
    currentShapeRef.current = newShape;
    redraw(newShape);
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    const pt = getCanvasPoint(clientX, clientY);
    if (!pt) return;

    if (selectedShapeId && moveStartPointRef.current && originalShapeRef.current) {
      const orig = originalShapeRef.current;

      // Handling corner resize
      if (resizingCorner && orig.start && orig.end) {
        const origMinX = Math.min(orig.start.x, orig.end.x);
        const origMinY = Math.min(orig.start.y, orig.end.y);
        const origMaxX = Math.max(orig.start.x, orig.end.x);
        const origMaxY = Math.max(orig.start.y, orig.end.y);

        let newMinX = origMinX;
        let newMinY = origMinY;
        let newMaxX = origMaxX;
        let newMaxY = origMaxY;

        if (resizingCorner === "nw") {
          newMinX = Math.min(pt.x, origMaxX - 20);
          newMinY = Math.min(pt.y, origMaxY - 20);
        } else if (resizingCorner === "ne") {
          newMaxX = Math.max(pt.x, origMinX + 20);
          newMinY = Math.min(pt.y, origMaxY - 20);
        } else if (resizingCorner === "se") {
          newMaxX = Math.max(pt.x, origMinX + 20);
          newMaxY = Math.max(pt.y, origMinY + 20);
        } else if (resizingCorner === "sw") {
          newMinX = Math.min(pt.x, origMaxX - 20);
          newMaxY = Math.max(pt.y, origMinY + 20);
        }

        setShapes((prev) =>
          prev.map((s) =>
            s.id === selectedShapeId
              ? { ...s, start: { x: newMinX, y: newMinY }, end: { x: newMaxX, y: newMaxY } }
              : s,
          ),
        );
        return;
      }

      // Handling move
      if (isMoving) {
        const dx = pt.x - moveStartPointRef.current.x;
        const dy = pt.y - moveStartPointRef.current.y;

        setShapes((prev) =>
          prev.map((s) => {
            if (s.id !== selectedShapeId) return s;
            if (orig.type === "pen") {
              return {
                ...s,
                points: orig.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
              };
            }
            return {
              ...s,
              start: orig.start ? { x: orig.start.x + dx, y: orig.start.y + dy } : undefined,
              end: orig.end ? { x: orig.end.x + dx, y: orig.end.y + dy } : undefined,
            };
          }),
        );
        return;
      }
    }

    if (!isDrawing || !currentShapeRef.current) return;

    if (currentShapeRef.current.type === "pen") {
      currentShapeRef.current.points.push(pt);
    } else {
      currentShapeRef.current.end = pt;
    }
    redraw(currentShapeRef.current);
  };

  const handlePointerUp = () => {
    if (isMoving || resizingCorner) {
      setIsMoving(false);
      setResizingCorner(null);
      activeCornerRef.current = null;
      moveStartPointRef.current = null;
      originalShapeRef.current = null;
      haptics.selection();
      return;
    }

    if (!isDrawing || !currentShapeRef.current) return;
    setIsDrawing(false);
    const shapeToSave = currentShapeRef.current;
    currentShapeRef.current = null;
    if (shapeToSave) {
      setShapes((prev) => [...prev, shapeToSave]);
      setSelectedShapeId(shapeToSave.id); // Auto-select the newly created shape
    }
    haptics.selection();
  };

  const handleUndo = () => {
    setShapes((prev) => prev.slice(0, -1));
    setSelectedShapeId(null);
    haptics.selection();
  };

  const handleClear = () => {
    setShapes([]);
    setSelectedShapeId(null);
    haptics.selection();
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Redraw without selection bounding outline
    setSelectedShapeId(null);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">✏️</span>
            <div>
              <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">
                {resolveI18n(title)}
              </h2>
              <p className="text-[11px] text-zinc-500 font-medium">{t("issue.annotator_hint")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 bg-zinc-200/60 dark:bg-zinc-700/60 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs">
          {/* Tool selector */}
          <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setTool("circle")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                tool === "circle"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900"
              }`}
            >
              ⭕ {t("issue.tool_circle")}
            </button>
            <button
              type="button"
              onClick={() => setTool("rect")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                tool === "rect"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900"
              }`}
            >
              ▢ {t("issue.tool_rect")}
            </button>
            <button
              type="button"
              onClick={() => setTool("pen")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                tool === "pen"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900"
              }`}
            >
              ✎ {t("issue.tool_pen")}
            </button>
          </div>

          {/* Color & Actions */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {[
                { hex: "#e11d48", label: "Red" },
                { hex: "#eab308", label: "Yellow" },
                { hex: "#2563eb", label: "Blue" },
                { hex: "#16a34a", label: "Green" },
              ].map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => {
                    setColor(c.hex);
                    // Update color of currently selected shape if any
                    if (selectedShapeId) {
                      setShapes((prev) =>
                        prev.map((s) => (s.id === selectedShapeId ? { ...s, color: c.hex } : s)),
                      );
                    }
                  }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    color === c.hex
                      ? "scale-110 border-zinc-900 dark:border-white shadow-md"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  aria-label={c.label}
                />
              ))}
            </div>

            <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

            <button
              type="button"
              disabled={shapes.length === 0}
              onClick={handleUndo}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              ↩ {t("issue.tool_undo")}
            </button>
            <button
              type="button"
              disabled={shapes.length === 0}
              onClick={handleClear}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 text-zinc-700 dark:text-zinc-300 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              🗑 {t("issue.tool_clear")}
            </button>
          </div>
        </div>

        {/* Canvas Workspace */}
        <div
          ref={containerRef}
          className="flex-1 bg-zinc-950 flex items-center justify-center p-2 sm:p-4 overflow-hidden relative select-none touch-none"
        >
          <canvas
            ref={canvasRef}
            onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
            onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) handlePointerDown(t.clientX, t.clientY);
            }}
            onTouchMove={(e) => {
              const t = e.touches[0];
              if (t) handlePointerMove(t.clientX, t.clientY);
            }}
            onTouchEnd={handlePointerUp}
            onTouchCancel={handlePointerUp}
            className={`max-h-[60vh] max-w-full object-contain rounded-lg shadow-2xl border border-zinc-800 ${
              isMoving ? "cursor-grabbing" : selectedShapeId ? "cursor-grab" : "cursor-crosshair"
            }`}
          />
        </div>

        {/* Footer Actions */}
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
            <span>✓</span>
            <span>{t("issue.annotator_save")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
