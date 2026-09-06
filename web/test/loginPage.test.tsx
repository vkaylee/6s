import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { LoginPage } from "../src/pages/LoginPage.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

function WithMockState({ values, children }: { values: unknown[]; children: React.ReactNode }) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: {
          current: {
            useState: (init: unknown) => [unknown, () => void];
            useSyncExternalStore: (sub: unknown, snap: () => unknown) => unknown;
          };
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
  internals.current.useSyncExternalStore = (_sub: unknown, snap: () => unknown) => snap();
  return <>{children}</>;
}

describe("LoginPage Component", () => {
  const originalLocation = (globalThis as unknown as { location?: unknown }).location;
  const originalLocalStorage = globalThis.localStorage;
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    (globalThis as unknown as { location: unknown }).location = {
      search: "",
      pathname: "/login",
      hash: "",
      href: "/login",
    };
    globalThis.localStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, String(v)),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      length: 0,
      key: () => null,
    };
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
  });

  afterEach(() => {
    if (originalLocation === undefined) {
      delete (globalThis as unknown as { location?: unknown }).location;
    } else {
      (globalThis as unknown as { location: unknown }).location = originalLocation;
    }
    globalThis.localStorage = originalLocalStorage;
  });

  it("renders default login form with username and password inputs", () => {
    const html = renderToString(
      <Router ssrPath="/login" ssrSearch="">
        <LoginPage />
      </Router>,
    );
    expect(html).toContain("6S Workplace Security");
    expect(html).toContain('type="password"');
    expect(html).toContain("Active Directory (AD) &amp; Local");
  });

  it("renders remembered user profile card with switch account action", () => {
    const rememberedUser = {
      username: "worker01",
      full_name: "Nguyen Van A",
    };
    localStorage.setItem("6s_last_auth_user", JSON.stringify(rememberedUser));
    try {
      const html = renderToString(
        <Router ssrPath="/login" ssrSearch="">
          <LoginPage />
        </Router>,
      );
      expect(html).toContain("Nguyen Van A");
      expect(html).toContain("worker01");
      expect(html).toContain("Đăng nhập bằng tài khoản khác");
    } finally {
      localStorage.removeItem("6s_last_auth_user");
    }
  });

  it("renders error banner when login failure occurs", () => {
    const html = renderToString(
      <Router ssrPath="/login" ssrSearch="">
        <WithMockState
          values={[
            null, // rememberedUser
            "admin", // username
            "wrongpass", // password
            false, // isLoading
            "Tài khoản hoặc mật khẩu không chính xác", // errorMsg
          ]}
        >
          <LoginPage />
        </WithMockState>
      </Router>,
    );

    expect(html).toContain("Tài khoản hoặc mật khẩu không chính xác");
  });

  it("renders back button when user is already authenticated", () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "operator_b",
        full_name: "Operator B",
        role: UserRole.LINE_LEADER,
      },
    });

    const html = renderToString(
      <Router ssrPath="/login" ssrSearch="">
        <LoginPage />
      </Router>,
    );

    expect(html).toContain('aria-label="Back"');
  });
});
