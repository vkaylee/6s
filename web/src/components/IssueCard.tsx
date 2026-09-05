import { useI18nStore } from "../i18n/index.ts";
import { IssueCategory, type IssueItem, IssueStatus } from "../types/index.ts";

interface IssueCardProps {
  issue: IssueItem;
  onClick: () => void;
}

export function IssueCard({ issue, onClick }: IssueCardProps) {
  const { t } = useI18nStore();
  const isSafety = issue.category === IssueCategory.S6;
  const isOpen = issue.status === IssueStatus.OPEN;
  const isPendingReview = issue.status === IssueStatus.PENDING_REVIEW;
  const isClosed = issue.status === IssueStatus.CLOSED;

  const statusBadge = isOpen ? (
    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border border-rose-300 dark:border-rose-800">
      <span>⚠️ {t("status.OPEN")}</span>
    </span>
  ) : isPendingReview ? (
    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
      <span>⏳ {t("status.PENDING_REVIEW")}</span>
    </span>
  ) : isClosed ? (
    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
      <span>✓ {t("status.CLOSED")}</span>
    </span>
  ) : (
    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-black bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700">
      <span>{t("status.INVALIDATED")}</span>
    </span>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-zinc-900 rounded-2xl p-4 border shadow-sm transition-all active:scale-[0.99] flex flex-col space-y-3 min-h-[96px] ${
        isSafety
          ? "border-rose-500/80 dark:border-rose-600/80 ring-2 ring-rose-500/20"
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2.5">
          <span
            className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center shadow-xs ${
              isSafety
                ? "bg-rose-600 text-white animate-pulse"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            }`}
          >
            {issue.category}
          </span>
          <div>
            <div className="font-bold text-base text-zinc-900 dark:text-zinc-100 leading-tight">
              {issue.location_name || issue.location_code}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {t("issue.code_prefix")}: {issue.location_code} • {issue.creator_name}
            </div>
          </div>
        </div>
        {statusBadge}
      </div>

      <div className="flex items-center space-x-3">
        {issue.photo_before && (
          <img
            src={issue.photo_before}
            alt={t("issue.photo_before_alt")}
            className="w-20 h-15 rounded-xl object-cover bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2 leading-snug">
            {issue.description || t("issue.no_description")}
          </p>
          {issue.tags && issue.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {issue.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
