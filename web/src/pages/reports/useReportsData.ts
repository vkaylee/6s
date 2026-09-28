import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiClient } from "../../api/client.ts";
import { subscribeIssueEvents } from "../../api/issueEvents.ts";
import { fetchIssuePage, fetchLocations, fetchTags } from "../../api/operations.ts";
import {
  IssueCategory,
  type IssueItem,
  type LocationHealthScore,
  type LocationItem,
  type ReporterLeaderboard,
  type ReportSummaryResponse,
  type TagItem,
  type TeamKpiReport,
} from "../../types/index.ts";
import type { LocationReportItem } from "../../utils/analytics.ts";
import { useFullscreen } from "./useFullscreen.ts";

export type ReportMeetingTab = "LOCATIONS" | "PEOPLE" | "TRENDS" | "TEAMS";
export type ReportDrilldownType = "LOCATION" | "CATEGORY" | "SAFETY" | "OVERDUE" | "TAG";
export type LocationSort = "HEALTH_ASC" | "OPEN_DESC";
export type LocationLimit = 5 | 10 | 0;

export interface ReportKpiData {
  totalIssues: number;
  openIssues: number;
  pendingReviewIssues: number;
  closedIssues: number;
  invalidIssues: number;
  safetyIssues: number;
  overdueIssues: number;
  resolutionRate: number;
  averageHealthScore: number;
}

const DRILLDOWN_PAGE_SIZE = 15;

export function useReportsData() {
  const [summaryData, setSummaryData] = useState<ReportSummaryResponse | null>(null);
  const [locations, setLocations] = useState<LocationHealthScore[]>([]);
  const [reporters, setReporters] = useState<ReporterLeaderboard[]>([]);
  const [masterLocations, setMasterLocations] = useState<LocationItem[]>([]);
  const [masterTags, setMasterTags] = useState<TagItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [daysRange, setDaysRange] = useState<7 | 14 | 30>(14);
  const [activeTab, setActiveTab] = useState<ReportMeetingTab>("LOCATIONS");
  const [locationLimit, setLocationLimit] = useState<LocationLimit>(5);
  const [locationSort, setLocationSort] = useState<LocationSort>("HEALTH_ASC");
  const [selectedLocationFilter, setSelectedLocationFilter] = useState("");
  const [teamReport, setTeamReport] = useState<TeamKpiReport[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [teamReportError, setTeamReportError] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState("");
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [drilldownType, setDrilldownType] = useState<ReportDrilldownType | null>(null);
  const [selectedLocationDrill, setSelectedLocationDrill] = useState<string | null>(null);
  const [selectedCategoryDrill, setSelectedCategoryDrill] = useState<IssueCategory | null>(null);
  const [selectedTagDrill, setSelectedTagDrill] = useState<string | null>(null);
  const [inspectingIssue, setInspectingIssue] = useState<IssueItem | null>(null);
  const [drilldownIssues, setDrilldownIssues] = useState<IssueItem[]>([]);
  const [drilldownTotal, setDrilldownTotal] = useState(0);
  const [drilldownPage, setDrilldownPage] = useState(1);
  const [isLoadingDrilldown, setIsLoadingDrilldown] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const reportRequest = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++reportRequest.current;
    setIsLoading(true);
    setLoadError(false);
    try {
      const locationQuery = selectedLocationFilter
        ? `&location_code=${encodeURIComponent(selectedLocationFilter)}`
        : "";
      const leaderboardLocationQuery = selectedLocationFilter
        ? `?location_code=${encodeURIComponent(selectedLocationFilter)}`
        : "";
      const [summaryRes, locationsRes, repRes, mLocRes, mTagRes] = await Promise.all([
        apiClient<ReportSummaryResponse>(`/api/reports/summary?days=${daysRange}${locationQuery}`),
        apiClient<LocationHealthScore[]>(`/api/leaderboard/locations${leaderboardLocationQuery}`),
        apiClient<ReporterLeaderboard[]>(`/api/leaderboard/reporters${leaderboardLocationQuery}`),
        fetchLocations(),
        fetchTags(),
      ]);
      if (requestId !== reportRequest.current) return;
      setSummaryData(summaryRes || null);
      setLocations(locationsRes || []);
      setReporters(repRes || []);
      setMasterLocations(mLocRes || []);
      setMasterTags(mTagRes || []);
    } catch (err) {
      if (requestId === reportRequest.current) {
        setLoadError(true);
        console.error("Failed to load report analytics data", err);
      }
    } finally {
      if (requestId === reportRequest.current) setIsLoading(false);
    }
  }, [daysRange, selectedLocationFilter]);

  const loadTeamReport = useCallback(async () => {
    setIsLoadingTeams(true);
    setTeamReportError(false);
    try {
      const rows = await apiClient<TeamKpiReport[]>(`/api/reports/teams?days=${daysRange}`);
      setTeamReport(rows || []);
    } catch {
      setTeamReportError(true);
    } finally {
      setIsLoadingTeams(false);
    }
  }, [daysRange]);

  useEffect(() => {
    if (activeTab !== "TEAMS") return;
    loadTeamReport();
  }, [activeTab, loadTeamReport]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    return subscribeIssueEvents(() => {
      loadData();
      if (activeTab === "TEAMS") loadTeamReport();
    });
  }, [activeTab, loadData, loadTeamReport]);

  useEffect(() => {
    if (!drilldownType) {
      setDrilldownIssues([]);
      setDrilldownTotal(0);
      return;
    }

    let isCancelled = false;
    const fetchDrilldown = async () => {
      setIsLoadingDrilldown(true);
      try {
        const params = new URLSearchParams({
          page: String(drilldownPage),
          limit: String(DRILLDOWN_PAGE_SIZE),
        });
        if (drilldownType === "LOCATION" && selectedLocationDrill) {
          params.set("location_code", selectedLocationDrill);
        } else if (selectedLocationFilter) {
          params.set("location_code", selectedLocationFilter);
        }
        if (drilldownType === "CATEGORY" && selectedCategoryDrill) {
          params.set("category", selectedCategoryDrill);
        } else if (drilldownType === "SAFETY") {
          params.set("category", IssueCategory.S6);
        } else if (drilldownType === "OVERDUE") {
          params.set("overdue", "true");
        }
        if (drilldownType === "TAG" && selectedTagDrill) {
          params.set("tag_code", selectedTagDrill);
        }

        const res = await fetchIssuePage(
          Object.fromEntries(params.entries()) as Record<string, unknown>,
        );
        if (isCancelled) return;
        const list = res?.data || [];
        const metaTotal = res?.pagination?.total ?? list.length;
        setDrilldownTotal(metaTotal);
        setDrilldownIssues((prev) => (drilldownPage === 1 ? list : [...prev, ...list]));
      } catch (err) {
        console.error("Failed to load drilldown issues", err);
      } finally {
        if (!isCancelled) setIsLoadingDrilldown(false);
      }
    };

    fetchDrilldown();
    return () => {
      isCancelled = true;
    };
  }, [
    drilldownType,
    selectedLocationDrill,
    selectedCategoryDrill,
    selectedTagDrill,
    selectedLocationFilter,
    drilldownPage,
  ]);

  useEffect(() => {
    setDrilldownPage(1);
  }, [drilldownType, selectedLocationDrill, selectedCategoryDrill, selectedTagDrill]);

  const visibleTeamReport = useMemo(
    () =>
      selectedTeamFilter
        ? teamReport.filter((row) => String(row.team_id) === selectedTeamFilter)
        : teamReport,
    [teamReport, selectedTeamFilter],
  );
  const kpi = useMemo<ReportKpiData>(() => {
    const totalHealth =
      locations.length > 0
        ? Math.round(locations.reduce((acc, loc) => acc + loc.health_score, 0) / locations.length)
        : 100;
    if (summaryData?.kpi) return { ...summaryData.kpi, averageHealthScore: totalHealth };
    return {
      totalIssues: 0,
      openIssues: 0,
      pendingReviewIssues: 0,
      closedIssues: 0,
      invalidIssues: 0,
      safetyIssues: 0,
      overdueIssues: 0,
      resolutionRate: 0,
      averageHealthScore: totalHealth,
    };
  }, [summaryData, locations]);
  const categoryData = summaryData?.categories || [];
  const trendData = summaryData?.trends || [];
  const topTagsData = summaryData?.topTags || [];
  const rawLocationReports = useMemo(
    () =>
      locations
        .map((loc) => ({
          location_code: loc.location_code,
          location_name: loc.location_name || loc.location_code,
          health_score: loc.health_score,
          open_count: loc.open_count,
          overdue_count: loc.overdue_count,
          total_issues: loc.open_count + loc.overdue_count,
        }))
        .sort((a, b) => a.health_score - b.health_score),
    [locations],
  );
  const filteredLocationData = useMemo(() => {
    let list = [...rawLocationReports];
    if (selectedLocationFilter) {
      list = list.filter((loc) => loc.location_code === selectedLocationFilter);
    }
    if (locationSort === "HEALTH_ASC") {
      list.sort((a, b) => a.health_score - b.health_score);
    } else {
      list.sort((a, b) => b.open_count - a.open_count || a.health_score - b.health_score);
    }
    if (locationLimit > 0 && !selectedLocationFilter) list = list.slice(0, locationLimit);
    return list;
  }, [rawLocationReports, selectedLocationFilter, locationSort, locationLimit]);

  const closeDrilldown = useCallback(() => {
    setDrilldownType(null);
    setSelectedLocationDrill(null);
    setSelectedCategoryDrill(null);
    setSelectedTagDrill(null);
  }, []);

  return {
    reporters,
    masterLocations,
    masterTags,
    isLoading,
    isExporting,
    setIsExporting,
    daysRange,
    setDaysRange,
    activeTab,
    setActiveTab,
    locationLimit,
    setLocationLimit,
    locationSort,
    setLocationSort,
    selectedLocationFilter,
    setSelectedLocationFilter,
    teamReport,
    isLoadingTeams,
    teamReportError,
    selectedTeamFilter,
    setSelectedTeamFilter,
    visibleTeamReport,
    isFullscreen,
    toggleFullscreen,
    drilldownType,
    setDrilldownType,
    selectedLocationDrill,
    setSelectedLocationDrill,
    selectedCategoryDrill,
    setSelectedCategoryDrill,
    selectedTagDrill,
    setSelectedTagDrill,
    inspectingIssue,
    setInspectingIssue,
    drilldownIssues,
    drilldownTotal,
    drilldownPage,
    setDrilldownPage,
    isLoadingDrilldown,
    loadError,
    loadData,
    loadTeamReport,
    kpi,
    categoryData,
    trendData,
    topTagsData,
    filteredLocationData: filteredLocationData as (LocationReportItem & {
      location_name: string;
    })[],
    closeDrilldown,
  };
}
