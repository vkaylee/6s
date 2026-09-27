import { useEffect, useState } from "react";
import type { CauseStatus, IssueItem, ProposedTagItem } from "../../types/index.ts";
import type { ConfirmAction, ModalTab } from "./types.ts";

export interface UseIssueDetailStateProps {
  issue: IssueItem;
  locale: string;
}

export function useIssueDetailState({ issue, locale }: UseIssueDetailStateProps) {
  const [currentIssue, setCurrentIssue] = useState<IssueItem>(issue);

  const [assignmentAssetId, setAssignmentAssetId] = useState<number | null>(issue.asset_id ?? null);
  const [assignmentTeamId, setAssignmentTeamId] = useState<number | null>(
    issue.assigned_team_id ?? null,
  );
  const [assignmentAssigneeId, setAssignmentAssigneeId] = useState<number | null>(
    issue.assignee_id ?? null,
  );
  const [syncCauseWithAssignment, setSyncCauseWithAssignment] = useState(false);

  const [causeTeamId, setCauseTeamId] = useState<number | null>(issue.cause_team_id ?? null);
  const [closeCauseTeamId, setCloseCauseTeamId] = useState<number | null>(
    issue.cause_status === "UNVERIFIED"
      ? (issue.cause_team_id ?? issue.assigned_team_id ?? null)
      : (issue.cause_team_id ?? null),
  );
  const [causeStatus, setCauseStatus] = useState<CauseStatus>(issue.cause_status ?? "UNVERIFIED");

  const [isResponsibilityEditing, setIsResponsibilityEditing] = useState(false);
  const [isCauseVerificationOpen, setIsCauseVerificationOpen] = useState(false);

  const [isEditingFull, setIsEditingFull] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);

  const [activeTab, setActiveTab] = useState<ModalTab>("overview");
  const [scoreRating, setScoreRating] = useState<number>(3);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [showConfirmAction, setShowConfirmAction] = useState<ConfirmAction | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [isSavingResponsibility, setIsSavingResponsibility] = useState(false);
  const [isSavingCause, setIsSavingCause] = useState(false);

  const [selectedProposedTags, setSelectedProposedTags] = useState<ProposedTagItem[]>([]);

  useEffect(() => {
    setCurrentIssue(issue);
    setActiveTab("overview");
    setAssignmentAssetId(issue.asset_id ?? null);
    setAssignmentTeamId(issue.assigned_team_id ?? null);
    setAssignmentAssigneeId(issue.assignee_id ?? null);
    setCauseTeamId(issue.cause_team_id ?? null);
    setCauseStatus(issue.cause_status ?? "UNVERIFIED");
    setCloseCauseTeamId(
      issue.cause_status === "UNVERIFIED"
        ? (issue.cause_team_id ?? issue.assigned_team_id ?? null)
        : (issue.cause_team_id ?? null),
    );
    setSyncCauseWithAssignment(false);
    setIsCauseVerificationOpen(false);
  }, [issue, locale]);

  return {
    currentIssue,
    setCurrentIssue,
    assignmentAssetId,
    setAssignmentAssetId,
    assignmentTeamId,
    setAssignmentTeamId,
    assignmentAssigneeId,
    setAssignmentAssigneeId,
    syncCauseWithAssignment,
    setSyncCauseWithAssignment,
    causeTeamId,
    setCauseTeamId,
    closeCauseTeamId,
    setCloseCauseTeamId,
    causeStatus,
    setCauseStatus,
    isResponsibilityEditing,
    setIsResponsibilityEditing,
    isCauseVerificationOpen,
    setIsCauseVerificationOpen,
    isEditingFull,
    setIsEditingFull,
    isEditingCategory,
    setIsEditingCategory,
    isEditingLocation,
    setIsEditingLocation,
    activeTab,
    setActiveTab,
    scoreRating,
    setScoreRating,
    rejectReason,
    setRejectReason,
    deleteReason,
    setDeleteReason,
    showConfirmAction,
    setShowConfirmAction,
    isActionMenuOpen,
    setIsActionMenuOpen,
    isSubmitting,
    setIsSubmitting,
    recoveryPending,
    setRecoveryPending,
    isSavingResponsibility,
    setIsSavingResponsibility,
    isSavingCause,
    setIsSavingCause,
    selectedProposedTags,
    setSelectedProposedTags,
  };
}
