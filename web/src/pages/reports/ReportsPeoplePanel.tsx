import { ChevronRight, Medal } from "lucide-react";
import { Link } from "wouter";

import type { ReporterLeaderboard } from "../../types/index.ts";

type T = (path: string, params?: Record<string, string | number>) => string;

interface ReportsPeoplePanelProps {
  reporters: ReporterLeaderboard[];
  t: T;
}

export function ReportsPeoplePanel({ reporters, t }: ReportsPeoplePanelProps) {
  return (
    <div
      id="reports-panel-people"
      role="tabpanel"
      aria-labelledby="reports-tab-people"
      className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4 animate-fade-in"
    >
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
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${idx === 0 ? "bg-amber-400 text-amber-950 shadow-sm" : idx === 1 ? "bg-zinc-300 text-zinc-800" : idx === 2 ? "bg-amber-700/60 text-amber-100" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}
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
                    {rep.points > 0 ? `+${rep.points}` : rep.points} {t("leaderboard.points_unit")}
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
  );
}
