import { describe, expect, it } from "bun:test";
import { fetchAuthenticatedBlob } from "../src/api/client.ts";
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
