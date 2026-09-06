import { describe, expect, it } from "bun:test";
import { useThemeStore } from "../src/store/themeStore.ts";

describe("themeStore", () => {
  it("initializes theme correctly and updates dark class", () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const storage = new Map<string, string>();
    const classList = new Set<string>();

    globalThis.localStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, String(v)),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;

    globalThis.document = {
      documentElement: {
        classList: {
          add: (c: string) => classList.add(c),
          remove: (c: string) => classList.delete(c),
          contains: (c: string) => classList.has(c),
        },
      },
    } as unknown as Document;

    globalThis.window = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window & typeof globalThis;

    try {
      storage.set("app_theme", "dark");
      useThemeStore.getState().initTheme();
      expect(useThemeStore.getState().isDark).toBe(true);
      expect(classList.has("dark")).toBe(true);

      storage.set("app_theme", "light");
      useThemeStore.getState().initTheme();
      expect(useThemeStore.getState().isDark).toBe(false);
      expect(classList.has("dark")).toBe(false);
    } finally {
      globalThis.localStorage = originalLocalStorage;
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    }
  });

  it("toggles theme and persists to localStorage", () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const storage = new Map<string, string>();
    const classList = new Set<string>();

    globalThis.localStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, String(v)),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;

    globalThis.document = {
      documentElement: {
        classList: {
          add: (c: string) => classList.add(c),
          remove: (c: string) => classList.delete(c),
          contains: (c: string) => classList.has(c),
        },
      },
    } as unknown as Document;

    globalThis.window = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window & typeof globalThis;

    try {
      useThemeStore.setState({ isDark: false });
      useThemeStore.getState().toggleTheme();

      expect(useThemeStore.getState().isDark).toBe(true);
      expect(storage.get("app_theme")).toBe("dark");
      expect(classList.has("dark")).toBe(true);

      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().isDark).toBe(false);
      expect(storage.get("app_theme")).toBe("light");
      expect(classList.has("dark")).toBe(false);
    } finally {
      globalThis.localStorage = originalLocalStorage;
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    }
  });
});
