/** Normalizes photo URLs returned by the API or local caches. */
export function resolvePhotoUrl(
  url?: string | null,
  _fallbackFolder: "before" | "detail" | "after" = "before",
): string {
  if (!url) {
    return "";
  }
  if (
    url.startsWith("/") ||
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }
  return "";
}
