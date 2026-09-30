import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { AppLeaderboardsWidget } from "../src/layout/AppLeaderboardsWidget.tsx";

describe("AppLeaderboardsWidget mobile UI/UX optimization", () => {
  const dummyT = (key: string, params?: Record<string, string | number>) => {
    if (key === "leaderboard.location_health") return "Sức khỏe khu vực";
    if (key === "leaderboard.top_reporters") return "Top Thợ săn 6S";
    if (key === "leaderboard.cycle_weekly") return "Chu kỳ tuần (từ Thứ Hai)";
    if (key === "leaderboard.cycle_monthly") return "Chu kỳ tháng";
    if (key === "health_gauge.overdue_count") return "Quá hạn >48h: {count}";
    if (key === "status.OPEN") return "Mới ghi nhận";
    if (key === "leaderboard.points_unit") return "điểm";
    if (key === "leaderboard.issues_unit") return "sự cố";
    if (key === "leaderboard.view_history") return "Xem lịch sử";
    if (key === "leaderboard.view_all") return `Xem tất cả (${params?.count ?? 0})`;
    return key;
  };

  it("renders location health items with mobile-first responsive layout to prevent text clipping", () => {
    const mockLocations = [
      {
        location_code: "LOC_CUTTING_01",
        location_name: "Xưởng Cắt May 01",
        health_score: 85,
        open_count: 5,
        overdue_count: 2,
      },
    ];

    const html = renderToString(
      <Router ssrPath="/">
        <AppLeaderboardsWidget
          locationHealth={mockLocations}
          reporters={[]}
          locations={[]}
          locale="vi"
          leaderboardTab="LOCATIONS"
          setLeaderboardTab={() => {}}
          showAllLeaderboard={false}
          setShowAllLeaderboard={() => {}}
          dashboardErrors={{ issues: false, masterData: false, leaderboards: false }}
          retryLeaderboards={() => {}}
          t={dummyT}
        />
      </Router>,
    );
    // Verify location title renders
    expect(html).toContain("Xưởng Cắt May 01");
    // Verify badge texts render
    expect(html).toContain("Quá hạn");
    expect(html).toContain("Mới ghi nhận");
    expect(html).toContain("85");
    expect(html).toContain("điểm");
    // Verify responsive stacking classes to protect title width
    expect(html).toContain(
      "min-w-0 flex-1 space-y-1 sm:space-y-0 sm:flex sm:items-center sm:gap-2",
    );
    expect(html).toContain("whitespace-nowrap");
  });

  it("renders reporter items with mobile-friendly stacking", () => {
    const mockReporters = [
      {
        user_id: 10,
        full_name: "Nguyễn Văn Hoàng",
        points: 120,
        valid_count: 14,
        safety_count: 1,
      },
    ];

    const html = renderToString(
      <Router ssrPath="/">
        <AppLeaderboardsWidget
          locationHealth={[]}
          reporters={mockReporters}
          locations={[]}
          locale="vi"
          leaderboardTab="REPORTERS"
          setLeaderboardTab={() => {}}
          showAllLeaderboard={false}
          setShowAllLeaderboard={() => {}}
          dashboardErrors={{ issues: false, masterData: false, leaderboards: false }}
          retryLeaderboards={() => {}}
          t={dummyT}
        />
      </Router>,
    );

    expect(html).toContain("Nguyễn Văn Hoàng");
    expect(html).toContain("120");
    expect(html).toContain("điểm");
    expect(html).toContain("14");
    expect(html).toContain("sự cố");
    expect(html).toContain(
      "min-w-0 flex-1 space-y-0.5 sm:space-y-0 sm:flex sm:items-center sm:gap-2",
    );
  });
});
