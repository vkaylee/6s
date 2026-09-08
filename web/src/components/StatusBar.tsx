import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useHeaderVisibility } from "../hooks/useHeaderVisibility.ts";
import { useI18nStore } from "../i18n/index.ts";
import { useAuthStore } from "../store/authStore.ts";
import { type SyncProgress, syncEngine } from "../sync/syncEngine.ts";
import { UserRole } from "../types/index.ts";
import { NavActions } from "./NavActions.tsx";
import { PageContainer } from "./PageContainer.tsx";

interface StatusBarProps {
  onOpenDrawer: () => void;
  onNavigate?: (path: string) => void;
}

export function StatusBar({ onOpenDrawer, onNavigate }: StatusBarProps) {
  const { t } = useI18nStore();
  const storeUser = useAuthStore((s) => s.user);
  const user = typeof window === "undefined" ? useAuthStore.getState().user : storeUser;
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [progress, setProgress] = useState<SyncProgress>({
    total: 0,
    completed: 0,
    currentName: "",
    percent: 100,
    isSyncing: false,
    conflictCount: 0,
  });
  const isVisible = useHeaderVisibility();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileOpen(false);
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    if (isProfileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isProfileOpen]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubscribe = syncEngine.subscribe((p) => {
      setProgress(p);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, []);

  const hasPending = progress.total > 0;

  return (
    <header
      className={`sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 select-none shadow-sm transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <PageContainer className="min-h-14 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Left: Brand title & Sync/Network status */}
        <div className="flex items-center space-x-3">
          <div className="flex flex-col">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
              {t("nav.title")}
            </h1>
            <button
              type="button"
              onClick={onOpenDrawer}
              className="flex items-center space-x-1.5 text-left focus:outline-none group mt-0.5"
            >
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isOnline
                    ? hasPending
                      ? "bg-amber-500 animate-pulse"
                      : "bg-emerald-500"
                    : "bg-rose-500"
                }`}
              />
              <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider group-hover:underline">
                {isOnline ? (hasPending ? t("nav.syncing") : t("nav.online")) : t("nav.offline")}
              </span>
              {hasPending && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  ({progress.total - progress.completed})
                </span>
              )}
            </button>
          </div>

          {progress.conflictCount > 0 && (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full font-bold border border-amber-300 dark:border-amber-700 animate-bounce"
            >
              ⚠️ {progress.conflictCount}
            </button>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <NavActions />
          {user ? (
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen((prev) => !prev)}
                aria-expanded={isProfileOpen}
                aria-haspopup="true"
                aria-label={user.full_name}
                className="flex items-center space-x-2 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[40px]"
                title={user.full_name}
              >
                {/* Avatar Badge */}
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                  {user.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="text-left hidden sm:block leading-tight pr-1">
                  <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate max-w-[200px] lg:max-w-[260px]">
                    {user.full_name}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-medium truncate max-w-[200px] lg:max-w-[260px]">
                    {user.role}
                  </div>
                </div>
                <span className="text-xs text-zinc-400">▾</span>
              </button>

              {/* Profile Dropdown Popover */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-2 z-50 animate-slide-down">
                  {/* User Profile Card */}
                  <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                    <div className="text-xs font-black text-zinc-900 dark:text-zinc-100 truncate">
                      {user.full_name}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                      @{user.username} • {user.role}
                    </div>
                    {user.assigned_location_code && (
                      <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-0.5">
                        📍 {user.assigned_location_code}
                      </div>
                    )}
                  </div>

                  {/* Reports: management roles only */}
                  {(user.role === UserRole.ADMIN ||
                    user.role === UserRole.SAFETY_OFFICER ||
                    user.role === UserRole.LINE_LEADER) && (
                    <Link
                      href="/reports"
                      onClick={() => {
                        setIsProfileOpen(false);
                        onNavigate?.("/reports");
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center space-x-2 transition-colors min-h-[40px]"
                    >
                      <span>📊</span>
                      <span>{t("nav.reports")}</span>
                    </Link>
                  )}

                  {/* Action 1: Admin Settings (if admin) */}
                  {user.role === UserRole.ADMIN && (
                    <>
                      <Link
                        href="/admin/locations"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onNavigate?.("/admin/locations");
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center space-x-2 transition-colors min-h-[40px]"
                      >
                        <span>📍</span>
                        <span>{t("admin.locations_page_title")}</span>
                      </Link>
                      <Link
                        href="/admin/tags"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onNavigate?.("/admin/tags");
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center space-x-2 transition-colors min-h-[40px]"
                      >
                        <span>🏷️</span>
                        <span>{t("admin.tags_page_title")}</span>
                      </Link>
                      <Link
                        href="/admin"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onNavigate?.("/admin");
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center space-x-2 transition-colors min-h-[40px]"
                      >
                        <span>⚙️</span>
                        <span>{t("admin.title")}</span>
                      </Link>
                      <Link
                        href="/admin/users"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onNavigate?.("/admin/users");
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center space-x-2 transition-colors min-h-[40px]"
                      >
                        <span>👥</span>
                        <span>{t("admin.users_tab")}</span>
                      </Link>
                      <Link
                        href="/admin/permissions"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onNavigate?.("/admin/permissions");
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center space-x-2 transition-colors min-h-[40px]"
                      >
                        <span>🔑</span>
                        <span>{t("admin.permissions_tab")}</span>
                      </Link>
                    </>
                  )}

                  {/* Action 2: Logout */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      clearAuth();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center space-x-2 transition-colors min-h-[40px]"
                  >
                    <span>🚪</span>
                    <span>{t("auth.logout")}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate?.("/login")}
              className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl min-h-[36px] shadow-sm hover:bg-blue-700 transition-colors"
            >
              {t("auth.login")}
            </button>
          )}
        </div>
      </PageContainer>

      {progress.isSyncing && (
        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1 relative overflow-hidden">
          <div
            className="bg-blue-600 h-1 transition-all duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
    </header>
  );
}
