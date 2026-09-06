import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { AdminConfigPage } from "../src/pages/AdminConfigPage.tsx";

describe("AdminConfigPage Location Edit UI", () => {
  it("renders admin config page with locations tab and edit buttons", () => {
    const html = renderToString(
      <Router ssrPath="/admin/config">
        <AdminConfigPage />
      </Router>,
    );
    expect(html).toContain("LINE_A3");
    expect(html).toContain("LOC:");
  });
});
