import { beforeEach, describe, expect, it } from "bun:test";
import { invalidateAiStatus, loadAiStatus } from "../src/hooks/useAiStatus.ts";

function mockAiStatus(enabled: boolean, calls: { count: number }) {
  return (async () => {
    calls.count += 1;
    return new Response(JSON.stringify({ data: { enabled } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("loadAiStatus", () => {
  beforeEach(() => {
    invalidateAiStatus();
  });

  it("reports the server AI toggle", async () => {
    const calls = { count: 0 };
    globalThis.fetch = mockAiStatus(true, calls);

    expect(await loadAiStatus()).toBe(true);
    expect(await loadAiStatus()).toBe(true);
    expect(calls.count).toBe(1);
  });

  it("fetches again after invalidation", async () => {
    const calls = { count: 0 };
    globalThis.fetch = mockAiStatus(true, calls);
    await loadAiStatus();

    invalidateAiStatus();
    globalThis.fetch = mockAiStatus(false, calls);

    expect(await loadAiStatus()).toBe(false);
    expect(calls.count).toBe(2);
  });

  it("stays disabled when the status request fails", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    expect(await loadAiStatus()).toBe(false);
  });
});
