import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { UserAccessPage } from "../src/pages/UserAccessPage.tsx";

// State order in UserAccessPage:
// [users, locations, isLoading, loadError, roleFilter, statusFilter, savingId, editingId, editRole, editLocation]
// First three useMocks cover useEffect-driven loaders; we mock the render path.
function WithMockState({ values, children }: { values: unknown[]; children: React.ReactNode }) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: { current: unknown };
      };
    }
  ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let idx = 0;
  const real = internals.current as Record<string, unknown>;
  internals.current = new Proxy(real, {
    get(target, prop) {
      if (prop === "useState") {
        return (init: unknown) => {
          const v = values[idx] ?? init;
          idx += 1;
          return [v, () => {}];
        };
      }
      return (target as Record<PropertyKey, unknown>)[prop];
    },
  });
  return <>{children}</>;
}

const SAMPLE_USERS = [
  {
    id: 1,
    username: "admin",
    auth_source: "LOCAL",
    full_name: "System Admin",
    email: null,
    role: "ADMIN",
    assigned_location_code: null,
    is_active: true,
    created_at: "2026-01-01 08:00",
    last_login_at: null,
  },
  {
    id: 2,
    username: "worker1",
    auth_source: "AD",
    full_name: "Nguyen Van A",
    email: null,
    role: "USER",
    assigned_location_code: "LINE_A1",
    is_active: false,
    created_at: "2026-01-02 08:00",
    last_login_at: "2026-09-01 10:30",
  },
];

describe("UserAccessPage UI", () => {
  it("renders loading skeleton state while isLoading", () => {
    const html = renderToString(
      <Router ssrPath="/admin/users">
        <UserAccessPage />
      </Router>,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders populated user list with badges, location, and role labels", () => {
    const html = renderToString(
      <WithMockState
        // isHeaderVisible, users, locations, isLoading=false, loadError=null, filters, savingId, editingId, editRole, editLocation
        values={[true, SAMPLE_USERS, [], false, null, "ALL", "ALL", null, null, "USER", ""]}
      >
        <Router ssrPath="/admin/users">
          <UserAccessPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Nguyen Van A");
    expect(html).toContain("LINE_A1");
    expect(html).toContain("ADMIN");
  });

  it("hides last-admin warning for non-admin rows", () => {
    const html = renderToString(
      <WithMockState
        values={[true, SAMPLE_USERS, [], false, null, "ALL", "ALL", null, null, "USER", ""]}
      >
        <Router ssrPath="/admin/users">
          <UserAccessPage />
        </Router>
      </WithMockState>,
    );
    // Self-management is hidden; the last-admin warning must not be shown for that row.
    expect(html).not.toContain("Không thể vô hiệu hóa");
  });

  it("renders filter selects with associated labels", () => {
    const html = renderToString(
      <WithMockState
        values={[true, SAMPLE_USERS, [], false, null, "ALL", "ALL", null, null, "USER", ""]}
      >
        <Router ssrPath="/admin/users">
          <UserAccessPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain('id="role-filter"');
    expect(html).toContain('id="status-filter"');
  });
});
