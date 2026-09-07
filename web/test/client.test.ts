import { describe, expect, it } from "bun:test";
import { ApiError, apiClient } from "../src/api/client.ts";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

describe("apiClient ApiError", () => {
  it("constructs with status and code", () => {
    const err = new ApiError(409, "Phiên bản đã thay đổi", "CONFLICT", { current_version: 2 });
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Phiên bản đã thay đổi");
    expect(err.details).toEqual({ current_version: 2 });
  });
});

describe("apiClient request contract", () => {
  it("rejects body-bearing requests without an explicit mutation method", async () => {
    await expect(
      apiClient("/api/issues/101/close", {
        body: JSON.stringify({ score_rating: 5 }),
        skipAuth: true,
      }),
    ).rejects.toThrow("apiClient mutation requests require an explicit HTTP method");
  });

  it("preserves explicit POST methods for mutation requests", async () => {
    const originalFetch = globalThis.fetch;
    let capturedMethod = "";
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedMethod = init?.method ?? "";
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await apiClient<{ ok: boolean }>("/api/issues/101/close", {
        method: "POST",
        body: JSON.stringify({ score_rating: 5 }),
        skipAuth: true,
      });
      expect(capturedMethod).toBe("POST");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("apiClient authentication", () => {
  it("proactively refreshes token before making request when user exists but accessToken is missing", async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Super Admin",
        role: UserRole.ADMIN,
      },
      accessToken: null,
      getRefreshToken: async () => "mock-refresh-token",
    });

    const originalFetch = globalThis.fetch;
    const calls: { url: string; headers: Headers }[] = [];

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      calls.push({ url, headers });

      if (url === "/api/auth/refresh") {
        return new Response(
          JSON.stringify({
            data: {
              access_token: "refreshed-jwt-token",
              refresh_token: "new-refresh-token",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "/api/locations") {
        return new Response(
          JSON.stringify({
            data: [{ code: "LOC1" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    try {
      const res = await apiClient<{ code: string }[]>("/api/locations");
      expect(res).toEqual([{ code: "LOC1" }]);
      expect(calls[0].url).toBe("/api/auth/refresh");
      expect(calls[1].url).toBe("/api/locations");
      expect(calls[1].headers.get("Authorization")).toBe("Bearer refreshed-jwt-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deduplicates refresh token calls when multiple concurrent requests lack accessToken", async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Super Admin",
        role: UserRole.ADMIN,
      },
      accessToken: null,
      getRefreshToken: async () => "mock-refresh-token",
    });

    const originalFetch = globalThis.fetch;
    let refreshCalls = 0;
    const { promise: refreshGate, resolve: releaseRefresh } = Promise.withResolvers<void>();

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/auth/refresh") {
        refreshCalls++;
        await refreshGate;
        return new Response(
          JSON.stringify({
            data: {
              access_token: "single-refreshed-token",
              refresh_token: "new-refresh-token",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            success: true,
            token: init?.headers ? new Headers(init.headers).get("Authorization") : null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const fetchPromises = Promise.all([
        apiClient<{ token: string }>("/api/locations"),
        apiClient<{ token: string }>("/api/tags"),
        apiClient<{ token: string }>("/api/issues"),
      ]);

      // Allow microtask ticks for all 3 calls to enter refresh queue
      await queueMicrotask(() => {});
      releaseRefresh();

      const [res1, res2, res3] = await fetchPromises;
      expect(refreshCalls).toBe(1);
      expect(res1.token).toBe("Bearer single-refreshed-token");
      expect(res2.token).toBe("Bearer single-refreshed-token");
      expect(res3.token).toBe("Bearer single-refreshed-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requests one-time ticket with Authorization Bearer header", async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "worker1",
        full_name: "Worker One",
        role: UserRole.USER,
      },
      accessToken: "mock-valid-access-token",
      getRefreshToken: async () => null,
    });

    const originalFetch = globalThis.fetch;
    let capturedAuthHeader = "";
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      capturedAuthHeader = headers.get("Authorization") ?? "";
      return new Response(JSON.stringify({ ticket: "mock-one-time-ticket-abc123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const data = await apiClient<{ ticket: string }>("/api/auth/ticket", { method: "POST" });
      expect(data.ticket).toBe("mock-one-time-ticket-abc123");
      expect(capturedAuthHeader).toBe("Bearer mock-valid-access-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns pagination metadata when includeMeta is true", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [{ id: 1, description: "Test" }],
          pagination: { page: 1, limit: 20, total: 42 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    try {
      const res = await apiClient<{
        data: { id: number; description: string }[];
        pagination: { total: number };
      }>("/api/issues?page=1&limit=20", { includeMeta: true, skipAuth: true });
      expect(res.data).toEqual([{ id: 1, description: "Test" }]);
      expect(res.pagination?.total).toBe(42);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
