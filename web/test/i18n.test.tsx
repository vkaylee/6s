import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { IssueCard } from "../src/components/IssueCard.tsx";
import { QuickFacets } from "../src/components/QuickFacets.tsx";
import { useI18nStore } from "../src/i18n/index.ts";
import en from "../src/i18n/locales/en.json";
import vi from "../src/i18n/locales/vi.json";
import zh from "../src/i18n/locales/zh.json";
import type { IssueItem } from "../src/types/index.ts";

function extractKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      keys = keys.concat(extractKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("i18n Locale Parity & Consistency (vi, en, zh)", () => {
  const viKeys = extractKeys(vi);
  const enKeys = extractKeys(en);
  const zhKeys = extractKeys(zh);

  it("has exact key parity across all 3 languages", () => {
    expect(viKeys).toEqual(enKeys);
    expect(viKeys).toEqual(zhKeys);
  });

  it("has non-empty values for all keys in all languages", () => {
    const { setLocale, t } = useI18nStore.getState();

    for (const locale of ["vi", "en", "zh"] as const) {
      setLocale(locale);
      for (const key of viKeys) {
        const val = t(key);
        expect(val).not.toBe("");
        expect(val).not.toBe(key);
      }
    }
  });

  it("correctly translates and interpolates per locale", () => {
    const { t, setLocale } = useI18nStore.getState();

    setLocale("vi");
    expect(t("common.save")).toBe("Lưu");
    expect(t("status.OPEN")).toBe("Mới ghi nhận");

    setLocale("en");
    expect(t("common.save")).toBe("Save");
    expect(t("status.OPEN")).toBe("Open");

    setLocale("zh");
    expect(t("common.save")).toBe("保存");
    expect(t("status.OPEN")).toBe("待处理");

    // Missing key returns key path
    expect(t("non_existent_key")).toBe("non_existent_key");
  });
});

describe("UI Components i18n Integration", () => {
  const sampleIssue: IssueItem = {
    id: 101,
    client_uuid: "test-uuid-101",
    category: "6S",
    creator_id: 1,
    creator_name: "Worker01",
    location_code: "LINE_A1",
    location_name: "Chuyền May A1",
    description: "Sample description",
    photo_before: "data:image/png;base64,sample",
    status: "OPEN",
    tags: ["safety"],
    created_at: new Date().toISOString(),
    version: 1,
  };

  it("renders IssueCard in Vietnamese, English, and Chinese correctly", () => {
    const { setLocale } = useI18nStore.getState();

    // VI
    setLocale("vi");
    let html = renderToString(<IssueCard issue={sampleIssue} onClick={() => {}} />);
    expect(html).toContain("Mới ghi nhận");

    // EN
    setLocale("en");
    html = renderToString(<IssueCard issue={sampleIssue} onClick={() => {}} />);
    expect(html).toContain("Open");

    // ZH
    setLocale("zh");
    html = renderToString(<IssueCard issue={sampleIssue} onClick={() => {}} />);
    expect(html).toContain("待处理");
  });

  it("renders QuickFacets reflecting the selected locale", () => {
    const { setLocale } = useI18nStore.getState();

    // VI
    setLocale("vi");
    let html = renderToString(
      <QuickFacets activeFacet="ALL" onSelectFacet={() => {}} pendingReviewCount={0} />,
    );
    expect(html).toContain("Tất cả");

    // ZH
    setLocale("zh");
    html = renderToString(
      <QuickFacets activeFacet="ALL" onSelectFacet={() => {}} pendingReviewCount={0} />,
    );
    expect(html).toContain("全部");
  });
});
