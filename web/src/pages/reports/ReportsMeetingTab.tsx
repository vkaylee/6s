import type { IssueCategory, ReporterLeaderboard, TeamKpiReport } from "../../types/index.ts";
import type { LocationReportItem } from "../../utils/analytics.ts";
import { ReportsLocationsPanel } from "./ReportsLocationsPanel.tsx";
import { ReportsPeoplePanel } from "./ReportsPeoplePanel.tsx";
import { ReportsTeamsPanel } from "./ReportsTeamsPanel.tsx";
import { ReportsTrendsPanel } from "./ReportsTrendsPanel.tsx";
import { CATEGORY_COLORS } from "./reportConstants.ts";
import type { LocationLimit, LocationSort, ReportMeetingTab } from "./useReportsData.ts";

export { CATEGORY_COLORS };

type T = (path: string, params?: Record<string, string | number>) => string;

interface ReportsMeetingTabProps {
  activeTab: ReportMeetingTab;
  setActiveTab: (tab: ReportMeetingTab) => void;
  locationLimit: LocationLimit;
  setLocationLimit: (limit: LocationLimit) => void;
  locationSort: LocationSort;
  setLocationSort: (sort: LocationSort) => void;
  selectedLocationFilter: string;
  reporters: ReporterLeaderboard[];
  filteredLocationData: (LocationReportItem & { location_name: string })[];
  categoryData: { category: IssueCategory; count: number; percentage: number }[];
  trendData: { date: string; created: number; resolved: number }[];
  topTagsData: {
    tag_code: string;
    category: string;
    name_vi: string;
    name_zh: string;
    name_en: string;
    count: number;
  }[];
  teamReport: TeamKpiReport[];
  visibleTeamReport: TeamKpiReport[];
  isLoadingTeams: boolean;
  teamReportError: boolean;
  selectedTeamFilter: string;
  setSelectedTeamFilter: (value: string) => void;
  loadTeamReport: () => void;
  daysRange: 7 | 14 | 30;
  totalIssues: number;
  locale: string;
  gridColor: string;
  textColor: string;
  tooltipBg: string;
  tooltipBorder: string;
  chartHeight: number;
  onLocationDrilldown: (code: string) => void;
  onCategoryDrilldown: (category: IssueCategory) => void;
  onTagDrilldown: (tagCode: string) => void;
  t: T;
}

export function ReportsMeetingTab({
  activeTab,
  setActiveTab,
  locationLimit,
  setLocationLimit,
  locationSort,
  setLocationSort,
  selectedLocationFilter,
  reporters,
  filteredLocationData,
  categoryData,
  trendData,
  topTagsData,
  teamReport,
  visibleTeamReport,
  isLoadingTeams,
  teamReportError,
  selectedTeamFilter,
  setSelectedTeamFilter,
  loadTeamReport,
  daysRange,
  totalIssues,
  locale,
  gridColor,
  textColor,
  tooltipBg,
  tooltipBorder,
  chartHeight,
  onLocationDrilldown,
  onCategoryDrilldown,
  onTagDrilldown,
  t,
}: ReportsMeetingTabProps) {
  return (
    <>
      <div
        role="tablist"
        aria-label={t("reports.title")}
        className="bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-1.5"
      >
        {(
          [
            ["LOCATIONS", "reports-tab-locations", "🏭", "reports.tab_locations"],
            ["PEOPLE", "reports-tab-people", "👥", "reports.tab_people"],
            ["TRENDS", "reports-tab-trends", "📈", "reports.tab_trends"],
            ["TEAMS", "reports-tab-teams", "🛠️", "reports.tab_teams"],
          ] as const
        ).map(([tab, id, icon, label]) => (
          <button
            key={tab}
            id={id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`reports-panel-${tab.toLowerCase()}`}
            data-testid={tab === "TRENDS" || tab === "TEAMS" ? id : undefined}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === tab ? "bg-blue-600 text-white shadow-md shadow-blue-600/30" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            <span>{icon}</span>
            <span>{t(label)}</span>
          </button>
        ))}
      </div>

      {activeTab === "LOCATIONS" && (
        <ReportsLocationsPanel
          locationLimit={locationLimit}
          setLocationLimit={setLocationLimit}
          locationSort={locationSort}
          setLocationSort={setLocationSort}
          selectedLocationFilter={selectedLocationFilter}
          filteredLocationData={filteredLocationData}
          chartHeight={chartHeight}
          gridColor={gridColor}
          textColor={textColor}
          onLocationDrilldown={onLocationDrilldown}
          t={t}
        />
      )}

      {activeTab === "PEOPLE" && <ReportsPeoplePanel reporters={reporters} t={t} />}

      {activeTab === "TRENDS" && (
        <ReportsTrendsPanel
          categoryData={categoryData}
          trendData={trendData}
          topTagsData={topTagsData}
          daysRange={daysRange}
          totalIssues={totalIssues}
          locale={locale}
          gridColor={gridColor}
          textColor={textColor}
          tooltipBg={tooltipBg}
          tooltipBorder={tooltipBorder}
          onCategoryDrilldown={onCategoryDrilldown}
          onTagDrilldown={onTagDrilldown}
          t={t}
        />
      )}

      {activeTab === "TEAMS" && (
        <ReportsTeamsPanel
          teamReport={teamReport}
          visibleTeamReport={visibleTeamReport}
          isLoadingTeams={isLoadingTeams}
          teamReportError={teamReportError}
          selectedTeamFilter={selectedTeamFilter}
          setSelectedTeamFilter={setSelectedTeamFilter}
          loadTeamReport={loadTeamReport}
          t={t}
        />
      )}
    </>
  );
}
