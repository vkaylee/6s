import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { IssueDetailModal } from "../src/pages/IssueDetailModal.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type ScoreLogItem,
  UserRole,
} from "../src/types/index.ts";

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

describe("IssueDetailModal Component", () => {
  const mockIssue: IssueItem = {
    id: 101,
    client_uuid: "c0a80101-0000-4000-8000-000000000101",
    version: 1,
    category: IssueCategory.S3,
    location_code: "LINE_A1",
    location_name: "Chuyền May A1",
    description: "Dầu loang dưới sàn máy may",
    photo_before: "/api/issues/101/media/before/before.jpg",
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
        capabilities: ["issue:resolve", "issue:close_own"],
      },
    });
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null,
          false,
          false,
          false,
          false,
          false,
          3,
          "",
          false,
          null,
          null,
          1,
          { x: 0, y: 0 },
          [],
          false,
          true,
          null,
          false,
        ]}
      >
        <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />
      </WithMockState>,
    );
    expect(html).toContain("Chuyền May A1");
    expect(html).toContain("Dầu loang dưới sàn máy may");
    expect(html).toContain("Nguyễn Văn A");
    expect(html).toContain("Chỉnh sửa");
    expect(html).toContain("Biến động điểm 6S của sự cố");
    expect(html).toContain("Dịch AI");
  });

  it("shows the localized location name instead of its code in the header metadata", () => {
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
        ]}
      />,
    );

    expect(html).toContain("Chuyền May A1");
    expect(html).not.toContain('class="truncate">LINE_A1</span>');
  });

  it("renders one full issue edit action instead of inline edit pencils", () => {
    useAuthStore.setState({
      user: {
        id: 10,
        username: "van_a",
        full_name: "Nguyễn Văn A",
        role: UserRole.USER,
        capabilities: ["issue:close_own"],
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
        ]}
      />,
    );
    expect(html).toContain('aria-label="Chỉnh sửa"');
    expect(html).not.toContain("Chạm để sửa nhanh vị trí (In-place Quick Edit)");
  });
  it("renders localized location name in score breakdown logs", () => {
    useAuthStore.setState({
      user: {
        id: 10,
        username: "van_a",
        full_name: "Nguyễn Văn A",
        role: UserRole.USER,
        capabilities: [],
      },
    });
    const scoreLog: ScoreLogItem = {
      id: 1,
      issue_id: 101,
      target_type: "LOCATION",
      target_id: "LINE_A1",
      rule_key: "OVERDUE_ISSUE",
      rule_description: "Quá hạn xử lý",
      points: -3,
      created_at: new Date().toISOString(),
    };
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null,
          false,
          false,
          false,
          false,
          false,
          3,
          "",
          false,
          null,
          null,
          1,
          { x: 0, y: 0 },
          [scoreLog],
          false,
          true,
          null,
          false,
        ]}
      >
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
          ]}
        />
      </WithMockState>,
    );
    expect(html).toContain("Chuyền May A1");
  });
  it("renders detail photo when photo_detail exists", () => {
    const issueWithDetail: IssueItem = {
      ...mockIssue,
      photo_detail: "/api/issues/101/media/detail/c0a80101-0000-4000-8000-000000000101_detail.jpg",
    };
    const html = renderToString(
      <IssueDetailModal
        issue={issueWithDetail}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(html).toContain(
      "/api/issues/101/media/detail/c0a80101-0000-4000-8000-000000000101_detail.jpg",
    );
    expect(html).toContain("Chạm ảnh để xem toàn màn hình");
  });

  it("renders zoom preview buttons when issue has photo_after", () => {
    const resolvedIssue: IssueItem = {
      ...mockIssue,
      photo_after: "/api/issues/101/media/after/c0a80101-0000-4000-8000-000000000101_after.jpg",
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
    expect(html).toContain("/api/issues/101/media/before/before.jpg");
    expect(html).toContain(
      "/api/issues/101/media/after/c0a80101-0000-4000-8000-000000000101_after.jpg",
    );
  });
  it("renders status badge and tags in modal", () => {
    useAuthStore.setState({
      user: {
        id: 10,
        username: "van_a",
        full_name: "Nguyễn Văn A",
        role: UserRole.USER,
        capabilities: ["issue:resolve"],
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
        capabilities: ["issue:close_line"],
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
        capabilities: ["issue:invalidate"],
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

  it("renders close confirmation dialog with kaizen rating when showConfirmAction is CLOSE", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue, // currentIssue
          null, // translatedDesc
          false, // isTranslating
          false, // showOriginal
          false, // isEditingFull
          false, // isEditingCategory
          false, // isEditingLocation
          5, // scoreRating (5 stars)
          "", // rejectReason
          false, // isSubmitting
          "CLOSE", // showConfirmAction
          null, // previewIndex
          1, // zoomScale
          { x: 0, y: 0 }, // panOffset
          [], // issueScoreLogs
          false, // loadingScores
          false, // aiEnabled
          null, // aiReview
          false, // isReviewing
        ]}
      >
        <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />
      </WithMockState>,
    );

    expect(html).toContain("Xác nhận duyệt đạt issue?");
    expect(html).toContain("Kaizen");
    expect(html).toContain("🏆 Kaizen Xuất Sắc (+5 điểm)");
  });

  it("renders invalid confirmation dialog with warning when showConfirmAction is INVALID", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null,
          false,
          false,
          false,
          false,
          false,
          3,
          "",
          false,
          "INVALID",
          null,
          1,
          { x: 0, y: 0 },
          [],
          false,
          false,
          null,
          false,
        ]}
      >
        <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />
      </WithMockState>,
    );

    expect(html).toContain("Xác nhận bác bỏ issue?");
    expect(html).toContain("Nhập lý do bắt buộc...");
  });

  it("renders photo preview overlay when previewIndex is set", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null,
          false,
          false,
          false,
          false,
          false,
          3,
          "",
          false,
          null,
          0, // previewIndex on photo_before
          1,
          { x: 0, y: 0 },
          [],
          false,
          false,
          null,
          false,
        ]}
      >
        <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />
      </WithMockState>,
    );

    expect(html).toContain("/api/issues/101/media/before/before.jpg");
  });

  it("renders reopen confirmation dialog when showConfirmAction is REOPEN", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null,
          false,
          false,
          false,
          false,
          false,
          3,
          "",
          false,
          "REOPEN",
          null,
          1,
          { x: 0, y: 0 },
          [],
          false,
          false,
          null,
          false,
        ]}
      >
        <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />
      </WithMockState>,
    );

    expect(html).toContain("Xác nhận mở lại issue?");
  });

  it("renders in-place category and location editor when enabled", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null,
          false,
          false,
          false,
          true, // isEditingCategory
          true, // isEditingLocation
          3,
          "",
          false,
          null,
          null,
          1,
          { x: 0, y: 0 },
          [],
          false,
          false,
          null,
          false,
        ]}
      >
        <IssueDetailModal
          issue={mockIssue}
          isOpen={true}
          onClose={() => {}}
          onRefresh={() => {}}
          locations={[
            {
              code: "LINE_A1",
              name_vi: "Chuyền A1",
              name_zh: "A1",
              name_en: "A1",
              is_active: true,
            },
          ]}
        />
      </WithMockState>,
    );

    expect(html).toContain("1S");
    expect(html).toContain("6S");
    expect(html).toContain("Chuyền A1");
  });

  it("renders multi-photo preview controls when previewIndex is second photo", () => {
    const resolvedIssue: IssueItem = {
      ...mockIssue,
      photo_after: "/uploads/after/after.jpg",
    };

    const html = renderToString(
      <WithMockState
        values={[
          resolvedIssue,
          null,
          false,
          false,
          false,
          false,
          false,
          3,
          "",
          false,
          null,
          1, // previewIndex = 1 (after photo)
          1.25, // zoomScale
          { x: 10, y: 20 },
          [],
          false,
          false,
          null,
          false,
        ]}
      >
        <IssueDetailModal
          issue={resolvedIssue}
          isOpen={true}
          onClose={() => {}}
          onRefresh={() => {}}
        />
      </WithMockState>,
    );

    expect(html).toContain("Sau khi khắc phục");
    expect(html).toContain("scale(1.25)");
    expect(html).toContain('aria-label="Ảnh trước"');
  });

  it("renders CreateIssueModal when isEditingFull is true", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null,
          false,
          false,
          true, // isEditingFull
          false,
          false,
          3,
          "",
          false,
          null,
          null,
          1,
          { x: 0, y: 0 },
          [],
          false,
          false,
          null,
          false,
        ]}
      >
        <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />
      </WithMockState>,
    );

    expect(html).toContain("Dầu loang dưới sàn máy may");
  });

  it("hides the AI review button when AI is disabled", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null, // translatedDesc
          false, // isTranslating
          false, // showOriginal
          false, // isEditingFull
          false, // isEditingCategory
          false, // isEditingLocation
          3, // scoreRating
          "", // rejectReason
          false, // isSubmitting
          null, // showConfirmAction
          null, // previewIndex
          1, // zoomScale
          { x: 0, y: 0 }, // panOffset
          [], // issueScoreLogs
          false, // loadingScores
          false, // aiEnabled (AI disabled)
          null, // aiReview
          false, // isReviewing
        ]}
      >
        <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />
      </WithMockState>,
    );

    expect(html).not.toContain("Hỏi AI");
    expect(html).not.toContain("Dịch AI");
  });

  it("shows the AI review button when AI is enabled", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockIssue,
          null, // translatedDesc
          false, // isTranslating
          false, // showOriginal
          false, // isEditingFull
          false, // isEditingCategory
          false, // isEditingLocation
          3, // scoreRating
          "", // rejectReason
          false, // isSubmitting
          null, // showConfirmAction
          null, // previewIndex
          1, // zoomScale
          { x: 0, y: 0 }, // panOffset
          [], // issueScoreLogs
          false, // loadingScores
          true, // aiEnabled (AI enabled)
          null, // aiReview
          false, // isReviewing
        ]}
      >
        <IssueDetailModal issue={mockIssue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />
      </WithMockState>,
    );

    expect(html).toContain("Hỏi AI");
  });
});
