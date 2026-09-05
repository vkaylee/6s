import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import ts from "typescript";
import { GlobalDialog } from "../src/components/GlobalDialog.tsx";
import { IssueCard } from "../src/components/IssueCard.tsx";
import { QuickFacets } from "../src/components/QuickFacets.tsx";
import { useI18nStore } from "../src/i18n/index.ts";
import en from "../src/i18n/locales/en.json";
import vi from "../src/i18n/locales/vi.json";
import zh from "../src/i18n/locales/zh.json";
import type { DialogOptions } from "../src/store/dialogStore.ts";
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
    "pages/CreateIssuePage.tsx",
    "pages/IssueDetailModal.tsx",
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

describe("Component I18nObject compliance & rendering", () => {
  it("renders GlobalDialog with localized I18nObject props", () => {
    const options: DialogOptions = {
      title: { vi: "Tiêu đề tiếng Việt", en: "English Title", zh: "中文标题" },
      message: { vi: "Nội dung tiếng Việt", en: "English Content", zh: "中文内容" },
      confirmText: { vi: "Xác nhận VN", en: "Confirm EN", zh: "确认 ZH" },
      cancelText: { vi: "Hủy VN", en: "Cancel EN", zh: "取消 ZH" },
      type: "confirm",
    };

    useI18nStore.getState().setLocale("en");
    const htmlEn = renderToString(<GlobalDialog isOpen={true} options={options} />);
    expect(htmlEn).toContain("English Title");
    expect(htmlEn).toContain("English Content");
    expect(htmlEn).toContain("Confirm EN");
    expect(htmlEn).toContain("Cancel EN");

    useI18nStore.getState().setLocale("vi");
    const htmlVi = renderToString(<GlobalDialog isOpen={true} options={options} />);
    expect(htmlVi).toContain("Tiêu đề tiếng Việt");
    expect(htmlVi).toContain("Nội dung tiếng Việt");
    expect(htmlVi).toContain("Xác nhận VN");
    expect(htmlVi).toContain("Hủy VN");
  });

  it("enforces I18nObject interface contract statically", () => {
    // Compile-time assignment check: valid I18nObject satisfies DialogOptions message
    const validI18n: I18nObject = { vi: "Chào", en: "Hello", zh: "你好" };
    const opts: DialogOptions = { message: validI18n };
    expect(opts.message).toEqual(validI18n);
  });
});

describe("Component Props I18n Enforcement Guard", () => {
  const sourceRoot = new URL("../src/", import.meta.url).pathname;

  // Allowed non-localizable string props (URLs, IDs, code keys, CSS classes)
  const nonI18nProps: Record<string, true> = {
    className: true,
    key: true,
    id: true,
    clientUuid: true,
    resolvedUuid: true,
    beforeUrl: true,
    afterUrl: true,
    serverPhotoAfter: true,
  };

  it("forbids raw string props for UI text across all components and pages, requiring I18nObject", async () => {
    const files = await Array.fromAsync(new Bun.Glob("**/*.tsx").scan({ cwd: sourceRoot }));

    const violations: { file: string; prop: string; type: string }[] = [];

    for (const file of files) {
      const content = await Bun.file(`${sourceRoot}${file}`).text();
      const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

      function inspectNode(node: ts.Node) {
        // Detect interface *Props or type *Props = { ... }
        let members: ts.NodeArray<ts.TypeElement> | undefined;
        if (ts.isInterfaceDeclaration(node) && node.name.text.endsWith("Props")) {
          members = node.members;
        } else if (
          ts.isTypeAliasDeclaration(node) &&
          node.name.text.endsWith("Props") &&
          ts.isTypeLiteralNode(node.type)
        ) {
          members = node.type.members;
        }

        if (members) {
          for (const member of members) {
            if (ts.isPropertySignature(member)) {
              const propName = member.name.getText(sf);
              if (nonI18nProps[propName]) continue;
              const propType = member.type ? member.type.getText(sf) : "";
              // If prop type is raw 'string' without I18nObject
              if (
                propType === "string" ||
                propType === "string | undefined" ||
                (propType.includes("string") && !propType.includes("I18nObject"))
              ) {
                violations.push({ file, prop: propName, type: propType });
              }
            }
          }
        }
        ts.forEachChild(node, inspectNode);
      }

      inspectNode(sf);
    }

    expect(violations).toEqual([]);
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
