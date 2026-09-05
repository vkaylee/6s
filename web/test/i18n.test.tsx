import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { IssueCard } from "../src/components/IssueCard.tsx";
import { QuickFacets } from "../src/components/QuickFacets.tsx";
import { useI18nStore } from "../src/i18n/index.ts";
import en from "../src/i18n/locales/en.json";
import vi from "../src/i18n/locales/vi.json";
import zh from "../src/i18n/locales/zh.json";
import {
  type I18nObject,
  IssueCategory,
  type IssueItem,
  IssueStatus,
  resolveI18n,
} from "../src/types/index.ts";

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
    category: IssueCategory.S6,
    creator_id: 1,
    creator_name: "Worker01",
    location_code: "LINE_A1",
    location_name: "Chuyền May A1",
    description: "Sample description",
    photo_before: "data:image/png;base64,sample",
    status: IssueStatus.OPEN,
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

describe("Frontend i18n usage guard", () => {
  const sourceRoot = new URL("../src/", import.meta.url).pathname;
  const legacyFiles = [
    "App.tsx",
    "components/ConflictModal.tsx",
    "components/HealthGauge.tsx",
    "components/IssueCard.tsx",
    "components/OfflineOutboxDrawer.tsx",
    "components/QuickFacets.tsx",
    "components/SplitSlider.tsx",
    "components/StatusBar.tsx",
    "pages/AdminConfigModal.tsx",
    "pages/CreateIssueModal.tsx",
    "pages/IssueDetailModal.tsx",
    "pages/LoginModal.tsx",
    "pages/SetupSuperadminModal.tsx",
  ];
  const localized =
    /[\u00c0-\u024f\u1e00-\u1eff\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/u;

  it("does not add hardcoded localized UI text", async () => {
    const files = await Array.fromAsync(new Bun.Glob("**/*.tsx").scan({ cwd: sourceRoot }));
    const current: string[] = [];

    for (const file of files) {
      const source = await Bun.file(`${sourceRoot}${file}`).text();
      const jsxText = [...source.matchAll(/>([^<>]*)</g)].some((match) => {
        const literal = match[1].replace(/\{[^{}]*\}/g, "");
        return localized.test(literal);
      });
      const attributeText =
        /(?:alt|title|placeholder|aria-label)="[^"]*[\u00c0-\u024f\u1e00-\u1eff\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/u.test(
          source,
        );
      if (jsxText || attributeText) current.push(file);
    }

    expect(current.sort()).toEqual(legacyFiles.sort());
  });

  it("resolves all static t() calls against all locales", async () => {
    const files = await Array.fromAsync(new Bun.Glob("**/*.tsx").scan({ cwd: sourceRoot }));
    const dictionaries = [vi, en, zh];
    const missing: string[] = [];

    for (const file of files) {
      const source = await Bun.file(`${sourceRoot}${file}`).text();
      for (const match of source.matchAll(/\bt\(["']([^"']+)["']/g)) {
        const key = match[1];
        if (dictionaries.some((d) => resolvePath(d, key) === undefined)) {
          missing.push(`${file}: ${key}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});

describe("I18nObject resolution", () => {
  const sampleObj: I18nObject = { vi: "Lưu", en: "Save", zh: "保存" };

  it("resolves exact locale", () => {
    expect(resolveI18n(sampleObj, "en")).toBe("Save");
    expect(resolveI18n(sampleObj, "zh")).toBe("保存");
    expect(resolveI18n(sampleObj, "vi")).toBe("Lưu");
  });

  it("falls back to vi when locale missing", () => {
    const partial = { vi: "Mặc định" } as unknown as I18nObject;
    expect(resolveI18n(partial, "en")).toBe("Mặc định");
  });
});

function resolvePath(obj: Record<string, unknown>, path: string): string | undefined {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}
