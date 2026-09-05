import { describe, expect, it } from "bun:test";
import { IssueCategory, S_CATEGORIES } from "../src/types/index.ts";

describe("S_CATEGORIES", () => {
  it("defines all 6S categories with multilingual names and hints (vi, en, zh)", () => {
    expect(S_CATEGORIES.length).toBe(6);
    expect(S_CATEGORIES[0].key).toBe(IssueCategory.S1);
    expect(S_CATEGORIES[5].key).toBe(IssueCategory.S6);
    expect(S_CATEGORIES[5].isSafety).toBe(true);

    for (const cat of S_CATEGORIES) {
      expect(cat.name).toBeDefined();
      expect(cat.hint_vi).toBeDefined();
      expect(cat.hint_zh).toBeDefined();
      expect(cat.hint_en).toBeDefined();
      expect(cat.name_i18n?.vi).toBeDefined();
      expect(cat.name_i18n?.en).toBeDefined();
      expect(cat.name_i18n?.zh).toBeDefined();
      expect(cat.hint_i18n?.vi).toBeDefined();
      expect(cat.hint_i18n?.en).toBeDefined();
      expect(cat.hint_i18n?.zh).toBeDefined();
    }
  });
});
describe("6S Tag Search Normalization", () => {
  function normalizeSearchText(str: string): string {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .trim();
  }

  it("matches accented and non-accented queries correctly", () => {
    const labelVi = "Phế liệu / Rác thừa";
    const labelVi2 = "Thùng rác đầy tràn";
    const labelVi3 = "Rò rỉ dầu mỡ";

    expect(normalizeSearchText(labelVi).includes(normalizeSearchText("rac"))).toBe(true);
    expect(normalizeSearchText(labelVi).includes(normalizeSearchText("rác"))).toBe(true);
    expect(normalizeSearchText(labelVi2).includes(normalizeSearchText("rac"))).toBe(true);
    expect(normalizeSearchText(labelVi2).includes(normalizeSearchText("rác"))).toBe(true);
    expect(normalizeSearchText(labelVi3).includes(normalizeSearchText("dau"))).toBe(true);
    expect(normalizeSearchText(labelVi3).includes(normalizeSearchText("dầu"))).toBe(true);
    expect(normalizeSearchText(labelVi3).includes(normalizeSearchText("rac"))).toBe(false);
  });
});
