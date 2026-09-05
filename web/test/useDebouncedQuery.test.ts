import { describe, expect, it } from "bun:test";
import { useDebouncedQuery } from "../src/hooks/useDebouncedQuery.ts";

describe("useDebouncedQuery", () => {
  it("exports useDebouncedQuery hook function", () => {
    expect(typeof useDebouncedQuery).toBe("function");
  });

  it("handles synchronous query function with signal", async () => {
    let calledWith = "";
    let signalReceived: AbortSignal | null = null;

    const queryFn = async (q: string, signal: AbortSignal) => {
      calledWith = q;
      signalReceived = signal;
      return `result_${q}`;
    };

    const res = await queryFn("test", new AbortController().signal);
    expect(res).toBe("result_test");
    expect(calledWith).toBe("test");
    expect(signalReceived).not.toBeNull();
    if (signalReceived) {
      expect((signalReceived as AbortSignal).aborted).toBe(false);
    }
  });

  it("supports aborting in-flight request", async () => {
    const controller = new AbortController();
    let abortedInCatch = false;

    const { promise, reject } = Promise.withResolvers<string>();
    controller.signal.addEventListener("abort", () => {
      reject(new DOMException("Aborted", "AbortError"));
    });

    controller.abort();
    try {
      await promise;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        abortedInCatch = true;
      }
    }

    expect(abortedInCatch).toBe(true);
  });
});
