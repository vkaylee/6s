import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useI18nStore } from "../i18n/index.ts";
import { hasCapability, useAuthStore } from "../store/authStore.ts";
import type { UserRole } from "../types/index.ts";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedCapability?: string;
  allowedRole?: UserRole;
}

export function ProtectedRoute({ children, allowedCapability, allowedRole }: ProtectedRouteProps) {
  const storeState = useAuthStore();
  const { t } = useI18nStore();
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

  if (!user) return null;

  const isForbidden =
    (allowedCapability && !hasCapability(user, allowedCapability)) ||
    (allowedRole && user.role !== allowedRole);

  if (isForbidden) {
    return (
      <main
        className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black px-4"
        aria-labelledby="protected-route-denied-title"
      >
        <section className="max-w-md text-center" role="alert">
          <h1
            id="protected-route-denied-title"
            className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {t("auth.access_denied_title")}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">{t("auth.access_denied_message")}</p>
          <button
            type="button"
            className="mt-6 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            onClick={() => setLocation("/")}
          >
            {t("auth.back_to_dashboard")}
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
