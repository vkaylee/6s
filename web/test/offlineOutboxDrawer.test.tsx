import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { OfflineOutboxDrawer } from "../src/components/OfflineOutboxDrawer.tsx";
import type { DraftIssue, DraftResolve } from "../src/db/indexeddb.ts";
import { WithMockState } from "./fixtures/mockState.tsx";

describe("OfflineOutboxDrawer Component", () => {
  it("returns null when isOpen is false", () => {
    const html = renderToString(<OfflineOutboxDrawer isOpen={false} onClose={() => {}} />);
    expect(html).toBe("");
  });

  it("renders drawer header and controls when isOpen is true", () => {
    const html = renderToString(<OfflineOutboxDrawer isOpen={true} onClose={() => {}} />);
    expect(html).toContain("Hàng đợi ngoại tuyến");
  });

  it("renders queued draft issues and draft resolves when present", () => {
    const mockIssues: DraftIssue[] = [
      {
        client_uuid: "uuid-issue-1",
        location_code: "LINE_A1",
        category: "1S",
        description: "Bừa bộn khu vực A1",
        photo_before_blob: new Blob(),
        tags: ["5S"],
        created_at: Date.now(),
        sync_status: "PENDING",
      },
      {
        client_uuid: "uuid-issue-2",
        location_code: "LINE_B2",
        category: "2S",
        description: "Thiếu tem nhãn",
        photo_before_blob: new Blob(),
        tags: [],
        created_at: Date.now(),
        sync_status: "FAILED",
      },
    ];

    const mockResolves: DraftResolve[] = [
      {
        resolved_client_uuid: "uuid-resolve-1",
        issue_id: 101,
        expected_version: 1,
        photo_after_blob: new Blob(),
        resolved_at: Date.now(),
        sync_status: "CONFLICT",
      },
      {
        resolved_client_uuid: "uuid-resolve-2",
        issue_id: 102,
        expected_version: 2,
        photo_after_blob: new Blob(),
        resolved_at: Date.now(),
        sync_status: "SYNCING",
      },
    ];

    const html = renderToString(
      <WithMockState values={[mockIssues, mockResolves, false]}>
        <OfflineOutboxDrawer isOpen={true} onClose={() => {}} />
      </WithMockState>,
    );

    expect(html).toContain("LINE_A1");
    expect(html).toContain("Bừa bộn khu vực A1");
    expect(html).toContain("LINE_B2");
    expect(html).toContain("#101");
    expect(html).toContain("#102");
    expect(html).toContain("CONFLICT");
    expect(html).toContain("Hủy");
  });
});
