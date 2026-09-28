import { afterEach, beforeEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useI18nStore } from "../src/i18n/index.ts";
import { useAuthStore } from "../src/store/authStore.ts";
import { useDialogStore } from "../src/store/dialogStore.ts";
import { useMasterdataStore } from "../src/store/masterdataStore.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationItem,
  type TagItem,
} from "../src/types/index.ts";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "https://6s.test/" });
}
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
// happy-dom ships no canvas/bitmap: stub them so the real compression path resolves.
(globalThis as Record<string, unknown>).createImageBitmap = async () => ({
  width: 120,
  height: 90,
  close() {},
});
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => ({ drawImage() {} }),
});
Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
  configurable: true,
  value: (cb: (blob: Blob) => void) =>
    cb(new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" })),
});

export type Call = { method: string; url: string; body: string };
export const calls: Call[] = [];

function serializeFormData(formData: FormData): string {
  return Array.from(formData.entries())
    .map(([key, value]) => {
      if (typeof value === "string") return `name="${key}"\r\n\r\n${value}`;
      const fileName = Reflect.get(value as object, "name");
      return `name="${key}"; filename="${typeof fileName === "string" ? fileName : ""}"`;
    })
    .join("\r\n");
}

export function installFetch() {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body;
    const requestBody =
      typeof body === "string"
        ? body
        : body instanceof ArrayBuffer
          ? new TextDecoder().decode(body)
          : body instanceof FormData
            ? serializeFormData(body)
            : ArrayBuffer.isView(body)
              ? new TextDecoder().decode(body)
              : "";
    const url = String(input);
    calls.push({ method: init?.method ?? "GET", url, body: requestBody });
    const send = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
    if (url.includes("score-logs")) return send([]);
    if (url.includes("/api/ai/cached")) return send({ cached: false });
    if (url.endsWith("/api/assets")) {
      return send([
        {
          id: 5,
          asset_code: "M-01",
          name: "May 1",
          location_code: "LINE_A1",
          is_active: true,
          default_team_id: 7,
        },
        {
          id: 6,
          asset_code: "M-09",
          name: "May 9",
          location_code: "LINE_B2",
          is_active: true,
          default_team_id: 8,
        },
      ]);
    }
    if (url.includes("/members"))
      return send([{ id: 3, team_id: 7, full_name: "Tran Van B", username: "b", is_active: true }]);
    if (url.endsWith("/api/teams"))
      return send([
        { id: 7, code: "TM", name: "To May", is_active: true },
        { id: 8, code: "TQ", name: "To QC", is_active: true },
      ]);
    return send({ id: 101, version: 2 });
  }) as typeof fetch;
}

export const mockLocations: LocationItem[] = [
  {
    code: "LINE_A1",
    name_vi: "Chuyen May A1",
    name_en: "Line A1",
    name_zh: "车间 A1",
    is_active: true,
  },
  {
    code: "LINE_B2",
    name_vi: "Chuyen May B2",
    name_en: "Line B2",
    name_zh: "车间 B2",
    is_active: true,
  },
];

export const mockTags: TagItem[] = [
  {
    tag_code: "S1_01",
    category: "1S",
    label_vi: "San sat",
    label_en: "Cluttered",
    label_zh: "杂乱",
  },
  { tag_code: "S3_01", category: "3S", label_vi: "Ban thiu", label_en: "Dirty", label_zh: "脏污" },
];

export const mockIssue: IssueItem = {
  id: 101,
  client_uuid: "uuid-101",
  version: 4,
  creator_id: 1,
  creator_name: "Tho A",
  category: IssueCategory.S1,
  location_code: "LINE_A1",
  location_name: "Chuyen May A1",
  description: "Can sap xep lai vat tu",
  status: IssueStatus.OPEN,
  photo_before: "/api/issues/101/media/before/before-101.jpg",
  photo_detail: "/api/issues/101/media/detail/detail-101.jpg",
  created_at: "2026-03-01T00:00:00Z",
  tags: ["S1_01"],
  asset_id: null,
  assigned_team_id: null,
  assignee_id: null,
};

const mounted: { root: Root; container: HTMLElement }[] = [];
const originalFetch = globalThis.fetch;

export async function cleanupMounted() {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (entry && entry.container.childNodes.length > 0) {
      await act(async () => {
        entry.root.unmount();
      });
    }
    entry?.container.remove();
  }
  globalThis.fetch = originalFetch;
}

export function resetTestState() {
  installFetch();
  useI18nStore.getState().setLocale("vi");
  useAuthStore.setState({
    user: { id: 9, username: "staff", full_name: "Staff", role: "USER" as never },
  });
  useDialogStore.setState({ isOpen: false, options: { message: "" }, resolvePromise: null });
  useMasterdataStore.setState({
    assets: [],
    teams: [],
    membersByTeam: {},
    membersStatusByTeam: {},
    status: "idle",
  });
}

beforeEach(resetTestState);
afterEach(cleanupMounted);

export async function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(element);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

export function findButton(container: HTMLElement, text: string) {
  return (Array.from(container.querySelectorAll("button")) as HTMLButtonElement[]).find((button) =>
    (button.textContent ?? "").includes(text),
  );
}

export function findSelect(container: HTMLElement, ariaLabel: string) {
  return (Array.from(container.querySelectorAll("select")) as HTMLSelectElement[]).find(
    (select) => select.getAttribute("aria-label") === ariaLabel,
  );
}

export function multipartPart(body: string, name: string): string | undefined {
  const match = body.match(new RegExp(`name="${name}"\\s*\\r?\\n\\r?\\n([^\\r\\n]*)`));
  return match?.[1];
}

export async function attachPhoto(input: HTMLInputElement | undefined, fileName: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
  const transfer = new DataTransfer();
  transfer.items.add(new File([new Uint8Array([1, 2, 3])], fileName, { type: "image/jpeg" }));
  await act(async () => {
    setter?.call(input, transfer.files);
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {});
  await act(async () => {});
}
