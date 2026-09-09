const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

export function formatTime(
  value: string | number | Date,
  locale = "vi-VN",
  timezone = DEFAULT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(new Date(value));
}
