import { Loader2 } from "lucide-react";

import type { TeamKpiReport } from "../../types/index.ts";

type T = (path: string, params?: Record<string, string | number>) => string;

interface ReportsTeamsPanelProps {
  teamReport: TeamKpiReport[];
  visibleTeamReport: TeamKpiReport[];
  isLoadingTeams: boolean;
  teamReportError: boolean;
  selectedTeamFilter: string;
  setSelectedTeamFilter: (value: string) => void;
  loadTeamReport: () => void;
  t: T;
}

export function ReportsTeamsPanel({
  teamReport,
  visibleTeamReport,
  isLoadingTeams,
  teamReportError,
  selectedTeamFilter,
  setSelectedTeamFilter,
  loadTeamReport,
  t,
}: ReportsTeamsPanelProps) {
  return (
    <div
      id="reports-panel-teams"
      role="tabpanel"
      aria-labelledby="reports-tab-teams"
      className="space-y-4 animate-fade-in"
    >
      <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">
              {t("reports.team_performance_title")}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">{t("reports.team_performance_desc")}</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">
            <span>{t("reports.select_team_filter")}</span>
            <select
              value={selectedTeamFilter}
              onChange={(event) => setSelectedTeamFilter(event.target.value)}
              className="min-h-[40px] rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs font-bold text-zinc-800 dark:text-zinc-200"
            >
              <option value="">{t("reports.all_teams_option")}</option>
              {teamReport.map((row) => (
                <option key={row.team_id} value={String(row.team_id)}>
                  {row.team_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {teamReportError ? (
          <div role="alert" className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
              {t("reports.teams_load_error")}
            </p>
            <button
              type="button"
              onClick={loadTeamReport}
              disabled={isLoadingTeams}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : isLoadingTeams ? (
          <div
            className="py-8 flex items-center justify-center gap-2"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs text-zinc-500">{t("common.loading")}</span>
          </div>
        ) : visibleTeamReport.length === 0 ? (
          <p className="text-xs text-zinc-400 py-4">{t("reports.teams_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {[
                    ["team_name", "reports.team_name"],
                    ["assigned_count", "reports.assigned_count"],
                    ["open_count", "reports.open_count"],
                    ["overdue_count", "reports.overdue_count"],
                    ["closed_count", "reports.closed_count"],
                    ["confirmed_cause_count", "reports.confirmed_cause_count"],
                  ].map(([key, label], index) => (
                    <th
                      key={key}
                      scope="col"
                      className={`py-2 ${index === 0 ? "pr-3" : index === 5 ? "pl-3" : "px-3"} font-black ${index > 0 ? "text-right" : ""}`}
                    >
                      {t(label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleTeamReport.map((row) => (
                  <tr key={row.team_id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-3 font-bold text-zinc-800 dark:text-zinc-200">
                      {row.team_name}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{row.assigned_count}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{row.open_count}</td>
                    <td
                      className={`py-2 px-3 text-right tabular-nums ${row.overdue_count > 0 ? "font-black text-rose-600 dark:text-rose-400" : ""}`}
                    >
                      {row.overdue_count}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{row.closed_count}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      {row.confirmed_cause_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
