import { beforeEach, describe, expect, it } from "bun:test";
import { clearRememberedUser, getRememberedUser, useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isOfflineGrace: false,
      isLoading: false,
    });
  });

  it("handles offline grace state transitions", () => {
    const store = useAuthStore.getState();
    expect(store.isOfflineGrace).toBe(false);

    store.enableOfflineGrace();
    expect(useAuthStore.getState().isOfflineGrace).toBe(true);
  });

  it("manages user profile in memory", () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "worker01",
        full_name: "Nguyen Van A",
        role: UserRole.USER,
      },
      accessToken: "mock-jwt-token",
      isOfflineGrace: false,
      isLoading: false,
    });

    const state = useAuthStore.getState();
    expect(state.user?.username).toBe("worker01");
    expect(state.accessToken).toBe("mock-jwt-token");
    expect(state.user?.role).toBe(UserRole.USER);
  });

  it("handles setAuth, clearAuth, and session transitions", async () => {
    const store = useAuthStore.getState();
    const user = {
      id: 2,
      username: "leader01",
      full_name: "Tran Van B",
      role: UserRole.LINE_LEADER,
    };

    await store.setAuth(user, "access-token-123", "refresh-token-456");
    let state = useAuthStore.getState();
    expect(state.user?.username).toBe("leader01");
    expect(state.accessToken).toBe("access-token-123");
    expect(state.isLoading).toBe(false);
    expect(state.isOfflineGrace).toBe(false);

    await store.clearAuth();
    state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isOfflineGrace).toBe(false);
  });

  it("restoreSession and getRefreshToken handle non-indexedDB runtime safely", async () => {
    const store = useAuthStore.getState();
    const restored = await store.restoreSession();
    expect(typeof restored).toBe("boolean");

    const token = await store.getRefreshToken();
    expect(token === null || typeof token === "string").toBe(true);
  });

  it("saves and clears remembered user in localStorage", async () => {
    const storage = new Map<string, string>();
    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, String(v));
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
      clear: () => {
        storage.clear();
      },
      key: () => null,
      length: 0,
    } as unknown as Storage;

    try {
      const store = useAuthStore.getState();
      const user = {
        id: 3,
        username: "saveduser",
        full_name: "Saved User",
        role: UserRole.USER,
      };

      await store.setAuth(user, "tok1", "tok2");
      expect(getRememberedUser()).toEqual({
        username: "saveduser",
        full_name: "Saved User",
      });

      clearRememberedUser();
      expect(getRememberedUser()).toBeNull();
    } finally {
      globalThis.localStorage = originalLocalStorage;
    }
  });
});
