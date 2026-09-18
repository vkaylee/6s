import { useEffect } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { hasCapability, useAuthStore } from "../store/authStore.ts";
import { useMasterdataStore } from "../store/masterdataStore.ts";

interface ResponsibilityPickerProps {
  locationCode: string;
  assetId: number | null;
  assignedTeamId: number | null;
  assigneeId: number | null;
  onAssetChange: (value: number | null) => void;
  onTeamChange: (value: number | null) => void;
  onAssigneeChange: (value: number | null) => void;
  disabled?: boolean;
  showAsset?: boolean;
}

export function ResponsibilityPicker({
  locationCode,
  assetId,
  assignedTeamId,
  assigneeId,
  onAssetChange,
  onTeamChange,
  onAssigneeChange,
  disabled = false,
  showAsset = true,
}: ResponsibilityPickerProps) {
  const { t } = useI18nStore();
  const storeUser = useAuthStore((state) => state.user);
  const user = typeof window === "undefined" ? useAuthStore.getState().user : storeUser;
  const canAssign = hasCapability(user, "issue:assign");

  const assets = useMasterdataStore((state) => state.assets);
  const teams = useMasterdataStore((state) => state.teams);
  const status = useMasterdataStore((state) => state.status);
  const loadReference = useMasterdataStore((state) => state.loadReference);
  const loadMembers = useMasterdataStore((state) => state.loadMembers);
  const members = useMasterdataStore((state) =>
    assignedTeamId ? state.membersByTeam[assignedTeamId] : undefined,
  );
  const membersStatus = useMasterdataStore((state) =>
    assignedTeamId ? state.membersStatusByTeam[assignedTeamId] : undefined,
  );

  useEffect(() => {
    loadReference();
  }, [loadReference]);

  useEffect(() => {
    if (!canAssign || !assignedTeamId) return;
    loadMembers(assignedTeamId);
  }, [assignedTeamId, canAssign, loadMembers]);

  const visibleAssets = assets.filter(
    (asset) => asset.is_active && (!locationCode || asset.location_code === locationCode),
  );
  const visibleTeams = teams.filter((team) => team.is_active);
  const selectedAsset = assets.find((asset) => asset.id === assetId);
  const selectedTeam = teams.find((team) => team.id === assignedTeamId);
  const selectable = disabled || status === "error";

  const handleAssetChange = (value: string) => {
    const nextId = value ? Number(value) : null;
    onAssetChange(nextId);
    if (nextId && !assignedTeamId) {
      const defaultTeamId = assets.find((asset) => asset.id === nextId)?.default_team_id;
      if (defaultTeamId) onTeamChange(defaultTeamId);
    }
  };

  return (
    <section
      className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
      aria-labelledby="responsibility-picker-title"
    >
      <div>
        <h3
          id="responsibility-picker-title"
          className="text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300"
        >
          {t("issue.responsibility_title")}
        </h3>
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          {t("issue.responsibility_hint")}
        </p>
      </div>
      {status === "error" && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <span>{t("issue.responsibility_load_error")}</span>
          <button
            type="button"
            onClick={() => loadReference(true)}
            className="min-h-[36px] rounded-lg border border-rose-300 px-3 font-bold dark:border-rose-800"
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {showAsset && (
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            {t("issue.asset_optional")}
          </span>
          <select
            value={assetId ?? ""}
            onChange={(event) => handleAssetChange(event.target.value)}
            disabled={selectable}
            aria-label={t("issue.asset_optional")}
            className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">{t("issue.no_asset")}</option>
            {selectedAsset && !visibleAssets.some((asset) => asset.id === selectedAsset.id) && (
              <option value={selectedAsset.id}>
                {selectedAsset.asset_code} — {selectedAsset.name}
              </option>
            )}
            {visibleAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.asset_code} — {asset.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
          {t("issue.assigned_team")}
        </span>
        <select
          value={assignedTeamId ?? ""}
          onChange={(event) => {
            onTeamChange(event.target.value ? Number(event.target.value) : null);
            onAssigneeChange(null);
          }}
          disabled={selectable || !canAssign}
          aria-label={t("issue.assigned_team")}
          className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">{t("issue.no_assigned_team")}</option>
          {selectedTeam && !visibleTeams.some((team) => team.id === selectedTeam.id) && (
            <option value={selectedTeam.id}>
              {selectedTeam.name} ({selectedTeam.code})
            </option>
          )}
          {visibleTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} ({team.code})
            </option>
          ))}
        </select>
        {!canAssign && (
          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
            {t("issue.assignment_requires_permission")}
          </span>
        )}
      </label>
      {canAssign && assignedTeamId != null && assignedTeamId > 0 && (
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            {t("issue.assignee_optional")}
          </span>
          <select
            value={assigneeId ?? ""}
            onChange={(event) =>
              onAssigneeChange(event.target.value ? Number(event.target.value) : null)
            }
            disabled={selectable || membersStatus === "loading"}
            aria-label={t("issue.assignee_optional")}
            className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">{t("issue.no_assignee")}</option>
            {(members || [])
              .filter((member) => member.is_active)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                  {member.username ? ` (@${member.username})` : ""}
                </option>
              ))}
          </select>
          {membersStatus === "error" && (
            <span role="alert" className="block text-[11px] font-semibold text-rose-600">
              {t("issue.responsibility_member_error")}
            </span>
          )}
        </label>
      )}
    </section>
  );
}
