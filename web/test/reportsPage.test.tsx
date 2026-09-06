import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { ReportsPage } from "../src/pages/ReportsPage.tsx";

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
    // Verify Export CSV presence
    expect(html).toContain('data-testid="btn-export-csv"');
  });
});
