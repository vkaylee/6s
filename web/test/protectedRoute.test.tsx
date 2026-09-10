import { beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { ProtectedRoute } from "../src/components/ProtectedRoute.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

describe("ProtectedRoute component", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isOfflineGrace: false,
      isLoading: false,
    });
  });

  it("renders loading spinner when auth is loading", () => {
    useAuthStore.setState({ isLoading: true });
    const html = renderToString(
      <Router ssrPath="/">
        <ProtectedRoute>
          <div>Secret Content</div>
        </ProtectedRoute>
      </Router>,
    );

    expect(html).toContain("animate-spin");
    expect(html).not.toContain("Secret Content");
  });

  it("blocks and does not render children when user is not authenticated", () => {
    const html = renderToString(
      <Router ssrPath="/">
        <ProtectedRoute>
          <div>Secret Content</div>
        </ProtectedRoute>
      </Router>,
    );

    expect(html).toBe("");
    expect(html).not.toContain("Secret Content");
  });

  it("renders children when user is authenticated", () => {
    useAuthStore.setState({
      isLoading: false,
      user: {
        id: 1,
        username: "admin",
        full_name: "Admin User",
        role: UserRole.ADMIN,
      },
      accessToken: "mock-token",
    });

    const html = renderToString(
      <Router ssrPath="/">
        <ProtectedRoute>
          <div id="dashboard">Secret Content</div>
        </ProtectedRoute>
      </Router>,
    );

    expect(html).toContain("Secret Content");
    expect(html).toContain("dashboard");
  });

  it("blocks authenticated users without required capability", () => {
    useAuthStore.setState({
      isLoading: false,
      user: {
        id: 2,
        username: "worker",
        full_name: "Worker User",
        role: UserRole.USER,
        capabilities: [],
      },
      accessToken: "worker-token",
    });

    const html = renderToString(
      <Router ssrPath="/admin/locations">
        <ProtectedRoute allowedCapability="masterdata:manage">
          <div>Admin Only</div>
        </ProtectedRoute>
      </Router>,
    );

    expect(html).toContain("Không có quyền truy cập");
  });

  it("allows user with required capability and blocks user without it", () => {
    useAuthStore.setState({
      isLoading: false,
      user: {
        id: 1,
        username: "admin",
        full_name: "Admin",
        role: UserRole.ADMIN,
        capabilities: ["settings:manage"],
      },
      accessToken: "token",
    });

    const allowedHtml = renderToString(
      <Router ssrPath="/admin">
        <ProtectedRoute allowedCapability="settings:manage">
          <div>Admin Settings</div>
        </ProtectedRoute>
      </Router>,
    );
    expect(allowedHtml).toContain("Admin Settings");

    const blockedHtml = renderToString(
      <Router ssrPath="/admin/users">
        <ProtectedRoute allowedCapability="user:manage">
          <div>User Management</div>
        </ProtectedRoute>
      </Router>,
    );
    expect(blockedHtml).toContain("Không có quyền truy cập");
  });

  it("blocks ADMIN from SUPERADMIN-only routes", () => {
    useAuthStore.setState({
      isLoading: false,
      user: { id: 1, username: "admin", full_name: "Admin", role: UserRole.ADMIN },
      accessToken: "token",
    });
    const html = renderToString(
      <Router ssrPath="/admin/permissions">
        <ProtectedRoute allowedRole={UserRole.SUPERADMIN}>
          <div>Permission Matrix</div>
        </ProtectedRoute>
      </Router>,
    );
    expect(html).toContain("Không có quyền truy cập");
  });

  it("fails closed on old session without capabilities even if role is ADMIN", () => {
    useAuthStore.setState({
      isLoading: false,
      user: {
        id: 1,
        username: "oldadmin",
        full_name: "Old Admin",
        role: UserRole.ADMIN,
        // capabilities missing (old session)
      },
      accessToken: "token",
    });

    const html = renderToString(
      <Router ssrPath="/admin">
        <ProtectedRoute allowedCapability="settings:manage">
          <div>Admin Settings</div>
        </ProtectedRoute>
      </Router>,
    );
    expect(html).toContain("Không có quyền truy cập");
  });
});
