import { EventType } from "../types/index.ts";
import { createAuthTicket } from "./generated/index.ts";

export interface IssueEventPayload {
  type: EventType;
  issue_id?: number;
}

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && Object.values(EventType).includes(value as EventType);
}

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
  onIssue: (event?: IssueEventPayload) => void,
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
      const res = await createAuthTicket({ throwOnError: true });
      const envelope = res.data as { data?: { ticket?: string }; ticket?: string };
      const ticket = envelope?.data?.ticket ?? envelope?.ticket;
      if (!ticket) throw new Error("Missing ticket in response");
      if (!active) return;
      const next = new EventSource(`/api/issues/events?ticket=${encodeURIComponent(ticket)}`);
      source = next;
      next.addEventListener("issue", (event) => {
        try {
          const raw = JSON.parse((event as MessageEvent).data) as {
            type?: unknown;
            issue_id?: unknown;
          } | null;
          if (!raw || typeof raw !== "object") return;
          if (!isEventType(raw.type)) return;
          const issue_id = typeof raw.issue_id === "number" ? raw.issue_id : undefined;
          onIssue({ type: raw.type, issue_id });
        } catch {
          // Safe ignore on malformed JSON; do not invent fallback semantics
        }
      });
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
