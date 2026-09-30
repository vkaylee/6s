import { SlidersHorizontal } from "lucide-react";
import { FilterDrawer } from "../components/FilterDrawer.tsx";
import { HealthGauge } from "../components/HealthGauge.tsx";
import { PageContainer } from "../components/PageContainer.tsx";
import { QuickFacets } from "../components/QuickFacets.tsx";
import type { DraftResolve } from "../db/indexeddb.ts";
import type { SupportedLocale } from "../i18n/index.ts";
import { hasCapability, type UserProfile, useAuthStore } from "../store/authStore.ts";
import type { TeamItem } from "../types/index.ts";
import { AppFilterChips } from "./AppFilterChips.tsx";
import { AppIssueList } from "./AppIssueList.tsx";
import { AppLeaderboardsWidget } from "./AppLeaderboardsWidget.tsx";
import { AppNavigation } from "./AppNavigation.tsx";
import { AppConflictResolution, AppSyncErrors } from "./AppSyncBanner.tsx";
import type { DashboardData } from "./types.ts";

export interface AppDashboardProps {
  dashboard: DashboardData;
  t: (path: string, params?: Record<string, string | number>) => string;
  locale: SupportedLocale;
  user: UserProfile | null;
  masterTeams: TeamItem[];
  conflictItem: DraftResolve | null;
  setConflictItem: (item: DraftResolve | null) => void;
}

export function AppDashboard({
  dashboard,
  t,
  locale,
  user,
  masterTeams,
  conflictItem,
  setConflictItem,
}: AppDashboardProps) {
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
    openIssueById,
    loadIssues,
    loadMoreIssues,
    loadMasterData,
    loadLeaderboards,
    dashboardErrors: dashboardErrorsState,
    retryIssues = () => loadIssues(true),
    retryMasterData = () => loadMasterData(),
    retryLeaderboards = () => loadLeaderboards(),
    sortedIssues,
    facetCounts,
    overallScore,
    totalOpen,
    totalOverdue,
  } = dashboard;

  const hasActiveFilters =
    advancedFilters.statuses.length > 0 ||
    advancedFilters.categories.length > 0 ||
    advancedFilters.locationCodes.length > 0 ||
    advancedFilters.assignedTeamId != null ||
    advancedFilters.mineTeam ||
    advancedFilters.deletion === "deleted";

  const selectedTeamLabel = advancedFilters.assignedTeamId
    ? (() => {
        const team = masterTeams.find((item) => item.id === advancedFilters.assignedTeamId);
        return team ? `${team.name} (${team.code})` : `#${advancedFilters.assignedTeamId}`;
      })()
    : "";

  const canViewHealth = hasCapability(user ?? useAuthStore.getState().user, "reports:view");
  const dashboardErrors =
    dashboardErrorsState &&
    typeof dashboardErrorsState === "object" &&
    "masterData" in dashboardErrorsState
      ? dashboardErrorsState
      : { issues: false, masterData: false, leaderboards: false };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-36 sm:pb-28">
      <main className="pt-4">
        <PageContainer className="space-y-4">
          <AppSyncErrors
            masterDataError={dashboardErrors.masterData}
            issuesError={dashboardErrors.issues}
            onRetryMasterData={retryMasterData}
            onRetryIssues={retryIssues}
            t={t}
          />

          {canViewHealth && (
            <>
              <HealthGauge
                score={overallScore}
                openCount={totalOpen}
                overdueCount={totalOverdue}
                onClick={() => setActiveFacet("ALL")}
              />

              <AppLeaderboardsWidget
                locationHealth={locationHealth}
                reporters={reporters}
                locations={locations}
                locale={locale}
                leaderboardTab={leaderboardTab}
                setLeaderboardTab={setLeaderboardTab}
                showAllLeaderboard={showAllLeaderboard}
                setShowAllLeaderboard={setShowAllLeaderboard}
                dashboardErrors={dashboardErrors}
                retryLeaderboards={retryLeaderboards}
                t={t}
              />
            </>
          )}

          {/* Quick Facets Bar */}
          <QuickFacets
            activeFacet={activeFacet}
            onSelectFacet={setActiveFacet}
            counts={facetCounts}
          />

          {/* Search lives in the global header */}
          <div className="flex items-center justify-end gap-2">
            {/* Filter Button */}
            <button
              type="button"
              onClick={() => setIsFilterDrawerOpen(true)}
              aria-label={t("filters.title")}
              className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 min-h-[40px] px-3 text-xs font-bold transition-all shadow-xs ${
                hasActiveFilters
                  ? "bg-rose-600 border-rose-600 text-white shadow-rose-200 dark:shadow-none"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
            </button>
          </div>

          {/* Active Filter Chips */}
          <AppFilterChips
            advancedFilters={advancedFilters}
            applyAdvancedFilters={applyAdvancedFilters}
            resetAdvancedFilters={resetAdvancedFilters}
            setActiveFacet={setActiveFacet}
            selectedTeamLabel={selectedTeamLabel}
            hasActiveFilters={hasActiveFilters}
            t={t}
          />

          {/* Issue List */}
          <AppIssueList
            issues={issues}
            sortedIssues={sortedIssues}
            locations={locations}
            masterTeams={masterTeams}
            tags={tags}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            isLoadingIssues={isLoadingIssues}
            isLoadingMore={isLoadingMore}
            paginationMeta={paginationMeta}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            activeFacet={activeFacet}
            setActiveFacet={setActiveFacet}
            loadIssues={loadIssues}
            loadMoreIssues={loadMoreIssues}
            openIssueById={openIssueById}
            t={t}
          />
        </PageContainer>
      </main>

      {/* Bottom Sticky Action Bar (Glove Friendly 64px, SPEC.md Section 9.1) */}
      <AppNavigation t={t} />

      {/* Modals & Drawers */}
      <FilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        locations={locations}
        teams={masterTeams}
        filters={advancedFilters}
        onApply={applyAdvancedFilters}
        onReset={() => {
          setActiveFacet("ALL");
          resetAdvancedFilters();
        }}
        canViewDeleted={hasCapability(user, "issue:view_deleted")}
      />

      <AppConflictResolution conflictItem={conflictItem} onResolve={setConflictItem} t={t} />
    </div>
  );
}
