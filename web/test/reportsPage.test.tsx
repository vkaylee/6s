import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { downloadReportsXlsx, ReportsPage } from "../src/pages/ReportsPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import {
  IssueCategory,
  type LocationHealthScore,
  type LocationItem,
  type ReporterLeaderboard,
  type ReportSummaryResponse,
  type TagItem,
  UserRole,
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
const defaultGetRefreshToken = useAuthStore.getState().getRefreshToken;

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isOfflineGrace: false,
    isLoading: false,
    getRefreshToken: defaultGetRefreshToken,
  });
});

afterEach(async () => {
  await useAuthStore.getState().clearAuth();
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isOfflineGrace: false,
    isLoading: false,
    getRefreshToken: defaultGetRefreshToken,
  });
});

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

  it("refreshes expired access token and proceeds with XLSX download", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Super Admin",
        role: UserRole.ADMIN,
      },
      accessToken: "expired-jwt-token",
      getRefreshToken: async () => "valid-refresh-token",
    });

    const calls: { url: string; authHeader: string }[] = [];
    let clicked = false;
    let downloadedFilename = "";

    const mockAnchor = {
      href: "",
      download: "",
      click: () => {
        clicked = true;
        downloadedFilename = mockAnchor.download;
      },
      remove: () => {},
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => (tag === "a" ? mockAnchor : {}),
      body: { appendChild: () => {} },
    };

    (globalThis as unknown as { window: unknown }).window = {
      URL: {
        createObjectURL: () => "blob:mock-xlsx-data",
        revokeObjectURL: () => {},
      },
    };

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const parsedUrl = new URL(rawUrl, "http://localhost");
      const url = `${parsedUrl.pathname}${parsedUrl.search}`;
      const authHeader = new Headers(init?.headers).get("Authorization") ?? "";
      calls.push({ url, authHeader });

      if (url === "/api/auth/refresh") {
        return new Response(
          JSON.stringify({
            data: {
              access_token: "refreshed-jwt-token",
              refresh_token: "new-refresh-token",
              user: { id: 1, username: "admin", full_name: "Super Admin", role: UserRole.ADMIN },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.startsWith("/api/issues/export")) {
        if (authHeader === "Bearer expired-jwt-token") {
          return new Response(
            JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Token expired" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        if (authHeader === "Bearer refreshed-jwt-token") {
          return new Response("PK\x03\x04mock xlsx content", {
            status: 200,
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": 'attachment; filename="6S_Issues_Export.xlsx"',
            },
          });
        }
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    try {
      await downloadReportsXlsx("LINE_A1");
      expect(calls.length).toBe(3);
      expect(calls[0].url).toBe("/api/issues/export?location_code=LINE_A1");
      expect(calls[0].authHeader).toBe("Bearer expired-jwt-token");
      expect(calls[1].url).toBe("/api/auth/refresh");
      expect(calls[2].url).toBe("/api/issues/export?location_code=LINE_A1");
      expect(calls[2].authHeader).toBe("Bearer refreshed-jwt-token");
      expect(clicked).toBe(true);
      expect(downloadedFilename).toMatch(/^6S_Report_\d{4}-\d{2}-\d{2}\.xlsx$/);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as unknown as { window: unknown }).window = originalWindow;
      (globalThis as unknown as { document: unknown }).document = originalDocument;
      await useAuthStore.getState().clearAuth();
    }
  });

  it("aborts download when token refresh fails on 401", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    useAuthStore.setState({
      user: {
        id: 2,
        username: "officer",
        full_name: "Safety Officer",
        role: UserRole.SAFETY_OFFICER,
      },
      accessToken: "expired-token",
      getRefreshToken: async () => "invalid-refresh-token",
    });

    let clicked = false;
    const mockAnchor = {
      href: "",
      download: "",
      click: () => {
        clicked = true;
      },
      remove: () => {},
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => (tag === "a" ? mockAnchor : {}),
      body: { appendChild: () => {} },
    };

    (globalThis as unknown as { window: unknown }).window = {
      URL: {
        createObjectURL: () => "blob:should-not-exist",
        revokeObjectURL: () => {},
      },
    };

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/auth/refresh") {
        return new Response(JSON.stringify({ error: { message: "Refresh token revoked" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Unauthorized", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(downloadReportsXlsx()).rejects.toThrow();
      expect(clicked).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as unknown as { window: unknown }).window = originalWindow;
      (globalThis as unknown as { document: unknown }).document = originalDocument;
      await useAuthStore.getState().clearAuth();
    }
  });

  it("aborts download on 403 Forbidden without creating a download link", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    useAuthStore.setState({
      user: {
        id: 3,
        username: "user_worker",
        full_name: "Regular Worker",
        role: UserRole.USER,
      },
      accessToken: "worker-valid-token",
    });

    let clicked = false;
    const mockAnchor = {
      href: "",
      download: "",
      click: () => {
        clicked = true;
      },
      remove: () => {},
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => (tag === "a" ? mockAnchor : {}),
      body: { appendChild: () => {} },
    };

    (globalThis as unknown as { window: unknown }).window = {
      URL: {
        createObjectURL: () => "blob:forbidden-error-body",
        revokeObjectURL: () => {},
      },
    };

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: { code: "FORBIDDEN", message: "Forbidden: role insufficient" } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    try {
      await expect(downloadReportsXlsx()).rejects.toThrow();
      expect(clicked).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as unknown as { window: unknown }).window = originalWindow;
      (globalThis as unknown as { document: unknown }).document = originalDocument;
      await useAuthStore.getState().clearAuth();
    }
  });
});
