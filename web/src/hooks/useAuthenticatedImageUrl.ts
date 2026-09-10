import { useEffect, useState } from "react";
import { fetchAuthenticatedBlob } from "../api/client.ts";

export function useAuthenticatedImageUrl(src?: string | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => {
    if (!src) return null;
    if (src.startsWith("data:") || src.startsWith("blob:")) return src;
    return null;
  });

  useEffect(() => {
    if (!src) {
      setBlobUrl(null);
      return;
    }

    if (src.startsWith("data:") || src.startsWith("blob:")) {
      setBlobUrl(src);
      return;
    }

    let active = true;
    let currentObjectUrl: string | null = null;

    fetchAuthenticatedBlob(src)
      .then((blob) => {
        if (!active) return;
        currentObjectUrl = URL.createObjectURL(blob);
        setBlobUrl(currentObjectUrl);
      })
      .catch(() => {
        if (!active) return;
        setBlobUrl(null);
      });

    return () => {
      active = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [src]);

  return blobUrl;
}
