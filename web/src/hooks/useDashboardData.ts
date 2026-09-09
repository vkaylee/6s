import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client.ts";
import type { Tag } from "../api/generated/index.ts";
import type { FilterState } from "../components/FilterDrawer.tsx";
import type { FacetKey } from "../components/QuickFacets.tsx";
import type { UserProfile } from "../store/authStore.ts";
import { syncEngine } from "../sync/syncEngine.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationHealthScore,
  type LocationItem,
  type PaginationMeta,
  type ReporterLeaderboard,
  type TagItem,
} from "../types/index.ts";

const EMPTY_FILTERS: FilterState = { statuses: [], categories: [], locationCodes: [] };

export function normalizeTags(tags: Tag[]): TagItem[] {
  return tags.map((tag) => ({
    tag_code: tag.code,
    category: tag.category,
    label_vi: tag.name_vi,
    label_zh: tag.name_zh,
    label_en: tag.name_en,
    use_count: tag.use_count,
    is_preset: tag.is_preset,
  }));
}

interface UseDashboardDataOptions {
  accessToken: string | null;
  locale: string;
  searchString: string;
  user: UserProfile | null;
}

export function useDashboardData({
  accessToken,
  locale,
  searchString,
  user,
}: UseDashboardDataOptions) {
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [locationHealth, setLocationHealth] = useState<LocationHealthScore[]>([]);
  const [reporters, setReporters] = useState<ReporterLeaderboard[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<"LOCATIONS" | "REPORTERS">("LOCATIONS");
  const [activeFacet, setActiveFacetState] = useState<FacetKey>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("6s_active_facet");
      if (
        saved &&
        ["ALL", "MY_ISSUES", "MY_LINE", "SAFETY_6S", "OVERDUE_48H", "WAITING_MY_REVIEW"].includes(
          saved,
        )
      ) {
        return saved as FacetKey;
      }
    }
    return "ALL";
  });
  const setActiveFacet = (facet: FacetKey) => {
    setActiveFacetState(facet);
    if (typeof window !== "undefined") {
      localStorage.setItem("6s_active_facet", facet);
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrderState] = useState<"URGENT" | "NEWEST" | "OLDEST">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("6s_sort_order");
      if (saved && ["URGENT", "NEWEST", "OLDEST"].includes(saved)) {
        return saved as "URGENT" | "NEWEST" | "OLDEST";
      }
    }
    return "URGENT";
  });
  const setSortOrder = (order: "URGENT" | "NEWEST" | "OLDEST") => {
    setSortOrderState(order);
    if (typeof window !== "undefined") {
      localStorage.setItem("6s_sort_order", order);
    }
  };
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [issuePage, setIssuePage] = useState(1);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);
  const [showAllLeaderboard, setShowAllLeaderboard] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);

  const openIssueById = async (issueId: number) => {
    const existing = issues.find((issue) => issue.id === issueId);
    if (existing) {
      setSelectedIssue(existing);
      return;
    }
    try {
      const fetched = await apiClient<IssueItem>(`/api/issues/${issueId}`);
      if (fetched) setSelectedIssue(fetched);
    } catch {
      // ignore if not found
    }
  };

  useEffect(() => {
    const issueId = new URLSearchParams(searchString).get("issue_id");
    if (issueId) openIssueById(Number(issueId));
  }, [searchString, issues]);

  const loadMasterData = async () => {
    try {
      const [locData, tagData] = await Promise.all([
        apiClient<LocationItem[]>("/api/locations"),
        apiClient<Tag[]>("/api/tags"),
      ]);
      setLocations(locData || []);
      setTags(normalizeTags(tagData || []));
    } catch {
      setLocations([
        {
          code: "LINE_A1",
          name_vi: "Chuyền May A1",
          name_zh: "缝纫一拉",
          name_en: "Sewing Line A1",
          is_active: true,
        },
        {
          code: "LINE_A2",
          name_vi: "Chuyền May A2",
          name_zh: "缝纫二拉",
          name_en: "Sewing Line A2",
          is_active: true,
        },
        {
          code: "WAREHOUSE",
          name_vi: "Kho Nguyên Liệu",
          name_zh: "原料仓",
          name_en: "Raw Warehouse",
          is_active: true,
        },
      ]);
      setTags([]);
    }
  };

  const loadIssues = async (reset = false, customFilters?: FilterState) => {
    const targetPage = reset ? 1 : issuePage;
    if (reset) {
      setIsLoadingIssues(true);
      setIssuePage(1);
    } else {
      setIsLoadingMore(true);
    }

    const filters = customFilters || advancedFilters;
    const queryParams = new URLSearchParams({ page: String(targetPage), limit: "20" });
    if (filters.statuses.length > 0) queryParams.set("statuses", filters.statuses.join(","));
    if (filters.categories.length > 0) queryParams.set("categories", filters.categories.join(","));
    if (filters.locationCodes.length > 0) {
      queryParams.set("location_codes", filters.locationCodes.join(","));
    }
    try {
      const res = await apiClient<IssueItem[]>(`/api/issues?${queryParams.toString()}`, {
        includeMeta: true,
      });
      const list = res?.data || [];
      const meta = res?.pagination || { page: targetPage, limit: 20, total: list.length };
      setPaginationMeta(meta);
      if (reset) {
        setIssues(list);
        setSelectedIssue((prev) =>
          prev ? list.find((issue) => issue.id === prev.id) || prev : null,
        );
      } else {
        appendUniqueIssues(list);
      }
    } catch {
      // ignore
    } finally {
      if (reset) setIsLoadingIssues(false);
      else setIsLoadingMore(false);
    }
  };

  const appendUniqueIssues = (list: IssueItem[]) => {
    setIssues((prev) => {
      const existingIds = new Set(prev.map((issue) => issue.id));
      return [...prev, ...list.filter((issue) => !existingIds.has(issue.id))];
    });
  };

  const loadMoreIssues = () => {
    if (isLoadingMore || isLoadingIssues) return;
    const nextPage = issuePage + 1;
    setIssuePage(nextPage);
    const queryParams = new URLSearchParams({ page: String(nextPage), limit: "20" });
    if (advancedFilters.statuses.length > 0) {
      queryParams.set("statuses", advancedFilters.statuses.join(","));
    }
    if (advancedFilters.categories.length > 0) {
      queryParams.set("categories", advancedFilters.categories.join(","));
    }
    if (advancedFilters.locationCodes.length > 0) {
      queryParams.set("location_codes", advancedFilters.locationCodes.join(","));
    }
    setIsLoadingMore(true);
    apiClient<IssueItem[]>(`/api/issues?${queryParams.toString()}`, {
      includeMeta: true,
    })
      .then((res) => {
        if (res?.pagination) setPaginationMeta(res.pagination);
        appendUniqueIssues(res?.data || []);
      })
      .catch(() => setIssuePage((prev) => Math.max(1, prev - 1)))
      .finally(() => setIsLoadingMore(false));
  };

  const applyAdvancedFilters = (newFilters: FilterState) => {
    setAdvancedFilters(newFilters);
    loadIssues(true, newFilters);
  };

  const resetAdvancedFilters = () => {
    setAdvancedFilters(EMPTY_FILTERS);
    loadIssues(true, EMPTY_FILTERS);
  };

  const loadLeaderboards = async () => {
    try {
      const [locHealth, repLeader] = await Promise.all([
        apiClient<LocationHealthScore[]>("/api/leaderboard/locations"),
        apiClient<ReporterLeaderboard[]>("/api/leaderboard/reporters"),
      ]);
      setLocationHealth(locHealth || []);
      setReporters(repLeader || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!user) return;
    syncEngine.start();
    loadMasterData();
    loadIssues(true);
    loadLeaderboards();
    let wasSyncing = false;
    const unsub = syncEngine.subscribe((progress) => {
      if (wasSyncing && !progress.isSyncing) {
        loadIssues(true);
        loadLeaderboards();
      }
      wasSyncing = progress.isSyncing;
    });
    let eventSource: EventSource | null = null;
    let active = true;
    if (typeof window !== "undefined" && typeof EventSource !== "undefined" && accessToken) {
      apiClient<{ ticket: string }>("/api/auth/ticket", { method: "POST" })
        .then(({ ticket }) => {
          if (!active) return;
          eventSource = new EventSource(`/api/issues/events?ticket=${encodeURIComponent(ticket)}`);
          eventSource.addEventListener("issue", () => {
            loadIssues(true);
            loadLeaderboards();
          });
        })
        .catch(() => {
          // ponytail: fallback if ticket endpoint unavailable
          if (!active) return;
          eventSource = new EventSource(
            `/api/issues/events?token=${encodeURIComponent(accessToken)}`,
          );
          eventSource.addEventListener("issue", () => {
            loadIssues(true);
            loadLeaderboards();
          });
        });
    }
    return () => {
      active = false;
      unsub();
      eventSource?.close();
      syncEngine.stop();
    };
  }, [user, accessToken]);

  const previousLocale = useRef(locale);
  useEffect(() => {
    if (previousLocale.current !== locale) {
      previousLocale.current = locale;
      if (user) {
        loadIssues(true);
        if (selectedIssue) {
          apiClient<IssueItem>(`/api/issues/${selectedIssue.id}`)
            .then((updated) => {
              if (updated) setSelectedIssue(updated);
            })
            .catch(() => {});
        }
      }
    }
  }, [locale, user, selectedIssue]);

  const filteredIssues = issues.filter((issue) => {
    if (activeFacet === "MY_ISSUES" && issue.creator_id !== user?.id) return false;
    if (
      activeFacet === "MY_LINE" &&
      user?.assigned_location_code &&
      issue.location_code !== user.assigned_location_code
    ) {
      return false;
    }
    if (activeFacet === "SAFETY_6S" && issue.category !== IssueCategory.S6) return false;
    if (activeFacet === "OVERDUE_48H") {
      const overdue = Date.now() - new Date(issue.created_at).getTime() > 48 * 3600 * 1000;
      if (!(issue.status === IssueStatus.OPEN && overdue)) return false;
    }
    if (activeFacet === "WAITING_MY_REVIEW" && issue.status !== IssueStatus.PENDING_REVIEW) {
      return false;
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const matches = [
        issue.location_code,
        issue.location_name,
        issue.description,
        issue.creator_name,
        issue.resolver_name,
        issue.category,
        ...issue.tags,
      ].some((value) => value?.toLowerCase().includes(query));
      if (!matches) return false;
    }
    return true;
  });

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    if (sortOrder === "NEWEST")
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortOrder === "OLDEST")
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    const aIsSafety = a.category === IssueCategory.S6 && a.status === IssueStatus.OPEN ? 1 : 0;
    const bIsSafety = b.category === IssueCategory.S6 && b.status === IssueStatus.OPEN ? 1 : 0;
    if (aIsSafety !== bIsSafety) return bIsSafety - aIsSafety;
    const now = Date.now();
    const aOverdue =
      a.status === IssueStatus.OPEN && now - new Date(a.created_at).getTime() > 48 * 3600 * 1000
        ? 1
        : 0;
    const bOverdue =
      b.status === IssueStatus.OPEN && now - new Date(b.created_at).getTime() > 48 * 3600 * 1000
        ? 1
        : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;
    const aPending = a.status === IssueStatus.PENDING_REVIEW ? 1 : 0;
    const bPending = b.status === IssueStatus.PENDING_REVIEW ? 1 : 0;
    if (aPending !== bPending) return bPending - aPending;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const now = Date.now();
  const facetCounts: Record<FacetKey, number> = {
    ALL: issues.length,
    MY_ISSUES: issues.filter((issue) => issue.creator_id === user?.id).length,
    MY_LINE: user?.assigned_location_code
      ? issues.filter((issue) => issue.location_code === user.assigned_location_code).length
      : issues.length,
    SAFETY_6S: issues.filter(
      (issue) => issue.category === IssueCategory.S6 && issue.status === IssueStatus.OPEN,
    ).length,
    OVERDUE_48H: issues.filter(
      (issue) =>
        issue.status === IssueStatus.OPEN &&
        now - new Date(issue.created_at).getTime() > 48 * 3600 * 1000,
    ).length,
    WAITING_MY_REVIEW: issues.filter((issue) => issue.status === IssueStatus.PENDING_REVIEW).length,
  };
  const overallScore = locationHealth.length
    ? Math.round(
        locationHealth.reduce((sum, location) => sum + location.health_score, 0) /
          locationHealth.length,
      )
    : 100;
  const totalOpen = issues.filter((issue) => issue.status === IssueStatus.OPEN).length;
  const totalOverdue = issues.filter(
    (issue) =>
      issue.status === IssueStatus.OPEN &&
      now - new Date(issue.created_at).getTime() > 48 * 3600 * 1000,
  ).length;

  return {
    issues,
    locations,
    tags,
    locationHealth,
    reporters,
    leaderboardTab,
    setLeaderboardTab,
    activeFacet,
    setActiveFacet,
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    isLoadingIssues,
    isLoadingMore,
    issuePage,
    paginationMeta,
    showAllLeaderboard,
    setShowAllLeaderboard,
    isFilterDrawerOpen,
    setIsFilterDrawerOpen,
    advancedFilters,
    applyAdvancedFilters,
    resetAdvancedFilters,
    isDrawerOpen,
    setIsDrawerOpen,
    selectedIssue,
    setSelectedIssue,
    openIssueById,
    loadIssues,
    loadMoreIssues,
    loadLeaderboards,
    loadMasterData,
    sortedIssues,
    facetCounts,
    overallScore,
    totalOpen,
    totalOverdue,
  };
}
