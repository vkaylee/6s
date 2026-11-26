import { beforeEach, describe, expect, it } from "bun:test";
import { clearRememberedUser, getRememberedUser, useAuthStore } from "../src/store/authStore.ts";
import { UserRole } from "../src/types/index.ts";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
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
      isOfflineGrace: false,
      isLoading: false,
    });

    const state = useAuthStore.getState();
    expect(state.user?.username).toBe("worker01");
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

    await store.setAuth(user);
    let state = useAuthStore.getState();
    expect(state.user?.username).toBe("leader01");
    expect(state.isLoading).toBe(false);
    expect(state.isOfflineGrace).toBe(false);

    await store.clearAuth();
    state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isOfflineGrace).toBe(false);
  });

  it("restoreSession handles non-indexedDB runtime safely", async () => {
    const originalFetch = globalThis.fetch;
    const user = { id: 4, username: "restored", full_name: "Restored User", role: UserRole.USER };
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ data: user }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      expect(await useAuthStore.getState().restoreSession()).toBe(true);
      expect(requestedUrl).toContain("/api/auth/me");
      expect(useAuthStore.getState().user).toEqual(user);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("saves and clears remembered user in localStorage", async () => {
    const storage = new Map<string, string>();
    const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
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
      } as unknown as Storage,
    });

    try {
      const store = useAuthStore.getState();
      const user = {
        id: 3,
        username: "saveduser",
        full_name: "Saved User",
        role: UserRole.USER,
      };

      await store.setAuth(user);
      expect(getRememberedUser()).toEqual({
        username: "saveduser",
        full_name: "Saved User",
      });

      clearRememberedUser();
      expect(getRememberedUser()).toBeNull();
    } finally {
      if (originalLocalStorageDescriptor) {
        Object.defineProperty(globalThis, "localStorage", originalLocalStorageDescriptor);
      } else {
        delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
      }
    }
  });
});
