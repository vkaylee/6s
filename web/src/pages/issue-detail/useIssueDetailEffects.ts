import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client.ts";
import type { IssueItem, ScoreLogItem } from "../../types/index.ts";

export interface UseIssueDetailEffectsProps {
  isOpen: boolean;
  currentIssue: IssueItem;
  isActionMenuOpen: boolean;
  setIsActionMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  previewIndex: number | null;
}

export function useIssueDetailEffects({
  isOpen,
  currentIssue,
  isActionMenuOpen,
  setIsActionMenuOpen,
  previewIndex,
}: UseIssueDetailEffectsProps) {
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const previewIndexRef = useRef<number | null>(null);
  previewIndexRef.current = previewIndex;

  const [issueScoreLogs, setIssueScoreLogs] = useState<ScoreLogItem[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);

  useEffect(() => {
    const updateOnline = () => setIsBrowserOnline(true);
    const updateOffline = () => setIsBrowserOnline(false);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOffline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOffline);
    };
  }, []);

  useEffect(() => {
    if (!isActionMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) setIsActionMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsActionMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isActionMenuOpen, setIsActionMenuOpen]);

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
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !currentIssue?.id) {
      setIssueScoreLogs([]);
      return;
    }
    let isMounted = true;
    setLoadingScores(true);
    apiClient<ScoreLogItem[]>(
      `/api/issues/${currentIssue.id}/score-logs?${new URLSearchParams({
        deletion: currentIssue.deleted_at != null ? "deleted" : "active",
      }).toString()}`,
    )
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
  }, [isOpen, currentIssue?.id, currentIssue?.deleted_at]);

  return {
    isBrowserOnline,
    dialogRef,
    actionMenuRef,
    issueScoreLogs,
    loadingScores,
  };
}
