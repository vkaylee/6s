/**
 * Triggers physical vibration patterns for factory noise compensation (SPEC.md Section 9.7).
 */
export const haptics = {
  success: () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(50);
    }
  },
  safetyAlert: () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([50, 50, 100]);
    }
  },
  errorOrConflict: () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(200);
    }
  },
  disabledTouch: () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(30);
    }
  },
  selection: () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(15);
    }
  },
};
