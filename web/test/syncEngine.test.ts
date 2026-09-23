import { describe, expect, it } from "bun:test";
import type { DraftResolve } from "../src/db/indexeddb.ts";
import { isRecoverableSyncStatus } from "../src/sync/syncEngine.ts";

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
});
