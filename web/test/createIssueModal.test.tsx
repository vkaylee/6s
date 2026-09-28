import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { CreateIssueModal } from "../src/pages/CreateIssueModal.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import {
  calls,
  cleanupMounted,
  findButton,
  findSelect,
  mockIssue,
  mockLocations,
  mockTags,
  mount,
  multipartPart,
  resetTestState,
} from "./createIssueModal.fixtures.tsx";

describe("CreateIssueModal create and edit", () => {
  beforeEach(resetTestState);
  afterEach(cleanupMounted);
  it("renders nothing while the modal is closed", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={false}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    expect(container.innerHTML).toBe("");
    await act(async () => root.unmount());
  });

  it("offers every 6S category, the location list and an empty photo step in create mode", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Tạo báo cáo sự cố 6S / An toàn");
    for (const key of ["1S", "2S", "3S", "4S", "5S", "6S"])
      expect(findButton(container, key)).toBeDefined();
    expect(text).toContain("Chuyen May A1");
    expect(text).toContain("Ảnh 1: Toàn cảnh");
    expect(text).toContain("GỬI BÁO CÁO 6S");
    expect(container.querySelector("img")).toBeNull();
    await act(async () => root.unmount());
  });

  it("hides assignment controls while creating a report", async () => {
    useAuthStore.setState({
      user: {
        id: 9,
        username: "staff",
        full_name: "Staff",
        role: "USER" as never,
        capabilities: ["issue:assign"],
      },
    });
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    expect(findSelect(container, "Thiết bị / tài sản (tùy chọn)")).toBeUndefined();
    expect(findSelect(container, "Đơn vị xử lý")).toBeUndefined();
    expect(container.textContent).not.toContain("Trách nhiệm xử lý");
    await act(async () => root.unmount());
  });

  it("keeps assignment controls available while editing an existing issue", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
        initialIssue={mockIssue}
      />,
    );
    expect(findSelect(container, "Thiết bị / tài sản (tùy chọn)")).toBeDefined();
    expect(findSelect(container, "Team xử lý")).toBeDefined();
    await act(async () => root.unmount());
  });

  it("submits an edit as multipart with the current version and explicit clears", async () => {
    let closed = false;
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {
          closed = true;
        }}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
        initialIssue={mockIssue}
      />,
    );
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Can sap xep lai vat tu",
    );
    await act(async () => findButton(container, "Lưu thay đổi")?.click());
    await act(async () => {});
    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.url).toContain("/api/issues/101");
    expect(multipartPart(patch?.body ?? "", "category")).toBe("1S");
    expect(multipartPart(patch?.body ?? "", "location_code")).toBe("LINE_A1");
    expect(multipartPart(patch?.body ?? "", "description")).toBe("Can sap xep lai vat tu");
    expect(closed).toBe(true);
    await act(async () => root.unmount());
  });

  it("keeps the edit form busy until the server answers, then closes on success", async () => {
    let closed = false;
    let succeeded = false;
    let release: ((response: Response) => void) | null = null;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return baseFetch(input as never, init);
    }) as typeof fetch;
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {
          closed = true;
        }}
        onSuccess={() => {
          succeeded = true;
        }}
        locations={mockLocations}
        tags={mockTags}
        initialIssue={mockIssue}
      />,
    );
    await act(async () => findButton(container, "Lưu thay đổi")?.click());
    await act(async () => {});
    expect(container.textContent).toContain("Đang lưu...");
    await act(async () =>
      release?.(new Response(JSON.stringify({ data: { id: 101, version: 2 } }), { status: 200 })),
    );
    await act(async () => {});
    expect(closed).toBe(true);
    expect(succeeded).toBe(true);
    await act(async () => root.unmount());
  });
});
