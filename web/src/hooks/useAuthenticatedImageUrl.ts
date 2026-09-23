import { useEffect, useState } from "react";
import { ApiError, fetchAuthenticatedBlob } from "../api/client.ts";

export type AuthenticatedImageError =
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export function classifyAuthenticatedImageError(error: unknown): AuthenticatedImageError {
  if (error instanceof ApiError) {
    if (error.status === 401) return "UNAUTHORIZED";
    if (error.status === 403) return "FORBIDDEN";
    if (error.status === 404) return "NOT_FOUND";
  }
  if (error instanceof TypeError) return "NETWORK_ERROR";
  return "UNKNOWN";
}

export function useAuthenticatedImageUrl(src?: string | null) {
  const [blobUrl, setBlobUrl] = useState<string | null>(() => {
    if (!src) return null;
    if (src.startsWith("data:") || src.startsWith("blob:")) return src;
    return null;
  });
  const [error, setError] = useState<AuthenticatedImageError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!src) {
      setBlobUrl(null);
      setError(null);
      return;
    }

    if (src.startsWith("data:") || src.startsWith("blob:")) {
      setBlobUrl(src);
      setError(null);
      return;
    }

    let active = true;
    let currentObjectUrl: string | null = null;
    setBlobUrl(null);
    setError(null);

    fetchAuthenticatedBlob(src)
      .then((blob) => {
        if (!active) return;
        currentObjectUrl = URL.createObjectURL(blob);
        setBlobUrl(currentObjectUrl);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(classifyAuthenticatedImageError(requestError));
      });

    return () => {
      active = false;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [src, attempt]);

  return { blobUrl, error, retry: () => setAttempt((value) => value + 1) };
}
