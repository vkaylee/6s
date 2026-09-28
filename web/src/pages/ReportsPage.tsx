import { ArrowLeft, Download, Loader2, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { hasCapability, useAuthStore } from "../store/authStore.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { useThemeStore } from "../store/themeStore.ts";
import type { IssueCategory } from "../types/index.ts";
import { goBack } from "../utils/navigation.ts";
import { IssueDetailModal } from "./IssueDetailModal.tsx";
import { ReportsDrilldownModal } from "./reports/ReportsDrilldownModal.tsx";
import { downloadReportsXlsx } from "./reports/ReportsExportAction.ts";
import { ReportsKpiSummary } from "./reports/ReportsKpiSummary.tsx";
import { ReportsMeetingTab } from "./reports/ReportsMeetingTab.tsx";
import { useReportsData } from "./reports/useReportsData.ts";

export type { ReportMeetingTab } from "./reports/useReportsData.ts";
export { downloadReportsXlsx };

export function ReportsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canExport = hasCapability(currentUser, "reports:export");
  const { t, locale } = useI18nStore();
  const { isDark } = useThemeStore();
  const reports = useReportsData();

  const handleExportXLSX = async () => {
    try {
      reports.setIsExporting(true);
      await downloadReportsXlsx(reports.selectedLocationFilter || undefined);
    } catch (err) {
      console.error("Failed to export XLSX", err);
      await modalDialog.alert(t("reports.export_error"), t("common.error"));
    } finally {
      reports.setIsExporting(false);
    }
  };

  const openLocationDrilldown = (code: string) => {
    reports.setSelectedLocationDrill(code);
    reports.setDrilldownType("LOCATION");
  };
  const openCategoryDrilldown = (category: IssueCategory) => {
    reports.setSelectedCategoryDrill(category);
    reports.setDrilldownType("CATEGORY");
  };
  const openTagDrilldown = (tagCode: string) => {
    reports.setSelectedTagDrill(tagCode);
    reports.setDrilldownType("TAG");
  };
  const gridColor = isDark ? "#27272a" : "#f4f4f5";
  const textColor = isDark ? "#a1a1aa" : "#71717a";
  const tooltipBg = isDark ? "#18181b" : "#ffffff";
  const tooltipBorder = isDark ? "#3f3f46" : "#e4e4e7";
  const chartHeight = Math.max(280, reports.filteredLocationData.length * 44 + 40);

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-20">
      <div className="pt-4">
        <PageContainer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
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
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={reports.toggleFullscreen}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center"
                title={
                  reports.isFullscreen
                    ? t("reports.fullscreen_exit")
                    : t("reports.fullscreen_enter")
                }
              >
                {reports.isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={reports.loadData}
                disabled={reports.isLoading}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                title={t("reports.refresh")}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reports.isLoading ? "animate-spin" : ""}`} />
              </button>
              {canExport && (
                <button
                  type="button"
                  data-testid="btn-export-xlsx"
                  onClick={handleExportXLSX}
                  disabled={reports.isExporting}
                  className="h-8 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title={t("reports.export_xlsx")}
                >
                  {reports.isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden md:inline">
                    {reports.isExporting ? t("reports.exporting") : t("reports.export_xlsx")}
                  </span>
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end">
            <div className="w-full sm:w-auto flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => reports.setDaysRange(7)}
                className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${reports.daysRange === 7 ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => reports.setDaysRange(14)}
                className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${reports.daysRange === 14 ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                14d
              </button>
              <button
                type="button"
                onClick={() => reports.setDaysRange(30)}
                className={`flex-1 sm:flex-initial px-3 py-1 rounded-lg transition-all text-center ${reports.daysRange === 30 ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                30d
              </button>
            </div>
          </div>
        </PageContainer>
      </div>

      {reports.loadError && (
        <PageContainer className="mt-4">
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-2xl p-4"
          >
            <div>
              <p className="text-sm font-bold">{t("app.load_error_title")}</p>
              <p className="text-xs mt-1">{t("app.load_error_desc")}</p>
            </div>
            <button
              type="button"
              onClick={reports.loadData}
              disabled={reports.isLoading}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
            >
              {t("common.retry")}
            </button>
          </div>
        </PageContainer>
      )}

      <main className="pt-4">
        <PageContainer className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <label htmlFor="reports-location-filter" className="text-xs font-bold text-zinc-500">
              {t("reports.select_location_filter")}
            </label>
            <select
              id="reports-location-filter"
              value={reports.selectedLocationFilter}
              onChange={(event) => reports.setSelectedLocationFilter(event.target.value)}
              className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-72"
            >
              <option value="">{t("reports.all_locations_option")}</option>
              {reports.masterLocations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.name_vi || location.code}
                </option>
              ))}
            </select>
          </div>
          <ReportsKpiSummary kpi={reports.kpi} t={t} onDrilldown={reports.setDrilldownType} />
          <ReportsMeetingTab
            activeTab={reports.activeTab}
            setActiveTab={reports.setActiveTab}
            locationLimit={reports.locationLimit}
            setLocationLimit={reports.setLocationLimit}
            locationSort={reports.locationSort}
            setLocationSort={reports.setLocationSort}
            selectedLocationFilter={reports.selectedLocationFilter}
            reporters={reports.reporters}
            filteredLocationData={reports.filteredLocationData}
            categoryData={reports.categoryData}
            trendData={reports.trendData}
            topTagsData={reports.topTagsData}
            teamReport={reports.teamReport}
            visibleTeamReport={reports.visibleTeamReport}
            isLoadingTeams={reports.isLoadingTeams}
            teamReportError={reports.teamReportError}
            selectedTeamFilter={reports.selectedTeamFilter}
            setSelectedTeamFilter={reports.setSelectedTeamFilter}
            loadTeamReport={reports.loadTeamReport}
            daysRange={reports.daysRange}
            totalIssues={reports.kpi.totalIssues}
            locale={locale}
            gridColor={gridColor}
            textColor={textColor}
            tooltipBg={tooltipBg}
            tooltipBorder={tooltipBorder}
            chartHeight={chartHeight}
            onLocationDrilldown={openLocationDrilldown}
            onCategoryDrilldown={openCategoryDrilldown}
            onTagDrilldown={openTagDrilldown}
            t={t}
          />
        </PageContainer>
      </main>

      <ReportsDrilldownModal
        drilldownType={reports.drilldownType}
        selectedLocationDrill={reports.selectedLocationDrill}
        selectedCategoryDrill={reports.selectedCategoryDrill}
        selectedTagDrill={reports.selectedTagDrill}
        drilldownIssues={reports.drilldownIssues}
        drilldownTotal={reports.drilldownTotal}
        isLoadingDrilldown={reports.isLoadingDrilldown}
        masterLocations={reports.masterLocations}
        masterTags={reports.masterTags}
        onClose={reports.closeDrilldown}
        onLoadMore={() => reports.setDrilldownPage((page) => page + 1)}
        onInspectIssue={reports.setInspectingIssue}
        t={t}
      />

      {reports.inspectingIssue && (
        <IssueDetailModal
          issue={reports.inspectingIssue}
          isOpen={true}
          onClose={() => reports.setInspectingIssue(null)}
          onRefresh={reports.loadData}
          locations={reports.masterLocations}
          tags={reports.masterTags}
        />
      )}
    </div>
  );
}
