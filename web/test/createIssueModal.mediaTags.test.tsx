import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { CreateIssueModal } from "../src/pages/CreateIssueModal.tsx";
import type { TagItem } from "../src/types/index.ts";
import {
  attachPhoto,
  calls,
  cleanupMounted,
  findButton,
  mockIssue,
  mockLocations,
  mockTags,
  mount,
  resetTestState,
} from "./createIssueModal.fixtures.tsx";

describe("CreateIssueModal media and tags", () => {
  beforeEach(resetTestState);
  afterEach(cleanupMounted);
  it("shows the captured wide photo as a preview thumbnail", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    const inputs = Array.from(
      container.querySelectorAll('input[type="file"]'),
    ) as HTMLInputElement[];
    await attachPhoto(inputs[0], "wide.jpg");
    const preview = container.querySelector('img[alt="Ảnh toàn cảnh"]') as HTMLImageElement | null;
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute("src")).toStartWith("blob:");
    await act(async () => root.unmount());
  });

  it("filters tag suggestions by the chosen category and keeps uncategorized tags available", async () => {
    const customTag: TagItem = {
      tag_code: "CUSTOM_01",
      category: "",
      label_vi: "The tuy chinh",
      label_en: "Custom",
      label_zh: "自定义",
    };
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={[...mockTags, customTag]}
      />,
    );
    expect(container.textContent).not.toContain("San sat");
    expect(container.textContent).not.toContain("Ban thiu");
    await act(async () => findButton(container, "1S")?.click());
    expect(container.textContent).toContain("San sat");
    expect(container.textContent).not.toContain("Ban thiu");
    expect(container.textContent).toContain("The tuy chinh");
    await act(async () => findButton(container, "3S")?.click());
    expect(container.textContent).toContain("Ban thiu");
    expect(container.textContent).not.toContain("San sat");
    await act(async () => root.unmount());
  });

  it("carries both captured photos into the edit upload", async () => {
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
    const inputs = Array.from(
      container.querySelectorAll('input[type="file"]'),
    ) as HTMLInputElement[];
    await attachPhoto(inputs[0], "wide.jpg");
    await attachPhoto(inputs[1], "detail.jpg");
    await act(async () => findButton(container, "Lưu thay đổi")?.click());
    await act(async () => {});
    const body = calls.find((call) => call.method === "PATCH")?.body ?? "";
    expect(body).toContain('name="photo_before"; filename="before.jpg"');
    expect(body).toContain('name="photo_detail"; filename="detail.jpg"');
    await act(async () => root.unmount());
  });
});
