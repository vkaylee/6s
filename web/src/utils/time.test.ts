import { describe, expect, it } from "bun:test";
import { formatTime } from "./time.ts";

describe("formatTime", () => {
  it("formats timestamp into localized string with explicit timezone", () => {
    const output = formatTime("2026-09-09T08:30:00Z", "en-US", "Asia/Ho_Chi_Minh");
    expect(output).toContain("2026");
    expect(output).toContain("GMT+7");
  });
});
