import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { AppShell } from "../src/components/AppShell.tsx";
import { useAuthStore } from "../src/store/authStore.ts";

describe("AppShell", () => {
  it("renders shared status bar around route content", () => {
    useAuthStore.setState({ user: null });
    const html = renderToString(
      <Router ssrPath="/">
        <AppShell onOpenDrawer={() => {}}>
          <main data-testid="route-content">Route content</main>
        </AppShell>
      </Router>,
    );

    expect(html).toContain("Hệ thống 6S");
    expect(html).toContain('data-testid="route-content"');
  });
});
