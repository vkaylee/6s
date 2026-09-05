import { describe, expect, it } from "bun:test";
import { haptics } from "../src/utils/haptics.ts";

describe("haptics utils", () => {
  it("executes all vibration triggers without error", () => {
    haptics.success();
    haptics.safetyAlert();
    haptics.errorOrConflict();
    haptics.disabledTouch();
    haptics.selection();
    expect(true).toBe(true);
  });
});
