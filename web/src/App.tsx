import { useCallback, useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { GlobalDialog } from "./components/GlobalDialog.tsx";
import type { DraftResolve } from "./db/indexeddb.ts";
import { useDashboardData } from "./hooks/useDashboardData.ts";
import { useEdgeSwipeBack } from "./hooks/useEdgeSwipeBack.ts";
import { useKeyboardViewport } from "./hooks/useKeyboardViewport.ts";
import { useSetupStatus } from "./hooks/useSetupStatus.ts";
import { useI18nStore } from "./i18n/index.ts";
import { AppLayout } from "./layout/AppLayout.tsx";
import { AppRoutes } from "./layout/AppRoutes.tsx";
import { IssueDetailModal } from "./pages/IssueDetailModal.tsx";
import { SetupSuperadminModal } from "./pages/SetupSuperadminModal.tsx";
import { useAuthStore } from "./store/authStore.ts";
import { useMasterdataStore } from "./store/masterdataStore.ts";
import { useRouteHistoryStore } from "./store/routeHistoryStore.ts";
import { useThemeStore } from "./store/themeStore.ts";

export function isBackGestureBlocked(
  isDrawerOpen: boolean,
  isFilterDrawerOpen: boolean,
  conflictItem: unknown,
) {
  return isDrawerOpen || isFilterDrawerOpen || conflictItem != null;
}

export function App() {
  const { t, locale } = useI18nStore();
  const { user, restoreSession } = useAuthStore();
  const { initTheme } = useThemeStore();
  const [currentPath, setLocation] = useLocation();
  const searchString = useSearch();
  const dashboard = useDashboardData({ locale, searchString, user });
  const [conflictItem, setConflictItem] = useState<DraftResolve | null>(null);
  const { isSetupOpen, setIsSetupOpen } = useSetupStatus();
  const pushRoute = useRouteHistoryStore((state) => state.push);

  const {
    locations,
    tags,
    searchQuery,
    setSearchQuery,
    isFilterDrawerOpen,
    isDrawerOpen,
    setIsDrawerOpen,
    selectedIssue,
    setSelectedIssue,
    loadIssues,
    loadMasterData,
    loadLeaderboards,
  } = dashboard;

  const masterTeams = useMasterdataStore((state) => state.teams);
  const loadMasterdataReference = useMasterdataStore((state) => state.loadReference);

  useEffect(() => {
    if (user) loadMasterdataReference();
  }, [user, loadMasterdataReference]);

  useEffect(() => {
    initTheme();
    restoreSession();
  }, [initTheme, restoreSession]);

  useKeyboardViewport();

  useEffect(() => {
    const current = currentPath.split("?")[0];
    const stack = useRouteHistoryStore.getState().stack;
    const last = stack[stack.length - 1]?.split("?")[0];
    if (last !== current) {
      pushRoute(currentPath);
    }
  }, [currentPath, pushRoute]);

  const closeIssue = useCallback(() => {
    setSelectedIssue(null);
    const currentParams = new URLSearchParams(searchString);
    if (currentParams.has("issue_id")) {
      currentParams.delete("issue_id");
      const newSearch = currentParams.toString();
      setLocation(newSearch ? `${currentPath}?${newSearch}` : currentPath, {
        replace: true,
      });
    }
  }, [currentPath, searchString, setLocation, setSelectedIssue]);

  const handleBack = useCallback(() => {
    if (selectedIssue) {
      closeIssue();
      return;
    }
    const previous = useRouteHistoryStore.getState().pop();
    if (previous) {
      setLocation(previous.split("?")[0]);
    }
  }, [closeIssue, selectedIssue, setLocation]);

  useEdgeSwipeBack({
    onBack: handleBack,
    enabled: Boolean(user) && !isSetupOpen,
    blocked: () => isBackGestureBlocked(isDrawerOpen, isFilterDrawerOpen, conflictItem),
  });

  return (
    <>
      <AppLayout
        showStatusBar={Boolean(user) && !currentPath.startsWith("/login")}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onCloseDrawer={() => setIsDrawerOpen(false)}
        isDrawerOpen={isDrawerOpen}
        onResolveConflict={(r) => setConflictItem(r)}
        searchQuery={currentPath === "/" ? searchQuery : undefined}
        onSearchChange={currentPath === "/" ? setSearchQuery : undefined}
      >
        <AppRoutes
          dashboard={dashboard}
          t={t}
          locale={locale}
          user={user}
          currentPath={currentPath}
          setLocation={setLocation}
          masterTeams={masterTeams}
          conflictItem={conflictItem}
          setConflictItem={setConflictItem}
        />
        {selectedIssue && (
          <IssueDetailModal
            issue={selectedIssue}
            isOpen={true}
            onClose={closeIssue}
            onRefresh={() => {
              loadIssues(true);
              loadLeaderboards();
            }}
            locations={locations}
            tags={tags}
          />
        )}
      </AppLayout>
      <SetupSuperadminModal
        isOpen={isSetupOpen}
        onSuccess={() => {
          setIsSetupOpen(false);
          loadMasterData();
          loadIssues();
        }}
        onClose={() => setIsSetupOpen(false)}
      />
      <GlobalDialog />
    </>
  );
}
