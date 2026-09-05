import { create } from "zustand";

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  initTheme: () => void;
}

const STORAGE_KEY = "app_theme";

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyTheme(isDark: boolean) {
  if (typeof document === "undefined") return;
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: getInitialDark(),
  initTheme: () => {
    const isDark = getInitialDark();
    applyTheme(isDark);
    set({ isDark });
  },
  toggleTheme: () => {
    const nextDark = !get().isDark;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, nextDark ? "dark" : "light");
    }
    applyTheme(nextDark);
    set({ isDark: nextDark });
  },
}));
