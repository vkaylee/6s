import type { FilterState } from "../components/FilterDrawer.tsx";
import type { FacetKey } from "../components/QuickFacets.tsx";
import type { DashboardDataErrors } from "../hooks/useDashboardData.ts";
import type {
  IssueItem,
  LocationHealthScore,
  LocationItem,
  PaginationMeta,
  ReporterLeaderboard,
  TagItem,
} from "../types/index.ts";

export interface DashboardData {
  issues: IssueItem[];
  locations: LocationItem[];
  tags: TagItem[];
  locationHealth: LocationHealthScore[];
  reporters: ReporterLeaderboard[];
  leaderboardTab: "LOCATIONS" | "REPORTERS";
  setLeaderboardTab: (tab: "LOCATIONS" | "REPORTERS") => void;
  activeFacet: FacetKey;
  setActiveFacet: (facet: FacetKey) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortOrder: "URGENT" | "NEWEST" | "OLDEST";
  setSortOrder: (order: "URGENT" | "NEWEST" | "OLDEST") => void;
  isLoadingIssues: boolean;
  isLoadingMore: boolean;
  issuePage?: number;
  paginationMeta: PaginationMeta | null;
  showAllLeaderboard: boolean;
  setShowAllLeaderboard: (value: boolean | ((previous: boolean) => boolean)) => void;
  isFilterDrawerOpen: boolean;
  setIsFilterDrawerOpen: (open: boolean) => void;
  advancedFilters: FilterState;
  applyAdvancedFilters: (filters: FilterState) => void;
  resetAdvancedFilters: () => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  selectedIssue: IssueItem | null;
  setSelectedIssue: (issue: IssueItem | null) => void;
  openIssueById: (issueId: number, deletion?: "active" | "deleted") => Promise<void>;
  loadIssues: (reset?: boolean, customFilters?: FilterState) => Promise<void>;
  loadMoreIssues: () => void;
  loadLeaderboards: () => Promise<void>;
  loadMasterData: () => Promise<void>;
  dashboardErrors: DashboardDataErrors;
  retryIssues?: () => Promise<void> | void;
  retryMasterData?: () => Promise<void> | void;
  retryLeaderboards?: () => Promise<void> | void;
  sortedIssues: IssueItem[];
  facetCounts: Record<FacetKey, number>;
  overallScore: number;
  totalOpen: number;
  totalOverdue: number;
}
