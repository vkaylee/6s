import {
  ArrowUpDown,
  ChevronDown,
  Loader2,
  RotateCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, Route, Switch, useLocation, useSearch } from "wouter";
import { AppShell } from "./components/AppShell.tsx";
import { ConflictModal } from "./components/ConflictModal.tsx";
import { FilterDrawer } from "./components/FilterDrawer.tsx";
import { GlobalDialog } from "./components/GlobalDialog.tsx";
import { HealthGauge } from "./components/HealthGauge.tsx";
import { IssueCard } from "./components/IssueCard.tsx";
import { IssueCardSkeleton } from "./components/IssueCardSkeleton.tsx";
import { OfflineOutboxDrawer } from "./components/OfflineOutboxDrawer.tsx";
import { PageContainer } from "./components/PageContainer.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { QuickFacets } from "./components/QuickFacets.tsx";
import type { DraftResolve } from "./db/indexeddb.ts";
import { useDashboardData } from "./hooks/useDashboardData.ts";
import { useEdgeSwipeBack } from "./hooks/useEdgeSwipeBack.ts";
import { useSetupStatus } from "./hooks/useSetupStatus.ts";
import { useI18nStore } from "./i18n/index.ts";
import { CreateIssuePage } from "./pages/CreateIssuePage.tsx";
import { IssueDetailModal } from "./pages/IssueDetailModal.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { ScoreLedgerPage } from "./pages/ScoreLedgerPage.tsx";
import { SetupSuperadminModal } from "./pages/SetupSuperadminModal.tsx";

import { useAuthStore } from "./store/authStore.ts";
import { modalDialog } from "./store/dialogStore.ts";
import { useRouteHistoryStore } from "./store/routeHistoryStore.ts";
import { useThemeStore } from "./store/themeStore.ts";
import { resolveLocationNameByCode, UserRole } from "./types/index.ts";

const AdminConfigPage = lazy(() =>
  import("./pages/AdminConfigPage.tsx").then((m) => ({ default: m.AdminConfigPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage.tsx").then((m) => ({ default: m.ReportsPage })),
);
const UserAccessPage = lazy(() =>
  import("./pages/UserAccessPage.tsx").then((m) => ({ default: m.UserAccessPage })),
);
const PermissionMatrixPage = lazy(() =>
  import("./pages/PermissionMatrixPage.tsx").then((m) => ({ default: m.PermissionMatrixPage })),
);
const FactoryLocationsPage = lazy(() =>
  import("./pages/FactoryLocationsPage.tsx").then((m) => ({ default: m.FactoryLocationsPage })),
);
const IssueTagsPage = lazy(() =>
  import("./pages/IssueTagsPage.tsx").then((m) => ({ default: m.IssueTagsPage })),
);

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [location]);
  return null;
}

export function App() {
  const { t, locale } = useI18nStore();
  const { user, accessToken, restoreSession } = useAuthStore();
  const { initTheme } = useThemeStore();
  const [currentPath, setLocation] = useLocation();
  const searchString = useSearch();
  const dashboard = useDashboardData({ accessToken, locale, searchString, user });
  const [conflictItem, setConflictItem] = useState<DraftResolve | null>(null);
  const { isSetupOpen, setIsSetupOpen } = useSetupStatus();
  const pushRoute = useRouteHistoryStore((state) => state.push);
  const {
    issues,
    locations,
    tags,
    locationHealth,
    reporters,
    leaderboardTab,
    setLeaderboardTab,
    activeFacet,
    setActiveFacet,
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    isLoadingIssues,
    isLoadingMore,
    paginationMeta,
    showAllLeaderboard,
    setShowAllLeaderboard,
    isFilterDrawerOpen,
    setIsFilterDrawerOpen,
    advancedFilters,
    applyAdvancedFilters,
    resetAdvancedFilters,
    isDrawerOpen,
    setIsDrawerOpen,
    selectedIssue,
    setSelectedIssue,
    openIssueById,
    loadIssues,
    loadMoreIssues,
    loadMasterData,
    loadLeaderboards,
    sortedIssues,
    facetCounts,
    overallScore,
    totalOpen,
    totalOverdue,
  } = dashboard;

  useEffect(() => {
    initTheme();
    restoreSession();
  }, [initTheme, restoreSession]);

  useEffect(() => {
    const current = currentPath.split("?")[0];
    const stack = useRouteHistoryStore.getState().stack;
    const last = stack[stack.length - 1]?.split("?")[0];
    if (last !== current) {
      pushRoute(currentPath);
    }
  }, [currentPath, pushRoute]);

  const handleBack = useCallback(() => {
    const previous = useRouteHistoryStore.getState().pop();
    if (previous) {
      setLocation(previous.split("?")[0]);
    }
  }, [setLocation]);

  useEdgeSwipeBack({
    onBack: handleBack,
    enabled: Boolean(user) && !isSetupOpen,
    blocked: () =>
      isDrawerOpen || isFilterDrawerOpen || selectedIssue != null || conflictItem != null,
  });

  return (
    <>
      <ScrollToTop />
      <AppShell
        showStatusBar={Boolean(user) && !currentPath.startsWith("/login")}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        globalOverlay={
          <OfflineOutboxDrawer
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            onResolveConflict={(r) => setConflictItem(r)}
          />
        }
      >
        <Switch>
          <Route path="/login">
            <LoginPage />
          </Route>
          <Route path="/admin">
            <ProtectedRoute>
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <AdminConfigPage />
              </Suspense>
            </ProtectedRoute>
          </Route>
          <Route path="/admin/users">
            <ProtectedRoute>
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <UserAccessPage />
              </Suspense>
            </ProtectedRoute>
          </Route>
          <Route path="/admin/permissions">
            <ProtectedRoute>
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <PermissionMatrixPage />
              </Suspense>
            </ProtectedRoute>
          </Route>
          <Route path="/admin/locations">
            <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <FactoryLocationsPage />
              </Suspense>
            </ProtectedRoute>
          </Route>
          <Route path="/admin/tags">
            <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <IssueTagsPage />
              </Suspense>
            </ProtectedRoute>
          </Route>
          <Route path="/reports">
            <ProtectedRoute
              allowedRoles={[UserRole.ADMIN, UserRole.SAFETY_OFFICER, UserRole.LINE_LEADER]}
            >
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <ReportsPage />
              </Suspense>
            </ProtectedRoute>
          </Route>
          <Route path="/leaderboard/locations/:code">
            {(params) => (
              <ProtectedRoute>
                <ScoreLedgerPage
                  targetType="LOCATION"
                  id={params.code}
                  onSelectIssue={(issueId) => {
                    openIssueById(issueId);
                    setLocation(`/?issue_id=${issueId}`, { replace: true });
                  }}
                />
              </ProtectedRoute>
            )}
          </Route>
          <Route path="/leaderboard/reporters/:id">
            {(params) => (
              <ProtectedRoute>
                <ScoreLedgerPage
                  targetType="USER"
                  id={params.id}
                  onSelectIssue={(issueId) => {
                    openIssueById(issueId);
                    setLocation(`/?issue_id=${issueId}`, { replace: true });
                  }}
                />
              </ProtectedRoute>
            )}
          </Route>
          <Route path="/issues/new">
            <ProtectedRoute>
              <CreateIssuePage
                locations={locations}
                tags={tags}
                onSuccess={() => {
                  loadIssues();
                  loadLeaderboards();
                }}
              />
            </ProtectedRoute>
          </Route>
          <Route path="/">
            <ProtectedRoute>
              <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
                <main className="pt-4">
                  <PageContainer className="space-y-4">
                    {/* Health Gauge Ring Widget (SPEC.md Section 9.8.A) */}
                    <HealthGauge
                      score={overallScore}
                      openCount={totalOpen}
                      overdueCount={totalOverdue}
                      onClick={() => setActiveFacet("ALL")}
                    />

                    {/* Leaderboards widget (Tabs) */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-3">
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLeaderboardTab("LOCATIONS");
                              setShowAllLeaderboard(false);
                            }}
                            className={`text-xs font-black px-3 py-1.5 rounded-lg ${
                              leaderboardTab === "LOCATIONS"
                                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                                : "text-zinc-500"
                            }`}
                          >
                            {t("leaderboard.location_health")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLeaderboardTab("REPORTERS");
                              setShowAllLeaderboard(false);
                            }}
                            className={`text-xs font-black px-3 py-1.5 rounded-lg ${
                              leaderboardTab === "REPORTERS"
                                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                                : "text-zinc-500"
                            }`}
                          >
                            {t("leaderboard.top_reporters")}
                          </button>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60 px-2 py-0.5 rounded-md">
                          {leaderboardTab === "LOCATIONS"
                            ? t("leaderboard.cycle_weekly")
                            : t("leaderboard.cycle_monthly")}
                        </span>
                      </div>
                      {leaderboardTab === "LOCATIONS" ? (
                        <div className="space-y-2">
                          {locationHealth.length === 0 ? (
                            <div className="text-xs text-zinc-400 py-2 text-center">
                              {t("leaderboard.no_location_data")}
                            </div>
                          ) : (
                            (showAllLeaderboard ? locationHealth : locationHealth.slice(0, 3)).map(
                              (loc) => (
                                <Link
                                  key={loc.location_code}
                                  href={`/leaderboard/locations/${encodeURIComponent(loc.location_code)}`}
                                  className="w-full flex items-center justify-between text-xs p-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-left group"
                                >
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <span className="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 truncate">
                                      {resolveLocationNameByCode(
                                        locations,
                                        loc.location_code,
                                        loc.location_name,
                                        locale,
                                      )}
                                    </span>
                                    {loc.overdue_count > 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white animate-pulse shrink-0">
                                        {loc.overdue_count}{" "}
                                        {t("health_gauge.overdue_count").split(":")[0]}
                                      </span>
                                    )}
                                    {loc.open_count > 0 && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 shrink-0">
                                        {loc.open_count} {t("status.OPEN")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-black text-blue-600 dark:text-blue-400">
                                      {loc.health_score} {t("leaderboard.points_unit")}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 font-medium group-hover:text-zinc-600">
                                      →
                                    </span>
                                  </div>
                                </Link>
                              ),
                            )
                          )}
                          {locationHealth.length > 3 && (
                            <button
                              type="button"
                              onClick={() => setShowAllLeaderboard((prev) => !prev)}
                              className="w-full text-center py-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {showAllLeaderboard
                                ? t("common.collapse")
                                : t("leaderboard.view_all").replace(
                                    "{count}",
                                    String(locationHealth.length),
                                  )}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {reporters.length === 0 ? (
                            <div className="text-xs text-zinc-400 py-2 text-center">
                              {t("leaderboard.no_reporter_data")}
                            </div>
                          ) : (
                            (showAllLeaderboard ? reporters : reporters.slice(0, 3)).map(
                              (rep, idx) => (
                                <Link
                                  key={rep.user_id}
                                  href={`/leaderboard/reporters/${encodeURIComponent(String(rep.user_id))}`}
                                  className="w-full flex items-center justify-between text-xs p-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-left group"
                                >
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-amber-600">
                                      {idx === 0
                                        ? "🥇"
                                        : idx === 1
                                          ? "🥈"
                                          : idx === 2
                                            ? "🥉"
                                            : `#${idx + 1}`}{" "}
                                      {rep.full_name}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 font-medium">
                                      (🔍 {t("leaderboard.view_history")})
                                    </span>
                                  </div>
                                  <span className="font-black text-amber-600">
                                    {rep.points} {t("leaderboard.points_unit")} ({rep.valid_count}{" "}
                                    {t("leaderboard.issues_unit")})
                                  </span>
                                </Link>
                              ),
                            )
                          )}
                          {reporters.length > 3 && (
                            <button
                              type="button"
                              onClick={() => setShowAllLeaderboard((prev) => !prev)}
                              className="w-full text-center py-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              {showAllLeaderboard
                                ? t("common.collapse")
                                : t("leaderboard.view_all").replace(
                                    "{count}",
                                    String(reporters.length),
                                  )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quick Facets Bar */}
                    <QuickFacets
                      activeFacet={activeFacet}
                      onSelectFacet={(f) => setActiveFacet(f)}
                      counts={facetCounts}
                    />
                    {/* Search and Advanced Filter Row */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                          <Search className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t("app.search_placeholder")}
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-xs"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            aria-label={t("app.search_clear")}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {/* Filter Button */}
                      <button
                        type="button"
                        onClick={() => setIsFilterDrawerOpen(true)}
                        aria-label={t("filters.title")}
                        className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 min-h-[40px] px-3 text-xs font-bold transition-all shadow-xs ${
                          advancedFilters.statuses.length > 0 ||
                          advancedFilters.categories.length > 0 ||
                          advancedFilters.locationCodes.length > 0
                            ? "bg-rose-600 border-rose-600 text-white shadow-rose-200 dark:shadow-none"
                            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                        {(advancedFilters.statuses.length > 0 ||
                          advancedFilters.categories.length > 0 ||
                          advancedFilters.locationCodes.length > 0) && (
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        )}
                      </button>
                    </div>
                    {/* Active Filter Chips */}
                    {(advancedFilters.statuses.length > 0 ||
                      advancedFilters.categories.length > 0 ||
                      advancedFilters.locationCodes.length > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap px-1 text-xs">
                        <span className="text-zinc-400 text-[11px] font-medium">
                          {t("filters.filter_active")}:
                        </span>
                        {advancedFilters.locationCodes.map((code) => (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded-md font-semibold text-[11px]"
                          >
                            {code}
                            <button
                              type="button"
                              onClick={() =>
                                applyAdvancedFilters({
                                  ...advancedFilters,
                                  locationCodes: advancedFilters.locationCodes.filter(
                                    (c) => c !== code,
                                  ),
                                })
                              }
                              className="hover:text-rose-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {advancedFilters.categories.map((cat) => (
                          <span
                            key={cat}
                            className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded-md font-semibold text-[11px]"
                          >
                            {cat}
                            <button
                              type="button"
                              onClick={() =>
                                applyAdvancedFilters({
                                  ...advancedFilters,
                                  categories: advancedFilters.categories.filter((c) => c !== cat),
                                })
                              }
                              className="hover:text-rose-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {advancedFilters.statuses.map((st) => (
                          <span
                            key={st}
                            className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded-md font-semibold text-[11px]"
                          >
                            {t(`status.${st}`)}
                            <button
                              type="button"
                              onClick={() =>
                                applyAdvancedFilters({
                                  ...advancedFilters,
                                  statuses: advancedFilters.statuses.filter((s) => s !== st),
                                })
                              }
                              className="hover:text-rose-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={resetAdvancedFilters}
                          className="text-[11px] text-rose-600 dark:text-rose-400 font-bold hover:underline ml-1"
                        >
                          {t("filters.clear_all")}
                        </button>
                      </div>
                    )}

                    {/* Issue List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 text-xs font-bold text-zinc-500 uppercase px-1">
                        <span>{t("app.issues_list", { count: sortedIssues.length })}</span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg px-2 py-1 normal-case font-medium">
                            <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                            <select
                              value={sortOrder}
                              onChange={(e) =>
                                setSortOrder(e.target.value as "URGENT" | "NEWEST" | "OLDEST")
                              }
                              className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
                            >
                              <option value="URGENT">{t("app.sort_urgent")}</option>
                              <option value="NEWEST">{t("app.sort_newest")}</option>
                              <option value="OLDEST">{t("app.sort_oldest")}</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => loadIssues(true)}
                            className="text-blue-600 dark:text-blue-400 min-h-[36px] flex items-center gap-1 hover:underline lowercase font-semibold"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>{t("app.refresh")}</span>
                          </button>
                        </div>
                      </div>
                      {isLoadingIssues ? (
                        <div className="space-y-3">
                          <IssueCardSkeleton />
                          <IssueCardSkeleton />
                          <IssueCardSkeleton />
                        </div>
                      ) : sortedIssues.length === 0 ? (
                        <div className="text-center py-12 px-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center">
                          <span className="text-4xl mb-3 block">
                            {issues.length === 0 ? "🎉" : "🔍"}
                          </span>
                          <p className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
                            {issues.length === 0 ? t("app.empty_all_clear") : t("issue.no_issues")}
                          </p>
                          <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                            {issues.length === 0 ? "" : t("app.empty_search_desc")}
                          </p>
                          {(searchQuery || activeFacet !== "ALL") && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery("");
                                setActiveFacet("ALL");
                              }}
                              className="mt-4 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-xl transition"
                            >
                              {t("app.empty_reset_btn")}
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          {sortedIssues.map((iss) => (
                            <IssueCard
                              key={iss.id}
                              issue={iss}
                              locations={locations}
                              tags={tags}
                              onClick={() => setSelectedIssue(iss)}
                            />
                          ))}
                          {/* Load more controls & progress */}
                          <div className="pt-2 pb-4 space-y-2">
                            {paginationMeta && paginationMeta.total > 0 && (
                              <p className="text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                {issues.length < paginationMeta.total
                                  ? t("common.showing_count", {
                                      current: issues.length,
                                      total: paginationMeta.total,
                                    })
                                  : t("common.all_loaded", { total: paginationMeta.total })}
                              </p>
                            )}
                            {paginationMeta && issues.length < paginationMeta.total && (
                              <button
                                type="button"
                                onClick={loadMoreIssues}
                                disabled={isLoadingMore}
                                className="w-full min-h-[48px] py-3 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-sm rounded-2xl flex items-center justify-center gap-2 border border-zinc-200 dark:border-zinc-700 active:scale-[0.99] transition disabled:opacity-50"
                              >
                                {isLoadingMore ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                                    <span>{t("common.loading_more")}</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                                    <span>{t("common.load_more")}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </PageContainer>
                </main>

                {/* Bottom Sticky Action Bar (Glove Friendly 64px, SPEC.md Section 9.1) */}
                <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 z-30">
                  <PageContainer className="flex items-center justify-between gap-3">
                    <Link
                      href="/issues/new"
                      className="flex-1 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2 shadow-xl shadow-rose-600/30 transition-transform"
                    >
                      <span className="text-xl">📸</span>
                      <span>{t("issue.create").toUpperCase()}</span>
                    </Link>
                  </PageContainer>
                </div>

                {/* Modals & Drawers */}
                <FilterDrawer
                  isOpen={isFilterDrawerOpen}
                  onClose={() => setIsFilterDrawerOpen(false)}
                  locations={locations}
                  filters={advancedFilters}
                  onApply={applyAdvancedFilters}
                  onReset={resetAdvancedFilters}
                />

                {selectedIssue && (
                  <IssueDetailModal
                    issue={selectedIssue}
                    isOpen={true}
                    onClose={() => {
                      setSelectedIssue(null);
                      const currentParams = new URLSearchParams(searchString);
                      if (currentParams.has("issue_id")) {
                        currentParams.delete("issue_id");
                        const newSearch = currentParams.toString();
                        setLocation(newSearch ? `${currentPath}?${newSearch}` : currentPath, {
                          replace: true,
                        });
                      }
                    }}
                    onRefresh={() => {
                      loadIssues(true);
                      loadLeaderboards();
                    }}
                    locations={locations}
                    tags={tags}
                  />
                )}
                {conflictItem && (
                  <ConflictModal
                    resolveItem={conflictItem}
                    serverVersion={2}
                    onOverwrite={() => {
                      modalDialog.alert(t("conflict.overwrite_requested"));
                      setConflictItem(null);
                    }}
                    onDiscard={() => {
                      setConflictItem(null);
                    }}
                    onClose={() => setConflictItem(null)}
                  />
                )}
              </div>
            </ProtectedRoute>
          </Route>
          <Route>
            <NotFoundPage />
          </Route>
        </Switch>
      </AppShell>
      <SetupSuperadminModal
        isOpen={isSetupOpen}
        onSuccess={() => {
          setIsSetupOpen(false);
          loadMasterData();
          loadIssues();
        }}
      />
      <GlobalDialog />
    </>
  );
}
