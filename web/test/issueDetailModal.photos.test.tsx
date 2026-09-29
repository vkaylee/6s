import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { IssueDetailModal } from "../src/pages/IssueDetailModal.tsx";
import {
  baseIssue,
  button,
  cleanupMounted,
  installFetch,
  mount,
  resetTestState,
} from "./issueDetailModal.fixtures.tsx";

beforeEach(resetTestState);
afterEach(cleanupMounted);

describe("IssueDetailModal - Photos", () => {
  it("opens the photo gallery and navigates it with zoom, arrows and Escape", async () => {
    installFetch({ issue: baseIssue() });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    const photoButton = container.querySelector(
      'button[aria-label="Chạm ảnh để xem toàn màn hình"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      photoButton?.click();
    });
    await act(async () => {});
    expect(
      container.querySelector("#issue-photo-preview-title")?.closest('[role="dialog"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("1 / 2");
    expect(container.textContent).toContain("TRƯỚC");

    await act(async () => {
      button(container, "Phóng to")?.click();
    });
    expect(container.textContent).toContain("125%");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    expect(container.textContent).toContain("2 / 2");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(
      container.querySelector("#issue-photo-preview-title")?.closest('[role="dialog"]'),
    ).toBeFalsy();
  });

  it("disables photo zoom and shows image error when native media loading fails", async () => {
    installFetch({ issue: baseIssue(), mediaStatus: 403 });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );

    await act(async () => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });

    const photoButton = container.querySelector(
      'button[aria-label="Chạm ảnh để xem toàn màn hình"]',
    ) as HTMLButtonElement | null;
    expect(photoButton).toBeNull();
    expect(container.textContent).toContain("Bạn không có quyền xem ảnh này");
    expect(container.textContent).not.toContain("Chạm ảnh để xem toàn màn hình");

    await act(async () => {
      photoButton?.click();
    });
    await act(async () => {});

    expect(
      container.querySelector("#issue-photo-preview-title")?.closest('[role="dialog"]'),
    ).toBeFalsy();
  });
});
