import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { type UseDebouncedQueryResult, useDebouncedQuery } from "../src/hooks/useDebouncedQuery.ts";

describe("useDebouncedQuery", () => {
  it("renders with initial state and allows executing cancel and refetch", async () => {
    let hookApi: UseDebouncedQueryResult<string> | null = null;
    let queryCount = 0;

    function HookTest() {
      hookApi = useDebouncedQuery<string>({
        initialQuery: "init",
        initialData: "initial-data",
        delay: 50,
        minChars: 2,
        queryFn: async (q) => {
          queryCount++;
          return `data:${q}`;
        },
      });
      return <div>{hookApi.data}</div>;
    }

    const html = renderToString(<HookTest />);
    expect(html).toContain("initial-data");
    const api = hookApi as UseDebouncedQueryResult<string> | null;
    expect(api).not.toBeNull();
    if (api) {
      expect(api.query).toBe("init");
      expect(api.debouncedQuery).toBe("init");
      expect(api.isLoading).toBe(false);

      api.cancel();
      expect(api.isLoading).toBe(false);

      await api.refetch("custom-search");
      expect(queryCount).toBe(1);

      // Test query below minChars
      await api.refetch("a");
      expect(queryCount).toBe(1);
    }
  });

  it("handles errors and onError callback during manual refetch", async () => {
    let hookApi: UseDebouncedQueryResult<string> | null = null;
    let capturedError: Error | null = null;

    function FailingHookTest() {
      hookApi = useDebouncedQuery<string>({
        initialQuery: "test",
        queryFn: async () => {
          throw new Error("Query failed");
        },
        onError: (err) => {
          capturedError = err as Error;
        },
      });
      return <div>Test</div>;
    }

    renderToString(<FailingHookTest />);
    const failApi = hookApi as UseDebouncedQueryResult<string> | null;
    expect(failApi).not.toBeNull();
    if (failApi) {
      await failApi.refetch("do-fail");
      const err = capturedError as Error | null;
      expect(err?.message).toBe("Query failed");
    }
  });
});
