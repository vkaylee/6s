import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { ImageAnnotatorModal } from "../src/components/ImageAnnotatorModal.tsx";
import { LocationCombobox } from "../src/components/LocationCombobox.tsx";
import { CreateIssuePage } from "../src/pages/CreateIssuePage.tsx";
import { IssueCategory, type LocationItem, type TagItem } from "../src/types/index.ts";

describe("Enterprise CreateIssuePage UIUX", () => {
  const mockLocations: LocationItem[] = [
    {
      code: "LINE_A1",
      name_vi: "Chuyền May A1",
      name_zh: "缝纫一号线",
      name_en: "Sewing Line A1",
      is_active: true,
    },
    {
      code: "LINE_B2",
      name_vi: "Chuyền May B2",
      name_zh: "缝纫二号线",
      name_en: "Sewing Line B2",
      is_active: true,
    },
  ];

  const mockTags: TagItem[] = [
    {
      tag_code: "s3_oil_spill",
      category: IssueCategory.S3,
      label_vi: "Rò rỉ dầu mỡ",
      label_zh: "漏水漏油",
    },
    {
      tag_code: "s6_fire_hazard",
      category: IssueCategory.S6,
      label_vi: "Nguy cơ cháy nổ",
      label_zh: "火灾隐患",
    },
  ];

  it("renders dual-column grid and dual-shot photo zones on desktop", () => {
    const html = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={mockLocations} tags={mockTags} onSuccess={() => {}} />
      </Router>,
    );
    expect(html).toContain("lg:col-span-5");
    expect(html).toContain("lg:col-span-7");
    expect(html).toContain("LINE_A1");
    expect(html).toContain("Rò rỉ dầu mỡ");
  });

  it("renders searchable LocationCombobox correctly", () => {
    const html = renderToString(
      <LocationCombobox locations={mockLocations} value="LINE_A1" onChange={() => {}} />,
    );
    expect(html).toContain("Chuyền May A1");
    expect(html).toContain("LINE_A1");
  });
  it("renders ImageAnnotatorModal without null pointer crash", () => {
    const html = renderToString(
      <ImageAnnotatorModal
        imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        isOpen={true}
        title={{ vi: "Khoanh vùng & Chú thích lỗi", en: "Annotate", zh: "标注" }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("canvas");
    expect(html).toContain("Khoanh vùng &amp; Chú thích lỗi");
    expect(html).toContain("Khoanh tròn");
    expect(html).toContain("Khung chữ nhật");
    expect(html).toContain("Vẽ tự do");
    expect(html).toContain("Di chuyển");
  });

  it("returns null when ImageAnnotatorModal isOpen is false", () => {
    const html = renderToString(
      <ImageAnnotatorModal
        imageUrl=""
        isOpen={false}
        title={{ vi: "Chú thích", en: "Annotate", zh: "标注" }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toBe("");
  });

  it("renders LocationCombobox with error state and custom search trigger", () => {
    const html = renderToString(
      <LocationCombobox
        locations={mockLocations}
        value=""
        onChange={() => {}}
        error={{ vi: "Vui lòng chọn vị trí", en: "Required", zh: "必选" }}
      />,
    );
    expect(html).toContain("Vui lòng chọn vị trí");
    expect(html).toContain("border-rose-500");
  });

  it("renders CreateIssuePage 6S decision tree button and glove-friendly submit triggers", () => {
    const html = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={mockLocations} tags={mockTags} onSuccess={() => {}} />
      </Router>,
    );
    // Decision tree wizard trigger
    expect(html).toContain("Trợ giúp phân loại 6S");
    // Both mobile and desktop action buttons
    expect(html).toContain("GỬI BÁO CÁO 6S");
    expect(html).toContain("min-h-[64px]");
  });
});
