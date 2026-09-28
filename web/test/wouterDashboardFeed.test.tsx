import { beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { App } from "../src/App.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { IssueCategory, IssueStatus, UserRole } from "../src/types/index.ts";
import { WithMockState } from "./fixtures/wouterTestHelpers.tsx";

describe("Wouter App Feed & Facet Routing Verification", () => {
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

  it("renders populated issues and leaderboard items in App main feed", () => {
    const mockIssue = {
      id: 55,
      client_uuid: "uuid-55",
      location_code: "LINE_A1",
      category: IssueCategory.S1,
      description: "Lối đi bị cản trở bởi thùng hàng",
      status: IssueStatus.OPEN,
      photo_before: "blob:mock",
      reporter_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      tags: [],
    };

    const mockLocHealth = [
      {
        location_code: "LINE_A1",
        location_name: "Chuyền may A1",
        health_score: 95,
        open_count: 1,
        overdue_count: 0,
      },
    ];

    const mockReporter = [
      {
        user_id: 1,
        full_name: "Nguyen Van A",
        points: 80,
        valid_count: 12,
        safety_count: 2,
      },
    ];

    const html = renderToString(
      <WithMockState
        values={[
          [mockIssue], // issues
          [], // locations
          [], // tags
          mockLocHealth, // locationHealth
          mockReporter, // reporters
          "LOCATIONS", // leaderboardTab
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Lối đi bị cản trở bởi thùng hàng");
    expect(html).toContain("Chuyền may A1");
    expect(html).toContain("95");
  });

  it("renders reporters leaderboard tab in App main feed", () => {
    const mockReporter = [
      {
        user_id: 1,
        full_name: "Nguyen Van A",
        points: 80,
        valid_count: 12,
        safety_count: 2,
      },
    ];

    const html = renderToString(
      <WithMockState
        values={[
          [], // issues
          [], // locations
          [], // tags
          [], // locationHealth
          mockReporter, // reporters
          "REPORTERS", // leaderboardTab
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Nguyen Van A");
    expect(html).toContain("80");
  });

  it("renders App with SAFETY_6S facet, search query, NEWEST sort and pagination", () => {
    const mockIssue = {
      id: 101,
      client_uuid: "uuid-101",
      creator_id: 1,
      location_code: "LINE_A1",
      location_name: "Chuyền may A1",
      category: IssueCategory.S6,
      description: "Nguy cơ cháy nổ chập điện",
      status: IssueStatus.OPEN,
      photo_before: "blob:mock",
      created_at: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      tags: ["fire_hazard"],
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
          "SAFETY_6S", // 7. activeFacet
          "cháy nổ", // 8. searchQuery
          "NEWEST", // 9. sortOrder
          false, // 10. isLoadingIssues
          false, // 11. isLoadingMore
          1, // 12. issuePage
          { page: 1, limit: 20, total: 45 }, // 13. paginationMeta
          false, // 14. showAllLeaderboard
          false, // 15. isFilterDrawerOpen
          { statuses: [], categories: [], locationCodes: [] }, // 16. advancedFilters
          false, // 17. isDrawerOpen
          null, // 18. selectedIssue
          null, // 19. conflictItem
          false, // 20. isSetupOpen
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Nguy cơ cháy nổ chập điện");
  });

  it("renders App with OVERDUE_48H facet, filter drawer open, and showAllLeaderboard", () => {
    const overdueIssue = {
      id: 102,
      client_uuid: "uuid-102",
      creator_id: 1,
      location_code: "LINE_A1",
      location_name: "Chuyền may A1",
      category: IssueCategory.S1,
      description: "Vật tư quá hạn 48h chưa xử lý",
      status: IssueStatus.OPEN,
      photo_before: "blob:mock",
      created_at: new Date(Date.now() - 60 * 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      tags: [],
    };

    const html = renderToString(
      <WithMockState
        values={[
          [overdueIssue], // 1. issues
          [], // 2. locations
          [], // 3. tags
          [], // 4. locationHealth
          [], // 5. reporters
          "LOCATIONS", // 6. leaderboardTab
          "OVERDUE_48H", // 7. activeFacet
          "", // 8. searchQuery
          "OLDEST", // 9. sortOrder
          false, // 10. isLoadingIssues
          false, // 11. isLoadingMore
          1, // 12. issuePage
          null, // 13. paginationMeta
          true, // 14. showAllLeaderboard
          true, // 15. isFilterDrawerOpen
          { statuses: ["OPEN"], categories: ["1S"], locationCodes: ["LINE_A1"] }, // 16. advancedFilters
          false, // 17. isDrawerOpen
          null, // 18. selectedIssue
          null, // 19. conflictItem
          false, // 20. isSetupOpen
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Vật tư quá hạn 48h chưa xử lý");
  });

  it("renders App with WAITING_MY_REVIEW, selectedIssue modal open, and conflict modal", () => {
    const reviewIssue = {
      id: 103,
      client_uuid: "uuid-103",
      creator_id: 1,
      location_code: "LINE_A1",
      location_name: "Chuyền may A1",
      category: IssueCategory.S2,
      description: "Chờ phê duyệt cải tiến",
      status: IssueStatus.PENDING_REVIEW,
      photo_before: "blob:mock",
      photo_after: "blob:mock-after",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      tags: [],
    };

    const conflictDraft = {
      client_uuid: "uuid-103",
      issue_id: 103,
      resolved_client_uuid: "uuid-res",
      expected_version: 1,
      photo_after_blob: new Blob(["dummy"]),
      server_issue: reviewIssue,
    };

    const html = renderToString(
      <WithMockState
        values={[
          [reviewIssue], // 1. issues
          [], // 2. locations
          [], // 3. tags
          [], // 4. locationHealth
          [], // 5. reporters
          "LOCATIONS", // 6. leaderboardTab
          "WAITING_MY_REVIEW", // 7. activeFacet
          "", // 8. searchQuery
          "URGENT", // 9. sortOrder
          false, // 10. isLoadingIssues
          false, // 11. isLoadingMore
          1, // 12. issuePage
          null, // 13. paginationMeta
          false, // 14. showAllLeaderboard
          false, // 15. isFilterDrawerOpen
          { statuses: [], categories: [], locationCodes: [] }, // 16. advancedFilters
          false, // 17. isDrawerOpen
          reviewIssue, // 18. selectedIssue (opens IssueDetailModal)
          { issues: false, masterData: false, leaderboards: false }, // 19. dashboardErrors
          conflictDraft, // 20. conflictItem (opens ConflictModal)
          true, // 21. isSetupOpen (opens SetupSuperadminModal)
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Chờ phê duyệt cải tiến");
  });

  it("renders IssueDetailModal over leaderboard route when selectedIssue is present", () => {
    const reviewIssue = {
      id: 102,
      client_uuid: "uuid-102",
      location_code: "LINE_A1",
      category: IssueCategory.S3,
      description: "Thùng dầu rò rỉ tại khu vực leaderboard",
      status: IssueStatus.PENDING_REVIEW,
      photo_before: "blob:mock-before",
      photo_after: "blob:mock-after",
      reporter_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
      tags: [],
    };

    const html = renderToString(
      <WithMockState
        values={[
          [reviewIssue], // 1. issues
          [], // 2. locations
          [], // 3. tags
          [], // 4. locationHealth
          [], // 5. reporters
          "LOCATIONS", // 6. leaderboardTab
          "ALL", // 7. activeFacet
          "", // 8. searchQuery
          "URGENT", // 9. sortOrder
          false, // 10. isLoadingIssues
          false, // 11. isLoadingMore
          1, // 12. issuePage
          null, // 13. paginationMeta
          false, // 14. showAllLeaderboard
          false, // 15. isFilterDrawerOpen
          { statuses: [], categories: [], locationCodes: [] }, // 16. advancedFilters
          false, // 17. isDrawerOpen
          reviewIssue, // 18. selectedIssue (opens IssueDetailModal)
          { issues: false, masterData: false, leaderboards: false }, // 19. dashboardErrors
          null, // 20. conflictItem
          false, // 21. isSetupOpen
        ]}
      >
        <Router ssrPath="/leaderboard/locations/LINE_A1">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("LINE_A1");
    expect(html).toContain("Thùng dầu rò rỉ tại khu vực leaderboard");
  });
});
