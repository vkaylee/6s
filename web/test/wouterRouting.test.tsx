import { beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { App } from "../src/App.tsx";
import { normalizeTags } from "../src/hooks/useDashboardData.ts";
import { FactoryLocationsPage } from "../src/pages/FactoryLocationsPage.tsx";
import { IssueTagsPage } from "../src/pages/IssueTagsPage.tsx";
import { NotFoundPage } from "../src/pages/NotFoundPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";
import { WithMockState } from "./fixtures/wouterTestHelpers.tsx";

describe("Wouter UX & Routing Verification", () => {
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

  it("renders 404 NotFoundPage directly with proper home link and multilingual header", () => {
    const html = renderToString(
      <Router ssrPath="/non-existent-page">
        <NotFoundPage />
      </Router>,
    );

    expect(html).toContain("404");
    expect(html).toContain("Hệ thống 6S");
    expect(html).toContain('href="/"');
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
    useAuthStore.setState({ user: null });
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
    useAuthStore.setState({ user: null, isLoading: false });
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
          null, // 18. selectedIssue
          { issues: false, masterData: false, leaderboards: false }, // 19. dashboardErrors
          null, // 20. conflictItem
          true, // 21. isSetupOpen
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
        capabilities: ["reports:view"],
      },
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
    expect(tagsHtml).toContain("Danh mục thẻ sự cố");
  });

  it("renders /leaderboard/locations/:code route within App", () => {
    const html = renderToString(
      <Router ssrPath="/leaderboard/locations/LINE_A1">
        <App />
      </Router>,
    );
    expect(html).toContain("LINE_A1");
  });

  it("hides health gauge, leaderboard and score ledger from users without reports:view", () => {
    useAuthStore.setState({
      user: {
        id: 2,
        username: "worker",
        full_name: "Worker",
        role: UserRole.USER,
        capabilities: [],
      },
    });

    const dashboardHtml = renderToString(
      <WithMockState
        values={[
          [], // issues
          [], // locations
          [], // tags
          [
            {
              location_code: "LINE_A1",
              location_name: "Chuyền may A1",
              health_score: 95,
              open_count: 1,
              overdue_count: 0,
            },
          ], // locationHealth
          [], // reporters
          "LOCATIONS", // leaderboardTab
        ]}
      >
        <Router ssrPath="/">
          <App />
        </Router>
      </WithMockState>,
    );
    expect(dashboardHtml).not.toContain("Sức khỏe 6S xưởng");
    expect(dashboardHtml).not.toContain("Chuyền may A1");

    const ledgerHtml = renderToString(
      <Router ssrPath="/leaderboard/locations/LINE_A1">
        <App />
      </Router>,
    );
    expect(ledgerHtml).toContain("Không có quyền truy cập");
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
