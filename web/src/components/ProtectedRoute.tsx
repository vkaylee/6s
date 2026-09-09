import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { hasCapability, useAuthStore } from "../store/authStore.ts";
import type { UserRole } from "../types/index.ts";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedCapability?: string;
  allowedRole?: UserRole;
}

export function ProtectedRoute({ children, allowedCapability, allowedRole }: ProtectedRouteProps) {
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

  if (
    !user ||
    (allowedCapability && !hasCapability(user, allowedCapability)) ||
    (allowedRole && user.role !== allowedRole)
  ) {
    return null;
  }

  return <>{children}</>;
}
