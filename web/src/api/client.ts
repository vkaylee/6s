import { useI18nStore } from "../i18n/index.ts";
import { type UserProfile, useAuthStore } from "../store/authStore.ts";
import { type Client, jsonBodySerializer } from "./generated/client/index.ts";
import { client } from "./generated/client.gen.ts";
import type { HttpMethod } from "./generated/core/types.gen.ts";
import type { ErrorDetail, PaginationMeta } from "./generated/index.ts";
export interface ApiEnvelope<T> {
  data?: T;
  error?: ErrorDetail;
  pagination?: PaginationMeta;
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
let refreshSubscribers: ((refreshed: boolean) => void)[] = [];

function onRefreshed(refreshed: boolean) {
  for (const callback of refreshSubscribers) callback(refreshed);
  refreshSubscribers = [];
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined" || typeof document.cookie !== "string") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!value) return null;
  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return null;
  }
}

const UNSAFE_METHODS: Record<string, true> = { DELETE: true, PATCH: true, POST: true, PUT: true };

export function getCsrfToken(): string | null {
  return readCookie("6s_csrf");
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
    const { enableOfflineGrace } = useAuthStore.getState();
    const headers = new Headers(request.headers);
    const skipAuth = headers.get("X-Skip-Auth") === "true";
    headers.delete("X-Skip-Auth");
    headers.delete("Authorization");
    const locale = useI18nStore.getState().locale;
    if (locale && !headers.has("X-Locale")) headers.set("X-Locale", locale);
    const sameOrigin =
      typeof window === "undefined" ||
      !("location" in window) ||
      new URL(request.url, window.location.origin).origin === window.location.origin;
    const hadCsrfToken = Boolean(getCsrfToken());
    if (sameOrigin && UNSAFE_METHODS[request.method]) {
      const csrf = getCsrfToken();
      if (csrf && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", csrf);
    }
    const send = async () => {
      const sendHeaders = new Headers(headers);
      if (sameOrigin && UNSAFE_METHODS[request.method]) {
        const csrf = getCsrfToken();
        if (csrf) sendHeaders.set("X-CSRF-Token", csrf);
      }
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : (request.headers.get("content-type") ?? "").startsWith("multipart/form-data")
            ? await request.clone().arrayBuffer()
            : await request.clone().text();
      const fetchInput =
        typeof window === "undefined" ? request.url.replace("http://localhost", "") : request.url;
      return globalThis.fetch(fetchInput, {
        method: request.method,
        headers: sendHeaders,
        body,
        credentials: "include",
      });
    };
    let response: Response;
    try {
      response = await send();
    } catch (error) {
      enableOfflineGrace();
      throw error;
    }
    if (response.status === 403 && sameOrigin && UNSAFE_METHODS[request.method] && !hadCsrfToken) {
      response = await send();
    }
    if (
      response.status === 401 &&
      !skipAuth &&
      (useAuthStore.getState().user || request.url.endsWith("/auth/me"))
    ) {
      if (!(await refreshAccessToken())) {
        throw new ApiError(401, "Phiên đăng nhập đã hết hạn hoặc đang ngoại tuyến", "UNAUTHORIZED");
      }
      response = await send();
    }
    return response;
  },
  { preconnect: globalThis.fetch.preconnect },
);

export async function fetchAuthenticatedBlob(url: string, init?: RequestInit): Promise<Blob> {
  const res = await authenticatedFetch(url, { ...init, method: "GET" });
  if (!res.ok) {
    throw new ApiError(res.status, `Lỗi tải ảnh (${res.status})`, "MEDIA_ERROR");
  }
  return res.blob();
}

client.setConfig({
  baseUrl,
  fetch: authenticatedFetch,
  responseStyle: "fields",
  parseAs: "json",
});
client.interceptors.error.use((error, response) => {
  if (!response) throw error;
  const detail = isRecord(error) && isRecord(error.error) ? error.error : undefined;
  throw new ApiError(
    response.status,
    typeof detail?.message === "string" ? detail.message : `Lỗi máy chủ (${response.status})`,
    typeof detail?.code === "string" ? detail.code : undefined,
    detail?.details,
  );
});

export const sdkClient: Client = client;

export async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing) {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    refreshSubscribers.push(resolve);
    return promise;
  }
  isRefreshing = true;
  try {
    const refreshed = await apiClient<{ user?: UserProfile }>("/api/auth/refresh", {
      method: "POST",
      skipAuth: true,
    });
    if (refreshed.user) await useAuthStore.getState().setAuth(refreshed.user);
    onRefreshed(true);
    return true;
  } catch (error) {
    if (error instanceof TypeError) {
      useAuthStore.getState().enableOfflineGrace();
    } else {
      await useAuthStore.getState().clearAuth();
    }
    onRefreshed(false);
    return false;
  } finally {
    isRefreshing = false;
  }
}
export async function logout(): Promise<void> {
  try {
    await apiClient("/api/auth/revoke", { method: "POST" });
    await useAuthStore.getState().clearAuth();
  } catch {
    // Keep profile while offline; HttpOnly cookies cannot be cleared by JavaScript.
    useAuthStore.getState().enableOfflineGrace();
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
  const result = await client.request(generatedOptions);
  const envelope = parseEnvelope<T>(result.data);
  if (envelope.data === undefined) {
    throw new ApiError(502, "API response is missing data", "INVALID_RESPONSE");
  }
  if (options.includeMeta) {
    return { data: envelope.data, pagination: envelope.pagination };
  }
  return envelope.data;
}
