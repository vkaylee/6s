import { describe, expect, it } from "bun:test";
import {
  highlightSegments,
  normalizeSearchText,
  scoreTag,
  searchTags,
} from "../src/utils/tagSearch.ts";

type TestTag = {
  code: string;
  name_vi: string;
  name_en: string;
  name_zh: string;
  use_count: number;
};

const tags: TestTag[] = [
  { code: "oil_leak", name_vi: "Rò rỉ dầu", name_en: "Oil leak", name_zh: "漏油", use_count: 2 },
  { code: "chemical", name_vi: "Hóa chất", name_en: "Chemical", name_zh: "化学品", use_count: 1 },
  {
    code: "oil_machine",
    name_vi: "Dầu máy",
    name_en: "Machine oil",
    name_zh: "机油",
    use_count: 9,
  },
];

describe("tag search", () => {
  it("normalizes Vietnamese accents and special separators", () => {
    expect(normalizeSearchText(" Rò_rỉ-ĐẦU ")).toBe("ro ri dau");
  });

  it("matches Vietnamese tokens regardless of order", () => {
    expect(searchTags(tags, "dau ro")[0]?.code).toBe("oil_leak");
  });

  it("ranks exact code above partial matches", () => {
    expect(searchTags(tags, "oil_leak")[0]?.code).toBe("oil_leak");
  });

  it("supports a small typo for longer tokens", () => {
    expect(scoreTag(tags[1], "hoa chatt")).toBeGreaterThan(0);
  });

  it("matches English and Chinese fields", () => {
    expect(searchTags(tags, "chemical")[0]?.code).toBe("chemical");
    expect(searchTags(tags, "漏油")[0]?.code).toBe("oil_leak");
  });

  it("highlights matched token in text", () => {
    const segments = highlightSegments("Rò rỉ dầu", "dau");
    expect(segments.some((segment) => segment.match && segment.text.includes("dầu"))).toBe(true);
  });

  it("returns unchanged list when query is empty or whitespace", () => {
    expect(searchTags(tags, "")).toEqual(tags);
    expect(searchTags(tags, "   ")).toEqual(tags);
  });

  it("prefers an exact name match over a higher use_count", () => {
    const tieTags: TestTag[] = [
      { code: "tag_a", name_vi: "Lối đi", name_en: "Aisle", name_zh: "过道", use_count: 5 },
      {
        code: "tag_b",
        name_vi: "Lối đi chung",
        name_en: "Common aisle",
        name_zh: "公共过道",
        use_count: 20,
      },
    ];
    const result = searchTags(tieTags, "loi di");
    expect(result[0].code).toBe("tag_a"); // exact name match wins score
  });

  it("filters out items with score 0", () => {
    expect(searchTags(tags, "zzzzzzzz")).toEqual([]);
  });

  it("highlights multiple separated tokens across text", () => {
    const segments = highlightSegments("Rò rỉ dầu mỡ nguy hiểm", "ro nguy");
    const matchedTexts = segments.filter((s) => s.match).map((s) => s.text);
    expect(matchedTexts).toContain("Rò");
    expect(matchedTexts).toContain("nguy");
  });
});
