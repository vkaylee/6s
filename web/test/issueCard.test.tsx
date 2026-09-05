import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { IssueCard } from "../src/components/IssueCard.tsx";
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
});
