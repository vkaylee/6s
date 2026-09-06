import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { ReportsPage } from "../src/pages/ReportsPage.tsx";
import {
  IssueCategory,
  type LocationHealthScore,
  type LocationItem,
  type ReporterLeaderboard,
  type ReportSummaryResponse,
  type TagItem,
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

const mockSummary: ReportSummaryResponse = {
  kpi: {
    totalIssues: 42,
    openIssues: 5,
    pendingReviewIssues: 2,
    closedIssues: 35,
    invalidIssues: 0,
    safetyIssues: 3,
    overdueIssues: 1,
    resolutionRate: 83.3,
  },
  categories: [
    { category: IssueCategory.S1, count: 10, percentage: 23.8 },
    { category: IssueCategory.S2, count: 12, percentage: 28.6 },
  ],
  trends: [
    { date: "2026-03-01", created: 5, resolved: 4 },
    { date: "2026-03-02", created: 3, resolved: 5 },
  ],
  topTags: [],
};

const mockLocations: LocationHealthScore[] = [
  {
    location_code: "LINE_A1",
    location_name: "Chuyền may A1",
    health_score: 92,
    open_count: 2,
    overdue_count: 0,
  },
];

const mockReporters: ReporterLeaderboard[] = [
  {
    user_id: 10,
    full_name: "Nguyen Van A",
    points: 150,
    valid_count: 30,
    safety_count: 5,
  },
];

const mockMasterLocations: LocationItem[] = [
  {
    code: "LINE_A1",
    name_vi: "Chuyền may A1",
    name_en: "Sewing Line A1",
    name_zh: "车间 A1",
    is_active: true,
  },
];

const mockMasterTags: TagItem[] = [
  {
    tag_code: "SAFETY_RISK",
    category: "6S",
    label_vi: "Nguy cơ an toàn",
    label_zh: "安全隐患",
  },
];

describe("ReportsPage & Export CSV UI", () => {
  it("renders reports page with executive KPI titles and export button", () => {
    const html = renderToString(
      <Router ssrPath="/reports">
        <ReportsPage />
      </Router>,
    );
    expect(html).toContain("7d");
    expect(html).toContain("14d");
    expect(html).toContain("30d");
    expect(html).toContain('data-testid="btn-export-csv"');
  });

  it("renders LOCATIONS tab with chart and meeting controls when data is loaded", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockSummary,
          mockLocations,
          mockReporters,
          mockMasterLocations,
          mockMasterTags,
          false, // isLoading
          false, // isExporting
          14, // daysRange
          "LOCATIONS", // activeTab
        ]}
      >
        <Router ssrPath="/reports">
          <ReportsPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("LINE_A1");
    expect(html).toContain("Chuyền may A1");
  });

  it("renders PEOPLE tab with reporter leaderboard", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockSummary,
          mockLocations,
          mockReporters,
          mockMasterLocations,
          mockMasterTags,
          false,
          false,
          14,
          "PEOPLE",
        ]}
      >
        <Router ssrPath="/reports">
          <ReportsPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Nguyen Van A");
    expect(html).toContain("150");
  });

  it("renders TRENDS tab with 6S breakdown", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockSummary,
          mockLocations,
          mockReporters,
          mockMasterLocations,
          mockMasterTags,
          false,
          false,
          14,
          "TRENDS",
        ]}
      >
        <Router ssrPath="/reports">
          <ReportsPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("1S");
    expect(html).toContain("2S");
  });

  it("renders drilldown drawer when drilldownType is SAFETY", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockSummary,
          mockLocations,
          mockReporters,
          mockMasterLocations,
          mockMasterTags,
          false, // isLoading
          false, // isExporting
          14, // daysRange
          "LOCATIONS", // activeTab
          5, // locationLimit
          "HEALTH_ASC", // locationSort
          "", // selectedLocationFilter
          false, // isFullscreen
          "SAFETY", // drilldownType
          null, // selectedLocationDrill
          null, // selectedCategoryDrill
          null, // selectedTagDrill
          null, // inspectingIssue
          [], // drilldownIssues
          0, // drilldownTotal
          1, // drilldownPage
          false, // isLoadingDrilldown
        ]}
      >
        <Router ssrPath="/reports">
          <ReportsPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Danh sách sự cố An toàn 6S khẩn cấp");
  });

  it("renders TRENDS empty state and tag drilldown buttons when topTags loaded", () => {
    const html = renderToString(
      <WithMockState
        values={[
          mockSummary,
          mockLocations,
          mockReporters,
          mockMasterLocations,
          mockMasterTags,
          false,
          false,
          14,
          "TRENDS",
          5,
          "HEALTH_ASC",
          "",
          false,
          null, // drilldownType
          null,
          null,
          null,
          null,
          [],
          0,
          1,
          false,
        ]}
      >
        <Router ssrPath="/reports">
          <ReportsPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("1S");
    expect(html).toContain("2S");
  });
});
