/** Normalizes photo URLs returned by the API or local caches. */
export function resolvePhotoUrl(
  url?: string | null,
  _fallbackFolder: "before" | "detail" | "after" = "before",
  deletion?: "active" | "deleted",
): string {
  if (!url) {
    return "";
  }
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  if (url.startsWith("/") || url.startsWith("http://") || url.startsWith("https://")) {
    return deletion === "deleted" ? `${url}${url.includes("?") ? "&" : "?"}deletion=deleted` : url;
  }
  return "";
}

export function hasDistinctPhoto(photo?: string | null, otherPhoto?: string | null): boolean {
  if (!photo) return false;
  if (!otherPhoto) return true;
  return photo.split("?")[0] !== otherPhoto.split("?")[0];
}
