import {
  FileX,
  ImageOff,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { type ImgHTMLAttributes, type ReactEventHandler, useEffect, useState } from "react";
import {
  type AuthenticatedImageError,
  useAuthenticatedImageUrl,
} from "../hooks/useAuthenticatedImageUrl.ts";
import { useI18nStore } from "../i18n/index.ts";

interface AuthenticatedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  imageUrl?: string | null;
  compact?: boolean;
  onErrorStateChange?: (error: AuthenticatedImageError | null) => void;
}

const EMPTY_SRC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const BROKEN_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='m3 16 5-5 4 4 3-3 6 6'/%3E%3Ccircle cx='9' cy='8' r='1.5'/%3E%3C/svg%3E\")";

interface MediaErrorCopy {
  title: string;
  label: string;
  badge: string;
  hint: string;
  Icon: typeof FileX;
  retry: boolean;
  tone: "amber" | "blue" | "slate";
}

export function isRetryableMediaError(error: AuthenticatedImageError | null): boolean {
  return error === "NETWORK_ERROR" || error === "UNKNOWN";
}

function errorCopy(error: AuthenticatedImageError | null, t: (key: string) => string) {
  switch (error) {
    case "FORBIDDEN":
      return {
        title: t("media.forbidden_title"),
        label: t("media.forbidden"),
        badge: t("media.forbidden_badge"),
        hint: t("media.forbidden_hint"),
        Icon: ShieldCheck,
        retry: false,
        tone: "amber",
      } satisfies MediaErrorCopy;
    case "UNAUTHORIZED":
      return {
        title: t("media.unauthorized_title"),
        label: t("media.unauthorized"),
        badge: t("media.unauthorized_badge"),
        hint: t("media.unauthorized_hint"),
        Icon: LockKeyhole,
        retry: false,
        tone: "blue",
      } satisfies MediaErrorCopy;
    case "NOT_FOUND":
      return {
        title: t("media.not_found_title"),
        label: t("media.not_found"),
        badge: t("media.not_found_badge"),
        hint: t("media.not_found_hint"),
        Icon: FileX,
        retry: false,
        tone: "slate",
      } satisfies MediaErrorCopy;
    case "NETWORK_ERROR":
      return {
        title: t("media.network_error_title"),
        label: t("media.network_error"),
        badge: t("media.network_badge"),
        hint: t("media.network_error_hint"),
        Icon: WifiOff,
        retry: true,
        tone: "blue",
      } satisfies MediaErrorCopy;
    case "UNKNOWN":
      return {
        title: t("media.load_error_title"),
        label: t("media.load_error"),
        badge: t("media.load_error_badge"),
        hint: t("media.load_error_hint"),
        Icon: ImageOff,
        retry: true,
        tone: "slate",
      } satisfies MediaErrorCopy;
    default:
      return null;
  }
}

const BADGE_TONE = {
  amber: "border-amber-500/30 bg-amber-950/85 text-amber-200",
  blue: "border-sky-500/30 bg-sky-950/85 text-sky-200",
  slate: "border-zinc-700/50 bg-zinc-900/85 text-zinc-200",
} as const;

const GLYPH_TONE = {
  amber:
    "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-400",
  blue: "border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-800/80 dark:bg-sky-950/50 dark:text-sky-400",
  slate:
    "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
} as const;

export function AuthenticatedImage({
  imageUrl,
  alt = "",
  className,
  onLoad,
  onError,
  compact = true,
  onErrorStateChange,
  ...props
}: AuthenticatedImageProps) {
  const { t } = useI18nStore();
  const { blobUrl, error, retry } = useAuthenticatedImageUrl(imageUrl);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    setStatus("loading");
    setShowSkeleton(false);
    const timer = window.setTimeout(() => setShowSkeleton(true), 100);
    return () => window.clearTimeout(timer);
  }, [imageUrl]);

  useEffect(() => {
    if (error) setStatus("error");
    onErrorStateChange?.(error);
  }, [error, onErrorStateChange]);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (event) => {
    setStatus("loaded");
    setShowSkeleton(false);
    onLoad?.(event);
  };

  const handleError: ReactEventHandler<HTMLImageElement> = (event) => {
    setStatus("error");
    onError?.(event);
  };

  const mediaError = errorCopy(error ?? (status === "error" ? "UNKNOWN" : null), t);
  const placeholderState =
    mediaError || (status === "loading" && showSkeleton) ? "bg-zinc-100 dark:bg-zinc-800" : "";
  const placeholderStyle =
    mediaError && !error
      ? {
          backgroundImage: BROKEN_ICON,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "1.5rem 1.5rem",
        }
      : undefined;
  const src =
    status === "error"
      ? EMPTY_SRC
      : typeof window === "undefined"
        ? (imageUrl ?? undefined)
        : (blobUrl ?? EMPTY_SRC);

  const retryMedia = () => {
    setStatus("loading");
    retry();
  };

  return (
    <>
      <img
        {...props}
        className={`${className ?? ""} ${placeholderState}`}
        style={placeholderStyle ? { ...props.style, ...placeholderStyle } : props.style}
        src={src}
        alt={alt}
        aria-busy={status === "loading"}
        onLoad={handleLoad}
        onError={handleError}
      />
      {mediaError && compact && (
        <span
          role="status"
          aria-label={mediaError.label}
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-1.5"
        >
          <span
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold shadow-xs backdrop-blur-md ${BADGE_TONE[mediaError.tone]}`}
          >
            <mediaError.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{mediaError.badge}</span>
          </span>
        </span>
      )}
      {mediaError && !compact && (
        <span
          role="status"
          className="absolute inset-0 flex select-none flex-col items-center justify-center gap-1.5 bg-zinc-100/90 p-6 text-center backdrop-blur-xs dark:bg-zinc-900/90"
        >
          <span
            className={`mb-1.5 flex h-12 w-12 items-center justify-center rounded-2xl border shadow-xs ${GLYPH_TONE[mediaError.tone]}`}
          >
            <mediaError.Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {mediaError.title}
          </span>
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {mediaError.label}
          </span>
          <span className="max-w-xs text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
            {mediaError.hint}
          </span>
          {mediaError.retry && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                retryMedia();
              }}
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("media.retry")}</span>
            </button>
          )}
        </span>
      )}
      {status === "loading" && showSkeleton && !mediaError && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-zinc-100/60 dark:bg-zinc-800/60">
          <LoaderCircle className="h-5 w-5 animate-spin text-zinc-400" aria-hidden="true" />
        </span>
      )}
    </>
  );
}
