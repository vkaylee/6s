import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { useMasterdataStore } from "../store/masterdataStore.ts";
import type { LocationItem, TeamItem, TeamMemberItem } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";
import { TeamCard } from "./team-management/TeamCard.tsx";
import { type TeamLocationItem, TeamScopeModal } from "./team-management/TeamScopeModal.tsx";
import type { AdminUserItem } from "./UserAccessPage.tsx";
export function TeamManagementPage() {
  const { t } = useI18nStore();
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
            <TeamCard
              key={team.id}
              team={team}
              isEditing={editingTeamId === team.id}
              editCode={editCode}
              editName={editName}
              isSaving={isSaving}
              isExpanded={expandedTeamId === team.id}
              isLoadingMembers={isLoadingMembers}
              onEditCodeChange={setEditCode}
              onEditNameChange={setEditName}
              onSaveTeam={handleSaveTeam}
              onCancelEdit={() => setEditingTeamId(null)}
              onStartEdit={() => {
                setEditingTeamId(team.id);
                setEditCode(team.code);
                setEditName(team.name);
              }}
              onToggleExpand={() => handleToggleExpand(team.id)}
              onToggleActive={() => handleToggleActive(team)}
            >
              <TeamScopeModal
                loading={isLoadingMembers}
                error={teamDetailsError}
                members={members}
                locations={teamLocations}
                users={users}
                availableLocations={locations}
                memberToAdd={memberToAdd}
                locationToAdd={locationToAdd}
                addingMember={isAddingMember}
                removingMemberId={removingMemberId}
                addingLocation={isAddingLocation}
                removingLocationCode={removingLocationCode}
                onRetry={() => {
                  if (expandedTeamId !== null) void loadMembers(expandedTeamId);
                }}
                onMemberChange={setMemberToAdd}
                onAddMember={handleAddMember}
                onRemoveMember={handleRemoveMember}
                onLocationChange={setLocationToAdd}
                onAddLocation={handleAddTeamLocation}
                onRemoveLocation={handleRemoveTeamLocation}
              />
            </TeamCard>
          ))}
        </ul>
      </PageContainer>
    </div>
  );
}
