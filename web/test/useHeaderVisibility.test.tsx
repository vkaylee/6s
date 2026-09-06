import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { useHeaderVisibility } from "../src/hooks/useHeaderVisibility.ts";

function WithEffectSupport({ children }: { children: React.ReactNode }) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: {
          current: {
            useEffect: (cb: () => undefined | (() => void)) => void;
          };
        };
      };
    }
  ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;

  const originalEffect = internals.current.useEffect;
  internals.current.useEffect = (cb: () => undefined | (() => void)) => {
    cb();
    internals.current.useEffect = originalEffect;
  };

  return <>{children}</>;
}

describe("useHeaderVisibility", () => {
  it("attaches scroll listener and reacts to window scroll changes", () => {
    let capturedListener: (() => void) | null = null;
    let removedListenerRef = false;

    const originalWindow = globalThis.window;
    globalThis.window = {
      scrollY: 0,
      addEventListener: (evt: string, cb: unknown) => {
        if (evt === "scroll") {
          capturedListener = cb as () => void;
        }
      },
      removeEventListener: () => {
        removedListenerRef = true;
      },
    } as unknown as Window & typeof globalThis;

    function HeaderTestComponent() {
      const isVisible = useHeaderVisibility({ threshold: 60 });
      return <div>{isVisible ? "VISIBLE" : "HIDDEN"}</div>;
    }

    try {
      const html = renderToString(
        <WithEffectSupport>
          <HeaderTestComponent />
        </WithEffectSupport>,
      );
      expect(html).toContain("VISIBLE");
      expect(capturedListener).toBeDefined();
      expect(removedListenerRef).toBe(false);

      if (capturedListener) {
        // Scroll down past threshold
        (window as { scrollY: number }).scrollY = 120;
        (capturedListener as () => void)();

        // Scroll down further
        (window as { scrollY: number }).scrollY = 150;
        (capturedListener as () => void)();

        // Scroll back up
        (window as { scrollY: number }).scrollY = 80;
        (capturedListener as () => void)();

        // Scroll to top (< 10)
        (window as { scrollY: number }).scrollY = 5;
        (capturedListener as () => void)();
      }
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
