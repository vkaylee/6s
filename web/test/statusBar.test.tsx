import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { StatusBar } from "../src/components/StatusBar.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

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
});
