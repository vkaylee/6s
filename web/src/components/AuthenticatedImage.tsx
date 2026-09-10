import type { ImgHTMLAttributes } from "react";
import { useAuthenticatedImageUrl } from "../hooks/useAuthenticatedImageUrl.ts";

interface AuthenticatedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  imageUrl?: string | null;
}

export function AuthenticatedImage({ imageUrl, alt = "", ...props }: AuthenticatedImageProps) {
  const resolvedSrc = useAuthenticatedImageUrl(imageUrl);
  const renderSrc = typeof window === "undefined" ? imageUrl : resolvedSrc;
  return <img {...props} src={renderSrc ?? undefined} alt={alt} />;
}
