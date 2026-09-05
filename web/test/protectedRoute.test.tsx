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
});
