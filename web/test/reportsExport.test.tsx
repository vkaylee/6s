import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { downloadReportsXlsx } from "../src/pages/ReportsPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isOfflineGrace: false,
    isLoading: false,
  });
});

afterEach(async () => {
  await useAuthStore.getState().clearAuth();
  useAuthStore.setState({
    user: null,
    isOfflineGrace: false,
    isLoading: false,
  });
});

describe("ReportsPage Export XLSX", () => {
  it("refreshes expired cookie session and proceeds with XLSX download", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Super Admin",
        role: UserRole.ADMIN,
      },
    });

    const calls: {
      url: string;
      credentials: RequestCredentials | undefined;
      authHeader: string;
    }[] = [];
    let clicked = false;
    let downloadedFilename = "";

    const mockAnchor = {
      href: "",
      download: "",
      click: () => {
        clicked = true;
        downloadedFilename = mockAnchor.download;
      },
      remove: () => {},
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => (tag === "a" ? mockAnchor : {}),
      body: { appendChild: () => {} },
    };

    (globalThis as unknown as { window: unknown }).window = {
      URL: {
        createObjectURL: () => "blob:mock-xlsx-data",
        revokeObjectURL: () => {},
      },
    };

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const parsedUrl = new URL(rawUrl, "http://localhost");
      const url = `${parsedUrl.pathname}${parsedUrl.search}`;
      const authHeader = new Headers(init?.headers).get("Authorization") ?? "";
      calls.push({ url, credentials: init?.credentials, authHeader });

      if (url === "/api/auth/refresh") {
        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.startsWith("/api/issues/export")) {
        if (calls.filter((call) => call.url.startsWith("/api/issues/export")).length === 1) {
          return new Response(
            JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Session expired" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("PK\x03\x04mock xlsx content", {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="6S_Issues_Export.xlsx"',
          },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    try {
      await downloadReportsXlsx("LINE_A1");
      expect(calls.length).toBe(3);
      expect(calls[0].url).toBe("/api/issues/export?location_code=LINE_A1");
      expect(calls[0].credentials).toBe("include");
      expect(calls[0].authHeader).toBe("");
      expect(calls[1].url).toBe("/api/auth/refresh");
      expect(calls[1].credentials).toBe("include");
      expect(calls[1].authHeader).toBe("");
      expect(calls[2].url).toBe("/api/issues/export?location_code=LINE_A1");
      expect(calls[2].credentials).toBe("include");
      expect(calls[2].authHeader).toBe("");
      expect(clicked).toBe(true);
      expect(downloadedFilename).toMatch(/^6S_Report_\d{4}-\d{2}-\d{2}\.xlsx$/);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as unknown as { window: unknown }).window = originalWindow;
      (globalThis as unknown as { document: unknown }).document = originalDocument;
      await useAuthStore.getState().clearAuth();
    }
  });

  it("aborts download when session refresh fails on 401", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    useAuthStore.setState({
      user: {
        id: 2,
        username: "officer",
        full_name: "Safety Officer",
        role: UserRole.SAFETY_OFFICER,
      },
    });

    let clicked = false;
    const mockAnchor = {
      href: "",
      download: "",
      click: () => {
        clicked = true;
      },
      remove: () => {},
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => (tag === "a" ? mockAnchor : {}),
      body: { appendChild: () => {} },
    };

    (globalThis as unknown as { window: unknown }).window = {
      URL: {
        createObjectURL: () => "blob:should-not-exist",
        revokeObjectURL: () => {},
      },
    };

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/auth/refresh") {
        return new Response(JSON.stringify({ error: { message: "Refresh token revoked" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Unauthorized", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(downloadReportsXlsx()).rejects.toThrow();
      expect(clicked).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as unknown as { window: unknown }).window = originalWindow;
      (globalThis as unknown as { document: unknown }).document = originalDocument;
      await useAuthStore.getState().clearAuth();
    }
  });

  it("aborts download on 403 Forbidden without creating a download link", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    useAuthStore.setState({
      user: {
        id: 3,
        username: "user_worker",
        full_name: "Regular Worker",
        role: UserRole.USER,
      },
    });

    let clicked = false;
    const mockAnchor = {
      href: "",
      download: "",
      click: () => {
        clicked = true;
      },
      remove: () => {},
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => (tag === "a" ? mockAnchor : {}),
      body: { appendChild: () => {} },
    };

    (globalThis as unknown as { window: unknown }).window = {
      URL: {
        createObjectURL: () => "blob:forbidden-error-body",
        revokeObjectURL: () => {},
      },
    };

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: { code: "FORBIDDEN", message: "Forbidden: role insufficient" } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    try {
      await expect(downloadReportsXlsx()).rejects.toThrow();
      expect(clicked).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as unknown as { window: unknown }).window = originalWindow;
      (globalThis as unknown as { document: unknown }).document = originalDocument;
      await useAuthStore.getState().clearAuth();
    }
  });
});
