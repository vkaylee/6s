import { beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { App } from "../src/App.tsx";
import { useI18nStore } from "../src/i18n/index.ts";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

describe("Wouter deep linking with useSearch", () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: "vi" });
    useAuthStore.setState({
      isLoading: false,
      user: {
        id: 1,
        username: "inspector",
        full_name: "Inspector Guy",
        role: UserRole.LINE_LEADER,
      },
      accessToken: "mock-token",
      isOfflineGrace: false,
    });
  });

  it("renders correctly with ssrSearch param present in Router", () => {
    const html = renderToString(
      <Router ssrPath="/" ssrSearch="issue_id=123">
        <App />
      </Router>,
    );

    // App should mount without crashing with wouter ssrSearch
    expect(html).toContain("6S");
  });
});
