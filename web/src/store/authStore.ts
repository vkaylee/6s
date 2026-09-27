import { create } from "zustand";
import { ApiError, apiClient } from "../api/client.ts";
import {
  type AuthSession,
  clearAuthSession,
  getAuthSession,
  saveAuthSession,
} from "../db/indexeddb.ts";
import type { UserRole } from "../types/index.ts";

export interface UserProfile {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  capabilities?: string[];
  assigned_location_code?: string;
}

export function hasCapability(user: UserProfile | null | undefined, capability: string): boolean {
  return Array.isArray(user?.capabilities) && user.capabilities.includes(capability);
}

export interface RememberedUser {
  username: string;
  full_name: string;
}

const REMEMBERED_USER_KEY = "6s_last_auth_user";

export function getRememberedUser(): RememberedUser | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(REMEMBERED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearRememberedUser(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(REMEMBERED_USER_KEY);
  } catch {
    // no-op
  }
}

export interface AuthState {
  user: UserProfile | null;
  isOfflineGrace: boolean;
  isLoading: boolean;

  setAuth: (user: UserProfile) => Promise<void>;
  clearAuth: () => Promise<void>;
  enableOfflineGrace: () => void;
  restoreSession: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isOfflineGrace: false,
  isLoading: true,

  setAuth: async (user) => {
    const session: AuthSession = {
      id: "current",
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        capabilities: user.capabilities,
        assigned_location_code: user.assigned_location_code,
      },
      updated_at: Date.now(),
    };
    if (typeof indexedDB !== "undefined") {
      await saveAuthSession(session);
    }
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          REMEMBERED_USER_KEY,
          JSON.stringify({ username: user.username, full_name: user.full_name }),
        );
      } catch {
        // no-op
      }
    }
    set({ user, isOfflineGrace: false, isLoading: false });
  },

  clearAuth: async () => {
    if (typeof indexedDB !== "undefined") {
      await clearAuthSession();
    }
    set({ user: null, isOfflineGrace: false, isLoading: false });
  },

  enableOfflineGrace: () => {
    set((state) => ({ ...state, isOfflineGrace: true }));
  },

  restoreSession: async () => {
    let cachedUser: UserProfile | null = null;
    try {
      if (typeof indexedDB !== "undefined") {
        const session = await getAuthSession();
        if (session) {
          cachedUser = session.user as UserProfile;
          set({ user: cachedUser, isOfflineGrace: true, isLoading: false });
        }
      }

      const currentUser = await apiClient<UserProfile>("/api/auth/me");
      await useAuthStore.getState().setAuth(currentUser);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await useAuthStore.getState().clearAuth();
        return false;
      }
      if (cachedUser) {
        useAuthStore.getState().enableOfflineGrace();
        set({ isLoading: false });
        return true;
      }
      set({ isLoading: false });
      return false;
    }
  },
}));
