import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { ScoreLedgerPage } from "../src/pages/ScoreLedgerPage.tsx";
import type { ScoreLogItem } from "../src/types/index.ts";

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
describe("ScoreLedgerPage", () => {
  it("renders location header, summary and navigation controls", () => {
    const html = renderToString(
      <Router ssrPath="/leaderboard/locations/LINE_A1">
        <ScoreLedgerPage targetType="LOCATION" id="LINE_A1" />
      </Router>,
    );

    expect(html).toContain("LINE_A1");
    expect(html).not.toContain('data-testid="lang-toggle"');
    expect(html).not.toContain('data-testid="theme-toggle"');
    expect(html).toContain("Sổ cái biến động điểm");
    expect(html).toContain("Chu kỳ tuần (từ Thứ Hai)");
  });

  it("renders user header and monthly cycle badge", () => {
    const html = renderToString(
      <Router ssrPath="/leaderboard/reporters/10">
        <ScoreLedgerPage targetType="USER" id="10" />
      </Router>,
    );

    expect(html).toContain("10");
    expect(html).not.toContain('data-testid="lang-toggle"');
    expect(html).not.toContain('data-testid="theme-toggle"');
    expect(html).toContain("Chu kỳ tháng (từ mùng 1)");
  });

  it("triggers onSelectIssue callback when an issue is selected", () => {
    let selectedId: number = 0;
    const page = (
      <ScoreLedgerPage
        targetType="LOCATION"
        id="LINE_A1"
        onSelectIssue={(issueId) => {
          selectedId = issueId;
        }}
      />
    );

    expect(page.props.targetType).toBe("LOCATION");
    expect(page.props.id).toBe("LINE_A1");
    page.props.onSelectIssue?.(999);
    expect(selectedId).toBe(999);
  });

  it("renders loaded score logs with positive and negative point deltas", () => {
    const mockLogs: ScoreLogItem[] = [
      {
        id: 1,
        issue_id: 10,
        target_type: "LOCATION",
        target_id: "LINE_A1",
        rule_key: "RESOLVED_ON_TIME",
        rule_description: "Khắc phục đúng hạn",
        points: 5,
        created_at: new Date().toISOString(),
        issue_category: "1S",
        issue_description: "Sàng lọc vật tư dư thừa",
        issue_status: "CLOSED",
      },
      {
        id: 2,
        issue_id: 11,
        target_type: "LOCATION",
        target_id: "LINE_A1",
        rule_key: "OVERDUE_ISSUE",
        rule_description: "Quá hạn xử lý",
        points: -3,
        created_at: new Date().toISOString(),
        issue_category: "2S",
        issue_description: "Bừa bộn lối đi",
        issue_status: "OPEN",
      },
    ];

    const html = renderToString(
      <WithMockState values={[mockLogs, false, null]}>
        <Router ssrPath="/leaderboard/locations/LINE_A1">
          <ScoreLedgerPage targetType="LOCATION" id="LINE_A1" />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Khắc phục đúng hạn");
    expect(html).toContain("+5");
    expect(html).toContain("Quá hạn xử lý");
    expect(html).toContain("-3");
    expect(html).toContain("1S");
    expect(html).toContain("2S");
  });
});
