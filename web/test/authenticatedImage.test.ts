import { describe, expect, it } from "bun:test";
import { ApiError, fetchAuthenticatedBlob } from "../src/api/client.ts";
import { classifyAuthenticatedImageError } from "../src/hooks/useAuthenticatedImageUrl.ts";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

describe("fetchAuthenticatedBlob", () => {
  it("attaches bearer token to protected image requests", async () => {
    const originalFetch = globalThis.fetch;
    let authHeader = "";

    useAuthStore.setState({
      user: {
        id: 1,
        username: "test",
        full_name: "Test User",
        role: UserRole.USER,
      },
      accessToken: "media-test-token-123",
      isLoading: false,
      isOfflineGrace: false,
    });

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      authHeader = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(new Blob(["binary-image-data"], { type: "image/jpeg" }), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    }) as unknown as typeof fetch;

    try {
      const blob = await fetchAuthenticatedBlob("/api/issues/1/media/before/test.jpg");
      expect(authHeader).toBe("Bearer media-test-token-123");
      expect(blob.size).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
      await useAuthStore.getState().clearAuth();
    }
  });

  it("throws ApiError on non-200 media response without leaking token to error", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response("unauthorized", { status: 401 });
    }) as unknown as typeof fetch;

    try {
      await expect(fetchAuthenticatedBlob("/api/issues/1/media/before/secret.jpg")).rejects.toThrow(
        "Phiên đăng nhập đã hết hạn hoặc đang ngoại tuyến",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("classifyAuthenticatedImageError", () => {
  it("classifies 401 as UNAUTHORIZED", () => {
    expect(classifyAuthenticatedImageError(new ApiError(401, "unauthorized"))).toBe("UNAUTHORIZED");
  });

  it("classifies 403 as FORBIDDEN", () => {
    expect(classifyAuthenticatedImageError(new ApiError(403, "forbidden"))).toBe("FORBIDDEN");
  });

  it("classifies 404 as NOT_FOUND", () => {
    expect(classifyAuthenticatedImageError(new ApiError(404, "not found"))).toBe("NOT_FOUND");
  });

  it("classifies network TypeError as NETWORK_ERROR", () => {
    expect(classifyAuthenticatedImageError(new TypeError("Failed to fetch"))).toBe("NETWORK_ERROR");
  });

  it("classifies unexpected errors as UNKNOWN", () => {
    expect(classifyAuthenticatedImageError(new Error("random failure"))).toBe("UNKNOWN");
    expect(classifyAuthenticatedImageError("string error")).toBe("UNKNOWN");
  });
});
