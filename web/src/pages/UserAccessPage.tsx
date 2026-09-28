import { useEffect, useState } from "react";
import { ApiError, apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { useHeaderVisibility } from "../hooks/useHeaderVisibility.ts";
import { useI18nStore } from "../i18n/index.ts";
import { useAuthStore } from "../store/authStore.ts";
import { modalDialog } from "../store/dialogStore.ts";
import {
  type AuthSource as AuthSourceType,
  type LocationItem,
  type ResponsibilityType,
  USER_ROLES,
  UserRole,
} from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";
import { UserRoleTable } from "./user-access/UserRoleTable.tsx";

export interface AdminUserItem {
  id: number;
  username: string;
  auth_source: AuthSourceType;
  full_name: string;
  email: string | null;
  role: UserRole;
  assigned_location_code: string | null;
  timezone?: string | null;
  locale?: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export const ALL_ROLES: UserRole[] = USER_ROLES;

type RoleFilter = "ALL" | UserRole;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export interface LocationMembershipItem {
  location_code: string;
  user_id: number;
  username: string;
  full_name: string;
  responsibility_type: ResponsibilityType;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
}

export function UserAccessPage() {
  useHeaderVisibility();
  const { t } = useI18nStore();
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<UserRole>(UserRole.USER);
  const [editLocation, setEditLocation] = useState<string>("");
  const [editTimezone, setEditTimezone] = useState<string>("");
  const [editLocale, setEditLocale] = useState<string>("vi-VN");

  useEffect(() => {
    loadUsers();
    loadLocations();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient<AdminUserItem[] | { users?: AdminUserItem[] }>(
        "/api/admin/users",
      );
      setUsers(Array.isArray(data) ? data : (data?.users ?? []));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("admin.users_load_error"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocations = async () => {
    try {
      const data = await apiClient<LocationItem[]>("/api/locations/all");
      setLocations(data || []);
    } catch {
      try {
        const fallback = await apiClient<LocationItem[]>("/api/locations");
        setLocations(fallback || []);
      } catch {
        // keep empty; location select shows placeholder only
      }
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    if (statusFilter === "ACTIVE" && !u.is_active) return false;
    if (statusFilter === "INACTIVE" && u.is_active) return false;
    return true;
  });

  const handleSaveEdit = async (target: AdminUserItem) => {
    setSavingId(target.id);
    try {
      const updated = await apiClient<AdminUserItem>(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: editRole,
          assigned_location_code: editLocation || null,
          timezone: editTimezone || null,
          locale: editLocale,
        }),
      });
      haptics.success();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingId(null);
    } catch (err) {
      haptics.errorOrConflict();
      modalDialog.alert(err instanceof ApiError ? err.message : t("admin.users_update_error"));
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (u: AdminUserItem) => {
    const nextActive = !u.is_active;
    const confirmed = await modalDialog.confirm(
      t(nextActive ? "admin.user_activate_confirm" : "admin.user_deactivate_confirm", {
        name: u.full_name || u.username,
      }),
      undefined,
      !nextActive,
    );
    if (!confirmed) return;
    setSavingId(u.id);
    try {
      const updated = await apiClient<AdminUserItem>(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: nextActive }),
      });
      haptics.success();
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      haptics.errorOrConflict();
      modalDialog.alert(err instanceof ApiError ? err.message : t("admin.users_update_error"));
    } finally {
      setSavingId(null);
    }
  };

  const handleStartEdit = (u: AdminUserItem) => {
    setEditingId(u.id);
    setEditRole(u.role);
    setEditLocation(u.assigned_location_code || "");
    setEditTimezone(u.timezone || "");
    setEditLocale(u.locale || "vi-VN");
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-28">
      {/* Page Heading */}
      <PageContainer className="pt-4 pb-3">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => goBack()}
            aria-label={t("common.back")}
            className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 min-h-[44px] min-w-[44px]"
          >
            ←
          </button>
          <h1 className="text-base font-black">{t("admin.users_tab")}</h1>
        </div>
      </PageContainer>

      <PageContainer>
        <section
          aria-label={t("admin.users_filter_title")}
          className="bg-white dark:bg-zinc-900 rounded-3xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="role-filter" className="block text-xs font-bold text-zinc-500 mb-1">
                {t("admin.users_filter_role")}
              </label>
              <select
                id="role-filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <option value="ALL">{t("common.all")}</option>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="status-filter" className="block text-xs font-bold text-zinc-500 mb-1">
                {t("common.status")}
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <option value="ALL">{t("common.all")}</option>
                <option value="ACTIVE">{t("admin.active_status")}</option>
                <option value="INACTIVE">{t("admin.inactive_status")}</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={loadUsers}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-blue-800"
          >
            🔄 {t("common.retry")}
          </button>
        </section>

        <section aria-live="polite" aria-busy={isLoading} className="space-y-3 mt-4">
          {isLoading ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 animate-pulse"
                >
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-2/3" />
                </div>
              ))}
              <span className="sr-only">{t("common.loading")}</span>
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-2xl p-4 text-sm font-bold"
            >
              ⚠️ {loadError}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-400 text-center">
              {t("admin.users_empty")}
            </div>
          ) : (
            <UserRoleTable
              users={filteredUsers}
              allUsers={users}
              locations={locations}
              currentUser={currentUser}
              editingId={editingId}
              editRole={editRole}
              editLocation={editLocation}
              editTimezone={editTimezone}
              editLocale={editLocale}
              savingId={savingId}
              t={t}
              onSaveEdit={handleSaveEdit}
              onToggleActive={handleToggleActive}
              onStartEdit={handleStartEdit}
              onCancelEdit={() => setEditingId(null)}
              onEditRoleChange={setEditRole}
              onEditLocationChange={setEditLocation}
              onEditTimezoneChange={setEditTimezone}
              onEditLocaleChange={setEditLocale}
            />
          )}
        </section>
      </PageContainer>
    </div>
  );
}
