import type React from "react";
import type { AIReviewResult } from "../../components/AIReviewPanel.tsx";
import type { AuthenticatedImageError } from "../../hooks/useAuthenticatedImageUrl.ts";
import type { UserProfile } from "../../store/authStore.ts";
import type {
  AssetItem,
  CauseStatus,
  CauseType,
  IssueCategory,
  IssueItem,
  LocationItem,
  ProposedTagItem,
  ScoreLogItem,
  TagItem,
  TeamItem,
  TeamMemberItem,
} from "../../types/index.ts";

export const SCORE_RULE_KEYS = [
  "base_weekly_score",
  "penalty_normal",
  "penalty_safety",
  "penalty_overdue",
  "penalty_reopen",
  "bonus_kaizen",
  "reward_reporter_normal",
  "reward_reporter_safety",
  "penalty_reporter_invalid",
] as const;

export function getScoreRuleLabel(
  ruleKey: string,
  description: string,
  t: (path: string, params?: Record<string, string | number>) => string,
): string {
  return SCORE_RULE_KEYS.includes(ruleKey as (typeof SCORE_RULE_KEYS)[number])
    ? t(`leaderboard.rule_${ruleKey}`)
    : description || ruleKey;
}

export interface IssueDetailModalProps {
  issue: IssueItem;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  locations?: LocationItem[];
  tags?: TagItem[];
}

export type ModalTab = "overview" | "ai" | "history";

export type ConfirmAction = "CLOSE" | "REOPEN" | "INVALID" | "DELETE" | "RESTORE";

export interface IssueDetailPhotoItem {
  url: string;
  alt: string;
  label: string;
  badgeClass: string;
}

export interface IssueDetailViewModel {
  issue: IssueItem;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  locations: LocationItem[];
  tags: TagItem[];
  t: (path: string, params?: Record<string, string | number>) => string;
  locale: string;
  user: UserProfile | null;
  isBrowserOnline: boolean;
  isOfflineGrace: boolean;
  currentIssue: IssueItem;
  setCurrentIssue: React.Dispatch<React.SetStateAction<IssueItem>>;
  causeType: CauseType;
  isResponsibilityEditing: boolean;
  setIsResponsibilityEditing: React.Dispatch<React.SetStateAction<boolean>>;
  isCauseVerificationOpen: boolean;
  setIsCauseVerificationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSavingResponsibility: boolean;
  assignmentAssetId: number | null;
  setAssignmentAssetId: React.Dispatch<React.SetStateAction<number | null>>;
  assignmentTeamId: number | null;
  setAssignmentTeamId: React.Dispatch<React.SetStateAction<number | null>>;
  assignmentAssigneeId: number | null;
  setAssignmentAssigneeId: React.Dispatch<React.SetStateAction<number | null>>;
  syncCauseWithAssignment: boolean;
  setSyncCauseWithAssignment: React.Dispatch<React.SetStateAction<boolean>>;
  mayAssign: boolean;
  causeTeamId: number | null;
  setCauseTeamId: React.Dispatch<React.SetStateAction<number | null>>;
  closeCauseTeamId: number | null;
  setCloseCauseTeamId: React.Dispatch<React.SetStateAction<number | null>>;
  causeStatus: CauseStatus;
  setCauseStatus: React.Dispatch<React.SetStateAction<CauseStatus>>;
  assets: AssetItem[];
  teams: TeamItem[];
  teamMembers: TeamMemberItem[] | undefined;
  membersStatus: "idle" | "loading" | "ready" | "error";
  loadMembers: (teamId: number, force?: boolean) => Promise<void>;
  asset: AssetItem | undefined;
  team: TeamItem | undefined;
  assignee: TeamMemberItem | undefined;
  causeTeam: TeamItem | undefined;
  assigneeLabel: string;
  assigneeLookupError: boolean;
  translatedDesc: string | null;
  isTranslating: boolean;
  showOriginal: boolean;
  translatedLangRef: React.MutableRefObject<string>;
  isEditingFull: boolean;
  setIsEditingFull: React.Dispatch<React.SetStateAction<boolean>>;
  isEditingCategory: boolean;
  setIsEditingCategory: React.Dispatch<React.SetStateAction<boolean>>;
  isEditingLocation: boolean;
  setIsEditingLocation: React.Dispatch<React.SetStateAction<boolean>>;
  activeTab: ModalTab;
  setActiveTab: React.Dispatch<React.SetStateAction<ModalTab>>;
  scoreRating: number;
  setScoreRating: React.Dispatch<React.SetStateAction<number>>;
  rejectReason: string;
  setRejectReason: React.Dispatch<React.SetStateAction<string>>;
  isSubmitting: boolean;
  recoveryPending: boolean;
  showConfirmAction: ConfirmAction | null;
  setShowConfirmAction: React.Dispatch<React.SetStateAction<ConfirmAction | null>>;
  deleteReason: string;
  setDeleteReason: React.Dispatch<React.SetStateAction<string>>;
  isActionMenuOpen: boolean;
  setIsActionMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  beforePhotoError: AuthenticatedImageError | null;
  setBeforePhotoError: React.Dispatch<React.SetStateAction<AuthenticatedImageError | null>>;
  detailPhotoError: AuthenticatedImageError | null;
  setDetailPhotoError: React.Dispatch<React.SetStateAction<AuthenticatedImageError | null>>;
  anyPhotoError: AuthenticatedImageError | null;
  previewIndex: number | null;
  setPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  actionMenuRef: React.RefObject<HTMLDivElement | null>;
  isSavingCause: boolean;
  issueScoreLogs: ScoreLogItem[];
  loadingScores: boolean;
  aiEnabled: boolean | null;
  aiReview: AIReviewResult | null;
  selectedProposedTags: ProposedTagItem[];
  setSelectedProposedTags: React.Dispatch<React.SetStateAction<ProposedTagItem[]>>;
  isReviewing: boolean;
  followUpQuestion: string;
  setFollowUpQuestion: React.Dispatch<React.SetStateAction<string>>;
  pendingFollowUpQuestion: string | null;
  streamingFollowUpAnswer: string;
  followUpHistory: Array<{ question: string; answer: string }>;
  isAskingFollowUp: boolean;
  followUpLimit: number;
  photoList: IssueDetailPhotoItem[];
  resolvedLocationName: string;
  isDeleted: boolean;
  mutationsOnline: boolean;
  canEdit: boolean;
  closeDisabledReason: string | null;
  canAssignResponsibility: boolean;
  canVerifyCause: boolean;
  canResolveIssue: boolean;
  canCloseIssue: boolean;
  canDeleteIssue: boolean;
  canRestoreIssue: boolean;
  isOpenStatus: boolean;
  isPendingReview: boolean;
  isClosedStatus: boolean;
  statusBadge: React.ReactNode;
  dateLocale: string;
  handleAIReview: () => Promise<void>;
  handleFollowUp: (question?: string) => Promise<void>;
  handleApplySuggestion: (patch: Record<string, unknown>) => Promise<void>;
  handleTranslate: () => Promise<void>;
  handleQuickChangeCategory: (newCat: IssueCategory) => Promise<void>;
  handleQuickChangeLocation: (newLocCode: string) => Promise<void>;
  handleSaveResponsibility: () => Promise<void>;
  handleVerifyCause: () => Promise<void>;
  handleResolveOfflineOrOnline: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleConfirmClose: () => Promise<void>;
  handleConfirmReopen: () => Promise<void>;
  handleConfirmInvalid: () => Promise<void>;
  handleConfirmDelete: () => Promise<void>;
  handleConfirmRestore: () => Promise<void>;
}
