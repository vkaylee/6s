/**
 * Safe navigation helpers to avoid history stack pollution in mobile Web / SPA.
 * Falls back to browser history when no logical stack is available.
 */
export function goBack(fallbackUrl = "/") {
  if (typeof window !== "undefined" && window.history.length > 1) {
    window.history.back();
  } else if (typeof window !== "undefined") {
    window.location.replace(fallbackUrl);
  }
}
