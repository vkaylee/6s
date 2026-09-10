import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Maximize2,
  Medal,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "wouter";
import { apiClient, fetchAuthenticatedBlob } from "../api/client.ts";
import { IssueCard } from "../components/IssueCard.tsx";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { useThemeStore } from "../store/themeStore.ts";
import {
  IssueCategory,
  type IssueItem,
  type LocationHealthScore,
  type LocationItem,
  type ReporterLeaderboard,
  type ReportSummaryResponse,
  type TagItem,
} from "../types/index.ts";
import type { LocationReportItem } from "../utils/analytics.ts";
import { goBack } from "../utils/navigation.ts";
import { IssueDetailModal } from "./IssueDetailModal.tsx";

export async function downloadReportsCsv(locationCode?: string): Promise<void> {
  const query = locationCode
    ? `?${new URLSearchParams({ location_code: locationCode }).toString()}`
    : "";
  const blob = await fetchAuthenticatedBlob(`/api/issues/export${query}`);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `6S_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export type ReportMeetingTab = "LOCATIONS" | "PEOPLE" | "TRENDS";

const CATEGORY_COLORS: Record<string, string> = {
  [IssueCategory.S1]: "#3b82f6", // Blue
  [IssueCategory.S2]: "#06b6d4", // Cyan
  [IssueCategory.S3]: "#10b981", // Emerald
  [IssueCategory.S4]: "#f59e0b", // Amber
  [IssueCategory.S5]: "#8b5cf6", // Violet
  [IssueCategory.S6]: "#f43f5e", // Rose (Safety)
};
export function ReportsPage() {
  const { t, locale } = useI18nStore();
  const { isDark } = useThemeStore();

  const [summaryData, setSummaryData] = useState<ReportSummaryResponse | null>(null);
  const [locations, setLocations] = useState<LocationHealthScore[]>([]);
  const [reporters, setReporters] = useState<ReporterLeaderboard[]>([]);
  const [masterLocations, setMasterLocations] = useState<LocationItem[]>([]);
  const [masterTags, setMasterTags] = useState<TagItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [daysRange, setDaysRange] = useState<7 | 14 | 30>(14);

  // Top Meeting View Mode (Progressive Disclosure Navigation)
  const [activeTab, setActiveTab] = useState<ReportMeetingTab>("LOCATIONS");

  // Meeting presenter controls
  const [locationLimit, setLocationLimit] = useState<5 | 10 | 0>(5); // 0 = all
  const [locationSort, setLocationSort] = useState<"HEALTH_ASC" | "OPEN_DESC">("HEALTH_ASC");
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drill-down inspection drawer
  const [drilldownType, setDrilldownType] = useState<
    "LOCATION" | "CATEGORY" | "SAFETY" | "OVERDUE" | "TAG" | null
  >(null);
  const [selectedLocationDrill, setSelectedLocationDrill] = useState<string | null>(null);
  const [selectedCategoryDrill, setSelectedCategoryDrill] = useState<IssueCategory | null>(null);
  const [selectedTagDrill, setSelectedTagDrill] = useState<string | null>(null);
  const [inspectingIssue, setInspectingIssue] = useState<IssueItem | null>(null);
  const [drilldownIssues, setDrilldownIssues] = useState<IssueItem[]>([]);
  const [drilldownTotal, setDrilldownTotal] = useState(0);
  const [drilldownPage, setDrilldownPage] = useState(1);
  const [isLoadingDrilldown, setIsLoadingDrilldown] = useState(false);
  const DRILLDOWN_PAGE_SIZE = 15;
  useEffect(() => {
    setDrilldownPage(1);
  }, [drilldownType, selectedLocationDrill, selectedCategoryDrill, selectedTagDrill]);
  const loadData = async () => {
    setIsLoading(true);
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
        apiClient<ReporterLeaderboard[]>(
          `/api/leaderboard/reporters${leaderboardLocationQuery}`,
        ).catch(() => []),
        apiClient<LocationItem[]>("/api/locations").catch(() => []),
        apiClient<TagItem[]>("/api/tags").catch(() => []),
      ]);
      setSummaryData(summaryRes || null);
      setLocations(locationsRes || []);
      setReporters(repRes || []);
      setMasterLocations(mLocRes || []);
      setMasterTags(mTagRes || []);
    } catch (err) {
      console.error("Failed to load report analytics data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [daysRange, selectedLocationFilter]);
  // Fetch drilldown issues from backend whenever drilldown filter or page changes
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

        const res = await apiClient<IssueItem[]>(`/api/issues?${params.toString()}`, {
          includeMeta: true,
        });
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

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      await downloadReportsCsv(selectedLocationFilter || undefined);
    } catch (err) {
      console.error("Failed to export CSV", err);
      await modalDialog.alert(t("reports.export_error"), t("common.error"));
    } finally {
      setIsExporting(false);
    }
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Compute metrics from backend summary API if available, fallback safely
  const kpi = useMemo(() => {
    const totalHealth =
      locations.length > 0
        ? Math.round(locations.reduce((acc, loc) => acc + loc.health_score, 0) / locations.length)
        : 100;

    if (summaryData?.kpi) {
      return {
        ...summaryData.kpi,
        averageHealthScore: totalHealth,
      };
    }
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

  const categoryData = useMemo(() => {
    return summaryData?.categories || [];
  }, [summaryData]);

  const rawLocationReports = useMemo(() => {
    return locations
      .map((loc) => ({
        location_code: loc.location_code,
        location_name: loc.location_name || loc.location_code,
        health_score: loc.health_score,
        open_count: loc.open_count,
        overdue_count: loc.overdue_count,
        total_issues: loc.open_count + loc.overdue_count,
      }))
      .sort((a, b) => a.health_score - b.health_score);
  }, [locations]);

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

    if (locationLimit > 0 && !selectedLocationFilter) {
      list = list.slice(0, locationLimit);
    }

    return list;
  }, [rawLocationReports, selectedLocationFilter, locationSort, locationLimit]);

  const trendData = useMemo(() => summaryData?.trends || [], [summaryData]);
  const topTagsData = useMemo(() => summaryData?.topTags || [], [summaryData]);

  // Drilldown issues filtered by active drilldown target
  // allDrilldownIssues replaced by server-side paginated drilldownIssues & drilldownTotal
  const gridColor = isDark ? "#27272a" : "#f4f4f5";
  const textColor = isDark ? "#a1a1aa" : "#71717a";
  const tooltipBg = isDark ? "#18181b" : "#ffffff";
  const tooltipBorder = isDark ? "#3f3f46" : "#e4e4e7";

  // Dynamic bar height for horizontal view (approx 44px per bar, min 280px)
  const chartHeight = Math.max(280, filteredLocationData.length * 44 + 40);

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-20">
      {/* Page Heading */}
      <div className="pt-4">
        <PageContainer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          {/* Back button, Title & Quick Actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <button
                type="button"
                onClick={() => goBack("/")}
                className="p-1.5 -ml-1 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0"
                aria-label={t("reports.back")}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-sm sm:text-base font-black tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 whitespace-nowrap">
                  <span className="shrink-0">📊</span>
                  <span className="inline sm:hidden">{t("reports.title_short")}</span>
                  <span className="hidden sm:inline">{t("reports.title")}</span>
                </h1>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium hidden md:block">
                  {t("reports.subtitle")}
                </p>
              </div>
            </div>

            {/* Quick Actions (Fullscreen, Refresh, Lang, Theme) */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center"
                title={isFullscreen ? t("reports.fullscreen_exit") : t("reports.fullscreen_enter")}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={loadData}
                disabled={isLoading}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                title={t("reports.refresh")}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                data-testid="btn-export-csv"
                onClick={handleExportCSV}
                disabled={isExporting}
                className="h-8 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title={t("reports.export_csv")}
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span className="hidden md:inline">
                  {isExporting ? t("reports.exporting") : t("reports.export_csv")}
                </span>
              </button>
            </div>
          </div>

          {/* Filter Range Pills: Full width bar on mobile, inline on desktop */}
          <div className="flex items-center justify-end">
            <div className="w-full sm:w-auto flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setDaysRange(7)}
                className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${
                  daysRange === 7
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => setDaysRange(14)}
                className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${
                  daysRange === 14
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                14d
              </button>
              <button
                type="button"
                onClick={() => setDaysRange(30)}
                className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${
                  daysRange === 30
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                30d
              </button>
            </div>
          </div>
        </PageContainer>
      </div>

      {/* Main Content Area */}
      <main className="pt-4">
        <PageContainer className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <label htmlFor="reports-location-filter" className="text-xs font-bold text-zinc-500">
              {t("reports.select_location_filter")}
            </label>
            <select
              id="reports-location-filter"
              value={selectedLocationFilter}
              onChange={(e) => setSelectedLocationFilter(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-72"
            >
              <option value="">{t("reports.all_locations_option")}</option>
              {masterLocations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.name_vi || location.code}
                </option>
              ))}
            </select>
          </div>
          {/* Tầng 1: Executive KPI Cards (Sticky Strategic Reality) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* KPI 1: Total & Resolution */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                {t("reports.total_issues")}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100">
                  {kpi.totalIssues}
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                  {kpi.resolutionRate}% {t("reports.resolution_rate")}
                </span>
              </div>
            </div>

            {/* KPI 2: Safety 6S (Clickable Drill-down) */}
            <button
              type="button"
              onClick={() => setDrilldownType("SAFETY")}
              className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10 shadow-sm cursor-pointer hover:border-rose-400 transition-colors text-left w-full"
            >
              <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wider block flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span>⚠️</span>
                  <span>{t("reports.safety_alerts")}</span>
                </span>
                <span className="text-[10px] lowercase text-rose-400">drilldown ↗</span>
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
                  {kpi.safetyIssues}
                </span>
                <span className="text-[11px] text-zinc-400 font-medium">
                  {kpi.safetyIssues > 0 ? t("reports.safety_priority") : t("reports.safety_safe")}
                </span>
              </div>
            </button>

            {/* KPI 3: Overdue >48h (Clickable Drill-down) */}
            <button
              type="button"
              onClick={() => setDrilldownType("OVERDUE")}
              className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 shadow-sm cursor-pointer hover:border-amber-400 transition-colors text-left w-full"
            >
              <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider block flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span>⏱️</span>
                  <span>{t("reports.overdue_alerts")}</span>
                </span>
                <span className="text-[10px] lowercase text-amber-400">drilldown ↗</span>
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                  {kpi.overdueIssues}
                </span>
                <span className="text-[11px] text-zinc-400 font-medium">
                  {t("reports.sla_breach")}
                </span>
              </div>
            </button>

            {/* KPI 4: Average Health */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                {t("reports.average_health")}
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span
                  className={`text-2xl sm:text-3xl font-black ${
                    kpi.averageHealthScore >= 90
                      ? "text-emerald-600 dark:text-emerald-400"
                      : kpi.averageHealthScore >= 75
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {kpi.averageHealthScore}
                </span>
                <span className="text-[11px] font-bold text-zinc-400">
                  {t("reports.max_score")}
                </span>
              </div>
            </div>
          </div>

          {/* Tầng 2: Meeting Navigation Segmented Tabs (Progressive Disclosure) */}
          <div className="bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("LOCATIONS")}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                activeTab === "LOCATIONS"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <span>🏭</span>
              <span>{t("reports.tab_locations")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("PEOPLE")}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                activeTab === "PEOPLE"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <span>👥</span>
              <span>{t("reports.tab_people")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("TRENDS")}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                activeTab === "TRENDS"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <span>📈</span>
              <span>{t("reports.tab_trends")}</span>
            </button>
          </div>

          {/* Tab 1: Plant & Hotspots (Horizontal Bar + Dropdown Filter) */}
          {activeTab === "LOCATIONS" && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">
                      {t("reports.chart_location_title")}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {t("reports.chart_location_desc")}
                    </p>
                  </div>

                  {/* Hotspot Range Selector (Top 5 / Top 10 / All) */}
                  <div className="flex items-center gap-1.5 self-start sm:self-auto">
                    <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl text-[11px] font-bold border border-zinc-200 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => setLocationLimit(5)}
                        className={`px-2.5 py-1 rounded-lg transition-all ${
                          locationLimit === 5 && !selectedLocationFilter
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                            : "text-zinc-500"
                        }`}
                      >
                        {t("reports.top_5")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationLimit(10)}
                        className={`px-2.5 py-1 rounded-lg transition-all ${
                          locationLimit === 10 && !selectedLocationFilter
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                            : "text-zinc-500"
                        }`}
                      >
                        {t("reports.top_10")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationLimit(0)}
                        className={`px-2.5 py-1 rounded-lg transition-all ${
                          locationLimit === 0 && !selectedLocationFilter
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                            : "text-zinc-500"
                        }`}
                      >
                        {t("reports.all_locations")}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Toolbar: Sort toggles (location filter is global above KPIs) */}
                <div className="flex flex-wrap items-stretch gap-2 mb-4 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl text-[11px] font-bold border border-zinc-200 dark:border-zinc-700 shrink-0 ml-auto">
                    <button
                      type="button"
                      onClick={() => setLocationSort("HEALTH_ASC")}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        locationSort === "HEALTH_ASC"
                          ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                          : "text-zinc-500"
                      }`}
                      title={t("reports.sort_lowest_health")}
                    >
                      {t("reports.sort_lowest_health")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocationSort("OPEN_DESC")}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        locationSort === "OPEN_DESC"
                          ? "bg-white dark:bg-zinc-700 text-rose-600 dark:text-rose-400 shadow-sm"
                          : "text-zinc-500"
                      }`}
                      title={t("reports.sort_most_open")}
                    >
                      {t("reports.sort_most_open")}
                    </button>
                  </div>
                </div>

                {/* Horizontal Bar Chart Container with internal scroll */}
                <div className="w-full max-h-[420px] overflow-y-auto pr-1">
                  {filteredLocationData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-zinc-400">
                      {t("reports.empty_data")}
                    </div>
                  ) : (
                    <div style={{ height: `${chartHeight}px` }}>
                      <ResponsiveContainer width="100%" height="100%" style={{ outline: "none" }}>
                        <BarChart
                          layout="vertical"
                          data={filteredLocationData}
                          margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                          style={{ outline: "none" }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={gridColor}
                            horizontal={false}
                          />
                          <XAxis type="number" stroke={textColor} fontSize={11} tickLine={false} />
                          <YAxis type="category" dataKey="location_code" hide />
                          <Tooltip
                            cursor={{ fill: "transparent" }}
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) return null;
                              const item = payload[0].payload as LocationReportItem & {
                                location_name: string;
                              };
                              return (
                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg px-3 py-2 text-xs">
                                  <div className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                                    {item.location_name}
                                  </div>
                                  {payload.map((entry) => (
                                    <div
                                      key={String(entry.dataKey)}
                                      className="flex items-center gap-2"
                                    >
                                      <span
                                        className="inline-block w-2 h-2 rounded-full"
                                        style={{ backgroundColor: entry.color || "#999" }}
                                      />
                                      <span className="text-zinc-600 dark:text-zinc-300">
                                        {entry.name}:
                                      </span>
                                      <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                        {entry.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            }}
                          />
                          <Bar
                            name={t("reports.legend_health_score")}
                            dataKey="health_score"
                            fill="#3b82f6"
                            radius={[0, 4, 4, 0]}
                            cursor="pointer"
                            onClick={(data: unknown) => {
                              const item = data as {
                                payload?: LocationReportItem;
                                location_code?: string;
                              };
                              const code = item?.payload?.location_code || item?.location_code;
                              if (code) {
                                setSelectedLocationDrill(code);
                                setDrilldownType("LOCATION");
                              }
                            }}
                          >
                            <LabelList
                              dataKey="location_name"
                              position="top"
                              fill={textColor}
                              fontSize={11}
                              fontWeight="bold"
                              offset={4}
                            />
                            <LabelList
                              dataKey="health_score"
                              position="right"
                              fill={textColor}
                              fontSize={11}
                              fontWeight="bold"
                              offset={4}
                            />
                          </Bar>
                          <Bar
                            name={t("reports.legend_open_issues")}
                            dataKey="open_count"
                            fill="#f43f5e"
                            radius={[0, 4, 4, 0]}
                            cursor="pointer"
                            onClick={(data: unknown) => {
                              const item = data as {
                                payload?: LocationReportItem;
                                location_code?: string;
                              };
                              const code = item?.payload?.location_code || item?.location_code;
                              if (code) {
                                setSelectedLocationDrill(code);
                                setDrilldownType("LOCATION");
                              }
                            }}
                          >
                            <LabelList
                              dataKey="open_count"
                              position="right"
                              fill={textColor}
                              fontSize={11}
                              fontWeight="bold"
                              offset={4}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: People & Honor Roll (Khen thưởng & Trách nhiệm cá nhân) */}
          {activeTab === "PEOPLE" && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Medal className="w-5 h-5 text-amber-500" />
                    <span>{t("reports.top_reporters_title")}</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{t("reports.top_reporters_desc")}</p>
                </div>
              </div>

              {reporters.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-zinc-400">
                  {t("reports.empty_data")}
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {reporters.map((rep, idx) => (
                    <div
                      key={rep.user_id}
                      className="py-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/40 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                            idx === 0
                              ? "bg-amber-400 text-amber-950 shadow-sm"
                              : idx === 1
                                ? "bg-zinc-300 text-zinc-800"
                                : idx === 2
                                  ? "bg-amber-700/60 text-amber-100"
                                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            {rep.full_name}
                          </div>
                          <div className="text-xs text-zinc-400 flex items-center gap-3 mt-0.5">
                            <span>
                              {t("reports.valid_issues")}:{" "}
                              <strong className="text-zinc-700 dark:text-zinc-300">
                                {rep.valid_count}
                              </strong>
                            </span>
                            <span>•</span>
                            <span className="text-rose-500 font-semibold">
                              {t("reports.safety_issues")}: {rep.safety_count}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <div className="text-sm font-black text-blue-600 dark:text-blue-400">
                            {rep.points > 0 ? `+${rep.points}` : rep.points} pts
                          </div>
                          <span className="text-[10px] text-zinc-400 font-bold uppercase">
                            {t("reports.total_points")}
                          </span>
                        </div>

                        <Link
                          href={`/leaderboard/reporters/${rep.user_id}`}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors inline-flex items-center justify-center"
                          title={t("reports.view_history")}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Trends & Strategic Category Breakdown */}
          {activeTab === "TRENDS" && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 1S - 6S Category Breakdown */}
                <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
                  <div className="mb-3">
                    <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">
                      {t("reports.chart_category_title")}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {t("reports.chart_category_desc")}
                    </p>
                  </div>

                  <div className="w-full h-72 flex flex-col sm:flex-row items-center justify-center">
                    {kpi.totalIssues === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                        {t("reports.empty_data")}
                      </div>
                    ) : (
                      <>
                        <div className="w-full sm:w-3/5 h-56 sm:h-full">
                          <ResponsiveContainer
                            width="100%"
                            height="100%"
                            style={{ outline: "none" }}
                          >
                            <PieChart style={{ outline: "none" }}>
                              <Pie
                                data={categoryData}
                                dataKey="count"
                                nameKey="category"
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={4}
                                cursor="pointer"
                                onClick={(data: unknown) => {
                                  const item = data as {
                                    category?: string;
                                    payload?: { category?: string };
                                  };
                                  const cat = item?.category || item?.payload?.category;
                                  if (cat) {
                                    setSelectedCategoryDrill(cat as IssueCategory);
                                    setDrilldownType("CATEGORY");
                                  }
                                }}
                              >
                                {categoryData.map((entry) => (
                                  <Cell
                                    key={`cell-${entry.category}`}
                                    fill={CATEGORY_COLORS[entry.category] || "#71717a"}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: tooltipBg,
                                  borderColor: tooltipBorder,
                                  borderRadius: 12,
                                  fontSize: 12,
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Custom Legend Pill List with Drill-down button */}
                        <div className="w-full sm:w-2/5 grid grid-cols-2 sm:grid-cols-1 gap-1.5 pt-2 sm:pt-0">
                          {categoryData.map((item) => (
                            <button
                              key={item.category}
                              type="button"
                              onClick={() => {
                                setSelectedCategoryDrill(item.category);
                                setDrilldownType("CATEGORY");
                              }}
                              className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                            >
                              <div className="flex items-center space-x-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{
                                    backgroundColor: CATEGORY_COLORS[item.category] || "#71717a",
                                  }}
                                />
                                <span className="font-bold text-zinc-700 dark:text-zinc-300">
                                  {item.category}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-zinc-500 dark:text-zinc-400">
                                {item.count} ({item.percentage}%) ↗
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Velocity Trendline */}
                <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
                  <div className="mb-3">
                    <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">
                      {t("reports.chart_trend_title")}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {t("reports.chart_trend_desc")}{" "}
                      {t("reports.trend_days_subtitle", { days: String(daysRange) })}
                    </p>
                  </div>

                  <div className="w-full h-72">
                    <ResponsiveContainer width="100%" height="100%" style={{ outline: "none" }}>
                      <AreaChart
                        data={trendData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
                      >
                        <defs>
                          <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke={textColor}
                          fontSize={11}
                          tickLine={false}
                          tickFormatter={(val) => val.slice(5)} // MM-DD
                        />
                        <YAxis
                          stroke={textColor}
                          fontSize={11}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: tooltipBg,
                            borderColor: tooltipBorder,
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                        <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11 }} />
                        <Area
                          type="monotone"
                          name={t("reports.legend_created")}
                          dataKey="created"
                          stroke="#f43f5e"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#createdGrad)"
                        />
                        <Area
                          type="monotone"
                          name={t("reports.legend_resolved")}
                          dataKey="resolved"
                          stroke="#10b981"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#resolvedGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Row: Top Common Failure Modes (Tags) */}
              <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <span>🏷️</span>
                      <span>{t("reports.top_tags_title")}</span>
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">{t("reports.top_tags_desc")}</p>
                  </div>
                </div>

                {topTagsData.length === 0 ? (
                  <div className="h-24 flex items-center justify-center text-xs text-zinc-400">
                    {t("reports.empty_data")}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {topTagsData.map((item) => {
                      const label =
                        locale === "zh"
                          ? item.name_zh
                          : locale === "en"
                            ? item.name_en
                            : item.name_vi;
                      return (
                        <button
                          key={item.tag_code}
                          type="button"
                          onClick={() => {
                            setSelectedTagDrill(item.tag_code);
                            setDrilldownType("TAG");
                          }}
                          className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 border border-zinc-200 dark:border-zinc-700 transition-all text-left group"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: CATEGORY_COLORS[item.category] || "#71717a",
                            }}
                          />
                          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {label}
                          </span>
                          <span className="text-[11px] font-mono font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                            {t("reports.occurrences", { count: item.count })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </PageContainer>
      </main>

      {/* Tầng 3: Presenter Drill-down Drawer Modal */}
      {drilldownType && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl bg-white dark:bg-zinc-900 h-full shadow-2xl flex flex-col border-l border-zinc-200 dark:border-zinc-800">
            {/* Drawer Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>🎯</span>
                  <span>
                    {drilldownType === "LOCATION" && selectedLocationDrill
                      ? t("reports.drilldown_title", { target: selectedLocationDrill })
                      : drilldownType === "CATEGORY" && selectedCategoryDrill
                        ? t("reports.drilldown_category_title", {
                            category: selectedCategoryDrill,
                          })
                        : drilldownType === "TAG" && selectedTagDrill
                          ? t("reports.drilldown_tag_title", { tag: selectedTagDrill })
                          : drilldownType === "SAFETY"
                            ? t("reports.drilldown_safety_title")
                            : t("reports.drilldown_overdue_title")}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold">
                    {drilldownTotal}
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">{t("reports.drilldown_subtitle")}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDrilldownType(null);
                  setSelectedLocationDrill(null);
                  setSelectedCategoryDrill(null);
                  setSelectedTagDrill(null);
                }}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body: Cards with Before/After preview */}
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
                      onClick={() => setInspectingIssue(issue)}
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
                          onClick={() => setDrilldownPage((p) => p + 1)}
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
      )}

      {/* Full Modal for Issue Inspection (Before/After split slider, approval, kaizen rating) */}
      {inspectingIssue && (
        <IssueDetailModal
          issue={inspectingIssue}
          isOpen={true}
          onClose={() => setInspectingIssue(null)}
          onRefresh={() => {
            loadData();
          }}
          locations={masterLocations}
          tags={masterTags}
        />
      )}
    </div>
  );
}
