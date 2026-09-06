import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { CreateIssueModal } from "../src/pages/CreateIssueModal.tsx";
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
  photo_before: "before-101.jpg",
  photo_detail: "detail-101.jpg",
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
});
