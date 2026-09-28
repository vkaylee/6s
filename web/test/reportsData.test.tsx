import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { ReportsPage } from "../src/pages/ReportsPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";
import {
  drilldownIssue,
  mockLocations,
  mockMasterLocations,
  mockMasterTags,
  mockReporters,
  mockSummary,
} from "./reportsTestFixtures.tsx";

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isOfflineGrace: false,
    isLoading: false,
  });
});

afterEach(async () => {
  await useAuthStore.getState().clearAuth();
  useAuthStore.setState({
    user: null,
    isOfflineGrace: false,
    isLoading: false,
  });
});

describe("ReportsPage Drilldown & Data", () => {
  it("opens the safety drilldown drawer with live issues when the safety KPI card is clicked", async () => {
    const originalFetch = globalThis.fetch;
    const wasRegistered = GlobalRegistrator.isRegistered;
    const originalActEnv = (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
    if (!wasRegistered) GlobalRegistrator.register({ url: "https://6s.test/" });
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const containers: { root: Root; node: HTMLElement }[] = [];
    const requested: string[] = [];
    try {
      useAuthStore.setState({
        user: { id: 1, username: "admin", full_name: "Super Admin", role: UserRole.ADMIN },
      });
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        requested.push(url);
        const send = (data: unknown, pagination?: unknown) =>
          new Response(JSON.stringify({ data, ...(pagination ? { pagination } : {}) }), {
            status: 200,
          });
        if (url.includes("/api/reports/summary")) return send(mockSummary);
        if (url.includes("/api/leaderboard/locations")) return send(mockLocations);
        if (url.includes("/api/leaderboard/reporters")) return send(mockReporters);
        if (url.includes("/api/locations")) return send(mockMasterLocations);
        if (url.includes("/api/tags")) return send(mockMasterTags);
        if (url.includes("/api/reports/teams")) return send([]);
        if (url.includes("/api/issues?"))
          return send([drilldownIssue], { page: 1, limit: 15, total: 1 });
        return send([], { page: 1, limit: 15, total: 0 });
      }) as typeof fetch;

      const node = document.createElement("div");
      document.body.appendChild(node);
      const root = createRoot(node);
      containers.push({ root, node });
      await act(async () => {
        root.render(
          <Router>
            <ReportsPage />
          </Router>,
        );
      });
      await act(async () => {});

      const safetyCard = Array.from(node.querySelectorAll("button")).find((item) =>
        (item.textContent ?? "").includes("Sự cố an toàn 6S"),
      );
      expect(safetyCard).toBeDefined();
      await act(async () => {
        (safetyCard as HTMLButtonElement).click();
      });
      await act(async () => {});

      expect(node.textContent).toContain("Danh sách sự cố an toàn 6S khẩn cấp");
      expect(requested.some((url) => url.includes("category=6S"))).toBe(true);
      expect(node.textContent).toContain("Dây điện hở dưới sàn");
    } finally {
      for (const entry of containers) {
        await act(async () => {
          entry.root.unmount();
        });
        entry.node.remove();
      }
      globalThis.fetch = originalFetch;
      (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = originalActEnv;
      if (!wasRegistered) await GlobalRegistrator.unregister();
    }
  });

  it("requests tag drilldown issues with the selected tag_code", async () => {
    const originalFetch = globalThis.fetch;
    const wasRegistered = GlobalRegistrator.isRegistered;
    const originalActEnv = (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
    if (!wasRegistered) GlobalRegistrator.register({ url: "https://6s.test/" });
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const containers: { root: Root; node: HTMLElement }[] = [];
    const requested: string[] = [];
    const summaryWithTag = {
      ...mockSummary,
      topTags: [
        {
          tag_code: "SAFETY_RISK",
          category: "6S",
          name_vi: "Nguy cơ an toàn",
          name_zh: "安全隐患",
          name_en: "Safety risk",
          count: 3,
        },
      ],
    };
    try {
      useAuthStore.setState({
        user: { id: 1, username: "admin", full_name: "Super Admin", role: UserRole.ADMIN },
      });
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        requested.push(url);
        const send = (data: unknown, pagination?: unknown) =>
          new Response(JSON.stringify({ data, ...(pagination ? { pagination } : {}) }), {
            status: 200,
          });
        if (url.includes("/api/reports/summary")) return send(summaryWithTag);
        if (url.includes("/api/leaderboard/locations")) return send(mockLocations);
        if (url.includes("/api/leaderboard/reporters")) return send(mockReporters);
        if (url.includes("/api/locations")) return send(mockMasterLocations);
        if (url.includes("/api/tags")) return send(mockMasterTags);
        if (url.includes("/api/reports/teams")) return send([]);
        if (url.includes("/api/issues?"))
          return send([drilldownIssue], { page: 1, limit: 15, total: 1 });
        return send([], { page: 1, limit: 15, total: 0 });
      }) as typeof fetch;

      const node = document.createElement("div");
      document.body.appendChild(node);
      const root = createRoot(node);
      containers.push({ root, node });
      await act(async () => {
        root.render(
          <Router>
            <ReportsPage />
          </Router>,
        );
      });
      await act(async () => {});
      const trendsTab = node.querySelector(
        '[data-testid="reports-tab-trends"]',
      ) as HTMLButtonElement | null;
      expect(trendsTab).not.toBeNull();
      await act(async () => {
        trendsTab?.click();
      });
      await act(async () => {});

      const tagButton = Array.from(node.querySelectorAll("button")).find((item) =>
        (item.textContent ?? "").includes("Nguy cơ an toàn"),
      );
      expect(tagButton).toBeDefined();
      await act(async () => {
        (tagButton as HTMLButtonElement).click();
      });
      await act(async () => {});

      const tagRequest = requested.find((url) => url.includes("/api/issues?"));
      expect(tagRequest).toBeDefined();
      expect(new URL(tagRequest as string, "https://6s.test").searchParams.get("tag_code")).toBe(
        "SAFETY_RISK",
      );
      expect(node.textContent).toContain("Dây điện hở dưới sàn");
    } finally {
      for (const entry of containers) {
        await act(async () => {
          entry.root.unmount();
        });
        entry.node.remove();
      }
      globalThis.fetch = originalFetch;
      (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = originalActEnv;
      if (!wasRegistered) await GlobalRegistrator.unregister();
    }
  });
});
