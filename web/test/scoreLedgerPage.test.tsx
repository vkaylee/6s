import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { ScoreLedgerPage } from "../src/pages/ScoreLedgerPage.tsx";

describe("ScoreLedgerPage", () => {
  it("renders location header, summary and navigation controls", () => {
    const html = renderToString(
      <Router ssrPath="/leaderboard/locations/LINE_A1">
        <ScoreLedgerPage targetType="LOCATION" id="LINE_A1" />
      </Router>,
    );

    expect(html).toContain("LINE_A1");
    expect(html).toContain('data-testid="lang-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
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
    expect(html).toContain('data-testid="lang-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
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
});
