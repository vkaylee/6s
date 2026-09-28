import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { ProtectedRoute } from "../components/ProtectedRoute.tsx";
import type { DraftResolve } from "../db/indexeddb.ts";
import type { SupportedLocale } from "../i18n/index.ts";
import { CreateIssuePage } from "../pages/CreateIssuePage.tsx";
import { LoginPage } from "../pages/LoginPage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { ScoreLedgerPage } from "../pages/ScoreLedgerPage.tsx";
import type { UserProfile } from "../store/authStore.ts";
import type { TeamItem } from "../types/index.ts";
import { UserRole } from "../types/index.ts";
import { AppDashboard } from "./AppDashboard.tsx";
import type { DashboardData } from "./types.ts";

const AdminConfigPage = lazy(() =>
  import("../pages/AdminConfigPage.tsx").then((m) => ({ default: m.AdminConfigPage })),
);
const ReportsPage = lazy(() =>
  import("../pages/ReportsPage.tsx").then((m) => ({ default: m.ReportsPage })),
);
const UserAccessPage = lazy(() =>
  import("../pages/UserAccessPage.tsx").then((m) => ({ default: m.UserAccessPage })),
);
const PermissionMatrixPage = lazy(() =>
  import("../pages/PermissionMatrixPage.tsx").then((m) => ({ default: m.PermissionMatrixPage })),
);
const FactoryLocationsPage = lazy(() =>
  import("../pages/FactoryLocationsPage.tsx").then((m) => ({ default: m.FactoryLocationsPage })),
);
const IssueTagsPage = lazy(() =>
  import("../pages/IssueTagsPage.tsx").then((m) => ({ default: m.IssueTagsPage })),
);
const TeamManagementPage = lazy(() =>
  import("../pages/TeamManagementPage.tsx").then((m) => ({ default: m.TeamManagementPage })),
);
const AssetManagementPage = lazy(() =>
  import("../pages/AssetManagementPage.tsx").then((m) => ({ default: m.AssetManagementPage })),
);

function LazyPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export interface AppRoutesProps {
  dashboard: DashboardData;
  t: (path: string, params?: Record<string, string | number>) => string;
  locale: SupportedLocale;
  user: UserProfile | null;
  currentPath: string;
  setLocation: (path: string, options?: { replace?: boolean }) => void;
  masterTeams: TeamItem[];
  conflictItem: DraftResolve | null;
  setConflictItem: (item: DraftResolve | null) => void;
}

export function AppRoutes({
  dashboard,
  t,
  locale,
  user,
  currentPath,
  setLocation,
  masterTeams,
  conflictItem,
  setConflictItem,
}: AppRoutesProps) {
  const { locations, tags, loadIssues, loadLeaderboards, openIssueById } = dashboard;

  return (
    <Switch>
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route path="/admin">
        <ProtectedRoute allowedCapability="settings:manage">
          <Suspense fallback={<LazyPageFallback />}>
            <AdminConfigPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedCapability="user:manage">
          <Suspense fallback={<LazyPageFallback />}>
            <UserAccessPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/permissions">
        <ProtectedRoute allowedRole={UserRole.SUPERADMIN}>
          <Suspense fallback={<LazyPageFallback />}>
            <PermissionMatrixPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/locations">
        <ProtectedRoute allowedCapability="masterdata:manage">
          <Suspense fallback={<LazyPageFallback />}>
            <FactoryLocationsPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/tags">
        <ProtectedRoute allowedCapability="masterdata:manage">
          <Suspense fallback={<LazyPageFallback />}>
            <IssueTagsPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/teams">
        <ProtectedRoute allowedCapability="user:manage">
          <Suspense fallback={<LazyPageFallback />}>
            <TeamManagementPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/assets">
        <ProtectedRoute allowedCapability="masterdata:manage">
          <Suspense fallback={<LazyPageFallback />}>
            <AssetManagementPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute allowedCapability="reports:view">
          <Suspense fallback={<LazyPageFallback />}>
            <ReportsPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/leaderboard/locations/:code">
        {(params) => (
          <ProtectedRoute allowedCapability="reports:view">
            <ScoreLedgerPage
              targetType="LOCATION"
              id={params.code}
              onSelectIssue={(issueId) => {
                openIssueById(issueId);
                setLocation(`${currentPath}?issue_id=${issueId}`, { replace: true });
              }}
            />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/leaderboard/reporters/:id">
        {(params) => (
          <ProtectedRoute allowedCapability="reports:view">
            <ScoreLedgerPage
              targetType="USER"
              id={params.id}
              onSelectIssue={(issueId) => {
                openIssueById(issueId);
                setLocation(`${currentPath}?issue_id=${issueId}`, { replace: true });
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
          <AppDashboard
            dashboard={dashboard}
            t={t}
            locale={locale}
            user={user}
            masterTeams={masterTeams}
            conflictItem={conflictItem}
            setConflictItem={setConflictItem}
          />
        </ProtectedRoute>
      </Route>
      <Route>
        <NotFoundPage />
      </Route>
    </Switch>
  );
}
