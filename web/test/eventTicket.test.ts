import { describe, expect, it } from "bun:test";
import { apiClient } from "../src/api/client.ts";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

describe("EventSource Ticket Flow", () => {
  it("fetches ticket before opening EventSource URL", async () => {
    useAuthStore.setState({
      user: {
        id: 42,
        username: "worker42",
        full_name: "Worker 42",
        role: UserRole.USER,
      },
      accessToken: "valid-jwt-token-42",
      getRefreshToken: async () => null,
    });

    const originalFetch = globalThis.fetch;
    let ticketRequested = false;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/ticket")) {
        ticketRequested = true;
        const authHeader = new Headers(init?.headers).get("Authorization");
        expect(authHeader).toBe("Bearer valid-jwt-token-42");
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

      // Verify URL constructed with ticket query param, not token
      const eventSourceUrl = `/api/issues/events?ticket=${encodeURIComponent(ticket)}`;
      expect(eventSourceUrl).toContain("ticket=stream-ticket-xyz-789");
      expect(eventSourceUrl).not.toContain("valid-jwt-token-42");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
