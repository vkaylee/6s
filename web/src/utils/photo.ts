/**
 * Normalizes photo URLs returned by the API or local caches.
 * Ensures relative basenames (e.g. {uuid}_wide.jpg) are prefixed with /uploads/{folder}/
 */
export function resolvePhotoUrl(
  url?: string | null,
  fallbackFolder: "before" | "detail" | "after" = "before",
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
  return `/uploads/${fallbackFolder}/${url}`;
}
