import { useAuthStore } from "../store/authStore.ts";

export interface ApiEnvelope<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, message: string, code = "API_ERROR", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let isRefreshing = false;
let refreshSubscribers: ((token: string | null) => void)[] = [];

function onRefreshed(token: string | null) {
  for (const cb of refreshSubscribers) {
    cb(token);
  }
  refreshSubscribers = [];
}

/**
 * Attempts to refresh the JWT Access Token using the Refresh Token stored in IndexedDB.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const { getRefreshToken, setAuth, user, clearAuth } = useAuthStore.getState();
  const refreshToken = await getRefreshToken();
  if (!refreshToken || !user) {
    return null;
  }

  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshSubscribers.push((token) => resolve(token));
    });
  }

  isRefreshing = true;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // Refresh token expired/revoked
      await clearAuth();
      onRefreshed(null);
      return null;
    }

    const payload = (await res.json()) as ApiEnvelope<{
      access_token: string;
      refresh_token: string;
      user: typeof user;
    }>;

    if (payload.data) {
      await setAuth(
        payload.data.user || user,
        payload.data.access_token,
        payload.data.refresh_token,
      );
      onRefreshed(payload.data.access_token);
      return payload.data.access_token;
    }

    onRefreshed(null);
    return null;
  } catch {
    // Network error during refresh, do not log out; enable offline grace mode
    useAuthStore.getState().enableOfflineGrace();
    onRefreshed(null);
    return null;
  } finally {
    isRefreshing = false;
  }
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * Centralized fetch wrapper with automatic JWT injection, 401 refresh, and error envelope handling.
 */
export async function apiClient<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, enableOfflineGrace } = useAuthStore.getState();
  const headers = new Headers(options.headers || {});

  if (!options.skipAuth && accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (netErr) {
    enableOfflineGrace();
    throw netErr;
  }

  // Handle 401 Unauthorized by attempting a token refresh
  if (response.status === 401 && !options.skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(url, { ...options, headers });
    } else {
      enableOfflineGrace();
      throw new ApiError(401, "Phiên đăng nhập đã hết hạn hoặc đang ngoại tuyến", "UNAUTHORIZED");
    }
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const body = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok) {
      const errMsg = body.error?.message || `Yêu cầu thất bại với mã ${response.status}`;
      const errCode = body.error?.code || "API_ERROR";
      throw new ApiError(response.status, errMsg, errCode, body.error?.details);
    }
    return (body.data !== undefined ? body.data : (body as unknown as T)) as T;
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Lỗi máy chủ (${response.status})`);
  }

  return (await response.text()) as unknown as T;
}
