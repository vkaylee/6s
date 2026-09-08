import { useI18nStore } from "../i18n/index.ts";
import { useAuthStore } from "../store/authStore.ts";
import { createClient, createConfig } from "./generated/client/index.ts";
import type { HttpMethod } from "./generated/core/types.gen.ts";

export interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  pagination?: { page: number; limit: number; total: number };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "API_ERROR",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let isRefreshing = false;
let refreshSubscribers: ((token: string | null) => void)[] = [];

function onRefreshed(token: string | null) {
  for (const callback of refreshSubscribers) callback(token);
  refreshSubscribers = [];
}

function parseEnvelope(value: unknown): ApiEnvelope<unknown> {
  if (typeof value !== "object" || value === null) {
    throw new ApiError(502, "Invalid API response", "INVALID_RESPONSE");
  }
  const body = value as Record<string, unknown>;
  const error = body.error;
  if (
    error !== undefined &&
    (typeof error !== "object" ||
      error === null ||
      typeof (error as Record<string, unknown>).code !== "string" ||
      typeof (error as Record<string, unknown>).message !== "string")
  ) {
    throw new ApiError(502, "Invalid API error response", "INVALID_RESPONSE");
  }
  const pagination = body.pagination;
  if (
    pagination !== undefined &&
    (typeof pagination !== "object" ||
      pagination === null ||
      typeof (pagination as Record<string, unknown>).page !== "number" ||
      typeof (pagination as Record<string, unknown>).limit !== "number" ||
      typeof (pagination as Record<string, unknown>).total !== "number")
  ) {
    throw new ApiError(502, "Invalid API pagination response", "INVALID_RESPONSE");
  }
  return {
    data: body.data,
    error: error as ApiEnvelope<unknown>["error"],
    pagination: pagination as ApiEnvelope<unknown>["pagination"],
  };
}

const baseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  `${typeof window !== "undefined" ? window.location.origin : "http://localhost"}/api`;
async function requestFetch(
  this: unknown,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (input instanceof Request && !init) {
    init = {
      method: input.method,
      headers: input.headers,
      body:
        input.method === "GET" || input.method === "HEAD" ? undefined : await input.clone().text(),
    };
    input = input.url;
  }
  const requestUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const fetchInput: RequestInfo | URL =
    typeof window === "undefined" && requestUrl.startsWith("http://localhost")
      ? new URL(requestUrl).pathname + new URL(requestUrl).search
      : input;
  const { user, enableOfflineGrace } = useAuthStore.getState();
  let accessToken = useAuthStore.getState().accessToken;
  const headers = new Headers(init?.headers);
  const skipAuth = headers.get("X-Skip-Auth") === "true";
  headers.delete("X-Skip-Auth");
  if (!skipAuth && user && !accessToken) accessToken = await refreshAccessToken();
  if (!skipAuth && accessToken && !headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${accessToken}`);
  const locale = useI18nStore.getState().locale;
  if (locale && !headers.has("X-Locale")) headers.set("X-Locale", locale);
  let response: Response;
  try {
    response = await fetch(fetchInput, { ...init, headers });
  } catch (error) {
    enableOfflineGrace();
    throw error;
  }
  if (response.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (!newToken)
      throw new ApiError(401, "Phiên đăng nhập đã hết hạn hoặc đang ngoại tuyến", "UNAUTHORIZED");
    headers.set("Authorization", `Bearer ${newToken}`);
    response = await fetch(fetchInput, { ...init, headers });
  }
  return response;
}

const requestFn = requestFetch as unknown as typeof fetch;
export const sdkClient = createClient(createConfig({ baseUrl, fetch: requestFn }));
sdkClient.interceptors.error.use((error, response) => {
  if (response) {
    const detail = (typeof error === "object" && error !== null ? error : {}) as Record<
      string,
      unknown
    >;
    const apiError = detail.error as Record<string, unknown> | undefined;
    throw new ApiError(
      response.status,
      typeof apiError?.message === "string" ? apiError.message : `Lỗi máy chủ (${response.status})`,
      typeof apiError?.code === "string" ? apiError.code : undefined,
      apiError?.details,
    );
  }
  throw error;
});

export async function refreshAccessToken(): Promise<string | null> {
  const { getRefreshToken, setAuth, user, clearAuth } = useAuthStore.getState();
  const refreshToken = await getRefreshToken();
  if (!refreshToken || !user) return null;
  if (isRefreshing) return new Promise((resolve) => refreshSubscribers.push(resolve));
  isRefreshing = true;
  try {
    const refreshUrl =
      typeof window === "undefined" ? "/api/auth/refresh" : `${baseUrl}/auth/refresh`;
    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      await clearAuth();
      onRefreshed(null);
      return null;
    }
    const envelope = parseEnvelope(body);
    const data = envelope.data;
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as Record<string, unknown>).access_token !== "string" ||
      typeof (data as Record<string, unknown>).refresh_token !== "string"
    ) {
      onRefreshed(null);
      return null;
    }
    const accessToken = (data as Record<string, unknown>).access_token as string;
    const refreshedUser = (data as Record<string, unknown>).user;
    await setAuth(
      (typeof refreshedUser === "object" && refreshedUser !== null
        ? refreshedUser
        : user) as typeof user,
      accessToken,
      (data as Record<string, unknown>).refresh_token as string,
    );
    onRefreshed(accessToken);
    return accessToken;
  } catch {
    useAuthStore.getState().enableOfflineGrace();
    onRefreshed(null);
    return null;
  } finally {
    isRefreshing = false;
  }
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  includeMeta?: boolean;
}

export async function apiClient<T>(url: string, options: RequestOptions = {}): Promise<T> {
  if (options.body && (!options.method || options.method.toUpperCase() === "GET"))
    throw new TypeError("apiClient mutation requests require an explicit HTTP method");
  const path = url.startsWith("/api") ? url.slice(4) || "/" : url;
  const result = await sdkClient.request({
    url: path,
    method: (options.method ?? "GET") as Uppercase<HttpMethod>,
    body:
      options.body instanceof FormData
        ? options.body
        : typeof options.body === "string"
          ? JSON.parse(options.body)
          : options.body,
    headers: {
      ...Object.fromEntries(new Headers(options.headers).entries()),
      ...(options.skipAuth ? { "X-Skip-Auth": "true" } : {}),
    },
    parseAs: "json",
    responseStyle: "data",
    throwOnError: true,
  });
  const envelope = parseEnvelope(result);
  if (options.includeMeta) return { data: envelope.data, pagination: envelope.pagination } as T;
  return (envelope.data !== undefined ? envelope.data : result) as T;
}
