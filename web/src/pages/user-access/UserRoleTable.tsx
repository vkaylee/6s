import { hasCapability, type UserProfile } from "../../store/authStore.ts";
import { type LocationItem, UserRole } from "../../types/index.ts";
import { formatTime } from "../../utils/time.ts";
import type { AdminUserItem } from "../UserAccessPage.tsx";

type Translate = (path: string, params?: Record<string, string | number>) => string;

interface UserRoleTableProps {
  users: AdminUserItem[];
  allUsers: AdminUserItem[];
  locations: LocationItem[];
  currentUser: UserProfile | null;
  editingId: number | null;
  editRole: string;
  editLocation: string;
  editTimezone: string;
  editLocale: string;
  savingId: number | null;
  t: Translate;
  onSaveEdit: (user: AdminUserItem) => void;
  onToggleActive: (user: AdminUserItem) => void;
  onStartEdit: (user: AdminUserItem) => void;
  onCancelEdit: () => void;
  onEditRoleChange: (value: string) => void;
  onEditLocationChange: (value: string) => void;
  onEditTimezoneChange: (value: string) => void;
  onEditLocaleChange: (value: string) => void;
}

const ALL_ROLES: string[] = [
  UserRole.USER,
  UserRole.LINE_LEADER,
  UserRole.SAFETY_OFFICER,
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
];

function roleBadgeClass(role: string) {
  switch (role) {
    case UserRole.SUPERADMIN:
      return "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300";
    case UserRole.ADMIN:
      return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300";
    case UserRole.SAFETY_OFFICER:
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
    case UserRole.LINE_LEADER:
      return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";
    default:
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

export function UserRoleTable({
  users,
  allUsers,
  locations,
  currentUser,
  editingId,
  editRole,
  editLocation,
  editTimezone,
  editLocale,
  savingId,
  t,
  onSaveEdit,
  onToggleActive,
  onStartEdit,
  onCancelEdit,
  onEditRoleChange,
  onEditLocationChange,
  onEditTimezoneChange,
  onEditLocaleChange,
}: UserRoleTableProps) {
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      {users.map((u) => {
        const isSelf = currentUser?.id === u.id;
        const isEditing = editingId === u.id;
        const canManage = !isSelf && hasCapability(currentUser, "user:manage");
        const isLastActiveAdmin =
          u.role === UserRole.ADMIN &&
          u.is_active &&
          allUsers.filter((x) => x.role === UserRole.ADMIN && x.is_active).length <= 1;
        const isLastActiveSuperadmin =
          u.role === UserRole.SUPERADMIN &&
          u.is_active &&
          allUsers.filter((x) => x.role === UserRole.SUPERADMIN && x.is_active).length <= 1;
        return (
          <li key={u.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm truncate">{u.full_name || u.username}</span>
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
                  {u.last_login_at && (
                    <div>
                      🕒{" "}
                      {formatTime(
                        u.last_login_at,
                        u.locale ?? "vi-VN",
                        u.timezone ?? "Asia/Ho_Chi_Minh",
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isEditing && canManage ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveEdit(u);
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
                      onChange={(e) => onEditRoleChange(e.target.value)}
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
                      onChange={(e) => onEditLocationChange(e.target.value)}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`timezone-${u.id}`}
                      className="block text-xs font-bold text-zinc-500 mb-1"
                    >
                      {t("admin.users_timezone_label")}
                    </label>
                    <select
                      id={`timezone-${u.id}`}
                      value={editTimezone}
                      onChange={(e) => onEditTimezoneChange(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <option value="">{t("admin.users_timezone_inherit")}</option>
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (UTC+07:00)</option>
                      <option value="Asia/Shanghai">Asia/Shanghai (UTC+08:00)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (UTC+09:00)</option>
                      <option value="Europe/Berlin">Europe/Berlin</option>
                      <option value="America/Los_Angeles">America/Los_Angeles</option>
                      <option value="UTC">UTC</option>
                    </select>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {t("admin.users_timezone_hint")}
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor={`locale-${u.id}`}
                      className="block text-xs font-bold text-zinc-500 mb-1"
                    >
                      {t("admin.users_locale_label")}
                    </label>
                    <select
                      id={`locale-${u.id}`}
                      value={editLocale}
                      onChange={(e) => onEditLocaleChange(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <option value="vi-VN">{t("admin.users_locale_vi")}</option>
                      <option value="en-US">{t("admin.users_locale_en")}</option>
                      <option value="zh-CN">{t("admin.users_locale_zh")}</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCancelEdit}
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
            ) : canManage ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onStartEdit(u)}
                  className="flex-1 text-xs font-bold px-3 py-2.5 rounded-xl min-h-[44px] transition-colors border bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  ✏️ {t("common.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleActive(u)}
                  disabled={
                    savingId === u.id || isLastActiveAdmin || isLastActiveSuperadmin || isSelf
                  }
                  title={
                    isLastActiveAdmin || isLastActiveSuperadmin
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
                      ? t("admin.active_status")
                      : t("admin.inactive_status")}
                </button>
              </div>
            ) : null}
            {!canManage && !isEditing && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <span aria-hidden="true">⚠️</span>
                {t("admin.users_privileged_hint")}
              </p>
            )}

            {canManage && (isLastActiveAdmin || isLastActiveSuperadmin || isSelf) && !isEditing && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <span aria-hidden="true">⚠️</span>
                {isLastActiveAdmin || isLastActiveSuperadmin
                  ? t("admin.users_last_admin_hint")
                  : t("admin.users_self_hint")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
