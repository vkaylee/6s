import { create } from "zustand";

export interface RouteHistoryState {
  stack: string[];
  push: (path: string) => void;
  replace: (path: string) => void;
  pop: () => string | null;
  reset: (initialPath?: string) => void;
  canGoBack: () => boolean;
}

const MAX_STACK_SIZE = 50;

export const useRouteHistoryStore = create<RouteHistoryState>((set, get) => ({
  stack: ["/"],

  push: (path: string) => {
    if (!path || typeof path !== "string") return;
    set((state) => {
      const current = state.stack[state.stack.length - 1];
      if (current === path) return state;
      const nextStack = [...state.stack, path];
      if (nextStack.length > MAX_STACK_SIZE) {
        return { stack: nextStack.slice(nextStack.length - MAX_STACK_SIZE) };
      }
      return { stack: nextStack };
    });
  },

  replace: (path: string) => {
    if (!path || typeof path !== "string") return;
    set((state) => {
      if (state.stack.length === 0) return { stack: [path] };
      const nextStack = [...state.stack];
      nextStack[nextStack.length - 1] = path;
      return { stack: nextStack };
    });
  },

  pop: () => {
    const state = get();
    if (state.stack.length <= 1) return null;
    const current = state.stack[state.stack.length - 1];
    const previous = state.stack[state.stack.length - 2];
    set({ stack: state.stack.slice(0, -1) });
    return previous !== current ? previous : null;
  },

  reset: (initialPath = "/") => {
    set({ stack: [initialPath] });
  },

  canGoBack: () => {
    return get().stack.length > 1;
  },
}));
