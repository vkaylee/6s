import { beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { App } from "../src/App.tsx";
import { NavActions } from "../src/components/NavActions.tsx";
import { CreateIssuePage } from "../src/pages/CreateIssuePage.tsx";
import { LoginPage } from "../src/pages/LoginPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { useThemeStore } from "../src/store/themeStore.ts";
import { UserRole } from "../src/types/index.ts";

describe("NavActions (Language & Theme toggle controls)", () => {
  it("renders both language and theme toggle buttons with required testids", () => {
    const html = renderToString(<NavActions />);
    expect(html).toContain('data-testid="lang-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
  });

  it("toggles dark mode state via themeStore", () => {
    useThemeStore.setState({ isDark: false });
    expect(useThemeStore.getState().isDark).toBe(false);

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().isDark).toBe(true);

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().isDark).toBe(false);
  });
});

describe("Page level Language & Theme Controls presence", () => {
  beforeEach(() => {
    useAuthStore.setState({
      isLoading: false,
      user: {
        id: 1,
        username: "worker01",
        full_name: "Worker One",
        role: UserRole.LINE_LEADER,
      },
      accessToken: "mock-token",
      isOfflineGrace: false,
    });
  });

  it("LoginPage contains language and theme toggle buttons", () => {
    const html = renderToString(
      <Router ssrPath="/login">
        <LoginPage />
      </Router>,
    );
    expect(html).toContain('data-testid="lang-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
  });

  it("CreateIssuePage contains language and theme toggle buttons", () => {
    const html = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={[]} tags={[]} onSuccess={() => {}} />
      </Router>,
    );
    expect(html).toContain('data-testid="lang-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
  });

  it("All registered routes in App render language and theme toggle buttons", () => {
    const routes = [
      "/",
      "/login",
      "/issues/new",
      "/leaderboard/locations/LINE_A1",
      "/leaderboard/reporters/1",
    ];

    for (const route of routes) {
      const html = renderToString(
        <Router ssrPath={route}>
          <App />
        </Router>,
      );
      expect(html).toContain('data-testid="lang-toggle"');
      expect(html).toContain('data-testid="theme-toggle"');
    }
  });
});
