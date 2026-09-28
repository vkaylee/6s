import type { ReportDrilldownType, ReportKpiData } from "./useReportsData.ts";

interface ReportsKpiSummaryProps {
  kpi: ReportKpiData;
  t: (path: string, params?: Record<string, string | number>) => string;
  onDrilldown: (type: ReportDrilldownType) => void;
}

export function ReportsKpiSummary({ kpi, t, onDrilldown }: ReportsKpiSummaryProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      <button
        type="button"
        onClick={() => onDrilldown("SAFETY")}
        className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10 shadow-sm cursor-pointer hover:border-rose-400 transition-colors text-left w-full"
      >
        <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wider block flex items-center justify-between">
          <span className="flex items-center gap-1">
            <span>⚠️</span>
            <span>{t("reports.safety_alerts")}</span>
          </span>
          <span className="text-[10px] lowercase text-rose-400">{t("reports.drilldown")}</span>
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
      <button
        type="button"
        onClick={() => onDrilldown("OVERDUE")}
        className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 shadow-sm cursor-pointer hover:border-amber-400 transition-colors text-left w-full"
      >
        <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider block flex items-center justify-between">
          <span className="flex items-center gap-1">
            <span>⏱️</span>
            <span>{t("reports.overdue_alerts")}</span>
          </span>
          <span className="text-[10px] lowercase text-amber-400">{t("reports.drilldown")}</span>
        </span>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
            {kpi.overdueIssues}
          </span>
          <span className="text-[11px] text-zinc-400 font-medium">{t("reports.sla_breach")}</span>
        </div>
      </button>
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
          <span className="text-[11px] font-bold text-zinc-400">{t("reports.max_score")}</span>
        </div>
      </div>
    </div>
  );
}
