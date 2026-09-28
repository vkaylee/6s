import { describe, expect, it } from "bun:test";
import { act } from "react";
import { CreateIssueModal } from "../src/pages/CreateIssueModal.tsx";
import { useDialogStore } from "../src/store/dialogStore.ts";
import {
  attachPhoto,
  calls,
  findButton,
  mockLocations,
  mockTags,
  mount,
} from "./createIssueModal.fixtures.tsx";

describe("CreateIssueModal validation and hints", () => {
  it("rejects an incomplete report with a message instead of sending anything", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    await act(async () => findButton(container, "GỬI BÁO CÁO 6S")?.click());
    await act(async () => {});
    expect(useDialogStore.getState().options.message).toBe("Vui lòng chọn phân loại 6S");

    await act(async () => findButton(container, "3S")?.click());
    await act(async () => findButton(container, "GỬI BÁO CÁO 6S")?.click());
    await act(async () => {});
    expect(useDialogStore.getState().options.message).toBe("Bắt buộc chụp ảnh toàn cảnh (Ảnh 1)");
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
    await act(async () => root.unmount());
  });

  it("switches the submit label to the safety wording for 6S and follows the cause hints", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    expect(container.textContent).toContain("Chụp rõ vật tư thừa");

    await act(async () => findButton(container, "6S")?.click());
    expect(container.textContent).toContain("GỬI BÁO CÁO NGUY HIỂM 6S");

    await act(async () => findButton(container, "5S")?.click());
    expect(container.textContent).toContain("Chụp rõ hành vi vi phạm");
    await act(async () => root.unmount());
  });

  it("keeps offline creation local: no direct issue write, and a failed local save is reported", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    await act(async () => findButton(container, "3S")?.click());
    const inputs = Array.from(
      container.querySelectorAll('input[type="file"]'),
    ) as HTMLInputElement[];
    await attachPhoto(inputs[0], "wide.jpg");
    await act(async () => findButton(container, "GỬI BÁO CÁO 6S")?.click());
    await act(async () => {});

    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
    expect(useDialogStore.getState().options.message).toBe("Không thể lưu bản nháp vào IndexedDB");
    await act(async () => root.unmount());
  });
});
