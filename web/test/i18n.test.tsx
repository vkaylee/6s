import { afterEach, describe, expect, it } from "bun:test";
import ts from "typescript";
import { detectBrowserLocale, useI18nStore } from "../src/i18n/index.ts";
import en from "../src/i18n/locales/en.json";
import vi from "../src/i18n/locales/vi.json";
import zh from "../src/i18n/locales/zh.json";
import { type I18nObject, resolveI18n, resolveLocationNameByCode } from "../src/types/index.ts";

afterEach(() => {
  useI18nStore.getState().setLocale("vi");
});

describe("Browser locale detection", () => {
  it("selects the first supported browser language", () => {
    expect(detectBrowserLocale(["fr-FR", "en-US", "zh-CN"])).toBe("en");
  });

  it("matches regional language tags and falls back to Vietnamese", () => {
    expect(detectBrowserLocale(["zh-TW"])).toBe("zh");
    expect(detectBrowserLocale(["fr-FR", "de-DE"])).toBe("vi");
  });

  it("keeps selected locale after repeated store reads", () => {
    const { setLocale } = useI18nStore.getState();
    setLocale("en");
    expect(useI18nStore.getState().locale).toBe("en");
    expect(useI18nStore.getState().t("common.save")).toBe("Save");
    expect(useI18nStore.getState().locale).toBe("en");
    setLocale("vi");
  });
});
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

  it("translates admin page titles in every locale", () => {
    const { setLocale, t } = useI18nStore.getState();
    const expected = {
      vi: ["Vị trí xưởng", "Thẻ sự cố"],
      en: ["Factory Locations", "Issue Tags"],
      zh: ["车间位置", "问题标签"],
    } as const;

    for (const [locale, [locations, tags]] of Object.entries(expected)) {
      setLocale(locale as keyof typeof expected);
      expect(t("admin.locations_page_title")).toBe(locations);
      expect(t("admin.tags_page_title")).toBe(tags);
    }
  });
  it("translates location display labels in every locale", () => {
    const { setLocale, t } = useI18nStore.getState();
    const expected = {
      vi: ["Mã", "Đang phân công"],
      en: ["Code", "Current assignment"],
      zh: ["编号", "当前分配"],
    } as const;
    for (const [locale, [code, current]] of Object.entries(expected)) {
      setLocale(locale as keyof typeof expected);
      expect(t("admin.location_code_label_short")).toBe(code);
      expect(t("admin.team_location_period_current")).toBe(current);
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
describe("Score ledger translations", () => {
  it("translates score rule and status labels in every locale", () => {
    const { setLocale, t } = useI18nStore.getState();
    const expected = {
      vi: ["Trừ điểm sự cố thường", "Đã hoàn thành"],
      en: ["Normal issue penalty", "Closed"],
      zh: ["普通问题扣分", "已关闭"],
    } as const;

    for (const [locale, [rule, status]] of Object.entries(expected)) {
      setLocale(locale as keyof typeof expected);
      expect(t("leaderboard.rule_penalty_normal")).toBe(rule);
      expect(t("status.CLOSED")).toBe(status);
    }
  });
});

describe("resolveLocationNameByCode", () => {
  const locations = [
    { code: "LINE_A1", name_vi: "Chuyền May A1", name_en: "Sewing Line A1", name_zh: "一号线" },
  ];

  it("resolves the selected locale and falls back safely", () => {
    expect(resolveLocationNameByCode(locations, "LINE_A1", "", "en")).toBe("Sewing Line A1");
    expect(resolveLocationNameByCode(locations, "MISSING", "Tên dự phòng", "vi")).toBe(
      "Tên dự phòng",
    );
    expect(resolveLocationNameByCode([], "MISSING", "", "vi")).toBe("MISSING");
  });
});

describe("Frontend i18n usage guard", () => {
  const sourceRoot = new URL("../src/", import.meta.url).pathname;
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

    expect(current).toEqual([]);
  });

  it("keeps runtime dialogs and errors locale-neutral", async () => {
    const owned = [
      "api/client.ts",
      "App.tsx",
      "pages/IssueDetailModal.tsx",
      "pages/CreateIssueModal.tsx",
      "pages/CreateIssuePage.tsx",
    ];

    const violations: string[] = [];
    const runtimeLiteral =
      /(?:alert|confirm|Error)\s*\(\s*["'][^"']*[\u00c0-\u024f\u1e00-\u1eff\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef][^"']*["']/u;
    for (const file of owned) {
      const source = await Bun.file(`${sourceRoot}${file}`).text();
      if (runtimeLiteral.test(source)) violations.push(file);
    }

    expect(violations).toEqual([]);
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

  it("uses the shared resolver for location code lookups", async () => {
    const files = await Array.fromAsync(new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: sourceRoot }));
    const violations: string[] = [];
    const directLookup = /resolveLocationName\(\s*locations\.find/su;

    for (const file of files) {
      const source = await Bun.file(`${sourceRoot}${file}`).text();
      if (directLookup.test(source)) violations.push(file);
    }

    expect(violations).toEqual([]);
  });
  it("keeps owned user-facing attributes translated", async () => {
    const owned = [
      "App.tsx",
      "pages/IssueDetailModal.tsx",
      "pages/CreateIssueModal.tsx",
      "pages/CreateIssuePage.tsx",
    ];
    const violations: string[] = [];
    const rawAttribute = /(?:alt|title|placeholder|aria-label)="[^"]+"/u;
    const rawFallback = /\bt\(["'][^"']+["']\)\s*\|\|\s*["'][^"']+["']/u;

    for (const file of owned) {
      const source = await Bun.file(`${sourceRoot}${file}`).text();
      if (rawAttribute.test(source) || rawFallback.test(source)) violations.push(file);
    }

    expect(violations).toEqual([]);
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
    imageUrl: true,
    value: true,
    locationCode: true,
    selectedTags: true,
    code: true,
    initialInput: true,
    initialCode: true,
    allowedRoles: true,
    allowedCapability: true,
    searchQuery: true,
    streamingFollowUpAnswer: true,
    pendingFollowUpQuestion: true,
    locale: true,
    currentPath: true,
    selectedTeamLabel: true,
    color: true,
    category: true,
    causeType: true,
    tags: true,
    appliedTags: true,
    tagQuery: true,
    aiError: true,
    aiSuggestions: true,
    selectedLocationFilter: true,
    filteredLocationData: true,
    trendData: true,
    topTagsData: true,
    selectedTeamFilter: true,
    gridColor: true,
    textColor: true,
    tooltipBg: true,
    tooltipBorder: true,
    selectedLocationDrill: true,
    selectedTagDrill: true,
    previewBefore: true,
    previewDetail: true,
    editRole: true,
    editLocation: true,
    editTimezone: true,
    editLocale: true,
    editCode: true,
    editName: true,
    memberToAdd: true,
    locationToAdd: true,
    removingLocationCode: true,
    recentLocations: true,
    lastDraftTime: true,
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
              // If prop type is raw 'string' without I18nObject, and not a function
              const isFunction =
                (member.type && ts.isFunctionTypeNode(member.type)) || propType.includes("=>");
              if (
                !isFunction &&
                (propType === "string" ||
                  propType === "string | undefined" ||
                  (propType.includes("string") && !propType.includes("I18nObject")))
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
