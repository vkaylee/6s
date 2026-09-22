import { apiClient } from "./client.ts";

/** Delay before retrying a dropped issue event stream. */
export const ISSUE_EVENT_RECONNECT_DELAY_MS = 1000;

/**
 * Opens the issue Server-Sent Events stream and keeps it connected.
 *
 * Streaming tickets are single-use, so every (re)connect requests a fresh one:
 * reusing a consumed ticket is answered with 401, which would silence real-time
 * updates for the rest of the session.
 */
export function subscribeIssueEvents(
  onIssue: () => void,
  reconnectDelayMs = ISSUE_EVENT_RECONNECT_DELAY_MS,
): () => void {
  let source: EventSource | null = null;
  let reconnectTimer: number | undefined;
  let connecting = false;
  let active = true;

  const scheduleReconnect = () => {
    if (!active || reconnectTimer !== undefined) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, reconnectDelayMs) as unknown as number;
  };

  const connect = async () => {
    if (!active || connecting) return;
    connecting = true;
    try {
      const { ticket } = await apiClient<{ ticket: string }>("/api/auth/ticket", {
        method: "POST",
      });
      if (!active) return;
      const next = new EventSource(`/api/issues/events?ticket=${encodeURIComponent(ticket)}`);
      source = next;
      next.addEventListener("issue", onIssue);
      next.onerror = () => {
        next.close();
        if (source === next) source = null;
        scheduleReconnect();
      };
    } catch {
      scheduleReconnect();
    } finally {
      connecting = false;
    }
  };

  void connect();

  return () => {
    active = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    source?.close();
  };
}
