import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "../store/authStore.ts";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const storeState = useAuthStore();
  // Support both SSR/test renderToString where React useSyncExternalStore passes getServerSnapshot (initialState)
  const user = storeState.user ?? useAuthStore.getState().user;
  const isLoading =
    typeof window === "undefined" ? useAuthStore.getState().isLoading : storeState.isLoading;
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
