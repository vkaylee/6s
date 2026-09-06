import { describe, expect, it } from "bun:test";
import { detectCauseType, IssueCategory, isBehaviorTag, S_CATEGORIES } from "../src/types/index.ts";

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

describe("6S Cause Classification (Người vs Vật)", () => {
  it("identifies behavior vs condition tags correctly", () => {
    expect(isBehaviorTag("ppe_violation", "5S")).toBe(true);
    expect(isBehaviorTag("forklift_speeding", "6S")).toBe(true);
    expect(isBehaviorTag("safety_gear", "6S")).toBe(true);
    expect(isBehaviorTag("oil_leak", "3S")).toBe(false);
    expect(isBehaviorTag("scrap_material", "1S")).toBe(false);
  });

  it("detects cause type accurately from category and tags", () => {
    expect(detectCauseType("1S", ["scrap_material"])).toBe("CONDITION");
    expect(detectCauseType("3S", ["oil_leak"])).toBe("CONDITION");
    expect(detectCauseType("5S", [])).toBe("BEHAVIOR");
    expect(detectCauseType("6S", ["forklift_speeding"])).toBe("BEHAVIOR");
    expect(detectCauseType("6S", ["exposed_wire"])).toBe("CONDITION");
  });
});
