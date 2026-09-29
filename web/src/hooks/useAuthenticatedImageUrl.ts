import { useCallback, useEffect, useRef, useState } from "react";
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
  const [blobUrl, setBlobUrl] = useState<string | null>(() => src || null);
  const [error, setError] = useState<AuthenticatedImageError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const objectUrlRef = useRef<string | null>(null);
  const sourceRef = useRef(src || "");
  const fallbackAttemptedRef = useRef(false);

  useEffect(() => {
    sourceRef.current = src || "";
    fallbackAttemptedRef.current = false;
    setBlobUrl(src || null);
    setError(null);
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, [src, attempt]);

  const loadFallback = useCallback(async (): Promise<boolean> => {
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
      setError("UNKNOWN");
      return false;
    }
    if (fallbackAttemptedRef.current) return false;
    fallbackAttemptedRef.current = true;
    try {
      const blob = await fetchAuthenticatedBlob(src);
      if (sourceRef.current !== src) return false;
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      setBlobUrl(objectUrl);
      return true;
    } catch (requestError: unknown) {
      if (sourceRef.current === src) {
        setError(classifyAuthenticatedImageError(requestError));
      }
      return false;
    }
  }, [src]);

  return {
    blobUrl,
    error,
    setError,
    reloadKey: attempt,
    loadFallback,
    retry: () => setAttempt((value) => value + 1),
  };
}
