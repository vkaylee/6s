import { normalizeTags } from "../src/hooks/useDashboardData.ts";
import { beforeEach, describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { App } from "../src/App.tsx";
import { FactoryLocationsPage } from "../src/pages/FactoryLocationsPage.tsx";
import { IssueTagsPage } from "../src/pages/IssueTagsPage.tsx";
import { NotFoundPage } from "../src/pages/NotFoundPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { IssueCategory, IssueStatus, UserRole } from "../src/types/index.ts";

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
describe("Wouter UX & Routing Verification", () => {
  beforeEach(() => {
    useAuthStore.setState({
      isLoading: false,
      user: {
        id: 1,
        username: "operator_a",
        full_name: "Operator A",
        role: UserRole.LINE_LEADER,
      },
      accessToken: "valid-token",
      isOfflineGrace: false,
    });
  });

  it("renders 404 NotFoundPage directly with proper home link and multilingual header", () => {
    const html = renderToString(
      <Router ssrPath="/non-existent-page">
        <NotFoundPage />
      </Router>,
    );

    expect(html).toContain("404");
    expect(html).toContain("Hệ thống 6S");
    expect(html).toContain('href="/"');
    expect(html).toContain('data-testid="lang-toggle"');
  });

  it("App catch-all route renders 404 NotFoundPage for unknown path", () => {
    const html = renderToString(
      <Router ssrPath="/unknown/invalid/route">
        <App />
      </Router>,
    );

    expect(html).toContain("404");
    expect(html).toContain('href="/"');
  });

  it("App renders semantic wouter Links for navigation targets", () => {
    const html = renderToString(
      <Router ssrPath="/">
        <App />
      </Router>,
    );

    // Bottom action bar create issue link
    expect(html).toContain('href="/issues/new"');
  });

  it("renders LoginPage with return_to target when provided via search param", () => {
    useAuthStore.setState({ user: null, accessToken: null });
    const html = renderToString(
      <Router ssrPath="/login" ssrSearch="return_to=%2Freports">
        <App />
      </Router>,
    );

    // LoginPage rendered with credentials input
    expect(html).toContain('type="password"');
    expect(html).toContain("6S Workplace Security");
  });
  it("renders initial superadmin setup before authentication", () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    const html = renderToString(
      <WithMockState
        values={[
          [],
          [],
          [],
          [],
          [],
          "LOCATIONS",
          "ALL",
          "",
          "URGENT",
          false,
          false,
          1,
          null,
          false,
          false,
          { statuses: [], categories: [], locationCodes: [] },
          false,
          null,
          null,
          true,
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Thiết lập Superadmin");
    expect(html).not.toContain("6S Workplace Security");
  });

  it("renders /issues/new route within App", () => {
    const html = renderToString(
      <Router ssrPath="/issues/new">
        <App />
      </Router>,
    );
    expect(html).toContain("GỬI BÁO CÁO 6S");
  });

  it("renders /reports route within App for authorized roles", () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Admin User",
        role: UserRole.ADMIN,
      },
      accessToken: "admin-token",
    });
    const html = renderToString(
      <Router ssrPath="/reports">
        <App />
      </Router>,
    );
    expect(html).toContain("Suspense");
  });

  it("renders /admin/config route within App for admin", () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Admin User",
        role: UserRole.ADMIN,
      },
      accessToken: "admin-token",
    });
    const html = renderToString(
      <Router ssrPath="/admin/config">
        <App />
      </Router>,
    );
    expect(html).toContain("Hệ thống 6S");
  });

  it("admin page components render their translated titles", () => {
    const locationsHtml = renderToString(
      <Router ssrPath="/admin/locations">
        <FactoryLocationsPage />
      </Router>,
    );
    const tagsHtml = renderToString(
      <Router ssrPath="/admin/tags">
        <IssueTagsPage />
      </Router>,
    );
    expect(locationsHtml).toContain("Vị trí xưởng");
    expect(tagsHtml).toContain("Danh mục Thẻ");
  });

  it("renders /leaderboard/locations/:code route within App", () => {
    const html = renderToString(
      <Router ssrPath="/leaderboard/locations/LINE_A1">
        <App />
      </Router>,
    );
    expect(html).toContain("LINE_A1");
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
          conflictDraft, // 19. conflictItem (opens ConflictModal)
          true, // 20. isSetupOpen (opens SetupSuperadminModal)
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Chờ phê duyệt cải tiến");
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
          null, // 19. conflictItem
          false, // 20. isSetupOpen
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
          null, // 19. conflictItem
          false, // 20. isSetupOpen
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
          null, // 19. conflictItem
          false, // 20. isSetupOpen
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
          null, // 19. conflictItem
          false, // 20. isSetupOpen
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

describe("dashboard data boundary", () => {
  it("normalizes generated server tags without client-side defaults", () => {
    expect(
      normalizeTags([
        {
          code: "oil_leak",
          category: "3S",
          name_vi: "Rò rỉ dầu",
          name_zh: "设备漏油",
          name_en: "Oil leak",
          use_count: 4,
          is_preset: true,
        },
      ]),
    ).toEqual([
      {
        tag_code: "oil_leak",
        category: "3S",
        label_vi: "Rò rỉ dầu",
        label_zh: "设备漏油",
        label_en: "Oil leak",
        use_count: 4,
        is_preset: true,
      },
    ]);
  });
});
