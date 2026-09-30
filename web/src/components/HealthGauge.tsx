import { useI18nStore } from "../i18n/index.ts";

interface HealthGaugeProps {
  score: number;
  openCount: number;
  overdueCount: number;
  onClick?: () => void;
}

export function HealthGauge({ score, openCount, overdueCount, onClick }: HealthGaugeProps) {
  const { t } = useI18nStore();
  // Score color logic: >=80 Green, 50-79 Amber, <50 Red (SPEC.md Section 9.8.A)
  const isGood = score >= 80;
  const isWarning = score >= 50 && score < 80;
  const colorClass = isGood
    ? "text-emerald-500 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
    : isWarning
      ? "text-amber-500 border-amber-500 bg-amber-50 dark:bg-amber-950/30"
      : "text-rose-500 border-rose-500 bg-rose-50 dark:bg-rose-950/30 animate-pulse";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between gap-3 min-h-[72px]"
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <div
          className={`w-14 h-14 rounded-full border-4 flex flex-col items-center justify-center font-black shrink-0 ${colorClass}`}
        >
          <span className="text-lg leading-none">{score}</span>
          <span className="text-[9px] font-bold opacity-75">{t("health_gauge.score_unit")}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span>{t("health_gauge.workshop_health")}</span>
            <span className="text-xs text-zinc-400 font-normal">
              {t("health_gauge.workshop_health_sub")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 text-zinc-500 dark:text-zinc-400">
            <span>{t("health_gauge.open_count", { count: openCount })}</span>
            {overdueCount > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-bold">
                {t("health_gauge.overdue_count", { count: overdueCount })}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="text-zinc-400 font-bold text-sm shrink-0">➔</div>
    </button>
  );
}
