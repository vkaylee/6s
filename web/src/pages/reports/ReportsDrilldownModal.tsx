import { ChevronDown, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { IssueCard } from "../../components/IssueCard.tsx";
import type { IssueCategory, IssueItem, LocationItem, TagItem } from "../../types/index.ts";
import type { ReportDrilldownType } from "./useReportsData.ts";

interface ReportsDrilldownModalProps {
  drilldownType: ReportDrilldownType | null;
  selectedLocationDrill: string | null;
  selectedCategoryDrill: IssueCategory | null;
  selectedTagDrill: string | null;
  drilldownIssues: IssueItem[];
  drilldownTotal: number;
  isLoadingDrilldown: boolean;
  masterLocations: LocationItem[];
  masterTags: TagItem[];
  onClose: () => void;
  onLoadMore: () => void;
  onInspectIssue: (issue: IssueItem) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function ReportsDrilldownModal({
  drilldownType,
  selectedLocationDrill,
  selectedCategoryDrill,
  selectedTagDrill,
  drilldownIssues,
  drilldownTotal,
  isLoadingDrilldown,
  masterLocations,
  masterTags,
  onClose,
  onLoadMore,
  onInspectIssue,
  t,
}: ReportsDrilldownModalProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drilldownType) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => previouslyFocused?.focus();
  }, [drilldownType]);

  useEffect(() => {
    if (!drilldownType) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusables = () =>
      drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !drawer.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, drilldownType]);

  if (!drilldownType) return null;

  const drilldownTitle =
    drilldownType === "LOCATION" && selectedLocationDrill
      ? t("reports.drilldown_title", { target: selectedLocationDrill })
      : drilldownType === "CATEGORY" && selectedCategoryDrill
        ? t("reports.drilldown_category_title", { category: selectedCategoryDrill })
        : drilldownType === "TAG" && selectedTagDrill
          ? t("reports.drilldown_tag_title", { tag: selectedTagDrill })
          : drilldownType === "SAFETY"
            ? t("reports.drilldown_safety_title")
            : t("reports.drilldown_overdue_title");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reports-drilldown-title"
        tabIndex={-1}
        className="w-full max-w-xl bg-white dark:bg-zinc-900 h-full shadow-2xl flex flex-col border-l border-zinc-200 dark:border-zinc-800"
      >
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2
              id="reports-drilldown-title"
              className="text-base font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
            >
              <span>🎯</span>
              <span>{drilldownTitle}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold">
                {drilldownTotal}
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">{t("reports.drilldown_subtitle")}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoadingDrilldown && drilldownIssues.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : drilldownIssues.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-zinc-400">
              {t("reports.drilldown_empty")}
            </div>
          ) : (
            <>
              {drilldownIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  locations={masterLocations}
                  tags={masterTags}
                  onClick={() => onInspectIssue(issue)}
                />
              ))}
              {drilldownTotal > 0 && (
                <div className="pt-2 pb-4 space-y-2">
                  <p className="text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {drilldownIssues.length < drilldownTotal
                      ? t("common.showing_count")
                          .replace("{current}", String(drilldownIssues.length))
                          .replace("{total}", String(drilldownTotal))
                      : t("common.all_loaded").replace("{total}", String(drilldownTotal))}
                  </p>
                  {drilldownIssues.length < drilldownTotal && (
                    <button
                      type="button"
                      onClick={onLoadMore}
                      className="w-full min-h-[44px] py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-zinc-200 dark:border-zinc-700 active:scale-[0.99] transition"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{t("common.load_more")}</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
