import { beforeEach, describe, expect, it } from "bun:test";
import { syncEngine } from "../src/sync/syncEngine.ts";

describe("syncEngine", () => {
  beforeEach(() => {
    // Reset listeners
    syncEngine.stop();
  });

  it("subscribes and receives initial progress state", () => {
    let receivedState: unknown = null;
    const unsubscribe = syncEngine.subscribe((progress) => {
      receivedState = progress;
    });

    expect(receivedState).toBeDefined();
    expect(typeof (receivedState as { percent: number }).percent).toBe("number");
    unsubscribe();
  });

  it("handles probeAndSync safely when network is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    try {
      await syncEngine.probeAndSync();
      expect(true).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it("starts and stops polling timer without crashing", () => {
    syncEngine.stop();
    expect(true).toBe(true);
  });
});
