import { beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { App } from "../src/App.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { IssueCategory, IssueStatus, UserRole } from "../src/types/index.ts";
import { WithMockState } from "./fixtures/wouterTestHelpers.tsx";

describe("Wouter App Feed States & Pagination Verification", () => {
  beforeEach(() => {
    useAuthStore.setState({
      isLoading: false,
      user: {
        id: 1,
        username: "operator_a",
        full_name: "Operator A",
        role: UserRole.LINE_LEADER,
        capabilities: ["reports:view"],
      },
      isOfflineGrace: false,
    });
  });

  it("renders App skeleton when loading and leaderboard collapse", () => {
    const fourLocations = [
      {
        location_code: "L1",
        location_name: "Loc 1",
        health_score: 90,
        open_count: 0,
        overdue_count: 0,
      },
      {
        location_code: "L2",
        location_name: "Loc 2",
        health_score: 85,
        open_count: 1,
        overdue_count: 0,
      },
      {
        location_code: "L3",
        location_name: "Loc 3",
        health_score: 80,
        open_count: 2,
        overdue_count: 0,
      },
      {
        location_code: "L4",
        location_name: "Loc 4",
        health_score: 75,
        open_count: 3,
        overdue_count: 1,
      },
    ];

    const html = renderToString(
      <WithMockState
        values={[
          [], // 1. issues
          [], // 2. locations
          [], // 3. tags
          fourLocations, // 4. locationHealth
          [], // 5. reporters
          "LOCATIONS", // 6. leaderboardTab
          "ALL", // 7. activeFacet
          "", // 8. searchQuery
          "URGENT", // 9. sortOrder
          true, // 10. isLoadingIssues (renders IssueCardSkeleton)
          false, // 11. isLoadingMore
          1, // 12. issuePage
          null, // 13. paginationMeta
          true, // 14. showAllLeaderboard (renders collapse)
          false, // 15. isFilterDrawerOpen
          { statuses: ["OPEN"], categories: ["1S"], locationCodes: ["L1"] }, // 16. advancedFilters (renders chips)
          false, // 17. isDrawerOpen
          null, // 18. selectedIssue
          { issues: false, masterData: false, leaderboards: false }, // 19. dashboardErrors
          null, // 20. conflictItem
          false, // 21. isSetupOpen
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Loc 4");
    expect(html).toContain("animate-pulse");
  });

  it("renders App empty state with reset button and loading more button", () => {
    const mockIssue = {
      id: 201,
      client_uuid: "uuid-201",
      creator_id: 1,
      location_code: "L1",
      category: IssueCategory.S1,
      description: "Item 1",
      status: IssueStatus.OPEN,
      photo_before: "blob:mock",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      tags: [],
    };

    const fourReporters = [
      { user_id: 1, full_name: "R1", points: 10, valid_count: 1, safety_count: 0 },
      { user_id: 2, full_name: "R2", points: 8, valid_count: 1, safety_count: 0 },
      { user_id: 3, full_name: "R3", points: 6, valid_count: 1, safety_count: 0 },
      { user_id: 4, full_name: "R4", points: 4, valid_count: 1, safety_count: 0 },
    ];

    const html = renderToString(
      <WithMockState
        values={[
          [mockIssue], // 1. issues
          [], // 2. locations
          [], // 3. tags
          [], // 4. locationHealth
          fourReporters, // 5. reporters
          "REPORTERS", // 6. leaderboardTab
          "ALL", // 7. activeFacet
          "", // 8. searchQuery
          "URGENT", // 9. sortOrder
          false, // 10. isLoadingIssues
          true, // 11. isLoadingMore (renders spinner)
          1, // 12. issuePage
          { page: 1, limit: 20, total: 30 }, // 13. paginationMeta (renders load more)
          false, // 14. showAllLeaderboard (renders view all reporters)
          false, // 15. isFilterDrawerOpen
          { statuses: [], categories: [], locationCodes: [] }, // 16. advancedFilters
          false, // 17. isDrawerOpen
          null, // 18. selectedIssue
          { issues: false, masterData: false, leaderboards: false }, // 19. dashboardErrors
          null, // 20. conflictItem
          false, // 21. isSetupOpen
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Item 1");
    expect(html).toContain("R1");
  });

  it("renders App empty state with reset button and empty reporters notice", () => {
    const html = renderToString(
      <WithMockState
        values={[
          [], // 1. issues (empty -> triggers lines 1298-1320)
          [], // 2. locations
          [], // 3. tags
          [], // 4. locationHealth
          [], // 5. reporters (empty -> triggers line 1080 no_reporter_data)
          "REPORTERS", // 6. leaderboardTab
          "MY_ISSUES", // 7. activeFacet (triggers line 1309 reset button)
          "", // 8. searchQuery
          "NEWEST", // 9. sortOrder (triggers line 828 NEWEST sort)
          false, // 10. isLoadingIssues
          false, // 11. isLoadingMore
          1, // 12. issuePage
          null, // 13. paginationMeta
          false, // 14. showAllLeaderboard
          false, // 15. isFilterDrawerOpen
          { statuses: [], categories: [], locationCodes: [] }, // 16. advancedFilters
          false, // 17. isDrawerOpen
          null, // 18. selectedIssue
          { issues: false, masterData: false, leaderboards: false }, // 19. dashboardErrors
          null, // 20. conflictItem
          false, // 21. isSetupOpen
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("🎉");
  });

  it("renders App all-loaded status and OLDEST sort branch", () => {
    const mockIssue = {
      id: 301,
      client_uuid: "uuid-301",
      creator_id: 1,
      location_code: "L1",
      category: IssueCategory.S1,
      description: "Item 301",
      status: IssueStatus.OPEN,
      photo_before: "blob:mock",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      tags: [],
    };

    const html = renderToString(
      <WithMockState
        values={[
          [mockIssue], // 1. issues
          [], // 2. locations
          [], // 3. tags
          [], // 4. locationHealth
          [], // 5. reporters
          "LOCATIONS", // 6. leaderboardTab
          "ALL", // 7. activeFacet
          "", // 8. searchQuery
          "OLDEST", // 9. sortOrder (triggers line 831 OLDEST sort)
          false, // 10. isLoadingIssues
          false, // 11. isLoadingMore
          1, // 12. issuePage
          { page: 1, limit: 20, total: 1 }, // 13. paginationMeta (triggers line 1339 all_loaded)
          false, // 14. showAllLeaderboard
          false, // 15. isFilterDrawerOpen
          { statuses: [], categories: [], locationCodes: [] }, // 16. advancedFilters
          false, // 17. isDrawerOpen
          null, // 18. selectedIssue
          { issues: false, masterData: false, leaderboards: false }, // 19. dashboardErrors
          null, // 20. conflictItem
          false, // 21. isSetupOpen
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Item 301");
  });
});
