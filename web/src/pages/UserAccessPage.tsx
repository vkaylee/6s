import { useEffect, useState } from "react";
import { ApiError, apiClient } from "../api/client.ts";
import { NavActions } from "../components/NavActions.tsx";
import { PageContainer } from "../components/PageContainer.tsx";
import { useHeaderVisibility } from "../hooks/useHeaderVisibility.ts";
import { useI18nStore } from "../i18n/index.ts";
import { useAuthStore } from "../store/authStore.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { type LocationItem, UserRole } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";

export interface AdminUserItem {
  id: number;
  username: string;
  auth_source: string;
  full_name: string;
  email: string | null;
  role: string;
  assigned_location_code: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

const ALL_ROLES: string[] = [
  UserRole.USER,
  UserRole.LINE_LEADER,
  UserRole.SAFETY_OFFICER,
  UserRole.ADMIN,
];

type RoleFilter = "ALL" | string;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export function UserAccessPage() {
  const { t } = useI18nStore();
  const isHeaderVisible = useHeaderVisibility();
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<string>(UserRole.USER);
  const [editLocation, setEditLocation] = useState<string>("");

  useEffect(() => {
    loadUsers();
    loadLocations();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient<AdminUserItem[]>("/api/admin/users");
      setUsers(data || []);
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

  const openEdit = (u: AdminUserItem) => {
    setEditingId(u.id);
    setEditRole(u.role);
    setEditLocation(u.assigned_location_code || "");
  };

  const handleSaveEdit = async (target: AdminUserItem) => {
    setSavingId(target.id);
    try {
      const updated = await apiClient<AdminUserItem>(`/api/admin/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: editRole,
          assigned_location_code: editLocation || null,
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

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case UserRole.ADMIN:
        return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300";
      case UserRole.SAFETY_OFFICER:
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
      case UserRole.LINE_LEADER:
        return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";
      default:
        return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      <header
        className={`sticky top-0 z-40 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 transition-transform ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goBack()}
            aria-label={t("common.back")}
            className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 min-h-[44px] min-w-[44px]"
          >
            ←
          </button>
          <h1 className="text-base font-black">{t("admin.users_tab")}</h1>
          <NavActions />
        </div>
      </header>

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
                onChange={(e) => setRoleFilter(e.target.value)}
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
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              {filteredUsers.map((u) => {
                const isSelf = currentUser?.id === u.id;
                const isEditing = editingId === u.id;
                const isLastActiveAdmin =
                  u.role === UserRole.ADMIN &&
                  u.is_active &&
                  users.filter((x) => x.role === UserRole.ADMIN && x.is_active).length <= 1;
                return (
                  <li key={u.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm truncate">
                            {u.full_name || u.username}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadgeClass(u.role)}`}
                          >
                            {u.role}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              u.is_active
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {u.is_active ? t("admin.active_status") : t("admin.inactive_status")}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
                          <div className="font-mono">
                            @{u.username} • {u.auth_source}
                          </div>
                          {u.assigned_location_code && (
                            <div className="text-blue-600 dark:text-blue-400 font-bold">
                              📍 {u.assigned_location_code}
                            </div>
                          )}
                          {u.last_login_at && <div>🕒 {u.last_login_at}</div>}
                        </div>
                      </div>
                    </div>

                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleSaveEdit(u);
                        }}
                        className="space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-3"
                        aria-label={t("admin.users_edit_title", {
                          name: u.full_name || u.username,
                        })}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor={`role-${u.id}`}
                              className="block text-xs font-bold text-zinc-500 mb-1"
                            >
                              {t("admin.users_role_label")}
                            </label>
                            <select
                              id={`role-${u.id}`}
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-600"
                            >
                              {ALL_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor={`loc-${u.id}`}
                              className="block text-xs font-bold text-zinc-500 mb-1"
                            >
                              {t("admin.users_location_label")}
                            </label>
                            <select
                              id={`loc-${u.id}`}
                              value={editLocation}
                              onChange={(e) => setEditLocation(e.target.value)}
                              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-600"
                            >
                              <option value="">{t("admin.users_no_location")}</option>
                              {locations.map((l) => (
                                <option key={l.code} value={l.code}>
                                  {l.code} — {l.name_vi}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-3 px-4 rounded-xl min-h-[48px] transition-colors focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            {t("common.cancel")}
                          </button>
                          <button
                            type="submit"
                            disabled={savingId === u.id}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] transition-colors shadow-sm disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-800"
                          >
                            {savingId === u.id ? t("admin.users_saving") : t("common.save")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="flex-1 text-xs font-bold px-3 py-2.5 rounded-xl min-h-[44px] transition-colors border bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          ✏️ {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          disabled={savingId === u.id || isLastActiveAdmin || isSelf}
                          title={
                            isLastActiveAdmin
                              ? t("admin.users_last_admin_hint")
                              : isSelf
                                ? t("admin.users_self_hint")
                                : undefined
                          }
                          className={`flex-1 text-xs font-bold px-3 py-2.5 rounded-xl min-h-[44px] transition-colors border focus-visible:ring-2 focus-visible:ring-blue-600 ${
                            u.is_active
                              ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-100"
                              : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100"
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          {savingId === u.id
                            ? t("admin.users_saving")
                            : u.is_active
                              ? t("admin.inactive_status")
                              : t("admin.active_status")}
                        </button>
                      </div>
                    )}

                    {(isLastActiveAdmin || isSelf) && !isEditing && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                        <span aria-hidden="true">⚠️</span>
                        {isLastActiveAdmin
                          ? t("admin.users_last_admin_hint")
                          : t("admin.users_self_hint")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </PageContainer>
    </div>
  );
}
