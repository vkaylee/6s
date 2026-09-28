import { afterEach, beforeEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { invalidateAiStatus } from "../src/hooks/useAiStatus.ts";
import { useI18nStore } from "../src/i18n/index.ts";
import { useAuthStore } from "../src/store/authStore.ts";
import { useMasterdataStore } from "../src/store/masterdataStore.ts";
import { IssueCategory, type IssueItem, IssueStatus } from "../src/types/index.ts";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "https://6s.test/" });
}
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

export type Call = { method: string; url: string; body: string };
export const calls: Call[] = [];
export function resetCalls(): void {
  calls.length = 0;
}

const originalFetch = globalThis.fetch;
const mounted: { root: Root; container: HTMLElement }[] = [];

export const baseIssue = (over: Partial<IssueItem> = {}): IssueItem => ({
  id: 101,
  client_uuid: "c0a80101-0000-4000-8000-000000000101",
  version: 1,
  category: IssueCategory.S3,
  location_code: "LINE_A1",
  location_name: "Chuyen May A1",
  description: "Dau loang duoi san may",
  status: IssueStatus.OPEN,
  creator_id: 10,
  creator_name: "Nguyen Van A",
  tags: [],
  created_at: "2026-03-01T00:00:00Z",
  photo_before: "/api/issues/101/media/before/before.jpg",
  photo_detail: "/api/issues/101/media/detail/detail.jpg",
  ...over,
});

export const locations = [
  { code: "LINE_A1", name_vi: "Chuyen May A1", name_en: "Line A1", name_zh: "A1", is_active: true },
];

/** Serves every endpoint the detail modal touches and echoes mutations onto the issue. */
export function installFetch({
  ai = false,
  issue,
  mediaStatus = 200,
  reviewResult,
}: {
  ai?: boolean;
  issue: IssueItem;
  mediaStatus?: number;
  reviewResult?: Record<string, unknown>;
}) {
  calls.length = 0;
  invalidateAiStatus();
  let serverIssue: IssueItem = { ...issue };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ method: init?.method ?? "GET", url, body });
    const send = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
    if (url.includes("/media/") && mediaStatus !== 200) {
      return new Response("denied", { status: mediaStatus });
    }
    if (url.includes("/api/ai/status")) return send({ enabled: ai });
    if (url.includes("/api/ai/cached")) return send({ cached: false });
    if (url.includes("score-logs")) return send([]);
    if (url.includes("/api/ai/review-follow-up")) return send({ answer: "Theo hinh anh" });
    if (url.includes("/api/ai/review")) {
      return send(
        reviewResult ?? {
          verdict: "MISMATCH",
          feedback: "Anh khong khop phan loai",
          suggestion: { category: "5S" },
          used_vision: false,
        },
      );
    }
    if (url.includes("/api/ai/translate"))
      return send({ translated_text: "Oil spilled on the floor" });
    if (url.endsWith("/api/assets") || url.endsWith("/api/teams")) return send([]);
    if (init?.method === "PATCH") {
      serverIssue = { ...serverIssue, ...(JSON.parse(body || "{}") as Partial<IssueItem>) };
      return send(serverIssue);
    }
    if (url.includes("/close")) return send({ ...serverIssue, status: IssueStatus.CLOSED });
    if (url.includes("/reopen")) return send({ ...serverIssue, status: IssueStatus.OPEN });
    if (url.includes("/invalid")) return send({ ...serverIssue, status: IssueStatus.INVALID });
    return send(serverIssue);
  }) as typeof fetch;
}

export async function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(element);
  });
  await act(async () => {});
  return container;
}

export function button(container: HTMLElement, text: string) {
  return (Array.from(container.querySelectorAll("button")) as HTMLButtonElement[]).find((item) =>
    (item.textContent ?? "").includes(text),
  );
}

export function selectByLabel(container: HTMLElement, label: string) {
  return (Array.from(container.querySelectorAll("select")) as HTMLSelectElement[]).find(
    (item) => item.getAttribute("aria-label") === label,
  );
}

export async function choose(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {});
}

export const mutations = () => calls.filter((call) => call.method !== "GET");

export function resetTestState() {
  useI18nStore.getState().setLocale("vi");
  useAuthStore.setState({ user: null });
  useMasterdataStore.setState({
    assets: [],
    teams: [{ id: 7, code: "TM", name: "To May", is_active: true } as never],
    membersByTeam: {},
    membersStatusByTeam: {},
    status: "ready",
  });
  invalidateAiStatus();
}

export async function cleanupMounted() {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    await act(async () => {
      entry?.root.unmount();
    });
    entry?.container.remove();
  }
  globalThis.fetch = originalFetch;
  invalidateAiStatus();
  useI18nStore.getState().setLocale("vi");
}

beforeEach(resetTestState);
afterEach(cleanupMounted);
