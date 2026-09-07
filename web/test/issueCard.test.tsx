import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { IssueCard } from "../src/components/IssueCard.tsx";
import { IssueCardSkeleton } from "../src/components/IssueCardSkeleton.tsx";
import { TagLabel } from "../src/components/TagLabel.tsx";
import { useI18nStore } from "../src/i18n/index.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  resolveTagLabel,
  type TagItem,
} from "../src/types/index.ts";

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
  it("renders deducted points when score logs contain penalties", () => {
    const html = renderToString(
      <IssueCard issue={{ ...mockIssue, score_deducted: 7 }} onClick={() => {}} />,
    );
    expect(html).toContain("-7");
    expect(html).toContain("điểm");
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

  it("renders localized tag labels and falls back to the tag code", () => {
    const localizedTag: TagItem = {
      tag_code: "clutter",
      category: "1S",
      label_vi: "Đồ thừa",
      label_zh: "废弃物",
      label_en: "Clutter",
    };
    const issueWithTags = { ...mockIssue, tags: ["clutter", "unknown_tag"] };

    useI18nStore.getState().setLocale("vi");
    const html = renderToString(
      <IssueCard issue={issueWithTags} tags={[localizedTag]} onClick={() => {}} />,
    );
    expect(html).toContain("Đồ thừa");
    expect(html).toContain("unknown_tag");
    expect(resolveTagLabel(localizedTag, "en")).toBe("Clutter");
    expect(resolveTagLabel(localizedTag, "zh")).toBe("废弃物");
    expect(resolveTagLabel({ tag_code: "unknown_tag" }, "en")).toBe("unknown_tag");
  });

  it("renders TagLabel with localized label and fallback", () => {
    const tag: TagItem = {
      tag_code: "clutter",
      category: "1S",
      label_vi: "Đồ thừa",
      label_zh: "废弃物",
      label_en: "Clutter",
    };
    useI18nStore.getState().setLocale("vi");
    expect(renderToString(<TagLabel code="clutter" tags={[tag]} />)).toContain("Đồ thừa");
    expect(renderToString(<TagLabel code="missing" tags={[tag]} />)).toContain("missing");
  });

  it("renders IssueCardSkeleton placeholder with pulse animation", () => {
    const html = renderToString(<IssueCardSkeleton />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain('data-testid="issue-card-skeleton"');
  });
});
