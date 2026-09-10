import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { CreateIssueModal } from "../src/pages/CreateIssueModal.tsx";

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

import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationItem,
  type TagItem,
} from "../src/types/index.ts";

const mockLocations: LocationItem[] = [
  {
    code: "LINE_A1",
    name_vi: "Chuyền May A1",
    name_en: "Line A1",
    name_zh: "车间 A1",
    is_active: true,
  },
  {
    code: "LINE_B2",
    name_vi: "Chuyền May B2",
    name_en: "Line B2",
    name_zh: "车间 B2",
    is_active: true,
  },
];

const mockTags: TagItem[] = [
  {
    tag_code: "S1_01",
    category: "1S",
    label_vi: "San sát",
    label_en: "Cluttered",
    label_zh: "杂乱",
  },
  { tag_code: "S3_01", category: "3S", label_vi: "Bẩn thỉu", label_en: "Dirty", label_zh: "脏污" },
];

const mockIssue: IssueItem = {
  id: 101,
  client_uuid: "uuid-101",
  version: 1,
  creator_id: 1,
  creator_name: "Thợ A",
  category: IssueCategory.S1,
  location_code: "LINE_A1",
  location_name: "Chuyền May A1",
  description: "Cần sắp xếp lại vật tư",
  status: IssueStatus.OPEN,
  photo_before: "/api/issues/101/media/before/before-101.jpg",
  photo_detail: "/api/issues/101/media/detail/detail-101.jpg",
  created_at: "2026-03-01T00:00:00Z",
  tags: ["San sát"],
};

describe("CreateIssueModal Component", () => {
  it("returns null when isOpen is false", () => {
    const html = renderToString(
      <CreateIssueModal
        isOpen={false}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    expect(html).toBe("");
  });

  it("renders modal form when isOpen is true in create mode", () => {
    const html = renderToString(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );
    expect(html).toContain("Tạo báo cáo lỗi 6S");
    expect(html).toContain("Chuyền May A1");
    expect(html).toContain("1S");
    expect(html).toContain("3S");
    expect(html).not.toContain("before-101.jpg");
  });

  it("renders modal form in edit mode with initialIssue details", () => {
    const html = renderToString(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
        initialIssue={mockIssue}
      />,
    );
    expect(html).toContain("Chỉnh sửa báo cáo 6S");
    expect(html).toContain("Cần sắp xếp lại vật tư");
    expect(html).toContain("before-101.jpg");
    expect(html).toContain("detail-101.jpg");
    expect(html).toContain("San sát");
  });

  it("renders Safety S6 submit button when S6 is selected", () => {
    const html = renderToString(
      <WithMockState
        values={[
          IssueCategory.S6, // category
          "CONDITION", // causeType
          "LINE_A1", // locationCode
          [], // selectedTags
          "Sự cố an toàn", // description
          null, // photoBefore
          null, // photoDetail
          null, // previewBefore
          null, // previewDetail
          false, // isSubmitting
        ]}
      >
        <CreateIssueModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
          locations={mockLocations}
          tags={mockTags}
        />
      </WithMockState>,
    );

    expect(html).toContain("GỬI BÁO CÁO NGUY HIỂM 6S");
  });

  it("renders saving indicator when form is submitting", () => {
    const html = renderToString(
      <WithMockState
        values={[
          IssueCategory.S1, // category
          "CONDITION", // causeType
          "LINE_A1", // locationCode
          [], // selectedTags
          "", // description
          null, // photoBefore
          null, // photoDetail
          null, // previewBefore
          null, // previewDetail
          true, // isSubmitting
        ]}
      >
        <CreateIssueModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
          locations={mockLocations}
          tags={mockTags}
        />
      </WithMockState>,
    );

    expect(html).toContain("Đang lưu...");
  });

  it("renders detail photo preview thumbnail and active selected tags", () => {
    const html = renderToString(
      <WithMockState
        values={[
          IssueCategory.S3, // category
          "CONDITION", // causeType
          "LINE_A1", // locationCode
          ["S3_01"], // selectedTags
          "Mô tả sự cố", // description
          null, // photoBefore
          null, // photoDetail
          "/api/issues/101/media/before/before.jpg", // previewBefore
          "/api/issues/101/media/detail/detail.jpg", // previewDetail
          false, // isSubmitting
        ]}
      >
        <CreateIssueModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
          locations={mockLocations}
          tags={mockTags}
        />
      </WithMockState>,
    );

    expect(html).toContain("detail.jpg");
    expect(html).toContain("Bẩn thỉu");
  });
});
