import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { AdminConfigPage } from "../src/pages/AdminConfigPage.tsx";

describe("AdminConfigPage", () => {
  it("defaults to scoring and exposes configuration tabs including factory timezone", () => {
    const html = renderToString(
      <Router ssrPath="/admin">
        <AdminConfigPage />
      </Router>,
    );
    expect(html).toContain("Điểm số 6S");
    expect(html).toContain("Active Directory");
    expect(html).toContain("Kênh thông báo");
    expect(html).toContain("Trí tuệ nhân tạo (AI)");
    expect(html).toContain("Múi giờ xưởng");
    expect(html).not.toContain("Vị trí xưởng");
    expect(html).not.toContain("Thẻ sự cố");
  });

  it("renders localized scoring rule names without technical keys", () => {
    const html = renderToString(
      <Router ssrPath="/admin">
        <AdminConfigPage />
      </Router>,
    );
    expect(html).toContain("Điểm nền hàng tuần");
    expect(html).not.toContain("base_weekly_score");
  });
});
