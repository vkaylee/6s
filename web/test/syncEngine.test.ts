import { describe, expect, it } from "bun:test";
import type { DraftIssue, DraftResolve } from "../src/db/indexeddb.ts";
import { buildIssueSyncFormData, isRecoverableSyncStatus } from "../src/sync/syncEngine.ts";

describe("syncEngine recovery filter", () => {
  it("includes PENDING, FAILED, and SYNCING drafts so interrupted uploads recover", () => {
    expect(isRecoverableSyncStatus("PENDING")).toBe(true);
    expect(isRecoverableSyncStatus("FAILED")).toBe(true);
    expect(isRecoverableSyncStatus("SYNCING")).toBe(true);
  });

  it("excludes CONFLICT status from automated sync retry", () => {
    const conflictStatus: DraftResolve["sync_status"] = "CONFLICT";
    expect(isRecoverableSyncStatus(conflictStatus)).toBe(false);
  });

  it("serializes proposed_tags to FormData when present and omits when empty", async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const baseDraft: DraftIssue = {
      client_uuid: "uuid-test-1",
      category: "3S",
      location_code: "LINE_A1",
      tags: ["oil_leak"],
      description: "Leak test",
      photo_before_blob: new Blob([jpegBytes], { type: "image/jpeg" }),
      created_at: 1_700_000_000_000,
      sync_status: "PENDING",
    };

    const formDataWithout = await buildIssueSyncFormData(baseDraft);
    expect(formDataWithout.get("proposed_tags")).toBeNull();

    const draftWithProposals: DraftIssue = {
      ...baseDraft,
      proposed_tags: [
        {
          name_vi: "Dầu tủ điện",
          name_en: "Oil near cabinet",
          category: "6S",
        },
      ],
    };
    const formDataWith = await buildIssueSyncFormData(draftWithProposals);
    const rawJson = formDataWith.get("proposed_tags");
    expect(typeof rawJson).toBe("string");
    const parsed = JSON.parse(rawJson as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name_vi).toBe("Dầu tủ điện");
    expect(parsed[0].category).toBe("6S");
  });
});
