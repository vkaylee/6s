import { create } from "zustand";
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
  accessToken: string | null;
  isOfflineGrace: boolean;
  isLoading: boolean;

  setAuth: (user: UserProfile, accessToken: string, refreshToken: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  enableOfflineGrace: () => void;
  restoreSession: () => Promise<boolean>;
  getRefreshToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: null,
  accessToken: null,
  isOfflineGrace: false,
  isLoading: true,

  setAuth: async (user, accessToken, refreshToken) => {
    const session: AuthSession = {
      id: "current",
      refresh_token: refreshToken,
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
    set({
      user,
      accessToken,
      isOfflineGrace: false,
      isLoading: false,
    });
  },

  clearAuth: async () => {
    if (typeof indexedDB !== "undefined") {
      await clearAuthSession();
    }
    set({
      user: null,
      accessToken: null,
      isOfflineGrace: false,
      isLoading: false,
    });
  },

  enableOfflineGrace: () => {
    set((state) => ({
      ...state,
      isOfflineGrace: true,
    }));
  },

  restoreSession: async () => {
    try {
      if (typeof indexedDB === "undefined") {
        set({ isLoading: false });
        return false;
      }
      const session = await getAuthSession();
      if (!session) {
        set({ isLoading: false });
        return false;
      }
      set({
        user: session.user as UserProfile,
        isOfflineGrace: true, // Initially offline grace until network refreshes token
        isLoading: false,
      });
      return true;
    } catch {
      set({ isLoading: false });
      return false;
    }
  },

  getRefreshToken: async () => {
    try {
      if (typeof indexedDB === "undefined") {
        return null;
      }
      const session = await getAuthSession();
      return session?.refresh_token ?? null;
    } catch {
      return null;
    }
  },
}));
