import { beforeEach, describe, expect, it } from "bun:test";
import { useAuthStore } from "../src/store/authStore.ts";
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
});
