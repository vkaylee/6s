import { useEffect, useState } from "react";
import { ApiError } from "../api/client.ts";

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
  const [imageUrl, setImageUrl] = useState<string | null>(() => src || null);
  const [error, setError] = useState<AuthenticatedImageError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setImageUrl(src || null);
    setError(null);
  }, [src, attempt]);

  return {
    blobUrl: imageUrl,
    error,
    setError,
    reloadKey: attempt,
    retry: () => setAttempt((value) => value + 1),
  };
}
