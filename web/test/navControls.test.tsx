import { beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { NavActions } from "../src/components/NavActions.tsx";
import { StatusBar } from "../src/components/StatusBar.tsx";
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

describe("Page-level headers", () => {
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

  it("LoginPage keeps its own language and theme controls", () => {
    const html = renderToString(
      <Router ssrPath="/login">
        <LoginPage />
      </Router>,
    );
    expect(html).toContain('data-testid="lang-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
  });

  it("does not duplicate language and theme controls on CreateIssuePage", () => {
    const html = renderToString(
      <Router ssrPath="/issues/new">
        <CreateIssuePage locations={[]} tags={[]} onSuccess={() => {}} />
      </Router>,
    );
    expect(html).not.toContain('data-testid="lang-toggle"');
    expect(html).not.toContain('data-testid="theme-toggle"');
  });

  it("keeps exactly one control set in the shared status bar", () => {
    const html = renderToString(<StatusBar onOpenDrawer={() => {}} />);
    expect(html.match(/data-testid="lang-toggle"/g)).toHaveLength(1);
    expect(html.match(/data-testid="theme-toggle"/g)).toHaveLength(1);
  });
});
