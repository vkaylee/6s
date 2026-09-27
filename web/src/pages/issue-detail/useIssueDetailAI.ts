import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client.ts";
import type { AIReviewResult } from "../../components/AIReviewPanel.tsx";
import { useAiStatus } from "../../hooks/useAiStatus.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import type { IssueItem, ProposedTagItem } from "../../types/index.ts";
import { haptics } from "../../utils/haptics.ts";

export interface UseIssueDetailAIProps {
  issue: IssueItem;
  currentIssue: IssueItem;
  isOpen: boolean;
  locale: string;
  isBrowserOnline: boolean;
  isOfflineGrace: boolean;
  selectedProposedTags: ProposedTagItem[];
  setCurrentIssue: React.Dispatch<React.SetStateAction<IssueItem>>;
  onRefresh: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function useIssueDetailAI({
  issue,
  currentIssue,
  isOpen,
  locale,
  isBrowserOnline,
  isOfflineGrace,
  selectedProposedTags,
  setCurrentIssue,
  onRefresh,
  t,
}: UseIssueDetailAIProps) {
  const aiEnabled = useAiStatus();
  const [aiReview, setAiReview] = useState<AIReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [pendingFollowUpQuestion, setPendingFollowUpQuestion] = useState<string | null>(null);
  const [streamingFollowUpAnswer, setStreamingFollowUpAnswer] = useState("");
  const [followUpHistory, setFollowUpHistory] = useState<
    Array<{ question: string; answer: string }>
  >([]);
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const followUpLimit = 5;

  const [translatedDesc, setTranslatedDesc] = useState<string | null>(
    issue.translated_description || null,
  );
  const [isTranslating, setIsTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const translatedLangRef = useRef<string>(locale);

  useEffect(() => {
    setTranslatedDesc(issue.translated_description || null);
    setFollowUpHistory([]);
    setPendingFollowUpQuestion(null);
    setStreamingFollowUpAnswer("");
    setShowOriginal(false);
  }, [issue, locale]);

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

  const handleAIReview = async () => {
    if (!aiEnabled || isReviewing) return;
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

  const handleApplySuggestion = async (patch: Record<string, unknown>) => {
    if (currentIssue.deleted_at != null || !isBrowserOnline || isOfflineGrace) return;
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

  return {
    aiEnabled,
    aiReview,
    isReviewing,
    followUpQuestion,
    setFollowUpQuestion,
    pendingFollowUpQuestion,
    streamingFollowUpAnswer,
    followUpHistory,
    isAskingFollowUp,
    followUpLimit,
    translatedDesc,
    isTranslating,
    showOriginal,
    translatedLangRef,
    handleAIReview,
    handleFollowUp,
    handleApplySuggestion,
    handleTranslate,
  };
}
