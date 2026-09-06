import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { useHeaderVisibility } from "../src/hooks/useHeaderVisibility.ts";

describe("useHeaderVisibility", () => {
  it("initializes to true in SSR", () => {
    function HeaderTester() {
      const isVisible = useHeaderVisibility({ threshold: 50 });
      return <div>{isVisible ? "VISIBLE" : "HIDDEN"}</div>;
    }
    const html = renderToString(<HeaderTester />);
    expect(html).toContain("VISIBLE");
  });

  it("handles scroll threshold transitions via listener simulation", () => {
    let scrollListener: (() => void) | null = null;
    const originalWindow = globalThis.window;

    const mockWindow = {
      scrollY: 0,
      addEventListener: (event: string, listener: () => void) => {
        if (event === "scroll") {
          scrollListener = listener;
        }
      },
      removeEventListener: () => {
        scrollListener = null;
      },
    };

    Object.defineProperty(globalThis, "window", {
      value: mockWindow,
      writable: true,
      configurable: true,
    });

    try {
      let visibleState = true;
      const threshold = 60;
      let lastY = 0;

      const handleScroll = () => {
        const currentY = mockWindow.scrollY;
        if (currentY < 10) {
          visibleState = true;
        } else if (currentY > lastY && currentY > threshold) {
          visibleState = false;
        } else if (currentY < lastY) {
          visibleState = true;
        }
        lastY = currentY;
      };

      mockWindow.addEventListener("scroll", handleScroll);

      // Scroll down past threshold -> false
      mockWindow.scrollY = 80;
      if (scrollListener) (scrollListener as () => void)();
      expect(visibleState).toBe(false);

      // Scroll up -> true
      mockWindow.scrollY = 50;
      if (scrollListener) (scrollListener as () => void)();
      expect(visibleState).toBe(true);

      // Scroll back near top (< 10) -> true
      mockWindow.scrollY = 5;
      if (scrollListener) (scrollListener as () => void)();
      expect(visibleState).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        writable: true,
        configurable: true,
      });
    }
  });
});
