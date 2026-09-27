import { AlertTriangle, Loader2, ShieldCheck, UserCog } from "lucide-react";
import { ResponsibilityPicker } from "../../components/ResponsibilityPicker.tsx";
import type { AssetItem, CauseStatus, IssueItem, TeamItem } from "../../types/index.ts";
import type { ModalTab } from "./types.ts";

export interface IssueDetailAssignmentView {
  currentIssue: IssueItem;
  activeTab: ModalTab;
  canAssignResponsibility: boolean;
  isResponsibilityEditing: boolean;
  setIsResponsibilityEditing: React.Dispatch<React.SetStateAction<boolean>>;
  canVerifyCause: boolean;
  isCauseVerificationOpen: boolean;
  setIsCauseVerificationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  assignmentAssetId: number | null;
  setAssignmentAssetId: React.Dispatch<React.SetStateAction<number | null>>;
  assignmentTeamId: number | null;
  setAssignmentTeamId: React.Dispatch<React.SetStateAction<number | null>>;
  assignmentAssigneeId: number | null;
  setAssignmentAssigneeId: React.Dispatch<React.SetStateAction<number | null>>;
  syncCauseWithAssignment: boolean;
  setSyncCauseWithAssignment: React.Dispatch<React.SetStateAction<boolean>>;
  handleSaveResponsibility: () => Promise<void>;
  isSavingResponsibility: boolean;
  asset: AssetItem | undefined;
  team: TeamItem | undefined;
  assigneeLabel: string;
  mayAssign: boolean;
  membersStatus: "idle" | "loading" | "ready" | "error";
  assigneeLookupError: boolean;
  loadMembers: (teamId: number, force?: boolean) => Promise<void>;
  causeTeam: TeamItem | undefined;
  causeStatus: CauseStatus;
  setCauseStatus: React.Dispatch<React.SetStateAction<CauseStatus>>;
  causeTeamId: number | null;
  setCauseTeamId: React.Dispatch<React.SetStateAction<number | null>>;
  teams: TeamItem[];
  isSavingCause: boolean;
  handleVerifyCause: () => Promise<void>;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function IssueDetailAssignment({
  currentIssue,
  activeTab,
  canAssignResponsibility,
  isResponsibilityEditing,
  setIsResponsibilityEditing,
  canVerifyCause,
  isCauseVerificationOpen,
  setIsCauseVerificationOpen,
  assignmentAssetId,
  setAssignmentAssetId,
  assignmentTeamId,
  setAssignmentTeamId,
  assignmentAssigneeId,
  setAssignmentAssigneeId,
  syncCauseWithAssignment,
  setSyncCauseWithAssignment,
  handleSaveResponsibility,
  isSavingResponsibility,
  asset,
  team,
  assigneeLabel,
  mayAssign,
  membersStatus,
  assigneeLookupError,
  loadMembers,
  causeTeam,
  causeStatus,
  setCauseStatus,
  causeTeamId,
  setCauseTeamId,
  teams,
  isSavingCause,
  handleVerifyCause,
  t,
}: IssueDetailAssignmentView) {
  if (activeTab !== "overview") return null;

  return (
    <section
      className="space-y-3.5 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800/80"
      aria-labelledby="assignment-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-0.5">
          <h3
            id="assignment-title"
            className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-200"
          >
            {t("issue.handling_responsibility_title")}
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {t("issue.handling_responsibility_hint")}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {canAssignResponsibility && !isResponsibilityEditing && (
            <button
              type="button"
              onClick={() => setIsResponsibilityEditing(true)}
              aria-label={t("issue.edit_responsibility")}
              title={t("issue.edit_responsibility")}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-4 text-xs font-bold text-zinc-700 shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              <UserCog className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("issue.edit_responsibility_short")}</span>
            </button>
          )}
          {canVerifyCause && (
            <button
              type="button"
              onClick={() => setIsCauseVerificationOpen((prev) => !prev)}
              aria-expanded={isCauseVerificationOpen}
              aria-controls="cause-verification-panel"
              aria-label={t("issue.cause_verification_title")}
              title={t("issue.cause_verification_title")}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200/90 bg-amber-50/80 px-4 text-xs font-bold text-amber-800 shadow-2xs transition hover:border-amber-300 hover:bg-amber-100 active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:flex-none dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("issue.cause_verification_short")}</span>
            </button>
          )}
        </div>
      </div>
      {isResponsibilityEditing ? (
        <div className="space-y-3">
          <ResponsibilityPicker
            locationCode={currentIssue.location_code}
            assetId={assignmentAssetId}
            assignedTeamId={assignmentTeamId}
            assigneeId={assignmentAssigneeId}
            onAssetChange={setAssignmentAssetId}
            onTeamChange={setAssignmentTeamId}
            onAssigneeChange={setAssignmentAssigneeId}
          />
          {canVerifyCause &&
            currentIssue.cause_status === "UNVERIFIED" &&
            assignmentTeamId != null && (
              <label className="flex min-h-[44px] items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <input
                  type="checkbox"
                  checked={syncCauseWithAssignment}
                  onChange={(event) => setSyncCauseWithAssignment(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span>{t("issue.sync_cause_team_label")}</span>
              </label>
            )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsResponsibilityEditing(false)}
              disabled={isSavingResponsibility}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSaveResponsibility}
              disabled={isSavingResponsibility}
              aria-busy={isSavingResponsibility}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingResponsibility ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>{t("common.saving")}</span>
                </>
              ) : (
                t("common.save")
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
          <div className="space-y-1.5 py-3 first:pt-0 last:pb-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("issue.asset_optional")}
            </span>
            <span
              className="block break-words text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              title={asset ? `${asset.asset_code} — ${asset.name}` : undefined}
            >
              {asset ? `${asset.asset_code} — ${asset.name}` : t("issue.no_asset")}
            </span>
          </div>
          <div className="space-y-1.5 py-3 first:pt-0 last:pb-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("issue.assigned_team")}
            </span>
            <span
              className="block break-words text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              title={team ? `${team.name} (${team.code})` : undefined}
            >
              {team ? `${team.name} (${team.code})` : t("issue.no_assigned_team")}
            </span>
          </div>
          <div className="space-y-1.5 py-3 first:pt-0 last:pb-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {t("issue.assignee_optional")}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              <span aria-live="polite" className="break-words">
                {assigneeLabel}
              </span>
              {mayAssign && membersStatus === "loading" && (
                <span className="text-[10px] font-normal text-zinc-400">
                  ({t("issue.assignee_loading")})
                </span>
              )}
              {assigneeLookupError && (
                <button
                  type="button"
                  onClick={() => {
                    if (currentIssue.assigned_team_id != null) {
                      void loadMembers(currentIssue.assigned_team_id, true);
                    }
                  }}
                  className="shrink-0 font-bold text-blue-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {t("common.retry")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {currentIssue.cause_status === "CONFIRMED" && causeTeam && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/90 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <span>
              <strong className="font-bold">{t("issue.cause_team")}:</strong> {causeTeam.name} (
              {causeTeam.code})
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/70 dark:text-amber-200">
            {t("issue.cause_status_CONFIRMED")}
          </span>
        </div>
      )}
      {isCauseVerificationOpen && canVerifyCause && (
        <div
          id="cause-verification-panel"
          className="space-y-3 rounded-xl border border-amber-200/70 bg-amber-50/40 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
                {t("issue.cause_verification_title")}
              </h4>
              <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">
                {t("issue.cause_verification_hint")}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-300">
              {t(`issue.cause_status_${currentIssue.cause_status || "UNVERIFIED"}`)}
            </span>
          </div>
          <div className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="space-y-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                <span>{t("common.status")}</span>
                <select
                  value={causeStatus}
                  onChange={(event) => setCauseStatus(event.target.value as CauseStatus)}
                  aria-label={t("common.status")}
                  className="min-h-[42px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="UNVERIFIED">{t("issue.cause_status_UNVERIFIED")}</option>
                  <option value="CONFIRMED">{t("issue.cause_status_CONFIRMED")}</option>
                  <option value="NOT_APPLICABLE">{t("issue.cause_status_NOT_APPLICABLE")}</option>
                </select>
              </label>
              {causeStatus === "CONFIRMED" && (
                <label className="space-y-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                  <span>{t("issue.cause_team")}</span>
                  <select
                    value={causeTeamId ?? ""}
                    onChange={(event) =>
                      setCauseTeamId(event.target.value ? Number(event.target.value) : null)
                    }
                    aria-label={t("issue.cause_team")}
                    className="min-h-[42px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">{t("issue.no_cause_team")}</option>
                    {teams
                      .filter((item) => item.is_active)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.code})
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCauseVerificationOpen(false)}
                disabled={isSavingCause}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleVerifyCause}
                disabled={isSavingCause}
                aria-busy={isSavingCause}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-5 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCause ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>{t("issue.cause_verification_saving")}</span>
                  </>
                ) : (
                  t("issue.verify_cause")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
