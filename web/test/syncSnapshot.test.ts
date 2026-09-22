import { describe, expect, it } from "bun:test";
import type { DraftIssue } from "../src/db/indexeddb.ts";
import { buildIssueSyncFormData } from "../src/sync/syncEngine.ts";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function draft(overrides: Partial<DraftIssue> = {}): DraftIssue {
  return {
    client_uuid: "draft-1",
    category: "1S",
    location_code: "LINE_A1",
    tags: [],
    description: "report",
    photo_before_blob: new Blob([JPEG_BYTES], { type: "image/jpeg" }),
    created_at: Date.now(),
    sync_status: "PENDING",
    ...overrides,
  };
}

describe("offline issue snapshot compatibility", () => {
  it("builds a legacy payload without optional snapshot fields", async () => {
    const payload = await buildIssueSyncFormData(draft());

    expect(payload.get("location_code")).toBe("LINE_A1");
    expect(payload.has("location_name_vi_snapshot")).toBe(false);
    expect(payload.has("location_name_zh_snapshot")).toBe(false);
    expect(payload.has("location_name_en_snapshot")).toBe(false);
  });

  it("includes all captured localized names and source", async () => {
    const payload = await buildIssueSyncFormData(
      draft({
        location_name_vi_snapshot: "Chuyền A1",
        location_name_zh_snapshot: "A1 车间",
        location_name_en_snapshot: "Line A1",
        location_snapshot_source: "CLIENT_CAPTURE",
      }),
    );

    expect(payload.get("location_name_vi_snapshot")).toBe("Chuyền A1");
    expect(payload.get("location_name_zh_snapshot")).toBe("A1 车间");
    expect(payload.get("location_name_en_snapshot")).toBe("Line A1");
    expect(payload.get("location_snapshot_source")).toBe("CLIENT_CAPTURE");
  });
});
