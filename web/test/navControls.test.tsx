import { beforeEach, describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { NavActions } from "../src/components/NavActions.tsx";
import { StatusBar } from "../src/components/StatusBar.tsx";
import { CreateIssuePage } from "../src/pages/CreateIssuePage.tsx";
import { LoginPage } from "../src/pages/LoginPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { useThemeStore } from "../src/store/themeStore.ts";
import { UserRole } from "../src/types/index.ts";

function WithMockState({ values, children }: { values: unknown[]; children: React.ReactNode }) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: { current: { useState: (init: unknown) => [unknown, () => void] } };
      };
    }
  ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let idx = 0;
  internals.current.useState = (init: unknown) => {
    const value =
      idx < values.length
        ? values[idx++]
        : typeof init === "function"
          ? (init as () => unknown)()
          : init;
    return [value, () => {}];
  };
  return <>{children}</>;
}

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

  it("keeps shared navigation as semantic links without duplicate navigation callbacks", () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Admin",
        role: UserRole.ADMIN,
        capabilities: [
          "reports:view",
          "masterdata:manage",
          "settings:manage",
          "user:manage",
          "permission:manage",
        ],
      },
    });
    const html = renderToString(
      <WithMockState
        values={[
          true,
          {
            total: 0,
            completed: 0,
            currentName: "",
            percent: 100,
            isSyncing: false,
            conflictCount: 0,
          },
          true,
          true,
        ]}
      >
        <Router ssrPath="/">
          <StatusBar onOpenDrawer={() => {}} />
        </Router>
      </WithMockState>,
    );
    for (const href of [
      "/reports",
      "/admin/locations",
      "/admin/tags",
      "/admin",
      "/admin/users",
      "/admin/permissions",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toContain("onNavigate");
  });

  it("keeps exactly one control set in the shared status bar", () => {
    const html = renderToString(<StatusBar onOpenDrawer={() => {}} />);
    expect(html.match(/data-testid="lang-toggle"/g)).toHaveLength(1);
    expect(html.match(/data-testid="theme-toggle"/g)).toHaveLength(1);
  });
});
