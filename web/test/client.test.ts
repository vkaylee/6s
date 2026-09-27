import { describe, expect, it } from "bun:test";
import { ApiError, apiClient, logout } from "../src/api/client.ts";
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

  it("serializes JSON mutation bodies for the server", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody = "";
    let capturedContentType = "";
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      capturedContentType = new Headers(init?.headers).get("Content-Type") ?? "";
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await apiClient<{ ok: boolean }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "worker1", password: "secret" }),
        skipAuth: true,
      });
      expect(capturedBody).toBe('{"username":"worker1","password":"secret"}');
      expect(capturedContentType).toBe("application/json");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it("preserves binary multipart bytes through authenticated fetch", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: ArrayBuffer | null = null;
    let capturedHeaders = new Headers();
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body instanceof ArrayBuffer ? init.body : null;
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const form = new FormData();
      form.append("client_uuid", "d9a16f42-bc15-4afe-b732-2549500613cf");
      form.append("photo_before", new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), "before.jpg");

      await apiClient<{ ok: boolean }>("/api/issues/sync", {
        method: "POST",
        body: form,
        skipAuth: true,
      });

      expect(capturedBody).toBeInstanceOf(ArrayBuffer);
      const parsed = await new Response(capturedBody, { headers: capturedHeaders }).formData();
      const photo = parsed.get("photo_before");
      expect(photo).toBeInstanceOf(File);
      expect(Array.from(new Uint8Array(await (photo as File).arrayBuffer()).slice(0, 3))).toEqual([
        0xff, 0xd8, 0xff,
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
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
  it("refreshes the cookie session after an unauthorized response before retrying", async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Super Admin",
        role: UserRole.USER,
      },
      isOfflineGrace: false,
      isLoading: false,
    });

    const originalFetch = globalThis.fetch;
    const calls: {
      url: string;
      headers: Headers;
      credentials: RequestCredentials | undefined;
    }[] = [];
    let locationAttempts = 0;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, headers: new Headers(init?.headers), credentials: init?.credentials });

      if (url === "/api/locations" && locationAttempts++ === 0) {
        return new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "expired" } }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url === "/api/auth/refresh") {
        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
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
      expect(calls.map(({ url }) => url)).toEqual([
        "/api/locations",
        "/api/auth/refresh",
        "/api/locations",
      ]);
      for (const call of calls) {
        expect(call.credentials).toBe("include");
        expect(call.headers.get("Authorization")).toBeNull();
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deduplicates cookie refresh calls when concurrent requests receive unauthorized responses", async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Super Admin",
        role: UserRole.ADMIN,
      },
      isOfflineGrace: false,
      isLoading: false,
    });

    const originalFetch = globalThis.fetch;
    let refreshCalls = 0;
    const attempts = new Map<string, number>();
    let initialUnauthorized = 0;
    const { promise: initialGate, resolve: releaseInitial } = Promise.withResolvers<void>();
    const { promise: refreshGate, resolve: releaseRefresh } = Promise.withResolvers<void>();

    globalThis.fetch = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const attempt = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, attempt);

      if (url === "/api/auth/refresh") {
        refreshCalls++;
        await refreshGate;
        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (attempt === 1) {
        initialUnauthorized++;
        await initialGate;
        return new Response(
          JSON.stringify({ error: { code: "UNAUTHORIZED", message: "expired" } }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          data: { success: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const fetchPromises = Promise.all([
        apiClient<{ success: boolean }>("/api/locations"),
        apiClient<{ success: boolean }>("/api/tags"),
        apiClient<{ success: boolean }>("/api/issues"),
      ]);

      await new Promise<void>((resolve) => setImmediate(resolve));
      releaseInitial();
      await new Promise<void>((resolve) => setImmediate(resolve));
      releaseRefresh();

      const [res1, res2, res3] = await fetchPromises;
      expect(initialUnauthorized).toBe(3);
      expect(refreshCalls).toBe(1);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(res3.success).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requests one-time ticket with cookie credentials and CSRF protection", async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "worker1",
        full_name: "Worker One",
        role: UserRole.USER,
      },
      isOfflineGrace: false,
      isLoading: false,
    });

    const originalFetch = globalThis.fetch;
    const originalDocument = globalThis.document;
    let capturedHeaders = new Headers();
    let capturedCredentials: RequestCredentials | undefined;
    globalThis.document = { cookie: "6s_csrf=mock-csrf-token" } as unknown as Document;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      capturedCredentials = init?.credentials;
      return new Response(JSON.stringify({ ticket: "mock-one-time-ticket-abc123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const data = await apiClient<{ ticket: string }>("/api/auth/ticket", { method: "POST" });
      expect(data.ticket).toBe("mock-one-time-ticket-abc123");
      expect(capturedCredentials).toBe("include");
      expect(capturedHeaders.get("X-CSRF-Token")).toBe("mock-csrf-token");
      expect(capturedHeaders.get("Authorization")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.document = originalDocument;
    }
  });

  it("retries a mutation after CSRF cookie becomes available", async () => {
    const originalFetch = globalThis.fetch;
    const originalDocument = globalThis.document;
    const calls: Headers[] = [];
    (globalThis as unknown as { document: Document }).document = {
      cookie: "",
    } as unknown as Document;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push(headers);
      if (calls.length === 1) {
        (globalThis.document as unknown as { cookie: string }).cookie = "6s_csrf=bootstrapped";
        return new Response(JSON.stringify({ error: { code: "CSRF", message: "missing" } }), {
          status: 403,
        });
      }
      return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await apiClient<{ ok: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "worker1", password: "secret" }),
        skipAuth: true,
      });
      expect(result.ok).toBe(true);
      expect(calls).toHaveLength(2);
      expect(calls[0].get("X-CSRF-Token")).toBeNull();
      expect(calls[1].get("X-CSRF-Token")).toBe("bootstrapped");
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.document = originalDocument;
    }
  });

  it("keeps local identity in offline grace when logout cannot reach server", async () => {
    const originalFetch = globalThis.fetch;
    useAuthStore.setState({
      user: {
        id: 7,
        username: "offline-worker",
        full_name: "Offline Worker",
        role: UserRole.USER,
      },
      isOfflineGrace: false,
      isLoading: false,
    });
    globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    try {
      await logout();
      expect(useAuthStore.getState().user?.username).toBe("offline-worker");
      expect(useAuthStore.getState().isOfflineGrace).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      await useAuthStore.getState().clearAuth();
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
      const res = await apiClient<{ id: number; description: string }[]>(
        "/api/issues?page=1&limit=20",
        {
          includeMeta: true,
          skipAuth: true,
        },
      );
      expect(res.data).toEqual([{ id: 1, description: "Test" }]);
      expect(res.pagination?.total).toBe(42);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
