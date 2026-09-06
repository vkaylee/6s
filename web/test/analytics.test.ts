import { describe, expect, it } from "bun:test";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationHealthScore,
  type TagItem,
} from "../src/types/index.ts";
import {
  calculateCategoryBreakdown,
  calculateIssueTrends,
  calculateKPISummary,
  calculateLocationReports,
  calculateTopTags,
} from "../src/utils/analytics.ts";

describe("Analytics Calculation Engine", () => {
  const baseDate = new Date("2026-09-06T12:00:00Z");

  const mockIssues: IssueItem[] = [
    {
      id: 1,
      client_uuid: "uuid-1",
      version: 1,
      creator_id: 1,
      creator_name: "Worker 1",
      category: IssueCategory.S1,
      location_code: "LINE_A1",
      location_name: "Line A1",
      description: "Trash",
      photo_before: "b1.jpg",
      status: IssueStatus.OPEN,
      created_at: "2026-09-01T10:00:00Z", // > 48h overdue
      tags: ["oil_leak", "scrap_material"],
    },
    {
      id: 2,
      client_uuid: "uuid-2",
      version: 1,
      creator_id: 2,
      creator_name: "Worker 2",
      category: IssueCategory.S6,
      location_code: "LINE_A1",
      location_name: "Line A1",
      description: "Wire hazard",
      photo_before: "b2.jpg",
      status: IssueStatus.PENDING_REVIEW,
      created_at: "2026-09-05T10:00:00Z",
      tags: ["oil_leak"],
    },
    {
      id: 3,
      client_uuid: "uuid-3",
      version: 2,
      creator_id: 1,
      creator_name: "Worker 1",
      category: IssueCategory.S2,
      location_code: "LINE_B2",
      location_name: "Line B2",
      description: "Disordered tools",
      photo_before: "b3.jpg",
      status: IssueStatus.CLOSED,
      created_at: "2026-09-04T08:00:00Z",
      closed_at: "2026-09-05T09:00:00Z",
      tags: [],
    },
  ];

  const mockLocations: LocationHealthScore[] = [
    {
      location_code: "LINE_A1",
      location_name: "Chuyền A1",
      health_score: 85,
      open_count: 2,
      overdue_count: 1,
    },
    {
      location_code: "LINE_B2",
      location_name: "Chuyền B2",
      health_score: 95,
      open_count: 0,
      overdue_count: 0,
    },
  ];

  const mockTags: TagItem[] = [
    {
      tag_code: "oil_leak",
      category: "3S",
      label_vi: "Rò rỉ dầu mỡ",
      label_zh: "漏油",
      name_vi: "Rò rỉ dầu mỡ",
      name_zh: "漏油",
      name_en: "Oil leak",
    },
    {
      tag_code: "scrap_material",
      category: "1S",
      label_vi: "Phế liệu tồn đọng",
      label_zh: "废料",
      name_vi: "Phế liệu tồn đọng",
      name_zh: "废料",
      name_en: "Scrap material",
    },
  ];

  it("calculates KPI summary correctly", () => {
    const kpi = calculateKPISummary(mockIssues, mockLocations);
    expect(kpi.totalIssues).toBe(3);
    expect(kpi.openIssues).toBe(1);
    expect(kpi.pendingReviewIssues).toBe(1);
    expect(kpi.closedIssues).toBe(1);
    expect(kpi.safetyIssues).toBe(1); // Issue 2 is 6S
    expect(kpi.overdueIssues).toBe(1); // Issue 1 is >48h open
    expect(kpi.resolutionRate).toBe(33); // 1 closed out of 3 total valid
    expect(kpi.averageHealthScore).toBe(90); // (85 + 95) / 2
  });

  it("calculates category breakdown percentages", () => {
    const breakdown = calculateCategoryBreakdown(mockIssues);
    expect(breakdown.length).toBe(6);
    const s1 = breakdown.find((b) => b.category === IssueCategory.S1);
    const s6 = breakdown.find((b) => b.category === IssueCategory.S6);
    const s3 = breakdown.find((b) => b.category === IssueCategory.S3);

    expect(s1?.count).toBe(1);
    expect(s6?.count).toBe(1);
    expect(s3?.count).toBe(0);
    expect(s1?.percentage).toBe(33);
  });

  it("calculates location reports sorted by health score ascending", () => {
    const reports = calculateLocationReports(mockLocations, mockIssues);
    expect(reports.length).toBe(2);
    expect(reports[0].location_code).toBe("LINE_A1");
    expect(reports[0].health_score).toBe(85);
    expect(reports[0].total_issues).toBe(2);
    expect(reports[1].location_code).toBe("LINE_B2");
    expect(reports[1].health_score).toBe(95);
    expect(reports[1].total_issues).toBe(1);
  });

  it("calculates top tags ordered by frequency", () => {
    const topTags = calculateTopTags(mockIssues, mockTags);
    expect(topTags.length).toBe(2);
    expect(topTags[0].tag_code).toBe("oil_leak");
    expect(topTags[0].count).toBe(2);
    expect(topTags[1].tag_code).toBe("scrap_material");
    expect(topTags[1].count).toBe(1);
  });

  it("calculates issue trends for date range", () => {
    const trends = calculateIssueTrends(mockIssues, 7, baseDate);
    expect(trends.length).toBe(7);

    // Date 2026-09-04 has 1 created (Issue 3)
    const d4 = trends.find((t) => t.date === "2026-09-04");
    expect(d4?.created).toBe(1);

    // Date 2026-09-05 has 1 created (Issue 2) and 1 resolved (Issue 3 closed_at)
    const d5 = trends.find((t) => t.date === "2026-09-05");
    expect(d5?.created).toBe(1);
    expect(d5?.resolved).toBe(1);
  });
});
