import { beforeAll, describe, expect, it } from "bun:test";
import { issueMutationPath, issueOperations, mutateIssue } from "../src/api/operations.ts";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

function captureFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    return handler(url, requestInit);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

function jsonEnvelope(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeAll(() => {
  useAuthStore.setState({
    user: { id: 1, username: "admin", full_name: "Admin", role: UserRole.ADMIN },
  });
});

describe("OpenAPI-derived issue operations", () => {
  it("derives paths from the spec including the /invalid backend route", () => {
    expect(issueMutationPath("close", 101)).toBe("/api/issues/101/close");
    expect(issueMutationPath("reopen", 101)).toBe("/api/issues/101/reopen");
    expect(issueMutationPath("invalid", 101)).toBe("/api/issues/101/invalid");
  });

  it("sends POST with correct URL and JSON body for close", async () => {
    const capture = captureFetch(() => jsonEnvelope({ id: 101, status: "CLOSED" }));
    try {
      const result = await issueOperations.close(101, { score_rating: 4 });
      expect(result.status).toBe("CLOSED");
      expect(capture.calls[0].url).toBe("/api/issues/101/close");
      expect(capture.calls[0].init.method).toBe("POST");
      expect(JSON.parse(String(capture.calls[0].init.body))).toEqual({ score_rating: 4 });
    } finally {
      capture.restore();
    }
  });

  it("sends POST with reject_reason body for reopen", async () => {
    const capture = captureFetch(() => jsonEnvelope({ id: 101, status: "OPEN" }));
    try {
      await issueOperations.reopen(101, { reject_reason: "Chưa đạt yêu cầu 6S" });
      expect(capture.calls[0].url).toBe("/api/issues/101/reopen");
      expect(JSON.parse(String(capture.calls[0].init.body))).toEqual({
        reject_reason: "Chưa đạt yêu cầu 6S",
      });
    } finally {
      capture.restore();
    }
  });

  it("sends POST with reason body for invalid", async () => {
    const capture = captureFetch(() => jsonEnvelope({ id: 101, status: "INVALID" }));
    try {
      await issueOperations.invalid(101, { reason: "Báo cáo không đúng thực tế" });
      expect(capture.calls[0].url).toBe("/api/issues/101/invalid");
      expect(JSON.parse(String(capture.calls[0].init.body))).toEqual({
        reason: "Báo cáo không đúng thực tế",
      });
    } finally {
      capture.restore();
    }
  });

  it("maps backend error envelopes to ApiError through apiClient", async () => {
    const capture = captureFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: "FORBIDDEN", message: "Không có quyền thực hiện" } }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );
    try {
      await expect(mutateIssue("invalid", 101, { reason: "x" })).rejects.toMatchObject({
        name: "ApiError",
        status: 403,
        code: "FORBIDDEN",
      });
    } finally {
      capture.restore();
    }
  });
});
