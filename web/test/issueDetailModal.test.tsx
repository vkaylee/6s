import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { IssueDetailModal } from "../src/pages/IssueDetailModal.tsx";
import { IssueCategory, type IssueItem, IssueStatus } from "../src/types/index.ts";

describe("IssueDetailModal Component", () => {
  const mockIssue: IssueItem = {
    id: 101,
    client_uuid: "c0a80101-0000-4000-8000-000000000101",
    version: 1,
    category: IssueCategory.S3,
    location_code: "LINE_A1",
    location_name: "Chuyền May A1",
    description: "Dầu loang dưới sàn máy may",
    photo_before: "/uploads/before/before.jpg",
    status: IssueStatus.OPEN,
    creator_id: 10,
    creator_name: "Nguyễn Văn A",
    tags: ["5S"],
    created_at: new Date().toISOString(),
  };

  it("returns null when isOpen is false", () => {
    const html = renderToString(
      <IssueDetailModal issue={mockIssue} isOpen={false} onClose={() => {}} onRefresh={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("renders issue details, category and description when isOpen is true", () => {
    const html = renderToString(
      <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );
    expect(html).toContain("Chuyền May A1");
    expect(html).toContain("Dầu loang dưới sàn máy may");
    expect(html).toContain("Nguyễn Văn A");
  });
});
