import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { ConflictModal } from "../src/components/ConflictModal.tsx";
import type { DraftResolve } from "../src/db/indexeddb.ts";

function WithMockState({ values, children }: { values: unknown[]; children: React.ReactNode }) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: {
          current: { useState: (init: unknown) => [unknown, () => void] };
        };
      };
    }
  ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let idx = 0;
  internals.current.useState = (init: unknown) => {
    const val =
      idx < values.length
        ? values[idx++]
        : typeof init === "function"
          ? (init as () => unknown)()
          : init;
    return [val, () => {}];
  };
  return <>{children}</>;
}
describe("ConflictModal Component", () => {
  it("renders conflict modal with local and server version details", () => {
    // Stub URL.createObjectURL if needed
    if (typeof URL.createObjectURL === "undefined") {
      URL.createObjectURL = () => "blob:mock-url";
    }

    const mockBlob = new Blob(["mock"], { type: "image/jpeg" });
    const mockResolveItem: DraftResolve = {
      issue_id: 12,
      resolved_client_uuid: "c0a80101-0000-4000-8000-000000000001",
      expected_version: 1,
      photo_after_blob: mockBlob,
      resolved_at: Date.now(),
      sync_status: "CONFLICT",
    };

    const html = renderToString(
      <ConflictModal
        resolveItem={mockResolveItem}
        serverVersion={2}
        serverPhotoAfter="after.jpg"
        onOverwrite={() => {}}
        onDiscard={() => {}}
        onClose={() => {}}
      />,
    );

    expect(html).toContain("12");
    expect(html).toContain("v1");
    expect(html).toContain("v2");
  });

  it("renders SERVER tab and handles missing server photo preview", () => {
    const mockBlob = new Blob(["mock"], { type: "image/jpeg" });
    const mockResolveItem: DraftResolve = {
      issue_id: 12,
      resolved_client_uuid: "c0a80101-0000-4000-8000-000000000001",
      expected_version: 1,
      photo_after_blob: mockBlob,
      resolved_at: Date.now(),
      sync_status: "CONFLICT",
    };

    const html = renderToString(
      <WithMockState values={["SERVER"]}>
        <ConflictModal
          resolveItem={mockResolveItem}
          serverVersion={2}
          serverPhotoAfter={undefined}
          onOverwrite={() => {}}
          onDiscard={() => {}}
          onClose={() => {}}
        />
      </WithMockState>,
    );

    expect(html).toContain("Không có ảnh máy chủ");
  });
});
