import { beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { App } from "../src/App.tsx";
import { NotFoundPage } from "../src/pages/NotFoundPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

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
});
