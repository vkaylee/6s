import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { PermissionMatrixPage } from "../src/pages/PermissionMatrixPage.tsx";

// State order in PermissionMatrixPage:
// [isHeaderVisible, permissions, matrix, drafts, isLoading, loadError, savingRole]
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

const SAMPLE_PERMISSIONS = [
  { code: "issue:create", description: "Tạo issue" },
  { code: "issue:close_any", description: "Đóng mọi issue" },
  { code: "user:manage", description: "Quản lý user" },
  { code: "permission:manage", description: "Sửa ma trận quyền" },
];

const SAMPLE_MATRIX = [
  { role: "USER", permissions: ["issue:create"] },
  { role: "LINE_LEADER", permissions: ["issue:create", "issue:close_line"] },
  { role: "SAFETY_OFFICER", permissions: ["issue:create", "issue:close_safety"] },
  {
    role: "ADMIN",
    permissions: ["issue:create", "issue:close_any", "user:manage", "permission:manage"],
  },
  { role: "SUPERADMIN", permissions: SAMPLE_PERMISSIONS.map((p) => p.code) },
];

const CLEAN = [
  true,
  SAMPLE_PERMISSIONS,
  SAMPLE_MATRIX,
  Object.fromEntries(SAMPLE_MATRIX.map((m) => [m.role, m.permissions])),
  false,
  null,
  null,
];

describe("PermissionMatrixPage UI", () => {
  it("renders loading skeleton state while isLoading", () => {
    const html = renderToString(
      <Router ssrPath="/admin/permissions">
        <PermissionMatrixPage />
      </Router>,
    );
    expect(html).toContain("animate-pulse");
  });

  it("renders error state with retry", () => {
    const html = renderToString(
      <WithMockState values={[true, [], [], {}, false, "boom", null]}>
        <Router ssrPath="/admin/permissions">
          <PermissionMatrixPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("boom");
  });

  it("renders empty state when no permissions", () => {
    const html = renderToString(
      <WithMockState values={[true, [], [], {}, false, null, null]}>
        <Router ssrPath="/admin/permissions">
          <PermissionMatrixPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Chưa có quyền nào được cấu hình.");
  });

  it("renders full matrix: permission codes, role columns, and checkboxes", () => {
    const html = renderToString(
      <WithMockState values={CLEAN}>
        <Router ssrPath="/admin/permissions">
          <PermissionMatrixPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("issue:close_any");
    expect(html).toContain("SAFETY_OFFICER");
    // 4 permissions × 5 roles = 20 checkboxes
    expect(html.match(/type="checkbox"/g)?.length).toBe(20);
    // aria-label pairs role with code for screen readers
    expect(html).toContain('aria-label="ADMIN • user:manage"');
  });

  it("locks ADMIN safeguards and the immutable SUPERADMIN column", () => {
    const html = renderToString(
      <WithMockState values={CLEAN}>
        <Router ssrPath="/admin/permissions">
          <PermissionMatrixPage />
        </Router>
      </WithMockState>,
    );
    const disabled =
      html.match(/disabled="" aria-label="ADMIN • (?:user:manage|permission:manage)"/g) ?? [];
    expect(disabled).toHaveLength(2);
    expect(html.match(/disabled="" aria-label="SUPERADMIN • /g)).toHaveLength(4);
    expect(html).toContain("SUPERADMIN luôn có toàn bộ quyền hệ thống và không thể chỉnh sửa");
  });

  it("marks dirty roles and enables save/discard when drafts diverge", () => {
    const dirtyDrafts = {
      ...Object.fromEntries(SAMPLE_MATRIX.map((m) => [m.role, m.permissions])),
      USER: ["issue:create", "issue:close_any"],
    };
    const html = renderToString(
      <WithMockState
        values={[true, SAMPLE_PERMISSIONS, SAMPLE_MATRIX, dirtyDrafts, false, null, null]}
      >
        <Router ssrPath="/admin/permissions">
          <PermissionMatrixPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("bg-amber-500");
    expect(html).not.toMatch(/<button[^>]*disabled=""/u);
  });

  it("disables save/discard buttons in clean state", () => {
    const html = renderToString(
      <WithMockState values={CLEAN}>
        <Router ssrPath="/admin/permissions">
          <PermissionMatrixPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Bỏ thay đổi");
    expect(html).toContain("disabled");
  });
});
