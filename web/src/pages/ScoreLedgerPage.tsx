import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { NavActions } from "../components/NavActions.tsx";
import { apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import type { ScoreLogItem } from "../types/index.ts";
import { goBack } from "../utils/navigation.ts";

interface ScoreLedgerPageProps {
  targetType: "LOCATION" | "USER";
  id: string;
  onSelectIssue?: (issueId: number) => void;
}

export function ScoreLedgerPage({ targetType, id, onSelectIssue }: ScoreLedgerPageProps) {
  const { t } = useI18nStore();
  const [, setLocation] = useLocation();
  const [logs, setLogs] = useState<ScoreLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    apiClient<ScoreLogItem[]>(
      `/api/leaderboard/score-logs?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(id)}`,
    )
      .then((data) => {
        if (isMounted) {
          setLogs(data || []);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load score history");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [targetType, id]);

  const totalPoints = logs.reduce((sum, item) => sum + item.points, 0);
  const isLocation = targetType === "LOCATION";
  const displayedScore = isLocation ? Math.min(120, Math.max(0, 100 + totalPoints)) : totalPoints;

  const handleIssueClick = (issueId: number) => {
    if (onSelectIssue) {
      onSelectIssue(issueId);
    } else {
      setLocation(`/?issue_id=${issueId}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      {/* Page Heading */}
      <PageContainer className="pt-4">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => goBack("/")}
            className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-lg font-bold"
            aria-label={t("leaderboard.back_to_home")}
          >
            ←
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl">{isLocation ? "🏭" : "🎖️"}</span>
              <h1 className="text-lg font-black text-zinc-900 dark:text-zinc-100">{id}</h1>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                {isLocation ? t("leaderboard.cycle_weekly") : t("leaderboard.cycle_monthly")}
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-medium">
              {t("leaderboard.score_history_title")}
            </p>
          </div>
        </div>
          <NavActions />
      </PageContainer>

      {/* Main Content */}
      <main className="py-4 sm:py-6">
        <PageContainer className="space-y-4">
          {/* Summary Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                {isLocation ? t("leaderboard.location_health") : t("leaderboard.top_reporters")}
              </span>
              <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                {displayedScore}{" "}
                <span className="text-sm font-bold text-zinc-400">
                  {t("leaderboard.points_unit")}
                </span>
              </div>
              {isLocation && (
                <p className="text-xs text-zinc-400 font-medium">
                  {t("leaderboard.base_weekly_score").replace("{points}", "100")}
                </p>
              )}
            </div>

            <div className="text-right">
              <span className="text-xs font-bold text-zinc-400 block">
                {logs.length} {t("leaderboard.issues_unit")}
              </span>
            </div>
          </div>

          {/* List of Score Transactions */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 font-medium">
                {t("common.loading")}
              </div>
            ) : error ? (
              <div className="text-center py-8 text-xs text-rose-500 font-bold bg-rose-50 dark:bg-rose-950/20 p-4 rounded-3xl border border-rose-200 dark:border-rose-900">
                {error}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 font-medium">
                {t("leaderboard.score_history_empty")}
              </div>
            ) : (
              logs.map((log) => {
                const isPositive = log.points > 0;
                const pointsFormatted = isPositive ? `+${log.points}` : String(log.points);
                const createdDate = new Date(log.created_at).toLocaleString();

                return (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => handleIssueClick(log.issue_id)}
                    className="w-full text-left bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm transition active:scale-[0.99] flex items-start justify-between gap-3 group min-h-[72px]"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        {log.issue_category && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {log.issue_category}
                          </span>
                        )}
                        <span className="font-mono text-xs font-black text-blue-600 dark:text-blue-400 group-hover:underline">
                          #{log.issue_id}
                        </span>
                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                          {log.rule_description || log.rule_key}
                        </span>
                        {log.issue_status && (
                          <span className="text-[10px] font-medium text-zinc-400">
                            • {log.issue_status}
                          </span>
                        )}
                      </div>

                      {log.issue_description && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                          {log.issue_description}
                        </p>
                      )}

                      <div className="flex items-center space-x-2 text-[10px] text-zinc-400 font-medium">
                        <span>{createdDate}</span>
                        {log.penalty_date && <span>• {log.penalty_date}</span>}
                        <span className="text-blue-500 group-hover:underline">
                          → {t("leaderboard.view_issue")}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`font-black text-sm font-mono shrink-0 px-3 py-1.5 rounded-xl ${
                        isPositive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                      }`}
                    >
                      {pointsFormatted}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PageContainer>
      </main>
    </div>
  );
}
