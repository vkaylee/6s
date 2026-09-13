import { type ImgHTMLAttributes, type ReactEventHandler, useEffect, useState } from "react";
import { useAuthenticatedImageUrl } from "../hooks/useAuthenticatedImageUrl.ts";

interface AuthenticatedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  imageUrl?: string | null;
}

// 1x1 transparent GIF (base64): shows nothing while loading, prevents browser broken-image icon.
const EMPTY_SRC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const BROKEN_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='m3 16 5-5 4 4 3-3 6 6'/%3E%3Ccircle cx='9' cy='8' r='1.5'/%3E%3C/svg%3E\")";

export function AuthenticatedImage({
  imageUrl,
  alt = "",
  className,
  onLoad,
  onError,
  ...props
}: AuthenticatedImageProps) {
  const resolvedSrc = useAuthenticatedImageUrl(imageUrl);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    setStatus("loading");
    setShowSkeleton(false);
    const timer = window.setTimeout(() => setShowSkeleton(true), 100);
    return () => window.clearTimeout(timer);
  }, [imageUrl]);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (event) => {
    setStatus("loaded");
    setShowSkeleton(false);
    onLoad?.(event);
  };

  const handleError: ReactEventHandler<HTMLImageElement> = (event) => {
    setStatus("error");
    onError?.(event);
  };

  // Loading: pulsing skeleton over a 1x1 transparent image.
  // Error: solid block with a broken-image glyph, no browser default.
  const placeholderState =
    status === "error"
      ? "bg-zinc-100 dark:bg-zinc-800"
      : status === "loading" && showSkeleton
        ? "bg-zinc-100 dark:bg-zinc-800 animate-pulse"
        : "";

  const placeholderStyle =
    status === "error"
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
        : (resolvedSrc ?? EMPTY_SRC);

  return (
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
  );
}
