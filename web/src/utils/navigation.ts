/**
 * Safe navigation helpers to avoid history stack pollution in mobile Web / SPA.
 */

export function goBack(fallbackUrl = "/") {
  if (typeof window !== "undefined" && window.history.length > 1) {
    window.history.back();
  } else if (typeof window !== "undefined") {
    window.location.replace(fallbackUrl);
  }
}
