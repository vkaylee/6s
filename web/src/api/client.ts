import { useI18nStore } from "../i18n/index.ts";
import { useAuthStore } from "../store/authStore.ts";
import {
  type Client,
  createClient,
  createConfig,
  jsonBodySerializer,
} from "./generated/client/index.ts";
import type { HttpMethod } from "./generated/core/types.gen.ts";
import { refresh } from "./generated/index.ts";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvelope<T>(value: unknown): ApiEnvelope<T> {
  if (!isRecord(value)) throw new ApiError(502, "Invalid API response", "INVALID_RESPONSE");

  const error = value.error;
  if (
    error !== undefined &&
    (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string")
  ) {
    throw new ApiError(502, "Invalid API error response", "INVALID_RESPONSE");
  }

  const pagination = value.pagination;
  if (
    pagination !== undefined &&
    (!isRecord(pagination) ||
      typeof pagination.page !== "number" ||
      typeof pagination.limit !== "number" ||
      typeof pagination.total !== "number")
  ) {
    throw new ApiError(502, "Invalid API pagination response", "INVALID_RESPONSE");
  }

  if (!("data" in value) && !("error" in value)) {
    return { data: value as T };
  }

  return {
    data: value.data as T | undefined,
    error: error as ApiEnvelope<T>["error"],
    pagination: pagination as ApiEnvelope<T>["pagination"],
  };
}

const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  `${typeof window === "undefined" ? "http://localhost" : window.location.origin}/api`;

const HTTP_METHODS = new Set<Uppercase<HttpMethod>>([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);

function normalizeMethod(method: string): Uppercase<HttpMethod> {
  const normalized = method.toUpperCase();
  if (!HTTP_METHODS.has(normalized as Uppercase<HttpMethod>)) {
    throw new TypeError(`Unsupported HTTP method: ${method}`);
  }
  return normalized as Uppercase<HttpMethod>;
}

const authenticatedFetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request =
      input instanceof Request
        ? input
        : new Request(new URL(input.toString(), baseUrl || "http://localhost"), init);
    const { user, enableOfflineGrace } = useAuthStore.getState();
    const headers = new Headers(request.headers);
    const skipAuth = headers.get("X-Skip-Auth") === "true";
    headers.delete("X-Skip-Auth");
    let accessToken = useAuthStore.getState().accessToken;
    if (!skipAuth && user && !accessToken) accessToken = await refreshAccessToken();
    if (!skipAuth && accessToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    const locale = useI18nStore.getState().locale;
    if (locale && !headers.has("X-Locale")) headers.set("X-Locale", locale);
    const send = async (token?: string) => {
      const retryHeaders = new Headers(headers);
      if (token) retryHeaders.set("Authorization", `Bearer ${token}`);
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.clone().text();
      const fetchInput =
        typeof window === "undefined" ? request.url.replace("http://localhost", "") : request.url;
      return globalThis.fetch(fetchInput, { method: request.method, headers: retryHeaders, body });
    };
    let response: Response;
    try {
      response = await send(accessToken || undefined);
    } catch (error) {
      enableOfflineGrace();
      throw error;
    }
    if (response.status === 401 && !skipAuth) {
      const newToken = await refreshAccessToken();
      if (!newToken)
        throw new ApiError(401, "Phiên đăng nhập đã hết hạn hoặc đang ngoại tuyến", "UNAUTHORIZED");
      response = await send(newToken);
    }
    return response;
  },
  { preconnect: globalThis.fetch.preconnect },
);

export const sdkClient: Client = createClient(
  createConfig({ baseUrl, fetch: authenticatedFetch, responseStyle: "fields" }),
);
sdkClient.interceptors.error.use((error, response) => {
  if (!response) throw error;
  const detail = isRecord(error) && isRecord(error.error) ? error.error : undefined;
  throw new ApiError(
    response.status,
    typeof detail?.message === "string" ? detail.message : `Lỗi máy chủ (${response.status})`,
    typeof detail?.code === "string" ? detail.code : undefined,
    detail?.details,
  );
});

export async function refreshAccessToken(): Promise<string | null> {
  const { getRefreshToken, setAuth, user, clearAuth } = useAuthStore.getState();
  const refreshToken = await getRefreshToken();
  if (!refreshToken || !user) return null;
  if (isRefreshing) return new Promise((resolve) => refreshSubscribers.push(resolve));
  isRefreshing = true;
  try {
    const result = await refresh({
      client: sdkClient,
      body: { refresh_token: refreshToken },
      headers: { "X-Skip-Auth": "true" },
      responseStyle: "fields",
      throwOnError: true,
    });
    const envelope = parseEnvelope<{
      access_token: string;
      refresh_token: string;
      user: typeof user;
    }>(result.data);
    const data = envelope.data;
    const refreshedUser = data?.user ?? user;
    if (!data?.access_token || !data.refresh_token || !refreshedUser) {
      onRefreshed(null);
      return null;
    }
    await setAuth(refreshedUser, data.access_token, data.refresh_token);
    onRefreshed(data.access_token);
    return data.access_token;
  } catch {
    await clearAuth();
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

type ApiResult<T> = { data: T; pagination?: ApiEnvelope<T>["pagination"] };

export function apiClient<T>(
  url: string,
  options: RequestOptions & { includeMeta: true },
): Promise<ApiResult<T>>;
export function apiClient<T>(url: string, options?: RequestOptions): Promise<T>;
export async function apiClient<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T | ApiResult<T>> {
  if (options.body && (!options.method || options.method.toUpperCase() === "GET")) {
    throw new TypeError("apiClient mutation requests require an explicit HTTP method");
  }
  const path = url.startsWith("/api") ? url.slice(4) || "/" : url;
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string | null> = {
    ...Object.fromEntries(new Headers(options.headers).entries()),
    ...(options.skipAuth ? { "X-Skip-Auth": "true" } : {}),
    ...(isFormData ? { "Content-Type": null } : {}),
  };
  const generatedOptions = {
    url: path,
    method: normalizeMethod(options.method ?? "GET"),
    body: isFormData || typeof options.body !== "string" ? options.body : JSON.parse(options.body),
    headers,
    bodySerializer: isFormData ? (body: unknown) => body : jsonBodySerializer.bodySerializer,
    parseAs: "json" as const,
    responseStyle: "fields" as const,
    throwOnError: true as const,
  };
  const result = await sdkClient.request(generatedOptions);
  const envelope = parseEnvelope<T>(result.data);
  if (envelope.data === undefined) {
    throw new ApiError(502, "API response is missing data", "INVALID_RESPONSE");
  }
  if (options.includeMeta) {
    return { data: envelope.data, pagination: envelope.pagination };
  }
  return envelope.data;
}
