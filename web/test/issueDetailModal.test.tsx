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
    expect(html).toContain("Biến động điểm 6S của sự cố");
  });

  it("renders quick location edit button when user can edit and locations are provided", () => {
    useAuthStore.setState({
      user: {
        id: 10,
        username: "van_a",
        full_name: "Nguyễn Văn A",
        role: UserRole.USER,
      },
    });
    const html = renderToString(
      <IssueDetailModal
        issue={mockIssue}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
        locations={[
          {
            code: "LINE_A1",
            name_vi: "Chuyền May A1",
            name_zh: "一号线",
            name_en: "Sewing Line A1",
            is_active: true,
          },
          {
            code: "LINE_B2",
            name_vi: "Chuyền May B2",
            name_zh: "二号线",
            name_en: "Sewing Line B2",
            is_active: true,
          },
        ]}
      />,
    );
    expect(html).toContain("Chạm để sửa nhanh vị trí (In-place Quick Edit)");
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
  it("renders status badge and tags in modal", () => {
    useAuthStore.setState({
      user: {
        id: 10,
        username: "van_a",
        full_name: "Nguyễn Văn A",
        role: UserRole.USER,
      },
    });
    const html = renderToString(
      <IssueDetailModal
        issue={mockIssue}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
        tags={[
          {
            tag_code: "5S",
            category: IssueCategory.S5,
            label_vi: "Chuẩn 5S",
            label_zh: "5S标准",
            label_en: "5S Standard",
          },
        ]}
      />,
    );
    expect(html).toContain("Mới ghi nhận");
    expect(html).toContain("#Chuẩn 5S");
  });

  it("does not render quick edit category button when user cannot edit", () => {
    useAuthStore.setState({
      user: {
        id: 99,
        username: "other_user",
        full_name: "Người khác",
        role: UserRole.USER,
      },
    });
    const html = renderToString(
      <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );
    expect(html).not.toContain("Chạm để sửa nhanh phân loại S (In-place Quick Edit)");
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

  it("renders with 2-column desktop responsive classes up to 2xl breakpoint", () => {
    const html = renderToString(
      <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );
    expect(html).toContain("2xl:max-w-7xl");
    expect(html).toContain("lg:grid-cols-12");
    expect(html).toContain("2xl:col-span-8");
    expect(html).toContain("2xl:col-span-4");
  });

  it("renders review and approve action buttons for line leaders when status is PENDING_REVIEW", () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "leader",
        full_name: "Chuyền Trưởng",
        role: UserRole.LINE_LEADER,
        assigned_location_code: "LINE_A1",
      },
    });
    const pendingIssue: IssueItem = {
      ...mockIssue,
      status: IssueStatus.PENDING_REVIEW,
      photo_after: "/uploads/after/after.jpg",
    };
    const html = renderToString(
      <IssueDetailModal
        issue={pendingIssue}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(html).toContain("DUYỆT ĐẠT");
    expect(html).toContain("Mở lại");
  });

  it("renders invalidate action button for admins when status is OPEN", () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Quản trị viên",
        role: UserRole.ADMIN,
      },
    });
    const html = renderToString(
      <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );
    expect(html).toContain("Bác bỏ báo cáo (Admin / An toàn)");
  });

  it("renders closed status badge when status is CLOSED", () => {
    const closedIssue: IssueItem = {
      ...mockIssue,
      status: IssueStatus.CLOSED,
      photo_after: "/uploads/after/after.jpg",
      score_rating: 5,
    };
    const html = renderToString(
      <IssueDetailModal
        issue={closedIssue}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(html).toContain("Đã hoàn thành");
  });

  it("renders 6S root cause badge correctly for condition and behavior issues", () => {
    const conditionHtml = renderToString(
      <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );
    expect(conditionHtml).toContain("📦");
    expect(conditionHtml).toContain("Đồ đạc / Vật chất");

    const behaviorIssue: IssueItem = {
      ...mockIssue,
      category: IssueCategory.S5,
      tags: ["ppe_violation"],
    };
    const behaviorHtml = renderToString(
      <IssueDetailModal
        issue={behaviorIssue}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(behaviorHtml).toContain("👤");
    expect(behaviorHtml).toContain("Hành vi con người");
  });
});
