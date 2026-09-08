import { Camera, Check, Clock, Sparkles, Star, User, Wrench, XCircle } from "lucide-react";
import { useI18nStore } from "../i18n/index.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationItem,
  resolveLocationNameByCode,
  type TagItem,
} from "../types/index.ts";
import { resolvePhotoUrl } from "../utils/photo.ts";
import { TagLabel } from "./TagLabel.tsx";

interface IssueCardProps {
  issue: IssueItem;
  onClick: () => void;
  locations?: LocationItem[];
  tags?: TagItem[];
}
export function IssueCard({ issue, onClick, locations = [], tags = [] }: IssueCardProps) {
  const { t, locale } = useI18nStore();
  const isSafety = issue.category === IssueCategory.S6;
  const isOpen = issue.status === IssueStatus.OPEN;
  const isPendingReview = issue.status === IssueStatus.PENDING_REVIEW;
  const isClosed = issue.status === IssueStatus.CLOSED;

  // SLA Aging calculation (48 hours threshold)
  const createdTime = new Date(issue.created_at).getTime();
  const elapsedMs = Math.max(0, Date.now() - createdTime);
  const elapsedHours = Math.floor(elapsedMs / (3600 * 1000));
  const isOverdue = elapsedHours >= 48;
  const remainingHours = Math.max(0, 48 - elapsedHours);

  const statusBadge = isOpen ? (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
        isOverdue
          ? "bg-rose-600 text-white animate-pulse shadow-xs"
          : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
      }`}
    >
      {t("status.OPEN")}
      <span className="inline-flex items-center gap-1 pl-1.5 ml-0.5 border-l border-rose-200 dark:border-rose-800 text-[11px] font-medium">
        <Clock className="w-3 h-3 shrink-0" />
        {isOverdue
          ? t("app.sla_overdue", { hours: elapsedHours - 48 || 1 })
          : remainingHours <= 12
            ? t("app.sla_remaining", { hours: remainingHours })
            : elapsedHours < 1
              ? t("app.time_just_now")
              : elapsedHours < 24
                ? t("app.time_hours_ago", { hours: elapsedHours })
                : t("app.time_days_ago", { days: Math.floor(elapsedHours / 24) })}
      </span>
    </span>
  ) : isPendingReview ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
      <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      {t("status.PENDING_REVIEW")}
    </span>
  ) : isClosed ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
      <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      {t("status.CLOSED")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 shrink-0">
      <XCircle className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
      {t("status.INVALID")}
    </span>
  );

  const scoreBadge =
    issue.score_rating && issue.score_rating > 0 && isClosed ? (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
        {issue.score_rating}
      </span>
    ) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left bg-white dark:bg-zinc-900 rounded-2xl p-3.5 sm:p-4 border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500 flex flex-col gap-3 min-h-[96px] ${
        isSafety
          ? "border-rose-500/80 dark:border-rose-600/80 ring-2 ring-rose-500/20"
          : isPendingReview
            ? "border-amber-400/80 dark:border-amber-500/80 ring-1 ring-amber-400/30"
            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl font-bold text-sm flex items-center justify-center shrink-0 shadow-xs ${
              isSafety
                ? "bg-rose-600 text-white animate-pulse"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            }`}
          >
            {issue.category}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 leading-tight truncate">
              {resolveLocationNameByCode(
                locations,
                issue.location_code,
                issue.location_name,
                locale,
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs text-zinc-400 truncate">
              {issue.creator_name && (
                <span className="flex items-center gap-0.5">
                  <User className="w-3 h-3 text-zinc-400 shrink-0 inline" />
                  <span>{issue.creator_name}</span>
                </span>
              )}
              {issue.resolver_name && (
                <span className="flex items-center gap-0.5">
                  {issue.creator_name && <span>•</span>}
                  <Wrench className="w-3 h-3 text-zinc-400 shrink-0 inline" />
                  <span>{issue.resolver_name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
          {statusBadge}
          {scoreBadge}
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        {(issue.photo_before || issue.photo_after) && (
          <div className="flex items-center gap-2 shrink-0 overflow-hidden">
            {issue.photo_before && (
              <div className="relative group/shrink-0">
                <img
                  src={resolvePhotoUrl(issue.photo_before, "before")}
                  alt={t("slider.before_alt")}
                  loading="lazy"
                  className={`${
                    issue.photo_after ? "w-28 h-20 sm:w-32 sm:h-22" : "w-40 h-24 sm:w-44 sm:h-28"
                  } rounded-xl object-cover bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800`}
                />
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white tracking-wide uppercase">
                  {t("slider.before")}
                </span>
                {issue.photo_detail && !issue.photo_after && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white flex items-center gap-1">
                    <Camera className="w-3 h-3 text-white" />
                    <span>+1</span>
                  </span>
                )}
              </div>
            )}

            {issue.photo_after && (
              <div className="relative group/shrink-0">
                <img
                  src={resolvePhotoUrl(issue.photo_after, "after")}
                  alt={t("slider.after_alt")}
                  loading="lazy"
                  className="w-28 h-20 sm:w-32 sm:h-22 rounded-xl object-cover bg-zinc-100 dark:bg-zinc-800 border-2 border-emerald-500/60 dark:border-emerald-500/80"
                />
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-emerald-600 text-[10px] font-bold text-white tracking-wide uppercase">
                  {t("slider.after")}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
          <div>
            {Boolean(issue.translated_description) && (
              <div className="mb-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 shadow-2xs">
                  <Sparkles className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{t("issue.translated_by_ai")}</span>
                </span>
              </div>
            )}
            <p className="text-sm text-zinc-700 dark:text-zinc-200 line-clamp-3 leading-snug">
              {issue.translated_description || issue.description || t("issue.no_description")}
            </p>
          </div>
          {issue.tags && issue.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {issue.tags.map((tag) => (
                <TagLabel
                  key={tag}
                  code={tag}
                  tags={tags}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
