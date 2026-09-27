import { BarChart3, Star } from "lucide-react";
import type { IssueItem, ScoreLogItem } from "../../types/index.ts";
import type { ModalTab } from "./types.ts";
import { getScoreRuleLabel } from "./types.ts";

export interface IssueDetailScoreView {
  currentIssue: IssueItem;
  activeTab: ModalTab;
  locale: string;
  issueScoreLogs: ScoreLogItem[];
  loadingScores: boolean;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function IssueDetailScore({
  currentIssue,
  activeTab,
  locale,
  issueScoreLogs,
  loadingScores,
  t,
}: IssueDetailScoreView) {
  if (activeTab !== "overview" && activeTab !== "history") return null;

  return (
    <>
      {currentIssue.responsibility_history && currentIssue.responsibility_history.length > 0 && (
        <section
          className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/80"
          aria-labelledby="responsibility-history-title"
        >
          <h3
            id="responsibility-history-title"
            className="text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300"
          >
            {t("issue_detail.responsibility_history_title")}
          </h3>
          <ol className="space-y-2">
            {currentIssue.responsibility_history.map((entry, index) => (
              <li
                key={entry.id ?? `${entry.created_at}-${index}`}
                className="border-l-2 border-zinc-200 pl-3 text-xs dark:border-zinc-700"
              >
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {t(`issue_detail.history_action_${entry.action}`)}
                </p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {entry.changed_by_name || t("issue_detail.changed_by")} ·{" "}
                  {new Date(entry.created_at).toLocaleString(locale)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Score Impact Breakdown Card */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("issue_detail.score_breakdown_title")}
          </span>
          {currentIssue.score_rating && currentIssue.score_rating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-amber-500">
              {[1, 2, 3, 4, 5].slice(0, currentIssue.score_rating).map((star) => (
                <Star key={star} className="h-3 w-3 fill-current" aria-hidden="true" />
              ))}
            </span>
          )}
        </div>

        {loadingScores ? (
          <div className="text-xs text-zinc-400 py-2 text-center">{t("common.loading")}</div>
        ) : (issueScoreLogs || []).length === 0 ? (
          <div className="text-xs text-zinc-400 py-1">
            {t("issue_detail.score_breakdown_empty")}
          </div>
        ) : (
          <div className="space-y-2">
            {(issueScoreLogs || []).map((log) => {
              const isPositive = log.points > 0;
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {getScoreRuleLabel(log.rule_key, log.rule_description, t)}
                      {log.penalty_date && ` (${log.penalty_date})`}
                    </div>
                  </div>
                  <span
                    className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg ${
                      isPositive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300"
                    }`}
                  >
                    {isPositive ? `+${log.points}` : log.points}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
