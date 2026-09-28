import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { GlobalDialog } from "../src/components/GlobalDialog.tsx";
import { HealthGauge } from "../src/components/HealthGauge.tsx";
import { IssueCard } from "../src/components/IssueCard.tsx";
import { QuickFacets } from "../src/components/QuickFacets.tsx";
import { useI18nStore } from "../src/i18n/index.ts";
import { CreateIssuePage } from "../src/pages/CreateIssuePage.tsx";
import type { DialogOptions } from "../src/store/dialogStore.ts";
import { type I18nObject, IssueCategory, type IssueItem, IssueStatus } from "../src/types/index.ts";

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

  it("rerenders subscribed components after locale changes", () => {
    const { setLocale } = useI18nStore.getState();
    setLocale("vi");
    expect(renderToString(<IssueCard issue={sampleIssue} onClick={() => {}} />)).toContain(
      "Mới ghi nhận",
    );
    setLocale("en");
    expect(renderToString(<IssueCard issue={sampleIssue} onClick={() => {}} />)).toContain("Open");
    setLocale("vi");
  });

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

  it("renders HealthGauge reflecting the selected locale", () => {
    const { setLocale } = useI18nStore.getState();

    // VI
    setLocale("vi");
    let html = renderToString(<HealthGauge score={90} openCount={2} overdueCount={1} />);
    expect(html).toContain("ĐIỂM");
    expect(html).toContain("Sức khỏe 6S xưởng");
    expect(html).toContain("Đang mở: 2");
    expect(html).toContain("Quá hạn");
    expect(html).toContain("48h: 1");

    // EN
    setLocale("en");
    html = renderToString(<HealthGauge score={90} openCount={2} overdueCount={1} />);
    expect(html).toContain("PTS");
    expect(html).toContain("Workshop 6S Health");
    expect(html).toContain("Open: 2");
    expect(html).toContain("Overdue 48h: 1");

    // ZH
    setLocale("zh");
    html = renderToString(<HealthGauge score={90} openCount={2} overdueCount={1} />);
    expect(html).toContain("分");
    expect(html).toContain("车间6S健康度");
    expect(html).toContain("待处理: 2");
    expect(html).toContain("超期48h: 1");
  });

  it("renders CreateIssuePage categories reflecting the selected locale", () => {
    const { setLocale } = useI18nStore.getState();

    // EN
    setLocale("en");
    let html = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={[]} tags={[]} onSuccess={() => {}} />
      </Router>,
    );
    expect(html).toContain("Safety");
    expect(html).toContain("Danger / Fire hazard");
    expect(html).toContain("Sort");
    expect(html).toContain("Clutter / Scrap");

    // VI
    setLocale("vi");
    html = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={[]} tags={[]} onSuccess={() => {}} />
      </Router>,
    );
    expect(html).toContain("An toàn");
    expect(html).toContain("Nguy hiểm / Cháy nổ");
    expect(html).toContain("Sàng lọc");
    expect(html).toContain("Đồ thừa / Phế phẩm");

    // ZH
    setLocale("zh");
    html = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={[]} tags={[]} onSuccess={() => {}} />
      </Router>,
    );
    expect(html).toContain("安全");
    expect(html).toContain("安全 / 紧急危险");
    expect(html).toContain("整理");
    expect(html).toContain("整理 / 废弃物");
  });
});
