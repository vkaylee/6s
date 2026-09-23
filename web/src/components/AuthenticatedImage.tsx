import { FileX, ImageOff, LoaderCircle, Lock, RefreshCw, WifiOff } from "lucide-react";
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

function errorCopy(error: AuthenticatedImageError | null, t: (key: string) => string) {
  switch (error) {
    case "FORBIDDEN":
      return { label: t("media.forbidden"), Icon: Lock, retry: false };
    case "UNAUTHORIZED":
      return { label: t("media.unauthorized"), Icon: Lock, retry: false };
    case "NOT_FOUND":
      return { label: t("media.not_found"), Icon: FileX, retry: false };
    case "NETWORK_ERROR":
      return { label: t("media.network_error"), Icon: WifiOff, retry: true };
    case "UNKNOWN":
      return { label: t("media.load_error"), Icon: ImageOff, retry: true };
    default:
      return null;
  }
}

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
      {mediaError && (
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-[inherit] bg-zinc-100/95 px-2 text-center text-zinc-600 dark:bg-zinc-800/95 dark:text-zinc-300 ${mediaError.retry ? "cursor-pointer" : "pointer-events-none"}`}
          {...(mediaError.retry
            ? {
                role: "button" as const,
                tabIndex: 0,
                "aria-label": `${mediaError.label} ${t("media.retry")}`,
                onClick: (event: React.MouseEvent<HTMLSpanElement>) => {
                  event.stopPropagation();
                  setStatus("loading");
                  retry();
                },
                onKeyDown: (event: React.KeyboardEvent<HTMLSpanElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setStatus("loading");
                    retry();
                  }
                },
              }
            : {})}
        >
          <mediaError.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span
            className={
              compact ? "text-[10px] font-semibold leading-tight" : "text-sm font-semibold"
            }
          >
            {mediaError.label}
          </span>
          {mediaError.retry && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              {t("media.retry")}
            </span>
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
