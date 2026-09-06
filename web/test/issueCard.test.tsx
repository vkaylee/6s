import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { IssueCard } from "../src/components/IssueCard.tsx";
import { IssueCardSkeleton } from "../src/components/IssueCardSkeleton.tsx";
import { IssueCategory, type IssueItem, IssueStatus } from "../src/types/index.ts";

describe("IssueCard Component", () => {
  const mockIssue: IssueItem = {
    id: 1,
    client_uuid: "uuid-1",
    version: 1,
    creator_id: 1,
    creator_name: "Thợ A",
    category: IssueCategory.S2,
    status: IssueStatus.CLOSED,
    location_code: "A1",
    location_name: "Khu vực A1",
    description: "Cái quạt hỏng",
    photo_before: "test.jpg",
    created_at: new Date().toISOString(),
    tags: [],
  };

  it("renders location, status badge, and photo with accessible focus", () => {
    const html = renderToString(<IssueCard issue={mockIssue} onClick={() => {}} />);
    expect(html).toContain("Khu vực A1");
    expect(html).toContain("Thợ A");
    expect(html).toContain("A1");
    expect(html).toContain("Cái quạt hỏng");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("h-15");
  });

  it("omits bullet separator when creator_name is missing", () => {
    const withoutCreator = { ...mockIssue, creator_name: "" };
    const html = renderToString(<IssueCard issue={withoutCreator} onClick={() => {}} />);
    expect(html).toContain("A1");
    expect(html).not.toContain("•");
  });

  it("renders both before and after photos when photo_after is present", () => {
    const issueWithAfter: IssueItem = {
      ...mockIssue,
      status: IssueStatus.PENDING_REVIEW,
      photo_after: "after.jpg",
      resolver_name: "Thợ Sửa B",
    };
    const html = renderToString(<IssueCard issue={issueWithAfter} onClick={() => {}} />);
    expect(html).toContain("after.jpg");
    expect(html).toContain("Thợ Sửa B");
  });

  it("renders +1 badge when photo_detail is present without photo_after", () => {
    const issueWithDetail: IssueItem = {
      ...mockIssue,
      status: IssueStatus.OPEN,
      photo_detail: "detail.jpg",
    };
    const html = renderToString(<IssueCard issue={issueWithDetail} onClick={() => {}} />);
    expect(html).toContain("+1");
    expect(html).toContain("lucide-camera");
  });

  it("renders SLA overdue badge when open issue is older than 48 hours", () => {
    const overdueIssue: IssueItem = {
      ...mockIssue,
      status: IssueStatus.OPEN,
      created_at: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
    };
    const html = renderToString(<IssueCard issue={overdueIssue} onClick={() => {}} />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("bg-rose-600");
  });

  it("renders IssueCardSkeleton placeholder with pulse animation", () => {
    const html = renderToString(<IssueCardSkeleton />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain('data-testid="issue-card-skeleton"');
  });
});
