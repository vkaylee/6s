import { ArrowUpDown, ChevronDown, Loader2, RotateCw } from "lucide-react";
import { IssueCard } from "../components/IssueCard.tsx";
import { IssueCardSkeleton } from "../components/IssueCardSkeleton.tsx";
import type { FacetKey } from "../components/QuickFacets.tsx";
import type { IssueItem, LocationItem, PaginationMeta, TagItem, TeamItem } from "../types/index.ts";

interface AppIssueListProps {
  issues: IssueItem[];
  sortedIssues: IssueItem[];
  locations: LocationItem[];
  masterTeams: TeamItem[];
  tags: TagItem[];
  sortOrder: "URGENT" | "NEWEST" | "OLDEST";
  setSortOrder: (order: "URGENT" | "NEWEST" | "OLDEST") => void;
  isLoadingIssues: boolean;
  isLoadingMore: boolean;
  paginationMeta: PaginationMeta | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeFacet: FacetKey;
  setActiveFacet: (facet: FacetKey) => void;
  loadIssues: (reset?: boolean) => void;
  loadMoreIssues: () => void;
  openIssueById: (issueId: number, deletion?: "active" | "deleted") => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function AppIssueList({
  issues,
  sortedIssues,
  locations,
  masterTeams,
  tags,
  sortOrder,
  setSortOrder,
  isLoadingIssues,
  isLoadingMore,
  paginationMeta,
  searchQuery,
  setSearchQuery,
  activeFacet,
  setActiveFacet,
  loadIssues,
  loadMoreIssues,
  openIssueById,
  t,
}: AppIssueListProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-zinc-500 uppercase px-1">
        <span className="whitespace-nowrap">
          {t("app.issues_list", { count: sortedIssues.length })}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg px-2 py-1 normal-case font-medium">
            <ArrowUpDown className="w-3 h-3 text-zinc-400" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "URGENT" | "NEWEST" | "OLDEST")}
              className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="URGENT">{t("app.sort_urgent")}</option>
              <option value="NEWEST">{t("app.sort_newest")}</option>
              <option value="OLDEST">{t("app.sort_oldest")}</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => loadIssues(true)}
            className="text-blue-600 dark:text-blue-400 min-h-[36px] flex items-center gap-1 hover:underline lowercase font-semibold"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>{t("app.refresh")}</span>
          </button>
        </div>
      </div>
      {isLoadingIssues && sortedIssues.length === 0 ? (
        <div className="space-y-3">
          <IssueCardSkeleton />
          <IssueCardSkeleton />
          <IssueCardSkeleton />
        </div>
      ) : sortedIssues.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center">
          <span className="text-4xl mb-3 block">{issues.length === 0 ? "🎉" : "🔍"}</span>
          <p className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
            {issues.length === 0 ? t("app.empty_all_clear") : t("issue.no_issues")}
          </p>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs">
            {issues.length === 0 ? "" : t("app.empty_search_desc")}
          </p>
          {(searchQuery || activeFacet !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveFacet("ALL");
              }}
              className="mt-4 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-xl transition"
            >
              {t("app.empty_reset_btn")}
            </button>
          )}
        </div>
      ) : (
        <>
          {sortedIssues.map((iss) => (
            <IssueCard
              key={iss.id}
              issue={iss}
              locations={locations}
              teams={masterTeams}
              tags={tags}
              onClick={() => openIssueById(iss.id, iss.deleted_at ? "deleted" : "active")}
            />
          ))}
          {/* Load more controls & progress */}
          <div className="pt-2 pb-4 space-y-2">
            {paginationMeta && paginationMeta.total > 0 && (
              <p className="text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {issues.length < paginationMeta.total
                  ? t("common.showing_count", {
                      current: issues.length,
                      total: paginationMeta.total,
                    })
                  : t("common.all_loaded", { total: paginationMeta.total })}
              </p>
            )}
            {paginationMeta && issues.length < paginationMeta.total && (
              <button
                type="button"
                onClick={loadMoreIssues}
                disabled={isLoadingMore}
                className="w-full min-h-[48px] py-3 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-sm rounded-2xl flex items-center justify-center gap-2 border border-zinc-200 dark:border-zinc-700 active:scale-[0.99] transition disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                    <span>{t("common.loading_more")}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                    <span>{t("common.load_more")}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
