import { ApiError, apiClient } from "../../api/client.ts";
import {
  deleteIssue,
  fetchIssueWithDeletion,
  issueOperations,
  patchIssue,
  restoreIssue,
} from "../../api/operations.ts";
import type { DraftResolve } from "../../db/indexeddb.ts";
import { saveDraftResolve } from "../../db/indexeddb.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import { syncEngine } from "../../sync/syncEngine.ts";
import { CauseStatus, type IssueCategory, type IssueItem, SyncStatus } from "../../types/index.ts";
import { compressImage } from "../../utils/compress.ts";
import { haptics } from "../../utils/haptics.ts";
import { generateUuid } from "../../utils/uuid.ts";
import type { ConfirmAction } from "./types.ts";

export interface UseIssueDetailMutationsProps {
  currentIssue: IssueItem;
  setCurrentIssue: React.Dispatch<React.SetStateAction<IssueItem>>;
  isDeleted: boolean;
  mutationsOnline: boolean;
  isSubmitting: boolean;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  recoveryPending: boolean;
  setRecoveryPending: React.Dispatch<React.SetStateAction<boolean>>;
  canAssignResponsibility: boolean;
  isSavingResponsibility: boolean;
  setIsSavingResponsibility: React.Dispatch<React.SetStateAction<boolean>>;
  canVerifyCause: boolean;
  isSavingCause: boolean;
  setIsSavingCause: React.Dispatch<React.SetStateAction<boolean>>;
  canDeleteIssue: boolean;
  canRestoreIssue: boolean;
  assignmentAssetId: number | null;
  assignmentTeamId: number | null;
  assignmentAssigneeId: number | null;
  syncCauseWithAssignment: boolean;
  causeTeamId: number | null;
  closeCauseTeamId: number | null;
  setCloseCauseTeamId: React.Dispatch<React.SetStateAction<number | null>>;
  causeStatus: CauseStatus;
  deleteReason: string;
  setDeleteReason: React.Dispatch<React.SetStateAction<string>>;
  rejectReason: string;
  scoreRating: number;
  setShowConfirmAction: React.Dispatch<React.SetStateAction<ConfirmAction | null>>;
  setIsEditingCategory: React.Dispatch<React.SetStateAction<boolean>>;
  setIsEditingLocation: React.Dispatch<React.SetStateAction<boolean>>;
  setIsResponsibilityEditing: React.Dispatch<React.SetStateAction<boolean>>;
  onRefresh: () => void;
  onClose: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function useIssueDetailMutations({
  currentIssue,
  setCurrentIssue,
  isDeleted,
  mutationsOnline,
  isSubmitting,
  setIsSubmitting,
  recoveryPending,
  setRecoveryPending,
  canAssignResponsibility,
  isSavingResponsibility,
  setIsSavingResponsibility,
  canVerifyCause,
  isSavingCause,
  setIsSavingCause,
  canDeleteIssue,
  canRestoreIssue,
  assignmentAssetId,
  assignmentTeamId,
  assignmentAssigneeId,
  syncCauseWithAssignment,
  causeTeamId,
  closeCauseTeamId,
  setCloseCauseTeamId,
  causeStatus,
  deleteReason,
  setDeleteReason,
  rejectReason,
  scoreRating,
  setShowConfirmAction,
  setIsEditingCategory,
  setIsEditingLocation,
  setIsResponsibilityEditing,
  onRefresh,
  onClose,
  t,
}: UseIssueDetailMutationsProps) {
  const reloadCurrentIssue = async (): Promise<boolean> => {
    const preferredDeletion = currentIssue.deleted_at != null ? "deleted" : "active";
    const projections = [
      preferredDeletion,
      preferredDeletion === "active" ? "deleted" : "active",
    ] as const;
    for (const deletion of projections) {
      try {
        const fresh = await fetchIssueWithDeletion(currentIssue.id, deletion);
        if (fresh) {
          setCurrentIssue(fresh);
          return true;
        }
      } catch {
        // Try other projection
      }
    }
    return false;
  };

  const handleConfirmDelete = async () => {
    const reason = deleteReason.trim();
    if (!canDeleteIssue || !mutationsOnline || isSubmitting || recoveryPending) return;
    if (Array.from(reason).length < 1 || Array.from(reason).length > 1000) {
      await modalDialog.alert(t("issue_detail.delete_reason_invalid"));
      return;
    }
    setIsSubmitting(true);
    try {
      await deleteIssue(currentIssue.id, {
        reason,
        expected_version: currentIssue.version,
      });
      const recovered = await reloadCurrentIssue();
      setRecoveryPending(!recovered);
      if (recovered) {
        setDeleteReason("");
        setShowConfirmAction(null);
        haptics.success();
        onRefresh();
      } else {
        await modalDialog.alert(t("issue_detail.delete_failed"));
      }
    } catch (error) {
      haptics.errorOrConflict();
      const recovered = await reloadCurrentIssue();
      setRecoveryPending(!recovered);
      await modalDialog.alert(
        error instanceof ApiError && error.status === 409
          ? t("issue_detail.delete_conflict")
          : t("issue_detail.delete_failed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!canRestoreIssue || !mutationsOnline || isSubmitting || recoveryPending) return;
    setIsSubmitting(true);
    try {
      await restoreIssue(currentIssue.id, currentIssue.version);
      const recovered = await reloadCurrentIssue();
      setRecoveryPending(!recovered);
      if (recovered) {
        setShowConfirmAction(null);
        haptics.success();
        onRefresh();
      } else {
        await modalDialog.alert(t("issue_detail.restore_failed"));
      }
    } catch (error) {
      haptics.errorOrConflict();
      const recovered = await reloadCurrentIssue();
      setRecoveryPending(!recovered);
      await modalDialog.alert(
        error instanceof ApiError && error.status === 409
          ? t("issue_detail.delete_conflict")
          : t("issue_detail.restore_failed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickChangeCategory = async (newCat: IssueCategory) => {
    if (isDeleted || !mutationsOnline) return;
    try {
      const updated = await patchIssue(currentIssue.id, { category: newCat });
      haptics.success();
      if (updated) setCurrentIssue(updated);
      setIsEditingCategory(false);
      onRefresh();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.update_category_error"));
    }
  };

  const handleQuickChangeLocation = async (newLocCode: string) => {
    if (isDeleted || !mutationsOnline) return;
    if (!newLocCode || newLocCode === currentIssue.location_code) {
      setIsEditingLocation(false);
      return;
    }
    try {
      const updated = await patchIssue(currentIssue.id, { location_code: newLocCode });
      haptics.success();
      if (updated) setCurrentIssue(updated);
      setIsEditingLocation(false);
      onRefresh();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.update_location_error"));
    }
  };

  const handleSaveResponsibility = async () => {
    if (!canAssignResponsibility || isSavingResponsibility) return;
    setIsSavingResponsibility(true);
    try {
      const updated = await apiClient<IssueItem>(`/api/issues/${currentIssue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_version: currentIssue.version,
          asset_id: assignmentAssetId,
          assigned_team_id: assignmentTeamId,
          assignee_id: assignmentAssigneeId,
          ...(syncCauseWithAssignment && assignmentTeamId != null
            ? { cause_status: CauseStatus.CONFIRMED, cause_team_id: assignmentTeamId }
            : {}),
        }),
      });
      if (updated) setCurrentIssue(updated);
      setIsResponsibilityEditing(false);
      haptics.success();
      onRefresh();
    } catch (error) {
      haptics.errorOrConflict();
      await reloadCurrentIssue();
      await modalDialog.alert(
        error instanceof ApiError && error.status === 409
          ? t("issue_detail.assignment_update_conflict")
          : t("issue_detail.assignment_update_error"),
      );
    } finally {
      setIsSavingResponsibility(false);
    }
  };

  const handleVerifyCause = async () => {
    if (!canVerifyCause || isSavingCause) return;
    if (causeStatus === CauseStatus.CONFIRMED && causeTeamId == null) return;
    setIsSavingCause(true);
    try {
      const updated = await apiClient<IssueItem>(`/api/issues/${currentIssue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_version: currentIssue.version,
          cause_team_id: causeStatus === CauseStatus.CONFIRMED ? causeTeamId : null,
          cause_status: causeStatus,
        }),
      });
      if (updated) {
        setCurrentIssue(updated);
        setCloseCauseTeamId(updated.cause_team_id ?? null);
      }
      haptics.success();
      onRefresh();
    } catch (error) {
      haptics.errorOrConflict();
      await reloadCurrentIssue();
      await modalDialog.alert(
        error instanceof ApiError && error.status === 409
          ? t("issue_detail.cause_verification_conflict")
          : t("issue_detail.cause_verification_error"),
      );
    } finally {
      setIsSavingCause(false);
    }
  };

  const handleResolveOfflineOrOnline = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSubmitting(true);
      const compressed = await compressImage(file, { maxDimension: 1280, quality: 0.7 });
      const draft: DraftResolve = {
        resolved_client_uuid: generateUuid(),
        issue_id: currentIssue.id,
        expected_version: currentIssue.version,
        photo_after_blob: compressed,
        resolved_at: Date.now(),
        sync_status: SyncStatus.PENDING,
      };

      await saveDraftResolve(draft);
      haptics.success();
      syncEngine.triggerSync();
      await modalDialog.success(t("issue.sync_resolve_msg"));
      onRefresh();
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.resolve_image_error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmClose = async () => {
    setIsSubmitting(true);
    try {
      if (
        canVerifyCause &&
        closeCauseTeamId != null &&
        currentIssue.cause_status !== CauseStatus.CONFIRMED
      ) {
        await apiClient<IssueItem>(`/api/issues/${currentIssue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_version: currentIssue.version,
            cause_team_id: closeCauseTeamId,
            cause_status: CauseStatus.CONFIRMED,
          }),
        });
      }
      await issueOperations.close(currentIssue.id, { score_rating: scoreRating });
      haptics.success();
      setShowConfirmAction(null);
      onRefresh();
      onClose();
    } catch (error) {
      haptics.errorOrConflict();
      modalDialog.alert(
        error instanceof ApiError ? error.message : t("issue_detail.approve_failed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReopen = async () => {
    setIsSubmitting(true);
    try {
      await issueOperations.reopen(currentIssue.id, {
        reject_reason: rejectReason.trim() || t("issue_detail.default_reopen_reason"),
      });
      haptics.success();
      setShowConfirmAction(null);
      onRefresh();
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.reopen_failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmInvalid = async () => {
    setIsSubmitting(true);
    try {
      await issueOperations.invalid(currentIssue.id, {
        reason: rejectReason.trim() || t("issue_detail.default_invalid_reason"),
      });
      haptics.success();
      setShowConfirmAction(null);
      onRefresh();
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.invalidate_failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    handleConfirmDelete,
    handleConfirmRestore,
    handleQuickChangeCategory,
    handleQuickChangeLocation,
    handleSaveResponsibility,
    handleVerifyCause,
    handleResolveOfflineOrOnline,
    handleConfirmClose,
    handleConfirmReopen,
    handleConfirmInvalid,
  };
}
