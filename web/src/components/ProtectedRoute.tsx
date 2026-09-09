import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { hasCapability, useAuthStore } from "../store/authStore.ts";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedCapability?: string;
}

export function ProtectedRoute({ children, allowedCapability }: ProtectedRouteProps) {
  const storeState = useAuthStore();
  const user = storeState.user ?? useAuthStore.getState().user;
  const isLoading =
    typeof window === "undefined" ? useAuthStore.getState().isLoading : storeState.isLoading;
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      const target =
        location && location !== "/login" ? `?return_to=${encodeURIComponent(location)}` : "";
      setLocation(`/login${target}`, { replace: true });
    }
  }, [user, isLoading, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (allowedCapability && !hasCapability(user, allowedCapability))) {
    return null;
  }

  return <>{children}</>;
}
