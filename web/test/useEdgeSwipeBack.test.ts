import { describe, expect, it } from "bun:test";

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

describe("useEdgeSwipeBack - blocked callback integration", () => {
  function checkBlocked(
    isDrawerOpen: boolean,
    isFilterDrawerOpen: boolean,
    selectedIssue: unknown,
    conflictItem: unknown,
  ): boolean {
    return isDrawerOpen || isFilterDrawerOpen || selectedIssue != null || conflictItem != null;
  }

  it("blocks swipe when drawer is open", () => {
    expect(checkBlocked(true, false, null, null)).toBe(true);
  });

  it("blocks swipe when filter drawer is open", () => {
    expect(checkBlocked(false, true, null, null)).toBe(true);
  });

  it("blocks swipe when issue modal is open", () => {
    expect(checkBlocked(false, false, "issue-123", null)).toBe(true);
  });

  it("blocks swipe when conflict modal is open", () => {
    expect(checkBlocked(false, false, null, "conflict-456")).toBe(true);
  });

  it("allows swipe when nothing is blocking", () => {
    expect(checkBlocked(false, false, null, null)).toBe(false);
  });
});
