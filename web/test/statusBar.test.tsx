import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { StatusBar } from "../src/components/StatusBar.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

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

describe("StatusBar Component", () => {
  it("renders status bar and navigation actions when guest", () => {
    useAuthStore.setState({ user: null });
    const html = renderToString(
      <Router ssrPath="/">
        <StatusBar onOpenDrawer={() => {}} />
      </Router>,
    );
    expect(html).toContain("Ngoại tuyến");
    expect(html).toContain("Hệ thống 6S");
    expect(html).toContain('data-testid="lang-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
  });

  it("renders profile avatar trigger when logged in as admin", () => {
    useAuthStore.setState({
      user: {
        id: 99,
        username: "admin_user",
        full_name: "Quản trị viên",
        role: UserRole.ADMIN,
        assigned_location_code: "LINE_A1",
      },
    });
    const html = renderToString(
      <Router ssrPath="/">
        <StatusBar onOpenDrawer={() => {}} />
      </Router>,
    );
    expect(html).toContain("Quản trị viên");
    expect(html).toContain("ADMIN");
    expect(html).toContain('data-testid="lang-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
  });

  it("renders open user profile dropdown menu and syncing status", () => {
    useAuthStore.setState({
      user: {
        id: 99,
        username: "admin_user",
        full_name: "Quản trị viên",
        role: UserRole.ADMIN,
        assigned_location_code: "LINE_A1",
      },
    });

    const html = renderToString(
      <WithMockState
        values={[
          true, // isOnline
          {
            total: 3,
            completed: 1,
            currentName: "LINE_A1",
            percent: 33,
            isSyncing: true,
            conflictCount: 0,
          }, // progress
          true, // isVisible
          true, // isProfileOpen
        ]}
      >
        <Router ssrPath="/">
          <StatusBar onOpenDrawer={() => {}} />
        </Router>
      </WithMockState>,
    );

    expect(html).toContain("Đăng xuất");
    expect(html).toContain("Cấu hình hệ thống");
    expect(html).toContain("LINE_A1");
  });
});
