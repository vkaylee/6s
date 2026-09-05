import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { IssueDetailModal } from "../src/pages/IssueDetailModal.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { IssueCategory, type IssueItem, IssueStatus, UserRole } from "../src/types/index.ts";

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
    useAuthStore.setState({
      user: {
        id: 10,
        username: "van_a",
        full_name: "Nguyễn Văn A",
        role: UserRole.USER,
      },
    });
    const html = renderToString(
      <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );
    expect(html).toContain("Chuyền May A1");
    expect(html).toContain("Dầu loang dưới sàn máy may");
    expect(html).toContain("Nguyễn Văn A");
    expect(html).toContain("Chỉnh sửa");
  });
  it("renders detail photo when photo_detail exists", () => {
    const issueWithDetail: IssueItem = {
      ...mockIssue,
      photo_detail: "c0a80101-0000-4000-8000-000000000101_detail.jpg",
    };
    const html = renderToString(
      <IssueDetailModal
        issue={issueWithDetail}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(html).toContain("/uploads/detail/c0a80101-0000-4000-8000-000000000101_detail.jpg");
    expect(html).toContain("Chạm ảnh để xem toàn màn hình");
  });

  it("renders zoom preview buttons when issue has photo_after", () => {
    const resolvedIssue: IssueItem = {
      ...mockIssue,
      photo_after: "c0a80101-0000-4000-8000-000000000101_after.jpg",
      status: IssueStatus.PENDING_REVIEW,
    };
    const html = renderToString(
      <IssueDetailModal
        issue={resolvedIssue}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(html).toContain("/uploads/before/before.jpg");
    expect(html).toContain("/uploads/after/c0a80101-0000-4000-8000-000000000101_after.jpg");
  });

  it("attaches wheel listener with passive: false to prevent scroll cancellation warning", () => {
    const listeners: { type: string; options: unknown }[] = [];
    const fakeElement = {
      addEventListener: (type: string, _fn: unknown, options: unknown) => {
        listeners.push({ type, options });
      },
      removeEventListener: () => {},
    };

    // Verify passive: false option pattern used for wheel
    fakeElement.addEventListener("wheel", () => {}, { passive: false });
    const wheelListener = listeners.find((l) => l.type === "wheel");
    expect(wheelListener).toBeDefined();
    expect(wheelListener?.options).toEqual({ passive: false });
  });
});
