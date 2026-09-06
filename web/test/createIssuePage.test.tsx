import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { ImageAnnotatorModal } from "../src/components/ImageAnnotatorModal.tsx";
import { LocationCombobox } from "../src/components/LocationCombobox.tsx";
import { TaxonomySelectorModal } from "../src/components/TaxonomySelectorModal.tsx";
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
  });

  it("renders TaxonomySelectorModal with tags correctly when opened", () => {
    const html = renderToString(
      <TaxonomySelectorModal
        isOpen={true}
        onClose={() => {}}
        tags={mockTags}
        selectedTags={["s3_oil_spill"]}
        currentCategory={null}
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
      />,
    );
    expect(html).toContain("Rò rỉ dầu mỡ");
    expect(html).toContain("Nguy cơ cháy nổ");
  });

  it("renders TaxonomySelectorModal falling back to ALL tags when category has no matching tags", () => {
    const html = renderToString(
      <TaxonomySelectorModal
        isOpen={true}
        onClose={() => {}}
        tags={mockTags} // Only has S3 and S6
        selectedTags={[]}
        currentCategory={IssueCategory.S1} // S1 has 0 tags in mockTags
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
      />,
    );
    // Should gracefully fallback to show ALL tags instead of empty state
    expect(html).toContain("Rò rỉ dầu mỡ");
    expect(html).toContain("Nguy cơ cháy nổ");
  });

  it("renders TaxonomySelectorModal search filtering and custom tag creation hint", () => {
    const html = renderToString(
      <WithMockState values={["ALL", null, "rò rỉ"]}>
        <TaxonomySelectorModal
          isOpen={true}
          onClose={() => {}}
          tags={mockTags}
          selectedTags={[]}
          currentCategory={null}
          onToggleTag={() => {}}
          onSelectCategory={() => {}}
        />
      </WithMockState>,
    );
    expect(html).toContain("Rò rỉ dầu mỡ");
    expect(html).not.toContain("Nguy cơ cháy nổ");
  });

  it("renders TaxonomySelectorModal no match state with custom tag suggestion", () => {
    const html = renderToString(
      <WithMockState values={["ALL", null, "zzz_tidak_ada"]}>
        <TaxonomySelectorModal
          isOpen={true}
          onClose={() => {}}
          tags={mockTags}
          selectedTags={[]}
          currentCategory={null}
          onToggleTag={() => {}}
          onSelectCategory={() => {}}
        />
      </WithMockState>,
    );
    expect(html).toContain("Không tìm thấy nhãn phù hợp");
    expect(html).toContain("+ Dùng nhãn mới:");
  });

  it("renders TaxonomySelectorModal in closed state", () => {
    const html = renderToString(
      <TaxonomySelectorModal
        isOpen={false}
        onClose={() => {}}
        tags={mockTags}
        selectedTags={[]}
        currentCategory={null}
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
      />,
    );
    expect(html).toBe("");
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

  it("renders CreateIssuePage glove-friendly submit triggers", () => {
    const pageHtml = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={mockLocations} tags={mockTags} onSuccess={() => {}} />
      </Router>,
    );
    // Both mobile and desktop action buttons
    expect(pageHtml).toContain("GỬI BÁO CÁO 6S");
    expect(pageHtml).toContain("min-h-[64px]");
    expect(pageHtml).toContain("Phím tắt: 1-6 chọn loại S");
  });

  it("renders drag and drop photo dropzones with enterprise hints", () => {
    const pageHtml = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={mockLocations} tags={mockTags} onSuccess={() => {}} />
      </Router>,
    );
    expect(pageHtml).toContain("Kéo thả ảnh vào đây hoặc dán (Ctrl+V)");
  });

  it("renders LocationCombobox with SVG MapPin and ChevronDown icons", () => {
    const html = renderToString(
      <LocationCombobox locations={mockLocations} value="LINE_A1" onChange={() => {}} />,
    );
    expect(html).toContain("lucide-map-pin");
    expect(html).toContain("lucide-chevron-down");
  });

  it("renders open LocationCombobox dropdown list and search input", () => {
    const html = renderToString(
      <WithMockState values={[true, ""]}>
        <LocationCombobox locations={mockLocations} value="LINE_A1" onChange={() => {}} />
      </WithMockState>,
    );
    expect(html).toContain("Chuyền May A1");
    expect(html).toContain("Chuyền May B2");
    expect(html).toContain('placeholder="Tìm theo mã, tên tiếng Việt, tiếng Trung..."');
  });

  it("renders empty location search message when no matches found", () => {
    const html = renderToString(
      <WithMockState values={[true, "xyz999"]}>
        <LocationCombobox locations={mockLocations} value="LINE_A1" onChange={() => {}} />
      </WithMockState>,
    );
    expect(html).toContain("Không tìm thấy vị trí phù hợp");
  });

  it("renders 6S root cause Condition vs Behavior 1-touch selector", () => {
    const pageHtml = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={mockLocations} tags={mockTags} onSuccess={() => {}} />
      </Router>,
    );
    expect(pageHtml).toContain("Đồ đạc / Thiết bị");
    expect(pageHtml).toContain("Con người / Thao tác");
    expect(pageHtml).toContain("📦");
    expect(pageHtml).toContain("👤");
  });

  it("renders all 6S category selection options with hints", () => {
    const pageHtml = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={mockLocations} tags={mockTags} onSuccess={() => {}} />
      </Router>,
    );
    expect(pageHtml).toContain("1S");
    expect(pageHtml).toContain("2S");
    expect(pageHtml).toContain("3S");
    expect(pageHtml).toContain("4S");
    expect(pageHtml).toContain("5S");
    expect(pageHtml).toContain("6S");
  });
});

function WithMockState({ values, children }: { values: unknown[]; children: React.ReactNode }) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: {
          current: { useState: (init: unknown) => [unknown, () => void] };
        };
      };
    }
  ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let idx = 0;
  internals.current.useState = (init: unknown) => {
    const val =
      idx < values.length
        ? values[idx++]
        : typeof init === "function"
          ? (init as () => unknown)()
          : init;
    return [val, () => {}];
  };
  return <>{children}</>;
}

describe("CreateIssuePage with uploaded photos and states", () => {
  const mockLocations: LocationItem[] = [
    {
      code: "LINE_A1",
      name_vi: "Chuyền May A1",
      name_zh: "缝纫一号线",
      name_en: "Sewing Line A1",
      is_active: true,
    },
  ];

  const mockTags: TagItem[] = [
    {
      tag_code: "s6_fire",
      category: IssueCategory.S6,
      label_vi: "Nguy cơ cháy nổ",
      label_zh: "火灾隐患",
    },
  ];

  it("renders photo preview controls, annotator button, and Safety S6 submit trigger", () => {
    const pageHtml = renderToString(
      <WithMockState
        values={[
          true, // isHeaderVisible
          IssueCategory.S6, // category
          "CONDITION", // causeType
          "LINE_A1", // locationCode
          mockTags, // localTags
          ["s6_fire"], // selectedTags
          "Mô tả chi tiết sự cố rò rỉ", // description
          new Blob(["wide"], { type: "image/jpeg" }), // photoBefore
          new Blob(["detail"], { type: "image/jpeg" }), // photoDetail
          "blob:mock-wide-photo", // previewBefore
          "blob:mock-detail-photo", // previewDetail
          false, // isSubmitting
          null, // lastDraftTime
          false, // dragOverWide
          false, // dragOverDetail
          ["LINE_A1"], // recentLocations
          true, // touched
          false, // categoryError
          false, // photoError
          null, // annotatorTarget
        ]}
      >
        <Router ssrPath="/issues/new">
          <CreateIssuePage locations={mockLocations} tags={mockTags} onSuccess={() => {}} />
        </Router>
      </WithMockState>,
    );

    expect(pageHtml).toContain("blob:mock-wide-photo");
    expect(pageHtml).toContain("blob:mock-detail-photo");
    expect(pageHtml).toContain("Khoanh lỗi");
    expect(pageHtml).toContain("Chụp lại");
    expect(pageHtml).toContain("GỬI BÁO CÁO NGUY HIỂM 6S");
  });

  it("renders validation errors when form is touched with missing category or photo", () => {
    const pageHtml = renderToString(
      <WithMockState
        values={[
          true,
          null, // category missing
          "CONDITION",
          "LINE_A1",
          mockTags,
          [],
          "",
          null, // photo missing
          null,
          null,
          null,
          false,
          null,
          false,
          false,
          [],
          true, // touched
          true, // categoryError
          true, // photoError
          null,
        ]}
      >
        <Router ssrPath="/issues/new">
          <CreateIssuePage locations={mockLocations} tags={mockTags} onSuccess={() => {}} />
        </Router>
      </WithMockState>,
    );

    expect(pageHtml).toContain("Vui lòng chọn phân loại 6S");
    expect(pageHtml).toContain("Bắt buộc chụp ảnh toàn cảnh (Ảnh 1)");
  });
});
