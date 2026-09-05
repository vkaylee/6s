import { describe, expect, it } from "bun:test";
import { IssueCategory, S_CATEGORIES } from "../src/types/index.ts";

describe("S_CATEGORIES", () => {
  it("defines all 6S categories with bilingual hints", () => {
    expect(S_CATEGORIES.length).toBe(6);
    expect(S_CATEGORIES[0].key).toBe(IssueCategory.S1);
    expect(S_CATEGORIES[5].key).toBe(IssueCategory.S6);
    expect(S_CATEGORIES[5].isSafety).toBe(true);
  });
});
