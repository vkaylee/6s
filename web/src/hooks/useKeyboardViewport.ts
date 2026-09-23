import { useEffect } from "react";

/**
 * Keeps the focused text field visible when the on-screen keyboard opens.
 *
 * - Android Chrome: `interactive-widget=resizes-content` (viewport meta) already
 *   shrinks the layout viewport, so fixed elements track the keyboard.
 * - iOS Safari: the layout viewport never resizes. On focus, scroll the field
 *   into the visible region after the keyboard animation settles.
 */
export function useKeyboardViewport() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isTextField = (el: Element | null): el is HTMLElement =>
      el instanceof HTMLElement &&
      (el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" &&
          !["checkbox", "radio", "file", "button", "submit", "range", "date"].includes(
            (el as HTMLInputElement).type,
          )));

    let timer = 0;
    const reveal = () => {
      const el = document.activeElement;
      if (!isTextField(el)) return;
      // Keyboard animation ~300ms on iOS; scroll after it settles so the
      // visual viewport already reflects the final geometry.
      timer = window.setTimeout(() => {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 320);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (isTextField(event.target as Element | null)) reveal();
    };
    const onViewportResize = () => {
      // iOS fires visualViewport resize while the keyboard animates; if a field
      // is focused and got covered, re-reveal it at the final geometry.
      const el = document.activeElement;
      if (!isTextField(el)) return;
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport;
      if (vv && (rect.bottom > vv.height || rect.top < 0)) {
        window.clearTimeout(timer);
        reveal();
      }
    };

    document.addEventListener("focusin", onFocusIn);
    window.visualViewport?.addEventListener("resize", onViewportResize);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", onFocusIn);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
    };
  }, []);
}
