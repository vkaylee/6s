import { Plus, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { useMasterdataStore } from "../store/masterdataStore.ts";
import {
  type LocationItem,
  resolveLocationName,
  type TeamItem,
  type TeamMemberItem,
} from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";
import type { AdminUserItem } from "./UserAccessPage.tsx";

interface TeamLocationItem {
  team_id: number;
  location_code: string;
  created_at: string;
  name_vi: string;
  name_zh: string;
  name_en: string;
}

export function TeamManagementPage() {
  const { t, locale } = useI18nStore();
  const loadReference = useMasterdataStore((state) => state.loadReference);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const expandedTeamIdRef = useRef<number | null>(null);
  const detailRequestRef = useRef(0);
  const memberActionRef = useRef(0);
  const locationActionRef = useRef(0);
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [teamDetailsError, setTeamDetailsError] = useState(false);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [teamLocations, setTeamLocations] = useState<TeamLocationItem[]>([]);
  const [locationToAdd, setLocationToAdd] = useState("");
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [removingLocationCode, setRemovingLocationCode] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [teamData, userData, locationData] = await Promise.all([
        apiClient<TeamItem[]>("/api/teams"),
        apiClient<AdminUserItem[]>("/api/admin/users"),
        apiClient<LocationItem[]>("/api/locations/all"),
      ]);
      setTeams(teamData || []);
      setUsers(Array.isArray(userData) ? userData : []);
      setLocations(locationData || []);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMembers = async (teamId: number) => {
    const requestId = ++detailRequestRef.current;
    setIsLoadingMembers(true);
    setTeamDetailsError(false);
    try {
      const [memberData, locationData] = await Promise.all([
        apiClient<TeamMemberItem[]>(`/api/admin/teams/${teamId}/members`),
        apiClient<TeamLocationItem[]>(`/api/admin/teams/${teamId}/locations`),
      ]);
      if (requestId !== detailRequestRef.current || expandedTeamIdRef.current !== teamId) return;
      setMembers(Array.isArray(memberData) ? memberData : []);
      setTeamLocations(Array.isArray(locationData) ? locationData : []);
    } catch {
      if (requestId !== detailRequestRef.current || expandedTeamIdRef.current !== teamId) return;
      setTeamDetailsError(true);
    } finally {
      if (requestId === detailRequestRef.current && expandedTeamIdRef.current === teamId) {
        setIsLoadingMembers(false);
      }
    }
  };

  const handleToggleExpand = async (teamId: number) => {
    if (expandedTeamIdRef.current === teamId) {
      detailRequestRef.current += 1;
      expandedTeamIdRef.current = null;
      setExpandedTeamId(null);
      setMembers([]);
      setTeamLocations([]);
      setTeamDetailsError(false);
      setIsLoadingMembers(false);
      return;
    }
    expandedTeamIdRef.current = teamId;
    setExpandedTeamId(teamId);
    setMembers([]);
    setTeamLocations([]);
    setTeamDetailsError(false);
    setMemberToAdd("");
    setLocationToAdd("");
    await loadMembers(teamId);
  };

  const handleAddTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    setIsAdding(true);
    try {
      const created = await apiClient<TeamItem>("/api/admin/teams", {
        method: "POST",
        body: JSON.stringify({
          code: newCode.trim().toUpperCase(),
          name: newName.trim(),
          is_active: true,
        }),
      });
      setTeams((prev) => [...prev.filter((team) => team.id !== created.id), created]);
      setNewCode("");
      setNewName("");
      await loadReference(true);
      haptics.success();
      await modalDialog.success(t("admin.team_add_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.team_add_error"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleSaveTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingTeamId == null || !editCode.trim() || !editName.trim()) return;
    setIsSaving(true);
    try {
      const updated = await apiClient<TeamItem>(`/api/admin/teams/${editingTeamId}`, {
        method: "PUT",
        body: JSON.stringify({ code: editCode.trim().toUpperCase(), name: editName.trim() }),
      });
      setTeams((prev) =>
        prev.map((team) => (team.id === updated.id ? { ...team, ...updated } : team)),
      );
      setEditingTeamId(null);
      await loadReference(true);
      haptics.success();
      await modalDialog.success(t("admin.team_update_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.team_update_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (team: TeamItem) => {
    try {
      const updated = await apiClient<TeamItem>(`/api/admin/teams/${team.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !team.is_active }),
      });
      setTeams((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      await loadReference(true);
      haptics.success();
      await modalDialog.success(t("admin.location_status_updated"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.location_status_error"));
    }
  };

  const handleAddMember = async () => {
    const teamId = expandedTeamId;
    if (teamId == null || !memberToAdd || isAddingMember || removingMemberId !== null) return;
    const userId = memberToAdd;
    const actionId = ++memberActionRef.current;
    setIsAddingMember(true);
    try {
      await apiClient(`/api/admin/teams/${teamId}/members/${userId}`, {
        method: "PUT",
      });
      if (expandedTeamIdRef.current === teamId) {
        setMemberToAdd("");
        await loadMembers(teamId);
      }
      haptics.success();
      await modalDialog.success(t("admin.member_add_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.member_add_error"));
    } finally {
      if (memberActionRef.current === actionId) setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: number, memberName: string) => {
    const teamId = expandedTeamId;
    if (teamId == null || removingMemberId !== null || isAddingMember) return;
    const confirmed = await modalDialog.confirm(
      t("admin.member_remove_confirm", { name: memberName }),
      undefined,
      true,
    );
    if (!confirmed || expandedTeamIdRef.current !== teamId) return;
    const actionId = ++memberActionRef.current;
    setRemovingMemberId(userId);
    try {
      await apiClient(`/api/admin/teams/${teamId}/members/${userId}`, {
        method: "DELETE",
      });
      if (expandedTeamIdRef.current === teamId) {
        setMembers((prev) => prev.filter((member) => member.id !== userId));
      }
      haptics.success();
      await modalDialog.success(t("admin.member_remove_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.member_remove_error"));
    } finally {
      if (memberActionRef.current === actionId) setRemovingMemberId(null);
    }
  };

  const handleAddTeamLocation = async () => {
    const teamId = expandedTeamId;
    if (teamId == null || !locationToAdd || isAddingLocation || removingLocationCode !== null)
      return;
    const code = locationToAdd;
    const actionId = ++locationActionRef.current;
    setIsAddingLocation(true);
    try {
      await apiClient(`/api/admin/teams/${teamId}/locations/${encodeURIComponent(code)}`, {
        method: "PUT",
      });
      if (expandedTeamIdRef.current === teamId) {
        setLocationToAdd("");
        await loadMembers(teamId);
      }
      haptics.success();
      await modalDialog.success(t("admin.team_location_add_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.location_add_error"));
    } finally {
      if (locationActionRef.current === actionId) setIsAddingLocation(false);
    }
  };

  const handleRemoveTeamLocation = async (code: string) => {
    const teamId = expandedTeamId;
    if (teamId == null || removingLocationCode !== null || isAddingLocation) return;
    const confirmed = await modalDialog.confirm(
      t("admin.team_location_remove_confirm", { code }),
      undefined,
      true,
    );
    if (!confirmed || expandedTeamIdRef.current !== teamId) return;
    const actionId = ++locationActionRef.current;
    setRemovingLocationCode(code);
    try {
      await apiClient(`/api/admin/teams/${teamId}/locations/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      if (expandedTeamIdRef.current === teamId) {
        setTeamLocations((prev) => prev.filter((item) => item.location_code !== code));
      }
      haptics.success();
      await modalDialog.success(t("admin.team_location_remove_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.location_status_error"));
    } finally {
      if (locationActionRef.current === actionId) setRemovingLocationCode(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 pb-20 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <PageContainer className="pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goBack("/")}
            className="min-h-[40px] rounded-xl px-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← {t("common.back")}
          </button>
          <h1 className="text-lg font-black">{t("admin.teams_page_title")}</h1>
        </div>

        {loadError && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <span>{t("app.load_error_title")}</span>
            <button
              type="button"
              onClick={loadAll}
              className="min-h-[40px] w-fit rounded-xl bg-rose-600 px-4 text-xs font-bold text-white"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        <form
          onSubmit={handleAddTeam}
          className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold">
              <span>{t("admin.team_code_label")}</span>
              <input
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                placeholder={t("admin.team_code_placeholder")}
                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="space-y-1 text-xs font-bold">
              <span>{t("admin.team_name_label")}</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t("admin.team_name_placeholder")}
                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isAdding}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {isAdding ? t("admin.adding_team_btn") : t("admin.add_team_btn")}
          </button>
        </form>

        {isLoading && <p className="text-sm text-zinc-500">{t("admin.loading_teams")}</p>}
        {!isLoading && teams.length === 0 && (
          <p className="text-sm text-zinc-500">{t("admin.empty_teams")}</p>
        )}

        <ul className="space-y-3">
          {teams.map((team) => (
            <li
              key={team.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {editingTeamId === team.id ? (
                <form onSubmit={handleSaveTeam} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={editCode}
                      onChange={(event) => setEditCode(event.target.value)}
                      aria-label={t("admin.team_code_label")}
                      className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      aria-label={t("admin.team_name_label")}
                      className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="min-h-[44px] rounded-xl bg-blue-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {t("admin.save_team_btn")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTeamId(null)}
                      className="min-h-[44px] rounded-xl bg-zinc-100 px-4 text-xs font-bold dark:bg-zinc-800"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {team.name}{" "}
                        <span className="text-xs font-normal text-zinc-500">({team.code})</span>
                      </p>
                      <p className="text-[11px] font-bold text-zinc-500">
                        {team.is_active ? t("admin.active_status") : t("admin.inactive_status")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleExpand(team.id)}
                        aria-expanded={expandedTeamId === team.id}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-xs font-bold dark:border-zinc-700"
                      >
                        <Users className="h-3.5 w-3.5" />
                        {t("admin.team_members_title")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(team)}
                        className="min-h-[40px] rounded-xl border border-zinc-200 px-3 text-xs font-bold dark:border-zinc-700"
                      >
                        {t("admin.toggle_status")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTeamId(team.id);
                          setEditCode(team.code);
                          setEditName(team.name);
                        }}
                        className="min-h-[40px] rounded-xl border border-zinc-200 px-3 text-xs font-bold dark:border-zinc-700"
                      >
                        {t("admin.edit_location_btn")}
                      </button>
                    </div>
                  </div>

                  {expandedTeamId === team.id && (
                    <div
                      className="mt-3 space-y-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"
                      aria-busy={isLoadingMembers}
                    >
                      {isLoadingMembers ? (
                        <p className="text-xs text-zinc-500" role="status">
                          {t("common.loading")}
                        </p>
                      ) : teamDetailsError ? (
                        <div
                          role="alert"
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          <span>{t("admin.team_details_load_error")}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (expandedTeamId !== null) void loadMembers(expandedTeamId);
                            }}
                            className="min-h-[40px] rounded-lg bg-rose-600 px-3 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900"
                          >
                            {t("common.retry")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
                              {t("admin.team_members_title")}
                            </h3>
                            {members.length === 0 ? (
                              <p className="text-xs text-zinc-500">
                                {t("admin.team_members_empty")}
                              </p>
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
                                        handleRemoveMember(
                                          member.id,
                                          member.full_name || member.username || String(member.id),
                                        )
                                      }
                                      disabled={
                                        removingMemberId !== null ||
                                        isAddingMember ||
                                        removingMemberId === member.id
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
                                onChange={(event) => setMemberToAdd(event.target.value)}
                                disabled={isAddingMember || removingMemberId !== null}
                                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="">{t("common.search")}</option>
                                {users
                                  .filter(
                                    (user) =>
                                      user.is_active &&
                                      !members.some((member) => member.id === user.id),
                                  )
                                  .map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {user.full_name} (@{user.username})
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={handleAddMember}
                              disabled={!memberToAdd || isAddingMember || removingMemberId !== null}
                              className="min-h-[44px] rounded-xl bg-blue-600 px-4 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900"
                            >
                              {isAddingMember
                                ? t("admin.member_adding_btn")
                                : t("admin.member_add_btn")}
                            </button>
                          </div>
                        </>
                      )}

                      {!isLoadingMembers && !teamDetailsError && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
                            {t("admin.locations_page_title")}
                          </h3>
                          {teamLocations.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700">
                              {t("admin.team_locations_empty")}
                            </p>
                          ) : (
                            <ul className="flex flex-wrap gap-1.5">
                              {teamLocations.map((item) => (
                                <li
                                  key={item.location_code}
                                  className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold dark:bg-zinc-800"
                                >
                                  <span>
                                    [{item.location_code}] {resolveLocationName(item, locale)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTeamLocation(item.location_code)}
                                    disabled={
                                      removingLocationCode !== null ||
                                      isAddingLocation ||
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
                                onChange={(event) => setLocationToAdd(event.target.value)}
                                disabled={isAddingLocation || removingLocationCode !== null}
                                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="">{t("issue.location_select")}</option>
                                {locations
                                  .filter(
                                    (location) =>
                                      !teamLocations.some(
                                        (item) => item.location_code === location.code,
                                      ),
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
                              onClick={handleAddTeamLocation}
                              disabled={
                                !locationToAdd || isAddingLocation || removingLocationCode !== null
                              }
                              className="min-h-[44px] rounded-xl bg-blue-600 px-4 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900"
                            >
                              {isAddingLocation
                                ? t("admin.team_location_adding_btn")
                                : t("admin.add_location_btn")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </PageContainer>
    </div>
  );
}
