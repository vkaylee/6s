interface HealthGaugeProps {
  score: number;
  openCount: number;
  overdueCount: number;
  onClick?: () => void;
}

export function HealthGauge({ score, openCount, overdueCount, onClick }: HealthGaugeProps) {
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
      className="w-full text-left bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between min-h-[72px]"
    >
      <div className="flex items-center space-x-4">
        <div
          className={`w-14 h-14 rounded-full border-4 flex flex-col items-center justify-center font-black ${colorClass}`}
        >
          <span className="text-lg leading-none">{score}</span>
          <span className="text-[9px] font-bold opacity-75">ĐIỂM</span>
        </div>
        <div>
          <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5">
            <span>Sức khỏe 6S Xưởng</span>
            <span className="text-xs text-zinc-400 font-normal">/ 车间健康分</span>
          </div>
          <div className="flex items-center space-x-3 text-xs mt-1 text-zinc-500 dark:text-zinc-400">
            <span>
              Đang mở: <strong className="text-zinc-900 dark:text-zinc-100">{openCount}</strong>
            </span>
            {overdueCount > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-bold">
                Quá hạn 48h: {overdueCount}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="text-zinc-400 font-bold text-sm">➔</div>
    </button>
  );
}
