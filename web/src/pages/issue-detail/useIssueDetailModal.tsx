import { useEffect } from "react";
import { useI18nStore } from "../../i18n/index.ts";
import { hasCapability, useAuthStore } from "../../store/authStore.ts";
import { useMasterdataStore } from "../../store/masterdataStore.ts";
import {
  detectCauseType,
  IssueCategory,
  IssueStatus,
  resolveLocationNameByCode,
} from "../../types/index.ts";
import type { IssueDetailModalProps, IssueDetailViewModel } from "./types.ts";
import { useIssueDetailAI } from "./useIssueDetailAI.ts";
import { useIssueDetailEffects } from "./useIssueDetailEffects.ts";
import { useIssueDetailMutations } from "./useIssueDetailMutations.ts";
import { useIssueDetailState } from "./useIssueDetailState.ts";
import { useIssuePhotoGallery } from "./useIssuePhotoGallery.ts";

export function useIssueDetailModal({
  issue,
  isOpen,
  onClose,
  onRefresh,
  locations = [],
  tags = [],
}: IssueDetailModalProps): IssueDetailViewModel {
  const { t, locale: storeLocale } = useI18nStore();
  const locale = typeof window === "undefined" ? useI18nStore.getState().locale : storeLocale;
  const storeUser = useAuthStore((s) => s.user);
  const user = typeof window === "undefined" ? useAuthStore.getState().user : storeUser;
  const isOfflineGrace = useAuthStore((s) => s.isOfflineGrace);
  const state = useIssueDetailState({ issue, locale });
  const { currentIssue, setCurrentIssue, isActionMenuOpen, setIsActionMenuOpen } = state;
  const gallery = useIssuePhotoGallery({ currentIssue, t });
  const effects = useIssueDetailEffects({
    isOpen,
    currentIssue,
    isActionMenuOpen,
    setIsActionMenuOpen,
    previewIndex: gallery.previewIndex,
  });

  const assets = useMasterdataStore((store) => store.assets);
  const teams = useMasterdataStore((store) => store.teams);
  const teamMembers = useMasterdataStore((store) =>
    currentIssue.assigned_team_id == null
      ? undefined
      : store.membersByTeam[currentIssue.assigned_team_id],
  );
  const membersStatus = useMasterdataStore((store) =>
    currentIssue.assigned_team_id == null
      ? "idle"
      : (store.membersStatusByTeam[currentIssue.assigned_team_id] ?? "idle"),
  );
  const loadMembers = useMasterdataStore((store) => store.loadMembers);
  const mayAssign = hasCapability(user, "issue:assign");
  const asset = assets.find((item) => item.id === currentIssue.asset_id);
  const team = teams.find((item) => item.id === currentIssue.assigned_team_id);
  const assignee = teamMembers?.find((member) => member.id === currentIssue.assignee_id);
  const causeTeam = teams.find((item) => item.id === currentIssue.cause_team_id);
  const assigneeLabel =
    currentIssue.assignee_id == null
      ? t("issue.unassigned")
      : !mayAssign
        ? t("issue.assignee_permission_denied")
        : membersStatus === "error"
          ? t("issue.assignee_lookup_error")
          : membersStatus !== "ready"
            ? t("issue.assignee_loading")
            : assignee?.full_name || `#${currentIssue.assignee_id}`;
  const assigneeLookupError =
    mayAssign && currentIssue.assignee_id != null && membersStatus === "error";

  useEffect(() => {
    if (!mayAssign || currentIssue.assigned_team_id == null) return;
    void loadMembers(currentIssue.assigned_team_id);
  }, [mayAssign, currentIssue.assigned_team_id, loadMembers]);

  const isDeleted = currentIssue.deleted_at != null;
  const mutationsOnline = effects.isBrowserOnline && !isOfflineGrace;
  const isSafetyIssue = currentIssue.category === IssueCategory.S6;
  const isSelfResolved =
    user?.id != null && currentIssue.resolver_id != null && user.id === currentIssue.resolver_id;
  const canClose =
    (isSafetyIssue && hasCapability(user, "issue:close_safety")) ||
    (!isSafetyIssue &&
      (hasCapability(user, "issue:close_any") ||
        (user?.id === currentIssue.creator_id && hasCapability(user, "issue:close_own")) ||
        (hasCapability(user, "issue:close_line") &&
          user?.assigned_location_code === currentIssue.location_code)));
  const closeDisabledReason = isSelfResolved
    ? t("issue_detail.self_review_blocked")
    : isSafetyIssue && !hasCapability(user, "issue:close_safety")
      ? t("issue_detail.need_safety_officer")
      : hasCapability(user, "issue:close_line") &&
          user?.assigned_location_code &&
          user.assigned_location_code !== currentIssue.location_code
        ? t("issue_detail.only_assigned_line")
        : !canClose
          ? t("issue_detail.review_not_allowed")
          : null;

  const serverActions = currentIssue.allowed_actions;
  const canAssignResponsibility =
    !isDeleted &&
    (serverActions ? serverActions.assign === true : hasCapability(user, "issue:assign"));
  const canVerifyCause =
    !isDeleted &&
    (serverActions
      ? serverActions.verify_cause === true
      : hasCapability(user, "issue:verify_cause"));
  const canResolveIssue =
    !isDeleted &&
    (serverActions ? serverActions.resolve === true : hasCapability(user, "issue:resolve"));
  const canCloseIssue = !isDeleted && (serverActions ? serverActions.close === true : canClose);
  const canDeleteIssue =
    !isDeleted &&
    (serverActions?.delete === true || (!serverActions && hasCapability(user, "issue:delete")));
  const canRestoreIssue =
    isDeleted &&
    (serverActions?.restore === true || (!serverActions && hasCapability(user, "issue:restore")));
  const canEdit =
    !isDeleted &&
    mutationsOnline &&
    currentIssue.status === IssueStatus.OPEN &&
    (user?.id === currentIssue.creator_id || user?.id === currentIssue.resolver_id
      ? hasCapability(user, "issue:close_own")
      : hasCapability(user, "issue:close_any"));

  const ai = useIssueDetailAI({
    issue,
    currentIssue,
    isOpen,
    locale,
    isBrowserOnline: effects.isBrowserOnline,
    isOfflineGrace,
    selectedProposedTags: state.selectedProposedTags,
    setCurrentIssue,
    onRefresh,
    t,
  });
  const mutations = useIssueDetailMutations({
    currentIssue,
    setCurrentIssue,
    isDeleted,
    mutationsOnline,
    isSubmitting: state.isSubmitting,
    setIsSubmitting: state.setIsSubmitting,
    recoveryPending: state.recoveryPending,
    setRecoveryPending: state.setRecoveryPending,
    canAssignResponsibility,
    isSavingResponsibility: state.isSavingResponsibility,
    setIsSavingResponsibility: state.setIsSavingResponsibility,
    canVerifyCause,
    isSavingCause: state.isSavingCause,
    setIsSavingCause: state.setIsSavingCause,
    canDeleteIssue,
    canRestoreIssue,
    assignmentAssetId: state.assignmentAssetId,
    assignmentTeamId: state.assignmentTeamId,
    assignmentAssigneeId: state.assignmentAssigneeId,
    syncCauseWithAssignment: state.syncCauseWithAssignment,
    causeTeamId: state.causeTeamId,
    closeCauseTeamId: state.closeCauseTeamId,
    setCloseCauseTeamId: state.setCloseCauseTeamId,
    causeStatus: state.causeStatus,
    deleteReason: state.deleteReason,
    setDeleteReason: state.setDeleteReason,
    rejectReason: state.rejectReason,
    scoreRating: state.scoreRating,
    setShowConfirmAction: state.setShowConfirmAction,
    setIsEditingCategory: state.setIsEditingCategory,
    setIsEditingLocation: state.setIsEditingLocation,
    setIsResponsibilityEditing: state.setIsResponsibilityEditing,
    onRefresh,
    onClose,
    t,
  });

  const isOpenStatus = currentIssue.status === IssueStatus.OPEN;
  const isPendingReview = currentIssue.status === IssueStatus.PENDING_REVIEW;
  const isClosedStatus = currentIssue.status === IssueStatus.CLOSED;
  const statusBadge = isOpenStatus ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" aria-hidden="true" />
      {t("status.OPEN")}
    </span>
  ) : isPendingReview ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      <span
        className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400"
        aria-hidden="true"
      />
      {t("status.PENDING_REVIEW")}
    </span>
  ) : isClosedStatus ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      <span
        className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
        aria-hidden="true"
      />
      {t("status.CLOSED")}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-500/10 dark:text-zinc-300">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400" aria-hidden="true" />
      {t("status.INVALID")}
    </span>
  );

  return {
    issue,
    isOpen,
    onClose,
    onRefresh,
    locations,
    tags,
    t,
    locale,
    user,
    isBrowserOnline: effects.isBrowserOnline,
    isOfflineGrace,
    ...state,
    causeType: detectCauseType(currentIssue.category, currentIssue.tags),
    mayAssign,
    assets,
    teams,
    teamMembers,
    membersStatus,
    loadMembers,
    asset,
    team,
    assignee,
    causeTeam,
    assigneeLabel,
    assigneeLookupError,
    dialogRef: effects.dialogRef,
    actionMenuRef: effects.actionMenuRef,
    issueScoreLogs: effects.issueScoreLogs,
    loadingScores: effects.loadingScores,
    ...ai,
    ...gallery,
    ...mutations,
    resolvedLocationName: resolveLocationNameByCode(
      locations,
      currentIssue.location_code,
      currentIssue.location_name,
      locale,
    ),
    isDeleted,
    mutationsOnline,
    canEdit,
    closeDisabledReason,
    canAssignResponsibility,
    canVerifyCause,
    canResolveIssue,
    canCloseIssue,
    canDeleteIssue,
    canRestoreIssue,
    isOpenStatus,
    isPendingReview,
    isClosedStatus,
    statusBadge,
    dateLocale: locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN",
  };
}
