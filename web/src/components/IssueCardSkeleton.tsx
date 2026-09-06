export function IssueCardSkeleton() {
  return (
    <div
      data-testid="issue-card-skeleton"
      className="w-full bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col gap-3.5 min-h-[96px] animate-pulse"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* S Category icon placeholder */}
          <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Location placeholder */}
            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3" />
            {/* Meta info placeholder */}
            <div className="h-3 bg-zinc-100 dark:bg-zinc-800/60 rounded w-1/2" />
          </div>
        </div>
        {/* Status badge placeholder */}
        <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded-full w-20 shrink-0" />
      </div>

      {/* Body preview placeholder */}
      <div className="flex flex-col md:flex-row md:items-start gap-3.5 w-full">
        {/* Photo placeholder */}
        <div className="w-32 h-24 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
        {/* Description placeholder */}
        <div className="flex-1 space-y-2 py-1">
          <div className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded w-full" />
          <div className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded w-4/5" />
          <div className="flex gap-1.5 pt-1">
            <div className="h-5 bg-zinc-100 dark:bg-zinc-800/80 rounded-md w-16" />
            <div className="h-5 bg-zinc-100 dark:bg-zinc-800/80 rounded-md w-12" />
          </div>
        </div>
      </div>
    </div>
  );
}
