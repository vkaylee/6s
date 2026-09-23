import { AlertTriangle, Languages, Loader2, ShieldCheck, Sparkles, UserCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiClient } from "../api/client.ts";
import { fetchIssue, issueOperations, patchIssue } from "../api/operations.ts";
import { AIReviewPanel, type AIReviewResult } from "../components/AIReviewPanel.tsx";
import { AuthenticatedImage } from "../components/AuthenticatedImage.tsx";
import { LocationCombobox } from "../components/LocationCombobox.tsx";
import { ResponsibilityPicker } from "../components/ResponsibilityPicker.tsx";
import { SplitSlider } from "../components/SplitSlider.tsx";
import { TagLabel } from "../components/TagLabel.tsx";
import { type DraftResolve, saveDraftResolve } from "../db/indexeddb.ts";
import { useAiStatus } from "../hooks/useAiStatus.ts";
import type { AuthenticatedImageError } from "../hooks/useAuthenticatedImageUrl.ts";
import { useI18nStore } from "../i18n/index.ts";
import { hasCapability, useAuthStore } from "../store/authStore.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { useMasterdataStore } from "../store/masterdataStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import {
  type CauseStatus,
  detectCauseType,
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationItem,
  type ProposedTagItem,
  resolveI18n,
  resolveLocationNameByCode,
  S_CATEGORIES,
  type ScoreLogItem,
  type TagItem,
} from "../types/index.ts";
import { compressImage } from "../utils/compress.ts";
import { haptics } from "../utils/haptics.ts";
import { resolvePhotoUrl } from "../utils/photo.ts";
import { generateUuid } from "../utils/uuid.ts";
import { CreateIssueModal } from "./CreateIssueModal.tsx";

const SCORE_RULE_KEYS = [
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

function getScoreRuleLabel(
  ruleKey: string,
  description: string,
  t: (path: string) => string,
): string {
  return SCORE_RULE_KEYS.includes(ruleKey as (typeof SCORE_RULE_KEYS)[number])
    ? t(`leaderboard.rule_${ruleKey}`)
    : description || ruleKey;
}

interface IssueDetailModalProps {
  issue: IssueItem;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  locations?: LocationItem[];
  tags?: TagItem[];
}

export function IssueDetailModal({
  issue,
  isOpen,
  onClose,
  onRefresh,
  locations = [],
  tags = [],
}: IssueDetailModalProps) {
  const { t, locale: storeLocale } = useI18nStore();
  const locale = typeof window === "undefined" ? useI18nStore.getState().locale : storeLocale;
  const storeUser = useAuthStore((s) => s.user);
  const user = typeof window === "undefined" ? useAuthStore.getState().user : storeUser;
  const [currentIssue, setCurrentIssue] = useState<IssueItem>(issue);
  const causeType = detectCauseType(currentIssue.category, currentIssue.tags);
  const [isResponsibilityEditing, setIsResponsibilityEditing] = useState(false);
  const [isCauseVerificationOpen, setIsCauseVerificationOpen] = useState(false);
  const [isSavingResponsibility, setIsSavingResponsibility] = useState(false);
  const [assignmentAssetId, setAssignmentAssetId] = useState<number | null>(issue.asset_id ?? null);
  const [assignmentTeamId, setAssignmentTeamId] = useState<number | null>(
    issue.assigned_team_id ?? null,
  );
  const [assignmentAssigneeId, setAssignmentAssigneeId] = useState<number | null>(
    issue.assignee_id ?? null,
  );
  const [syncCauseWithAssignment, setSyncCauseWithAssignment] = useState(false);
  const mayAssign = hasCapability(user, "issue:assign");
  const [causeTeamId, setCauseTeamId] = useState<number | null>(issue.cause_team_id ?? null);
  const [closeCauseTeamId, setCloseCauseTeamId] = useState<number | null>(
    issue.cause_status === "UNVERIFIED"
      ? (issue.cause_team_id ?? issue.assigned_team_id ?? null)
      : (issue.cause_team_id ?? null),
  );
  const assets = useMasterdataStore((state) => state.assets);
  const teams = useMasterdataStore((state) => state.teams);
  const teamMembers = useMasterdataStore((state) =>
    currentIssue.assigned_team_id == null
      ? undefined
      : state.membersByTeam[currentIssue.assigned_team_id],
  );
  const membersStatus = useMasterdataStore((state) =>
    currentIssue.assigned_team_id == null
      ? "idle"
      : (state.membersStatusByTeam[currentIssue.assigned_team_id] ?? "idle"),
  );
  const loadMembers = useMasterdataStore((state) => state.loadMembers);
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

  const [causeStatus, setCauseStatus] = useState(issue.cause_status ?? "UNVERIFIED");

  const [translatedDesc, setTranslatedDesc] = useState<string | null>(
    issue.translated_description || null,
  );
  const [isTranslating, setIsTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const translatedLangRef = useRef<string>(locale);

  useEffect(() => {
    setCurrentIssue(issue);
    setTranslatedDesc(issue.translated_description || null);
    setFollowUpHistory([]);
    setPendingFollowUpQuestion(null);
    setStreamingFollowUpAnswer("");
    setShowOriginal(false);
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

  // The assignee name comes from the team member lookup, which the server gates behind issue:assign.
  useEffect(() => {
    if (!mayAssign || currentIssue.assigned_team_id == null) return;
    void loadMembers(currentIssue.assigned_team_id);
  }, [mayAssign, currentIssue.assigned_team_id, loadMembers]);

  const handleAIReview = async () => {
    if (!aiEnabled || isReviewing) {
      return;
    }
    setIsReviewing(true);
    try {
      const res = await apiClient<AIReviewResult>("/api/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_id: currentIssue.id,
          lang: locale,
          proposed_tags: selectedProposedTags.length > 0 ? selectedProposedTags : undefined,
        }),
      });
      setAiReview(res);
      haptics.success();
      window.requestAnimationFrame(() => {
        const panel = document.getElementById("ai-review-panel");
        if (!panel) return;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
      });
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("issue_detail.ai_review_failed"));
    } finally {
      setIsReviewing(false);
    }
  };

  const handleFollowUp = async (question = followUpQuestion) => {
    const trimmed = question.trim();
    if (
      !aiEnabled ||
      !trimmed ||
      isAskingFollowUp ||
      !currentIssue.id ||
      followUpHistory.length >= followUpLimit
    )
      return;
    setIsAskingFollowUp(true);
    setPendingFollowUpQuestion(trimmed);
    setStreamingFollowUpAnswer("");
    try {
      const res = await apiClient<{ answer: string }>("/api/ai/review-follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_id: currentIssue.id,
          lang: locale,
          question: trimmed,
          history: followUpHistory,
        }),
      });
      setFollowUpQuestion("");
      for (const [index] of Array.from(res.answer).entries()) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 18));
        setStreamingFollowUpAnswer(res.answer.slice(0, index + 1));
      }
      setFollowUpHistory((history) => [...history, { question: trimmed, answer: res.answer }]);
      setPendingFollowUpQuestion(null);
      setStreamingFollowUpAnswer("");
      haptics.success();
    } catch {
      setPendingFollowUpQuestion(null);
      setStreamingFollowUpAnswer("");
      haptics.errorOrConflict();
      await modalDialog.alert(t("issue_detail.ai_follow_up_failed"));
    } finally {
      setIsAskingFollowUp(false);
    }
  };

  // Apply one AI suggestion through the existing quick-edit PATCH flow.
  const handleApplySuggestion = async (patch: Record<string, unknown>) => {
    try {
      const updated = await apiClient<IssueItem>(`/api/issues/${currentIssue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      haptics.success();
      if (updated) {
        setCurrentIssue(updated);
      }
      onRefresh();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.update_location_error"));
    }
  };

  const [isEditingFull, setIsEditingFull] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [scoreRating, setScoreRating] = useState<number>(3); // Default 3 stars (SPEC.md Section 9.8.B)
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmAction, setShowConfirmAction] = useState<"CLOSE" | "REOPEN" | "INVALID" | null>(
    null,
  );
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [beforePhotoError, setBeforePhotoError] = useState<AuthenticatedImageError | null>(null);
  const [detailPhotoError, setDetailPhotoError] = useState<AuthenticatedImageError | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const photoDialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const photoTriggerRef = useRef<HTMLElement | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [isSavingCause, setIsSavingCause] = useState(false);
  const [issueScoreLogs, setIssueScoreLogs] = useState<ScoreLogItem[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);
  const aiEnabled = useAiStatus();
  const [aiReview, setAiReview] = useState<AIReviewResult | null>(null);
  const [selectedProposedTags, setSelectedProposedTags] = useState<ProposedTagItem[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [pendingFollowUpQuestion, setPendingFollowUpQuestion] = useState<string | null>(null);
  const [streamingFollowUpAnswer, setStreamingFollowUpAnswer] = useState("");
  const previewIndexRef = useRef<number | null>(null);
  previewIndexRef.current = previewIndex;
  useEffect(() => {
    setBeforePhotoError(null);
    setDetailPhotoError(null);
  }, [currentIssue.id, currentIssue.photo_before, currentIssue.photo_detail]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (previewIndexRef.current !== null || event.key !== "Tab") return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      );
      const active = document.activeElement;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const trigger = previouslyFocusedRef.current;
      if (trigger?.isConnected) trigger.focus();
      previouslyFocusedRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || previewIndex === null) return;
    photoTriggerRef.current = document.activeElement as HTMLElement | null;
    const dialog = photoDialogRef.current;
    if (!dialog) return;
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    );
    focusables[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const active = document.activeElement;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const trigger = photoTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
      photoTriggerRef.current = null;
    };
  }, [isOpen, previewIndex]);
  const [followUpHistory, setFollowUpHistory] = useState<
    Array<{ question: string; answer: string }>
  >([]);
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const followUpLimit = 5;

  // Prefetch the cached translation once the AI status resolves.
  useEffect(() => {
    if (!isOpen || !aiEnabled || !currentIssue.description) return;
    if (translatedDesc && translatedLangRef.current === locale) return;
    let isMounted = true;
    setTranslatedDesc(null);
    setShowOriginal(false);
    apiClient<{ cached: boolean; translated_text?: string }>("/api/ai/cached", {
      method: "POST",
      body: JSON.stringify({
        text: currentIssue.description,
        target_lang: locale,
        context: {
          category: currentIssue.category,
          cause_type: currentIssue.cause_type,
          location_code: currentIssue.location_code,
          location_name: currentIssue.location_name,
          tags: currentIssue.tags,
        },
      }),
    })
      .then((res: { cached: boolean; translated_text?: string }) => {
        if (isMounted && res?.cached && res.translated_text) {
          setTranslatedDesc(res.translated_text);
          translatedLangRef.current = locale;
          setShowOriginal(false);
        }
      })
      .catch(() => {
        // Cache lookup failed, keep original text
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, aiEnabled, currentIssue.description, locale, translatedDesc]);

  const handleTranslate = async () => {
    if (!aiEnabled || !currentIssue.description || isTranslating) return;
    if (translatedDesc && translatedLangRef.current === locale) {
      setShowOriginal(!showOriginal);
      return;
    }
    setIsTranslating(true);
    try {
      const res = await apiClient<{ translated_text: string }>("/api/ai/translate", {
        method: "POST",
        body: JSON.stringify({
          text: currentIssue.description,
          target_lang: locale,
          context: {
            category: currentIssue.category,
            cause_type: currentIssue.cause_type,
            location_code: currentIssue.location_code,
            location_name: currentIssue.location_name,
            tags: currentIssue.tags,
          },
        }),
      });
      if (res?.translated_text) {
        setTranslatedDesc(res.translated_text);
        translatedLangRef.current = locale;
        setShowOriginal(false);
        haptics.success();
      }
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("issue_detail.translate_failed"));
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !issue?.id) {
      setIssueScoreLogs([]);
      return;
    }
    let isMounted = true;
    setLoadingScores(true);
    apiClient<ScoreLogItem[]>(`/api/issues/${issue.id}/score-logs`)
      .then((data: ScoreLogItem[]) => {
        if (isMounted) {
          setIssueScoreLogs(data || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIssueScoreLogs([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingScores(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, issue?.id]);

  // List of all viewable photos for this issue with category color badges
  const photoList = [
    currentIssue.photo_before
      ? {
          url: resolvePhotoUrl(currentIssue.photo_before, "before"),
          alt: t("issue_detail.photo_before_alt"),
          label: t("slider.before"),
          badgeClass: "bg-amber-500 text-zinc-950 font-black shadow-amber-500/20",
        }
      : null,
    currentIssue.photo_detail
      ? {
          url: resolvePhotoUrl(currentIssue.photo_detail, "detail"),
          alt: t("issue_detail.photo_detail_alt"),
          label: t("issue.photo_detail_label"),
          badgeClass: "bg-blue-500 text-white font-black shadow-blue-500/20",
        }
      : null,
    currentIssue.photo_after
      ? {
          url: resolvePhotoUrl(currentIssue.photo_after, "after"),
          alt: t("slider.after_alt"),
          label: t("slider.after"),
          badgeClass: "bg-emerald-500 text-zinc-950 font-black shadow-emerald-500/20",
        }
      : null,
  ].filter((p): p is { url: string; alt: string; label: string; badgeClass: string } => p !== null);

  const previewPhoto =
    previewIndex !== null && photoList[previewIndex] ? photoList[previewIndex] : null;

  // Reset pan & zoom when photo changes
  useEffect(() => {
    if (previewIndex !== null) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [previewIndex]);

  // Escape & Arrow keys listener for gallery navigation & modal closing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewIndex !== null) {
          setPreviewIndex(null);
        } else if (showConfirmAction) {
          setShowConfirmAction(null);
        } else {
          onClose();
        }
      } else if (previewIndex !== null) {
        if (e.key === "ArrowLeft") {
          setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : photoList.length - 1));
        } else if (e.key === "ArrowRight") {
          setPreviewIndex((prev) => (prev !== null && prev < photoList.length - 1 ? prev + 1 : 0));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewIndex, showConfirmAction, onClose, photoList.length]);

  // Prevent background body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Non-passive wheel listener to allow e.preventDefault()
  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoomScale((s) => Math.min(5, Math.max(0.5, Number((s + delta).toFixed(2)))));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [previewPhoto]);
  if (!isOpen) {
    return null;
  }

  const isSafetyIssue = currentIssue.category === IssueCategory.S6;
  const resolvedLocationName = resolveLocationNameByCode(
    locations,
    currentIssue.location_code,
    currentIssue.location_name,
    locale,
  );

  const canEdit =
    currentIssue.status === IssueStatus.OPEN &&
    (user?.id === currentIssue.creator_id || user?.id === currentIssue.resolver_id
      ? hasCapability(user, "issue:close_own")
      : hasCapability(user, "issue:close_any"));

  const canClose =
    (isSafetyIssue && hasCapability(user, "issue:close_safety")) ||
    (!isSafetyIssue &&
      (hasCapability(user, "issue:close_any") ||
        (user?.id === currentIssue.creator_id && hasCapability(user, "issue:close_own")) ||
        (hasCapability(user, "issue:close_line") &&
          user?.assigned_location_code === currentIssue.location_code)));
  const closeDisabledReason =
    isSafetyIssue && !hasCapability(user, "issue:close_safety")
      ? t("issue_detail.need_safety_officer")
      : hasCapability(user, "issue:close_line") &&
          user?.assigned_location_code &&
          user.assigned_location_code !== currentIssue.location_code
        ? t("issue_detail.only_assigned_line")
        : !canClose
          ? t("issue_detail.need_line_leader")
          : null;
  // allowed_actions from the API is authoritative for this row; capabilities only cover legacy
  // responses that omit the field, so a capability can never re-grant a server-denied action.
  const serverActions = currentIssue.allowed_actions;
  const canAssignResponsibility = serverActions
    ? serverActions.assign === true
    : hasCapability(user, "issue:assign");
  const canVerifyCause = serverActions
    ? serverActions.verify_cause === true
    : hasCapability(user, "issue:verify_cause");
  const canResolveIssue = serverActions
    ? serverActions.resolve === true
    : hasCapability(user, "issue:resolve");
  const canCloseIssue = serverActions ? serverActions.close === true : canClose;
  const handleQuickChangeCategory = async (newCat: IssueCategory) => {
    try {
      const updated = await patchIssue(currentIssue.id, { category: newCat });
      haptics.success();
      if (updated) {
        setCurrentIssue(updated);
      }
      setIsEditingCategory(false);
      onRefresh();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.update_category_error"));
    }
  };

  const handleQuickChangeLocation = async (newLocCode: string) => {
    if (!newLocCode || newLocCode === currentIssue.location_code) {
      setIsEditingLocation(false);
      return;
    }
    try {
      const updated = await patchIssue(currentIssue.id, { location_code: newLocCode });
      haptics.success();
      if (updated) {
        setCurrentIssue(updated);
      }
      setIsEditingLocation(false);
      onRefresh();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.update_location_error"));
    }
  };
  const reloadCurrentIssue = async () => {
    try {
      const fresh = await fetchIssue(currentIssue.id);
      if (fresh) setCurrentIssue(fresh);
    } catch {
      // Keep the local copy when the refresh fails (offline or transient error).
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
            ? { cause_status: "CONFIRMED", cause_team_id: assignmentTeamId }
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
    if (causeStatus === "CONFIRMED" && causeTeamId == null) return;
    setIsSavingCause(true);
    try {
      const updated = await apiClient<IssueItem>(`/api/issues/${currentIssue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_version: currentIssue.version,
          // A reset to UNVERIFIED/NOT_APPLICABLE must explicitly clear the responsible team.
          cause_team_id: causeStatus === "CONFIRMED" ? causeTeamId : null,
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
    if (!file) {
      return;
    }

    try {
      setIsSubmitting(true);
      const compressed = await compressImage(file, { maxDimension: 1280, quality: 0.7 });

      // Save draft resolve in local IndexedDB (SPEC.md Section 7.2)
      const draft: DraftResolve = {
        resolved_client_uuid: generateUuid(),
        issue_id: currentIssue.id,
        expected_version: currentIssue.version,
        photo_after_blob: compressed,
        resolved_at: Date.now(),
        sync_status: "PENDING",
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
      if (canVerifyCause && closeCauseTeamId != null && currentIssue.cause_status !== "CONFIRMED") {
        await apiClient<IssueItem>(`/api/issues/${currentIssue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_version: currentIssue.version,
            cause_team_id: closeCauseTeamId,
            cause_status: "CONFIRMED",
          }),
        });
      }
      await issueOperations.close(currentIssue.id, { score_rating: scoreRating });
      haptics.success();
      setShowConfirmAction(null);
      onRefresh();
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("issue_detail.approve_failed"));
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

  const isOpenStatus = currentIssue.status === IssueStatus.OPEN;
  const isPendingReview = currentIssue.status === IssueStatus.PENDING_REVIEW;
  const isClosedStatus = currentIssue.status === IssueStatus.CLOSED;

  const statusBadge = isOpenStatus ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
      ⚠️ {t("status.OPEN")}
    </span>
  ) : isPendingReview ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
      ⏳ {t("status.PENDING_REVIEW")}
    </span>
  ) : isClosedStatus ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
      ✓ {t("status.CLOSED")}
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 shrink-0">
      {t("status.INVALID")}
    </span>
  );

  const dateLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 2xl:p-8 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      {/* Backdrop overlay button for a11y click-outside */}
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="fixed inset-0 w-full h-full cursor-default bg-transparent -z-10"
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-detail-modal-title"
        tabIndex={-1}
        className="w-full max-w-lg lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-y-auto sm:my-auto flex flex-col max-h-[calc(100dvh-1.5rem)] lg:max-h-[90vh] 2xl:max-h-[85vh]"
      >
        {/* Header */}
        <h2 id="issue-detail-modal-title" className="sr-only">
          {t("issue_detail.modal_title", { id: currentIssue.id })}
        </h2>
        <div className="p-4 pt-5 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="px-2 py-0.5 rounded-md font-black text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 shrink-0">
              {currentIssue.category}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold text-[10px] border shrink-0 ${
                causeType === "BEHAVIOR"
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                  : "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800"
              }`}
            >
              {causeType === "BEHAVIOR" ? "👤" : "📦"}
              {causeType === "BEHAVIOR" ? t("issue.badge_behavior") : t("issue.badge_condition")}
            </span>
            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 px-1">
              v{currentIssue.version}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {statusBadge}
            {canEdit && (
              <button
                type="button"
                onClick={() => setIsEditingFull(true)}
                className="p-2 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 transition-colors flex items-center justify-center min-w-[40px] min-h-[40px]"
                title={t("issue.edit")}
                aria-label={t("issue.edit")}
              >
                <span>✏️</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label={t("common.close")}
            >
              ✕
            </button>
          </div>
        </div>

        {isEditingCategory && (
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 grid grid-cols-3 gap-2">
            {S_CATEGORIES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => handleQuickChangeCategory(s.key)}
                className={`p-2 rounded-xl text-xs font-black min-h-[44px] border ${
                  currentIssue.category === s.key
                    ? "bg-zinc-900 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                }`}
              >
                {s.key} ({s.name_i18n ? resolveI18n(s.name_i18n, locale) : s.name})
              </button>
            ))}
          </div>
        )}

        {/* In-place quick edit location dropdown */}
        {isEditingLocation && locations && locations.length > 0 && (
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700">
            <LocationCombobox
              locations={locations}
              value={currentIssue.location_code}
              onChange={handleQuickChangeLocation}
            />
          </div>
        )}
        {/* Detail Content - 2 Columns on Desktop */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:grid lg:grid-cols-12 min-h-0">
          {/* Left Column: Visuals & Description (60% on 2K) */}
          <div className="lg:col-span-7 xl:col-span-7 2xl:col-span-8 p-4 lg:p-6 space-y-4 lg:overflow-y-auto lg:border-r border-zinc-200 dark:border-zinc-800">
            {/* Split Slider if After photo exists, otherwise show Before photo */}
            {currentIssue.photo_after ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("issue_detail.compare_slider_label")}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    🔍 {t("issue_detail.tap_to_zoom")}
                  </span>
                </div>
                <SplitSlider
                  beforeUrl={resolvePhotoUrl(currentIssue.photo_before, "before")}
                  afterUrl={resolvePhotoUrl(currentIssue.photo_after, "after")}
                  onPhotoClick={(type) => {
                    setZoomScale(1);
                    if (type === "before") {
                      const idx = photoList.findIndex(
                        (p) => p.url === resolvePhotoUrl(currentIssue.photo_before, "before"),
                      );
                      setPreviewIndex(idx >= 0 ? idx : 0);
                    } else {
                      const idx = photoList.findIndex(
                        (p) => p.url === resolvePhotoUrl(currentIssue.photo_after, "after"),
                      );
                      setPreviewIndex(idx >= 0 ? idx : photoList.length - 1);
                    }
                  }}
                />
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {t("issue_detail.photo_before_label")}
                  </span>
                  {!beforePhotoError && (
                    <span className="text-[11px] text-zinc-400">
                      {t("issue_detail.tap_to_zoom")}
                    </span>
                  )}
                </div>
                <div className="group relative w-full overflow-hidden rounded-2xl border border-zinc-200 shadow-md dark:border-zinc-800">
                  <AuthenticatedImage
                    imageUrl={resolvePhotoUrl(currentIssue.photo_before, "before")}
                    alt={t("issue_detail.photo_before_alt")}
                    compact={false}
                    onErrorStateChange={setBeforePhotoError}
                    className={`w-full aspect-[4/3] object-cover transition-transform ${
                      beforePhotoError ? "" : "group-hover:scale-101"
                    }`}
                  />
                  {!beforePhotoError && (
                    <button
                      type="button"
                      aria-label={t("issue_detail.tap_to_zoom")}
                      onClick={() => {
                        setZoomScale(1);
                        const idx = photoList.findIndex(
                          (p) => p.url === resolvePhotoUrl(currentIssue.photo_before, "before"),
                        );
                        setPreviewIndex(idx >= 0 ? idx : 0);
                      }}
                      className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                    >
                      <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100">
                        {t("issue_detail.tap_to_zoom")}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Detail photo (Before) if available */}
            {currentIssue.photo_detail && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {t("issue_detail.photo_detail_label")}
                  </span>
                  {!detailPhotoError && (
                    <span className="text-[11px] text-zinc-400">
                      {t("issue_detail.tap_to_zoom")}
                    </span>
                  )}
                </div>
                <div className="group relative w-full overflow-hidden rounded-2xl border border-zinc-200 shadow-md dark:border-zinc-800">
                  <AuthenticatedImage
                    imageUrl={resolvePhotoUrl(currentIssue.photo_detail, "detail")}
                    alt={t("issue_detail.photo_detail_alt")}
                    compact={false}
                    onErrorStateChange={setDetailPhotoError}
                    className={`w-full aspect-[4/3] object-cover transition-transform ${
                      detailPhotoError ? "" : "group-hover:scale-101"
                    }`}
                  />
                  {!detailPhotoError && (
                    <button
                      type="button"
                      aria-label={t("issue_detail.tap_to_zoom")}
                      onClick={() => {
                        setZoomScale(1);
                        const idx = photoList.findIndex(
                          (p) => p.url === resolvePhotoUrl(currentIssue.photo_detail, "detail"),
                        );
                        setPreviewIndex(idx >= 0 ? idx : 1);
                      }}
                      className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                    >
                      <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100">
                        {t("issue_detail.tap_to_zoom")}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Information, Actions, Rating & Score Breakdown (40% on 2K) */}
          <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-4 p-4 lg:p-6 space-y-4 lg:overflow-y-auto bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Description & Tags */}
              <h2 className="font-bold text-base leading-6 text-zinc-900 dark:text-zinc-100 break-words">
                #{currentIssue.id} - {resolvedLocationName}
              </h2>
              <div className="space-y-2.5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-700 dark:bg-zinc-800/80">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {t("issue_detail.reporter_label")}{" "}
                      <strong>{currentIssue.creator_name}</strong>
                    </span>
                    <span>{new Date(currentIssue.created_at).toLocaleDateString(dateLocale)}</span>
                  </div>
                </div>
                {translatedDesc && translatedLangRef.current === locale && !showOriginal ? (
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-1 rounded-md border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 shadow-2xs dark:border-indigo-800/80 dark:bg-indigo-950/60 dark:text-indigo-300">
                      <Sparkles
                        className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400"
                        aria-hidden="true"
                      />
                      <span>
                        {t("issue_detail.translated_badge", { lang: locale.toUpperCase() })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {translatedDesc}
                    </p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {currentIssue.description || t("issue.no_description")}
                  </p>
                )}
                {currentIssue.tags && currentIssue.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {currentIssue.tags.map((tagCode) => (
                      <TagLabel
                        key={tagCode}
                        code={tagCode}
                        tags={currentIssue.tag_details?.length ? currentIssue.tag_details : tags}
                        className="inline-flex items-center rounded-md bg-zinc-200/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-700/80 dark:text-zinc-300"
                      />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-100 pt-2 dark:border-zinc-700/70">
                  {aiEnabled === false ? (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      {t("issue_detail.ai_disabled_reason")}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAIReview}
                      disabled={aiEnabled !== true || isReviewing}
                      aria-disabled={aiEnabled !== true}
                      aria-busy={isReviewing}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-transparent px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-violet-700 dark:hover:bg-violet-950/40"
                    >
                      {isReviewing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles
                          className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400"
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        {isReviewing
                          ? t("issue_detail.ai_reviewing")
                          : t("issue_detail.ai_review_btn")}
                      </span>
                    </button>
                  )}
                  {currentIssue.description && (
                    <button
                      type="button"
                      onClick={handleTranslate}
                      disabled={aiEnabled !== true || isTranslating}
                      aria-disabled={aiEnabled !== true}
                      aria-busy={isTranslating}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-transparent px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                    >
                      {isTranslating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Languages
                          className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400"
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        {isTranslating
                          ? t("issue_detail.translating")
                          : translatedDesc && translatedLangRef.current === locale
                            ? showOriginal
                              ? t("issue_detail.translate_btn")
                              : t("issue_detail.show_original")
                            : t("issue_detail.translate_btn")}
                      </span>
                    </button>
                  )}
                </div>
                {currentIssue.reject_reason && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                    <strong>{t("issue_detail.reject_reason_label")}</strong>{" "}
                    {currentIssue.reject_reason}
                  </div>
                )}
              </div>
              {aiReview && (
                <AIReviewPanel
                  review={aiReview}
                  currentIssue={currentIssue}
                  tags={tags}
                  value={followUpQuestion}
                  selectedProposedTags={selectedProposedTags}
                  onSelectedProposedTagsChange={setSelectedProposedTags}
                  followUpCount={followUpHistory.length}
                  followUpLimit={followUpLimit}
                  followUpHistory={followUpHistory}
                  pendingFollowUpQuestion={pendingFollowUpQuestion}
                  streamingFollowUpAnswer={streamingFollowUpAnswer}
                  onFollowUpQuestionChange={setFollowUpQuestion}
                  isAskingFollowUp={isAskingFollowUp}
                  onApplySuggestion={handleApplySuggestion}
                  onFollowUp={handleFollowUp}
                />
              )}
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
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {t("issue.asset_optional")}
                      </span>
                      <span
                        className="mt-1 block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                        title={asset ? `${asset.asset_code} — ${asset.name}` : undefined}
                      >
                        {asset ? `${asset.asset_code} — ${asset.name}` : t("issue.no_asset")}
                      </span>
                    </div>
                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {t("issue.assigned_team")}
                      </span>
                      <span
                        className="mt-1 block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                        title={team ? `${team.name} (${team.code})` : undefined}
                      >
                        {team ? `${team.name} (${team.code})` : t("issue.no_assigned_team")}
                      </span>
                    </div>
                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {t("issue.assignee_optional")}
                      </span>
                      <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        <span aria-live="polite" className="truncate">
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
                    {currentIssue.cause_status === "CONFIRMED" && causeTeam && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/90 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900 sm:col-span-3 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                            aria-hidden="true"
                          />
                          <span>
                            <strong className="font-bold">{t("issue.cause_team")}:</strong>{" "}
                            {causeTeam.name} ({causeTeam.code})
                          </span>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/70 dark:text-amber-200">
                          {t("issue.cause_status_CONFIRMED")}
                        </span>
                      </div>
                    )}
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
                            <option value="NOT_APPLICABLE">
                              {t("issue.cause_status_NOT_APPLICABLE")}
                            </option>
                          </select>
                        </label>
                        {causeStatus === "CONFIRMED" && (
                          <label className="space-y-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                            <span>{t("issue.cause_team")}</span>
                            <select
                              value={causeTeamId ?? ""}
                              onChange={(event) =>
                                setCauseTeamId(
                                  event.target.value ? Number(event.target.value) : null,
                                )
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
              {currentIssue.responsibility_history &&
                currentIssue.responsibility_history.length > 0 && (
                  <section
                    className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/80"
                    aria-labelledby="responsibility-history-title"
                  >
                    <h3
                      id="responsibility-history-title"
                      className="text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300"
                    >
                      {t("issue_detail.responsibility_history_title")}
                    </h3>
                    <ol className="space-y-2">
                      {currentIssue.responsibility_history.map((entry, index) => (
                        <li
                          key={entry.id ?? `${entry.created_at}-${index}`}
                          className="border-l-2 border-zinc-200 pl-3 text-xs dark:border-zinc-700"
                        >
                          <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {t(`issue_detail.history_action_${entry.action}`)}
                          </p>
                          <p className="text-zinc-500 dark:text-zinc-400">
                            {entry.changed_by_name || t("issue_detail.changed_by")} ·{" "}
                            {new Date(entry.created_at).toLocaleString(locale)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              {/* Score Impact Breakdown Card */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                    📊 {t("issue_detail.score_breakdown_title")}
                  </span>
                  {currentIssue.score_rating && currentIssue.score_rating > 0 && (
                    <span className="text-xs text-amber-500 font-bold">
                      {"★".repeat(currentIssue.score_rating)}
                    </span>
                  )}
                </div>

                {loadingScores ? (
                  <div className="text-xs text-zinc-400 py-2 text-center">
                    {t("common.loading")}
                  </div>
                ) : (issueScoreLogs || []).length === 0 ? (
                  <div className="text-xs text-zinc-400 py-1">
                    {t("issue_detail.score_breakdown_empty")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(issueScoreLogs || []).map((log) => {
                      const isPositive = log.points > 0;
                      return (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {getScoreRuleLabel(log.rule_key, log.rule_description, t)}
                              {log.penalty_date && ` (${log.penalty_date})`}
                            </div>
                          </div>
                          <span
                            className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg ${
                              isPositive
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300"
                            }`}
                          >
                            {isPositive ? `+${log.points}` : log.points}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Bar (Integrated in sidebar for desktop, sticky/accessible) */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-2 shrink-0">
              {/* Action: Resolve (Upload after photo) */}
              {currentIssue.status === IssueStatus.OPEN && canResolveIssue && (
                <div className="space-y-1.5">
                  <label className="cursor-pointer w-full bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2 shadow-lg">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={isSubmitting}
                      onChange={handleResolveOfflineOrOnline}
                      className="hidden"
                    />
                    <span>
                      📸{" "}
                      {isSubmitting
                        ? t("issue_detail.processing_image")
                        : t("issue_detail.capture_after")}
                    </span>
                  </label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 px-1 text-center font-medium">
                    {causeType === "BEHAVIOR"
                      ? t("issue.photo_after_hint_behavior")
                      : t("issue.photo_after_hint_condition")}
                  </p>
                </div>
              )}

              {/* Action: Close (Duyệt đạt) */}
              {currentIssue.status === IssueStatus.PENDING_REVIEW && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!canCloseIssue || isSubmitting}
                      onClick={() => setShowConfirmAction("CLOSE")}
                      className={`flex-1 font-black text-sm py-4 px-4 rounded-2xl min-h-[56px] flex items-center justify-center space-x-1 shadow-md transition ${
                        canCloseIssue
                          ? "bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white"
                          : "opacity-50 bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      }`}
                    >
                      <span>
                        {canCloseIssue
                          ? `✓ ${t("issue.approve").toUpperCase()}`
                          : `🔒 ${t("issue_detail.locked")}`}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={!canCloseIssue || isSubmitting}
                      onClick={() => setShowConfirmAction("REOPEN")}
                      className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 font-bold px-4 rounded-2xl min-h-[56px] text-xs disabled:opacity-40"
                    >
                      {t("issue.reopen")}
                    </button>
                  </div>
                  {!canCloseIssue && closeDisabledReason && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium px-1 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>{closeDisabledReason}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Action: Invalidate (Bác bỏ) */}
              {currentIssue.status === IssueStatus.OPEN &&
                hasCapability(user, "issue:invalidate") && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmAction(IssueStatus.INVALID)}
                    className="w-full text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold py-3 px-4 rounded-xl min-h-[44px] flex items-center justify-center border border-rose-200 dark:border-rose-900/60 transition gap-1.5"
                  >
                    <span>⛔</span>
                    <span>{t("issue_detail.invalidate_btn_label")}</span>
                  </button>
                )}
            </div>
          </div>
        </div>

        {/* Inline Action Confirmation Drawer (Glove Friendly, No Nested Modal Jump) */}
        {showConfirmAction && (
          <div className="border-t border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-850 p-4 space-y-3 animate-fade-in shadow-inner">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-zinc-900 dark:text-zinc-100">
                {showConfirmAction === "CLOSE"
                  ? t("issue_detail.confirm_close_title")
                  : showConfirmAction === "REOPEN"
                    ? t("issue_detail.confirm_reopen_title")
                    : t("issue_detail.confirm_invalid_title")}
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmAction(null)}
                className="text-zinc-400 hover:text-zinc-600 text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>
            {showConfirmAction === "CLOSE" && (
              <div className="space-y-3">
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/70 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-xs space-y-2">
                  <div className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <span>📋</span>
                    <span>{t("issue_detail.close_checklist_title")}</span>
                  </div>
                  <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>
                      {causeType === "BEHAVIOR"
                        ? t("issue_detail.check_behavior_corrected")
                        : t("issue_detail.check_condition_resolved")}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>{t("issue_detail.check_recurrence_prevented")}</span>
                  </label>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800">
                  <span className="block text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-2">
                    {t("issue_detail.kaizen_rating_label")}
                  </span>
                  <div className="flex items-center space-x-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setScoreRating(star)}
                        className={`w-11 h-11 rounded-xl font-black text-lg flex items-center justify-center transition-all ${
                          scoreRating >= star
                            ? "bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-105"
                            : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    {scoreRating === 5 && (
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300 ml-2 animate-bounce">
                        {t("issue_detail.kaizen_excellent")}
                      </span>
                    )}
                  </div>
                </div>

                {canVerifyCause && currentIssue.cause_status === "UNVERIFIED" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="block text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                        {t("issue.close_cause_verification_title")}
                      </span>
                      <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                        {t("issue.optional_for_scoring")}
                      </span>
                    </div>
                    <select
                      value={closeCauseTeamId ?? ""}
                      onChange={(event) =>
                        setCloseCauseTeamId(event.target.value ? Number(event.target.value) : null)
                      }
                      aria-label={t("issue.close_cause_verification_title")}
                      className="min-h-[44px] w-full rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-2xs dark:border-amber-800 dark:bg-zinc-900 dark:text-zinc-100"
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
                  </div>
                )}
              </div>
            )}

            {showConfirmAction === IssueStatus.INVALID && (
              <div className="space-y-2">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">{t("issue_detail.invalid_warning")}</p>
                    <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                      {t("issue_detail.invalid_guidance")}
                    </p>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={t("issue_detail.reason_placeholder")}
                  className="w-full bg-white dark:bg-zinc-900 border border-rose-300 dark:border-rose-700 rounded-xl p-3 text-base focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            )}

            {showConfirmAction === "REOPEN" && (
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t("issue_detail.reason_placeholder")}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl p-3 text-base focus:outline-none"
              />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (showConfirmAction === "CLOSE") handleConfirmClose();
                  if (showConfirmAction === "REOPEN") handleConfirmReopen();
                  if (showConfirmAction === IssueStatus.INVALID) handleConfirmInvalid();
                }}
                className="flex-1 bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-black py-3 rounded-xl min-h-[48px] text-sm shadow-sm"
              >
                {t("common.confirm")}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmAction(null)}
                className="flex-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-xl min-h-[48px] text-sm"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* Fullscreen Image Previewer with Zoom */}
        {previewPhoto && (
          <div
            ref={photoDialogRef}
            className="fixed inset-0 z-70 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="issue-photo-preview-title"
          >
            <h2 id="issue-photo-preview-title" className="sr-only">
              {t("issue_detail.photo_preview")}
            </h2>
            {/* Backdrop overlay button for a11y click-outside */}
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={() => {
                setPreviewIndex(null);
                setZoomScale(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="fixed inset-0 w-full h-full cursor-default bg-transparent -z-10"
              tabIndex={-1}
            />
            {/* Top Bar with High-Contrast Pill Badge & Gallery Indicator */}
            <div className="w-full flex items-center justify-between z-10 pointer-events-none">
              <div className="flex items-center gap-2.5 max-w-[75%] pointer-events-auto">
                <span
                  className={`px-3 py-1 rounded-full text-xs uppercase tracking-wider shadow-md ${previewPhoto.badgeClass}`}
                >
                  {previewPhoto.label}
                </span>
                {photoList.length > 1 && (
                  <span className="px-2.5 py-1 rounded-full bg-zinc-850 border border-zinc-700/80 text-xs font-bold text-zinc-300 shadow-sm shrink-0">
                    {(previewIndex ?? 0) + 1} / {photoList.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewIndex(null);
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="w-10 h-10 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white font-bold flex items-center justify-center transition-colors pointer-events-auto cursor-pointer"
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>

            {/* Image Container with Zoom, Mouse Wheel, Two-Finger Pinch & Drag/Pan */}
            <div
              role="application"
              aria-label={t("issue_detail.photo_preview")}
              ref={imageContainerRef}
              className="flex-1 w-full flex items-center justify-center overflow-hidden p-2 touch-none select-none cursor-grab active:cursor-grabbing"
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  touchDistanceRef.current = Math.hypot(dx, dy);
                } else if (e.touches.length === 1) {
                  dragStartRef.current = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                    panX: panOffset.x,
                    panY: panOffset.y,
                  };
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 2 && touchDistanceRef.current) {
                  const dx = e.touches[0].clientX - e.touches[1].clientX;
                  const dy = e.touches[0].clientY - e.touches[1].clientY;
                  const newDist = Math.hypot(dx, dy);
                  const ratio = newDist / touchDistanceRef.current;
                  touchDistanceRef.current = newDist;
                  setZoomScale((s) => Math.min(5, Math.max(0.5, Number((s * ratio).toFixed(2)))));
                } else if (e.touches.length === 1 && dragStartRef.current) {
                  const dx = e.touches[0].clientX - dragStartRef.current.x;
                  const dy = e.touches[0].clientY - dragStartRef.current.y;
                  setPanOffset({
                    x: dragStartRef.current.panX + dx,
                    y: dragStartRef.current.panY + dy,
                  });
                }
              }}
              onTouchEnd={() => {
                const now = Date.now();
                if (now - lastTapRef.current < 300) {
                  // Double tap detected for mobile
                  if (zoomScale > 1) {
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    setZoomScale(2.5);
                  }
                  lastTapRef.current = 0;
                } else {
                  lastTapRef.current = now;
                }

                if (zoomScale <= 1) {
                  if (panOffset.y > 100) {
                    // Swipe down to dismiss
                    setPreviewIndex(null);
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else if (photoList.length > 1 && panOffset.x < -80) {
                    // Swipe left -> Next photo
                    setPreviewIndex((prev) =>
                      prev !== null && prev < photoList.length - 1 ? prev + 1 : 0,
                    );
                    setPanOffset({ x: 0, y: 0 });
                  } else if (photoList.length > 1 && panOffset.x > 80) {
                    // Swipe right -> Prev photo
                    setPreviewIndex((prev) =>
                      prev !== null && prev > 0 ? prev - 1 : photoList.length - 1,
                    );
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    setPanOffset({ x: 0, y: 0 });
                  }
                }
                touchDistanceRef.current = null;
                dragStartRef.current = null;
              }}
              onMouseDown={(e) => {
                if (e.button === 0) {
                  dragStartRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                    panX: panOffset.x,
                    panY: panOffset.y,
                  };
                }
              }}
              onMouseMove={(e) => {
                if (dragStartRef.current) {
                  const dx = e.clientX - dragStartRef.current.x;
                  const dy = e.clientY - dragStartRef.current.y;
                  setPanOffset({
                    x: dragStartRef.current.panX + dx,
                    y: dragStartRef.current.panY + dy,
                  });
                }
              }}
              onMouseUp={() => {
                if (zoomScale <= 1) {
                  if (panOffset.y > 100) {
                    setPreviewIndex(null);
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else if (photoList.length > 1 && panOffset.x < -80) {
                    setPreviewIndex((prev) =>
                      prev !== null && prev < photoList.length - 1 ? prev + 1 : 0,
                    );
                    setPanOffset({ x: 0, y: 0 });
                  } else if (photoList.length > 1 && panOffset.x > 80) {
                    setPreviewIndex((prev) =>
                      prev !== null && prev > 0 ? prev - 1 : photoList.length - 1,
                    );
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    setPanOffset({ x: 0, y: 0 });
                  }
                }
                dragStartRef.current = null;
              }}
              onMouseLeave={() => {
                if (zoomScale <= 1) {
                  if (panOffset.y > 100) {
                    setPreviewIndex(null);
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  } else {
                    setPanOffset({ x: 0, y: 0 });
                  }
                }
                dragStartRef.current = null;
              }}
              onDoubleClick={() => {
                if (zoomScale > 1) {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                } else {
                  setZoomScale(2.5);
                }
              }}
            >
              <AuthenticatedImage
                imageUrl={previewPhoto.url}
                alt={previewPhoto.alt}
                compact={false}
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                }}
                className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-75 select-none pointer-events-none"
              />
            </div>
            {/* Bottom Controls */}
            {/* Bottom Controls with Next/Prev & Close */}
            <div className="flex items-center gap-2 p-2 bg-zinc-900/90 border border-zinc-700/60 rounded-2xl backdrop-blur-md z-10 shadow-2xl">
              {photoList.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewIndex((prev) =>
                        prev !== null && prev > 0 ? prev - 1 : photoList.length - 1,
                      );
                    }}
                    aria-label={t("issue_detail.previous_photo")}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewIndex((prev) =>
                        prev !== null && prev < photoList.length - 1 ? prev + 1 : 0,
                      );
                    }}
                    aria-label={t("issue_detail.next_photo")}
                  >
                    ▶
                  </button>
                  <div className="w-px h-5 bg-zinc-700 mx-0.5" />
                </>
              )}
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))}
                disabled={zoomScale <= 0.5}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer"
              >
                ➖ {t("issue_detail.zoom_out")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all min-w-[60px] text-center cursor-pointer"
              >
                {Math.round(zoomScale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.min(4, Number((s + 0.25).toFixed(2))))}
                disabled={zoomScale >= 4}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer"
              >
                ➕ {t("issue_detail.zoom_in")}
              </button>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <button
                type="button"
                onClick={() => {
                  setPreviewIndex(null);
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-3.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                aria-label={t("common.close")}
              >
                <span>✕</span>
                <span>{t("common.close")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {isEditingFull && (
        <CreateIssueModal
          isOpen={isEditingFull}
          onClose={() => setIsEditingFull(false)}
          onSuccess={(updated) => {
            if (updated) {
              setCurrentIssue(updated);
            }
            setIsEditingFull(false);
            onRefresh();
          }}
          locations={locations}
          tags={tags}
          initialIssue={currentIssue}
        />
      )}
    </div>
  );
}
