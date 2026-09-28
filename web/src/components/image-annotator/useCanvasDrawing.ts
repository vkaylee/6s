import { type RefObject, useEffect, useRef, useState } from "react";
import { haptics } from "../../utils/haptics.ts";
import { generateUuid } from "../../utils/uuid.ts";

export type ToolMode = "circle" | "rect" | "pen";

export interface StrokePoint {
  x: number;
  y: number;
}

export interface ShapeItem {
  id: string;
  type: ToolMode;
  color: string;
  lineWidth: number;
  points: StrokePoint[];
  start?: StrokePoint;
  end?: StrokePoint;
}

export type CornerType = "nw" | "ne" | "se" | "sw";

interface ResizeHandle {
  corner: CornerType;
  point: StrokePoint;
}

export function getShapeBounds(shape: ShapeItem): {
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
    for (const point of shape.points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
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

export function findResizeHandleAtPoint(pt: StrokePoint, shape: ShapeItem): CornerType | null {
  for (const handle of getResizeHandles(shape)) {
    if (Math.hypot(pt.x - handle.point.x, pt.y - handle.point.y) <= 28) return handle.corner;
  }
  return null;
}

export function isPointInShape(pt: StrokePoint, shape: ShapeItem): boolean {
  const { minX, minY, maxX, maxY } = getShapeBounds(shape);
  return pt.x >= minX - 24 && pt.x <= maxX + 24 && pt.y >= minY - 24 && pt.y <= maxY + 24;
}

interface UseCanvasDrawingOptions {
  imageUrl: string;
  isOpen: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function useCanvasDrawing({ imageUrl, isOpen, canvasRef }: UseCanvasDrawingOptions) {
  const [tool, setTool] = useState<ToolMode>("circle");
  const [color, setColor] = useState("#e11d48");
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [resizingCorner, setResizingCorner] = useState<CornerType | null>(null);
  const currentShapeRef = useRef<ShapeItem | null>(null);
  const moveStartPointRef = useRef<StrokePoint | null>(null);
  const originalShapeRef = useRef<ShapeItem | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageObjRef.current = image;
      setImageLoaded(true);
      setShapes([]);
      setSelectedShapeId(null);
    };
    image.src = imageUrl;
  }, [isOpen, imageUrl]);

  const redraw = (extraShape?: ShapeItem | null) => {
    const canvas = canvasRef.current;
    const image = imageObjRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const allShapes = (extraShape ? [...shapes, extraShape] : shapes).filter(Boolean);
    for (const shape of allShapes) {
      const isSelected = shape.id === selectedShapeId;
      context.save();
      context.strokeStyle = shape.color;
      context.lineWidth = shape.lineWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      if (shape.type === "pen" && shape.points.length > 1) {
        context.beginPath();
        context.moveTo(shape.points[0].x, shape.points[0].y);
        for (let index = 1; index < shape.points.length; index++) {
          context.lineTo(shape.points[index].x, shape.points[index].y);
        }
        context.stroke();
      } else if (shape.type === "circle" && shape.start && shape.end) {
        const radiusX = Math.abs(shape.end.x - shape.start.x) / 2;
        const radiusY = Math.abs(shape.end.y - shape.start.y) / 2;
        const centerX = Math.min(shape.start.x, shape.end.x) + radiusX;
        const centerY = Math.min(shape.start.y, shape.end.y) + radiusY;
        context.beginPath();
        context.ellipse(
          centerX,
          centerY,
          Math.max(radiusX, 4),
          Math.max(radiusY, 4),
          0,
          0,
          2 * Math.PI,
        );
        context.stroke();
      } else if (shape.type === "rect" && shape.start && shape.end) {
        const x = Math.min(shape.start.x, shape.end.x);
        const y = Math.min(shape.start.y, shape.end.y);
        context.beginPath();
        context.strokeRect(
          x,
          y,
          Math.abs(shape.end.x - shape.start.x),
          Math.abs(shape.end.y - shape.start.y),
        );
      }
      if (isSelected) {
        const { minX, minY, maxX, maxY } = getShapeBounds(shape);
        context.strokeStyle = "#3b82f6";
        context.lineWidth = 2;
        context.setLineDash([6, 6]);
        context.strokeRect(minX - 8, minY - 8, maxX - minX + 16, maxY - minY + 16);
        for (const handle of getResizeHandles(shape)) {
          context.setLineDash([]);
          context.fillStyle = "#2563eb";
          context.strokeStyle = "#ffffff";
          context.lineWidth = 2.5;
          context.beginPath();
          context.arc(handle.point.x, handle.point.y, 8, 0, 2 * Math.PI);
          context.fill();
          context.stroke();
        }
      }
      context.restore();
    }
  };

  useEffect(() => {
    if (!imageLoaded) return;
    const canvas = canvasRef.current;
    const image = imageObjRef.current;
    if (!canvas || !image) return;
    canvas.width = image.naturalWidth || 1280;
    canvas.height = image.naturalHeight || 960;
    redraw();
  }, [imageLoaded, shapes, selectedShapeId, tool]);

  const getCanvasPoint = (clientX: number, clientY: number): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY);
    if (!point) return;
    if (selectedShapeId) {
      const selectedShape = shapes.find((shape) => shape.id === selectedShapeId);
      const corner = selectedShape && findResizeHandleAtPoint(point, selectedShape);
      if (corner) {
        setResizingCorner(corner);
        moveStartPointRef.current = point;
        originalShapeRef.current = structuredClone(selectedShape);
        haptics.selection();
        return;
      }
    }
    const clickedShape = [...shapes].reverse().find((shape) => isPointInShape(point, shape));
    if (clickedShape) {
      setSelectedShapeId(clickedShape.id);
      setIsMoving(true);
      moveStartPointRef.current = point;
      originalShapeRef.current = structuredClone(clickedShape);
      haptics.selection();
      return;
    }
    setSelectedShapeId(null);
    setIsDrawing(true);
    const newShape: ShapeItem = {
      id: generateUuid(),
      type: tool,
      color,
      lineWidth: 6,
      points: [point],
      start: point,
      end: point,
    };
    currentShapeRef.current = newShape;
    redraw(newShape);
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY);
    if (!point) return;
    if (selectedShapeId && moveStartPointRef.current && originalShapeRef.current) {
      const original = originalShapeRef.current;
      if (resizingCorner && original.start && original.end) {
        const originalMinX = Math.min(original.start.x, original.end.x);
        const originalMinY = Math.min(original.start.y, original.end.y);
        const originalMaxX = Math.max(original.start.x, original.end.x);
        const originalMaxY = Math.max(original.start.y, original.end.y);
        let minX = originalMinX;
        let minY = originalMinY;
        let maxX = originalMaxX;
        let maxY = originalMaxY;
        if (resizingCorner === "nw") {
          minX = Math.min(point.x, originalMaxX - 20);
          minY = Math.min(point.y, originalMaxY - 20);
        } else if (resizingCorner === "ne") {
          maxX = Math.max(point.x, originalMinX + 20);
          minY = Math.min(point.y, originalMaxY - 20);
        } else if (resizingCorner === "se") {
          maxX = Math.max(point.x, originalMinX + 20);
          maxY = Math.max(point.y, originalMinY + 20);
        } else {
          minX = Math.min(point.x, originalMaxX - 20);
          maxY = Math.max(point.y, originalMinY + 20);
        }
        setShapes((previous) =>
          previous.map((shape) =>
            shape.id === selectedShapeId
              ? { ...shape, start: { x: minX, y: minY }, end: { x: maxX, y: maxY } }
              : shape,
          ),
        );
        return;
      }
      if (isMoving) {
        const dx = point.x - moveStartPointRef.current.x;
        const dy = point.y - moveStartPointRef.current.y;
        setShapes((previous) =>
          previous.map((shape) => {
            if (shape.id !== selectedShapeId) return shape;
            if (original.type === "pen") {
              return {
                ...shape,
                points: original.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
              };
            }
            return {
              ...shape,
              start: original.start
                ? { x: original.start.x + dx, y: original.start.y + dy }
                : undefined,
              end: original.end ? { x: original.end.x + dx, y: original.end.y + dy } : undefined,
            };
          }),
        );
        return;
      }
    }
    if (!isDrawing || !currentShapeRef.current) return;
    if (currentShapeRef.current.type === "pen") currentShapeRef.current.points.push(point);
    else currentShapeRef.current.end = point;
    redraw(currentShapeRef.current);
  };

  const handlePointerUp = () => {
    if (isMoving || resizingCorner) {
      setIsMoving(false);
      setResizingCorner(null);
      moveStartPointRef.current = null;
      originalShapeRef.current = null;
      haptics.selection();
      return;
    }
    if (!isDrawing || !currentShapeRef.current) return;
    setIsDrawing(false);
    const shapeToSave = currentShapeRef.current;
    currentShapeRef.current = null;
    setShapes((previous) => [...previous, shapeToSave]);
    setSelectedShapeId(shapeToSave.id);
    haptics.selection();
  };

  const handleColorChange = (nextColor: string) => {
    setColor(nextColor);
    if (selectedShapeId) {
      setShapes((previous) =>
        previous.map((shape) =>
          shape.id === selectedShapeId ? { ...shape, color: nextColor } : shape,
        ),
      );
    }
  };

  const handleUndo = () => {
    setShapes((previous) => previous.slice(0, -1));
    setSelectedShapeId(null);
    haptics.selection();
  };

  const handleClear = () => {
    setShapes([]);
    setSelectedShapeId(null);
    haptics.selection();
  };

  return {
    tool,
    setTool,
    color,
    shapes,
    selectedShapeId,
    isMoving,
    imageLoaded,
    redraw,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleColorChange,
    handleUndo,
    handleClear,
  };
}
