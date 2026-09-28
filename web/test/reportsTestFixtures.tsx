import { afterEach, beforeEach } from "bun:test";
import * as React from "react";
import { useAuthStore } from "../src/store/authStore.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationHealthScore,
  type LocationItem,
  type ReporterLeaderboard,
  type ReportSummaryResponse,
  type TagItem,
} from "../src/types/index.ts";

export function WithMockState({
  values,
  children,
}: {
  values: unknown[];
  children: React.ReactNode;
}) {
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

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isOfflineGrace: false,
    isLoading: false,
  });
});

afterEach(async () => {
  await useAuthStore.getState().clearAuth();
  useAuthStore.setState({
    user: null,
    isOfflineGrace: false,
    isLoading: false,
  });
});

export const mockSummary: ReportSummaryResponse = {
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

export const mockLocations: LocationHealthScore[] = [
  {
    location_code: "LINE_A1",
    location_name: "Chuyền may A1",
    health_score: 92,
    open_count: 2,
    overdue_count: 0,
  },
];

export const mockReporters: ReporterLeaderboard[] = [
  { user_id: 10, full_name: "Nguyen Van A", points: 150, valid_count: 30, safety_count: 5 },
];

export const mockMasterLocations: LocationItem[] = [
  {
    code: "LINE_A1",
    name_vi: "Chuyền may A1",
    name_en: "Sewing Line A1",
    name_zh: "车间 A1",
    is_active: true,
  },
];

export const mockMasterTags: TagItem[] = [
  { tag_code: "SAFETY_RISK", category: "6S", label_vi: "Nguy cơ an toàn", label_zh: "安全隐患" },
];

export const drilldownIssue: IssueItem = {
  id: 501,
  client_uuid: "c0a80101-0000-4000-8000-000000000501",
  version: 1,
  creator_id: 10,
  creator_name: "Nguyen Van A",
  category: IssueCategory.S6,
  location_code: "LINE_A1",
  location_name: "Chuyền may A1",
  description: "Dây điện hở dưới sàn",
  status: IssueStatus.OPEN,
  photo_before: "/api/issues/501/media/before/before.jpg",
  created_at: "2026-03-01T00:00:00Z",
  tags: [],
};
