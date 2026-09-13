import { apiClient } from "../api/client.ts";

let cached: boolean | null = null;
let request: Promise<boolean> | null = null;

/** Reads the server-side AI toggle once per session for every AI affordance. */
export function loadAiStatus(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  request ??= apiClient<{ enabled: boolean }>("/api/ai/status")
    .then((response) => {
      cached = response?.enabled === true;
      return cached;
    })
    .catch(() => {
      request = null;
      return false;
    });
  return request;
}

/** Drops the cached status so the next consumer refetches after a config change. */
export function invalidateAiStatus(): void {
  cached = null;
  request = null;
}
