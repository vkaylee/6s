import { Trash2, X } from "lucide-react";
import { useI18nStore } from "../../i18n/index.ts";
import { type LocationItem, resolveLocationName, type TeamMemberItem } from "../../types/index.ts";
import type { AdminUserItem } from "../UserAccessPage.tsx";

export interface TeamLocationItem {
  team_id: number;
  location_code: string;
  created_at: string;
  name_vi: string;
  name_zh: string;
  name_en: string;
  period_id?: number;
  valid_from?: string;
  valid_to?: string | null;
}

interface TeamScopeModalProps {
  loading: boolean;
  error: boolean;
  members: TeamMemberItem[];
  locations: TeamLocationItem[];
  users: AdminUserItem[];
  availableLocations: LocationItem[];
  memberToAdd: string;
  locationToAdd: string;
  addingMember: boolean;
  removingMemberId: number | null;
  addingLocation: boolean;
  removingLocationCode: string | null;
  onRetry: () => void;
  onMemberChange: (value: string) => void;
  onAddMember: () => void;
  onRemoveMember: (userId: number, memberName: string) => void;
  onLocationChange: (value: string) => void;
  onAddLocation: () => void;
  onRemoveLocation: (code: string) => void;
}

export function TeamScopeModal({
  loading,
  error,
  members,
  locations,
  users,
  availableLocations,
  memberToAdd,
  locationToAdd,
  addingMember,
  removingMemberId,
  addingLocation,
  removingLocationCode,
  onRetry,
  onMemberChange,
  onAddMember,
  onRemoveMember,
  onLocationChange,
  onAddLocation,
  onRemoveLocation,
}: TeamScopeModalProps) {
  const { t, locale } = useI18nStore();

  if (loading) {
    return (
      <p className="text-xs text-zinc-500" role="status">
        {t("common.loading")}
      </p>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
      >
        <span>{t("admin.team_details_load_error")}</span>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[40px] rounded-lg bg-rose-600 px-3 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
          {t("admin.team_members_title")}
        </h3>
        {members.length === 0 ? (
          <p className="text-xs text-zinc-500">{t("admin.team_members_empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-800/60"
              >
                <span className="truncate font-semibold">
                  {member.full_name}
                  {member.username ? ` (@${member.username})` : ""}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onRemoveMember(
                      member.id,
                      member.full_name || member.username || String(member.id),
                    )
                  }
                  disabled={
                    removingMemberId !== null || addingMember || removingMemberId === member.id
                  }
                  aria-label={`${t("common.delete")} ${member.full_name}`}
                  className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 font-bold text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {removingMemberId === member.id
                    ? t("admin.member_removing_btn")
                    : t("common.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1 space-y-1 text-xs font-bold">
          <span>{t("admin.member_add_label")}</span>
          <select
            value={memberToAdd}
            onChange={(event) => onMemberChange(event.target.value)}
            disabled={addingMember || removingMemberId !== null}
            className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{t("common.search")}</option>
            {users
              .filter((user) => user.is_active && !members.some((member) => member.id === user.id))
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} (@{user.username})
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onAddMember}
          disabled={!memberToAdd || addingMember || removingMemberId !== null}
          className="min-h-[44px] rounded-xl bg-blue-600 px-4 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900"
        >
          {addingMember ? t("admin.member_adding_btn") : t("admin.member_add_btn")}
        </button>
      </div>
      <div className="space-y-2">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
          {t("admin.locations_page_title")}
        </h3>
        {locations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700">
            {t("admin.team_locations_empty")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {locations.map((item) => (
              <li
                key={item.location_code}
                className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold dark:bg-zinc-800"
              >
                <span className="flex min-w-0 flex-col">
                  {item.valid_from && (
                    <span className="text-[10px] font-normal text-zinc-500">
                      {item.valid_to
                        ? t("admin.team_location_period_closed")
                        : t("admin.team_location_period_current")}
                    </span>
                  )}
                  <span className="truncate">{resolveLocationName(item, locale)}</span>
                  <span className="font-mono text-[10px] font-normal text-zinc-500">
                    {t("admin.location_code_label_short")}: {item.location_code}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveLocation(item.location_code)}
                  disabled={
                    removingLocationCode !== null ||
                    addingLocation ||
                    removingLocationCode === item.location_code
                  }
                  aria-label={`${t("common.delete")} ${item.location_code}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 space-y-1 text-xs font-bold">
            <span>{t("common.location")}</span>
            <select
              value={locationToAdd}
              onChange={(event) => onLocationChange(event.target.value)}
              disabled={addingLocation || removingLocationCode !== null}
              className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t("issue.location_select")}</option>
              {availableLocations
                .filter(
                  (location) => !locations.some((item) => item.location_code === location.code),
                )
                .map((location) => (
                  <option key={location.code} value={location.code}>
                    [{location.code}] {resolveLocationName(location, locale)}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onAddLocation}
            disabled={!locationToAdd || addingLocation || removingLocationCode !== null}
            className="min-h-[44px] rounded-xl bg-blue-600 px-4 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900"
          >
            {addingLocation ? t("admin.team_location_adding_btn") : t("admin.add_location_btn")}
          </button>
        </div>
      </div>
    </>
  );
}
