import { describe, expect, it } from "bun:test";
import { apiClient } from "../src/api/client.ts";
import { subscribeIssueEvents } from "../src/api/issueEvents.ts";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

/** Yields macrotasks (no wall-clock wait) until the predicate holds or the budget runs out. */
async function settleUntil(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe("EventSource Ticket Flow", () => {
  it("fetches ticket with cookie credentials and CSRF before opening EventSource URL", async () => {
    useAuthStore.setState({
      user: {
        id: 42,
        username: "worker42",
        full_name: "Worker 42",
        role: UserRole.USER,
      },
      isOfflineGrace: false,
      isLoading: false,
    });

    const originalFetch = globalThis.fetch;
    const originalDocument = globalThis.document;
    let ticketRequested = false;
    globalThis.document = { cookie: "6s_csrf=event-csrf-token" } as unknown as Document;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/ticket")) {
        ticketRequested = true;
        const headers = new Headers(init?.headers);
        expect(init?.credentials).toBe("include");
        expect(headers.get("X-CSRF-Token")).toBe("event-csrf-token");
        expect(headers.get("Authorization")).toBeNull();
        return new Response(JSON.stringify({ ticket: "stream-ticket-xyz-789" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const { ticket } = await apiClient<{ ticket: string }>("/api/auth/ticket", {
        method: "POST",
      });

      expect(ticketRequested).toBe(true);
      expect(ticket).toBe("stream-ticket-xyz-789");

      const eventSourceUrl = `/api/issues/events?ticket=${encodeURIComponent(ticket)}`;
      expect(eventSourceUrl).toBe("/api/issues/events?ticket=stream-ticket-xyz-789");
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.document = originalDocument;
    }
  });

  it("requests a fresh ticket after the current EventSource fails", async () => {
    useAuthStore.setState({
      user: {
        id: 42,
        username: "worker42",
        full_name: "Worker 42",
        role: UserRole.USER,
      },
      isOfflineGrace: false,
      isLoading: false,
    });

    const originalFetch = globalThis.fetch;
    const originalDocument = globalThis.document;
    const tickets = ["ticket-first-111", "ticket-second-222"];
    const sources: FakeEventSource[] = [];
    let ticketIndex = 0;
    globalThis.document = { cookie: "6s_csrf=event-csrf-token" } as unknown as Document;

    class FakeEventSource {
      closed = false;
      onerror: (() => void) | null = null;
      listeners = new Map<string, Array<() => void>>();

      constructor(readonly url: string) {
        sources.push(this);
      }

      addEventListener(type: string, listener: () => void) {
        const callbacks = this.listeners.get(type) ?? [];
        callbacks.push(listener);
        this.listeners.set(type, callbacks);
      }

      close() {
        this.closed = true;
      }
    }

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/ticket")) {
        const headers = new Headers(init?.headers);
        expect(init?.credentials).toBe("include");
        expect(headers.get("X-CSRF-Token")).toBe("event-csrf-token");
        expect(headers.get("Authorization")).toBeNull();
        return new Response(JSON.stringify({ ticket: tickets[ticketIndex++] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const originalEventSource = globalThis.EventSource;
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
    const originalSetTimeout = globalThis.setTimeout;
    // Synchronous fake: fires the callback immediately, so no wall-clock wait is needed
    globalThis.setTimeout = ((callback: () => void) => {
      callback();
      return 1;
    }) as unknown as typeof globalThis.setTimeout;

    try {
      const unsubscribe = subscribeIssueEvents(() => {});
      await settleUntil(() => sources.length === 1);
      expect(sources).toHaveLength(1);
      expect(sources[0].url).toBe("/api/issues/events?ticket=ticket-first-111");

      sources[0].onerror?.();
      await settleUntil(() => sources.length >= 2);
      expect(sources[0].closed).toBe(true);
      expect(sources).toHaveLength(2);
      expect(sources[1].url).toBe("/api/issues/events?ticket=ticket-second-222");
      expect(sources[1].url).not.toBe(sources[0].url);

      unsubscribe();
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.document = originalDocument;
      globalThis.EventSource = originalEventSource;
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
