import { describe, expect, it } from "bun:test";
import { useHeaderVisibility } from "../src/hooks/useHeaderVisibility.ts";

describe("useHeaderVisibility", () => {
  it("exports useHeaderVisibility function", () => {
    expect(typeof useHeaderVisibility).toBe("function");
  });
});
