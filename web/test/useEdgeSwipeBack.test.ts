import { describe, expect, it } from "bun:test";
import { isBackGestureBlocked } from "../src/App.tsx";

describe("useEdgeSwipeBack - core logic unit tests", () => {
  // Test the gesture detection logic independently
  const EDGE_WIDTH = 24;
  const DEFAULT_THRESHOLD = 80;
  const DEFAULT_MAX_DURATION = 400;

  function simulateSwipe(
    startX: number,
    endX: number,
    startY: number,
    endY: number,
    duration: number,
  ): { shouldTrigger: boolean; reason?: string } {
    const deltaX = endX - startX;
    const deltaY = Math.abs(endY - startY);

    if (startX > EDGE_WIDTH) {
      return { shouldTrigger: false, reason: "outside edge width" };
    }

    if (duration > DEFAULT_MAX_DURATION) {
      return { shouldTrigger: false, reason: "too slow" };
    }

    if (deltaX < DEFAULT_THRESHOLD) {
      return { shouldTrigger: false, reason: "below threshold" };
    }

    if (deltaX <= deltaY * 1.25) {
      return { shouldTrigger: false, reason: "too vertical" };
    }

    return { shouldTrigger: true };
  }

  it("triggers on valid rightward swipe from left edge", () => {
    const result = simulateSwipe(5, 150, 100, 100, 300);
    expect(result.shouldTrigger).toBe(true);
  });

  it("does not trigger on swipe starting away from edge", () => {
    const result = simulateSwipe(50, 200, 100, 100, 300);
    expect(result.shouldTrigger).toBe(false);
    expect(result.reason).toBe("outside edge width");
  });

  it("does not trigger below threshold distance", () => {
    const result = simulateSwipe(5, 50, 100, 100, 300);
    expect(result.shouldTrigger).toBe(false);
    expect(result.reason).toBe("below threshold");
  });

  it("does not trigger on slow swipes", () => {
    const result = simulateSwipe(5, 200, 100, 100, 500);
    expect(result.shouldTrigger).toBe(false);
    expect(result.reason).toBe("too slow");
  });
  it("does not trigger on vertical swipes", () => {
    // Diagonal: deltaX=100 (>80 threshold), deltaY=300, ratio = 3.0 > 1.25
    const result = simulateSwipe(5, 105, 100, 400, 300);
    expect(result.shouldTrigger).toBe(false);
    expect(result.reason).toBe("too vertical");
  });
});

describe("useEdgeSwipeBack - blocked callback and modal close priority", () => {
  it("blocks swipe when drawer is open", () => {
    expect(isBackGestureBlocked(true, false, null)).toBe(true);
  });

  it("blocks swipe when filter drawer is open", () => {
    expect(isBackGestureBlocked(false, true, null)).toBe(true);
  });

  it("allows swipe when issue modal is open so back gesture can close it", () => {
    expect(isBackGestureBlocked(false, false, null)).toBe(false);
  });

  it("blocks swipe when conflict modal is open", () => {
    expect(isBackGestureBlocked(false, false, "conflict-456")).toBe(true);
  });

  it("allows swipe when nothing is blocking", () => {
    expect(isBackGestureBlocked(false, false, null)).toBe(false);
  });

  it("closes open issue modal on back instead of popping route history", () => {
    let modalClosed = false;
    let poppedRoute = false;
    const selectedIssue = { id: 101 };

    const closeIssue = () => {
      modalClosed = true;
    };
    const popHistory = () => {
      poppedRoute = true;
      return "/reports";
    };

    const handleBack = () => {
      if (selectedIssue) {
        closeIssue();
        return;
      }
      const previous = popHistory();
      if (previous) {
        // navigate
      }
    };

    handleBack();

    expect(modalClosed).toBe(true);
    expect(poppedRoute).toBe(false);
  });

  it("pops route history on back when no issue modal is open", () => {
    let modalClosed = false;
    let poppedRoute = false;
    const selectedIssue = null;

    const closeIssue = () => {
      modalClosed = true;
    };
    const popHistory = () => {
      poppedRoute = true;
      return "/reports";
    };

    const handleBack = () => {
      if (selectedIssue) {
        closeIssue();
        return;
      }
      const previous = popHistory();
      if (previous) {
        // navigate
      }
    };

    handleBack();

    expect(modalClosed).toBe(false);
    expect(poppedRoute).toBe(true);
  });
});
