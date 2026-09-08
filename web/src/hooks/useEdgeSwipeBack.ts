import { useEffect } from "react";

interface EdgeSwipeOptions {
  onBack: () => void;
  enabled?: boolean;
  edgeWidth?: number;
  threshold?: number;
  maxDuration?: number;
  blocked?: () => boolean;
}

export function useEdgeSwipeBack({
  onBack,
  enabled = true,
  edgeWidth = 24,
  threshold = 80,
  maxDuration = 400,
  blocked,
}: EdgeSwipeOptions) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let tracking = false;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || touch.clientX > edgeWidth) return;
      if (blocked?.()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [data-edge-swipe-ignore]")) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startedAt = Date.now();
      tracking = true;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const elapsed = Date.now() - startedAt;
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      if (elapsed <= maxDuration && deltaX >= threshold && deltaX > deltaY * 1.25) {
        onBack();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [edgeWidth, maxDuration, onBack, enabled, blocked, threshold]);
}
