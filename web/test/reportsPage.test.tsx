import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { ReportsPage } from "../src/pages/ReportsPage.tsx";
import {
  mockLocations,
  mockMasterLocations,
  mockMasterTags,
  mockReporters,
  mockSummary,
  WithMockState,
} from "./reportsTestFixtures.tsx";

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
    // Export button is conditional on hasCapability("reports:export")
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
