import {
  AlertTriangle,
  Camera,
  Check,
  Clock,
  History,
  Sparkles,
  Star,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import { useI18nStore } from "../i18n/index.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationItem,
  resolveLocationNameByCode,
  resolveTagLabel,
  type TagItem,
} from "../types/index.ts";
import { resolvePhotoUrl } from "../utils/photo.ts";

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
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
      {t("status.OPEN")}
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

  // SLA Aging Badge
  const slaBadge =
    isOpen &&
    (isOverdue ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-600 text-white animate-pulse shrink-0 shadow-xs">
        <Clock className="w-3 h-3 shrink-0" />
        {t("app.sla_overdue", { hours: elapsedHours - 48 || 1 })}
      </span>
    ) : remainingHours <= 12 ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500 text-white shrink-0 shadow-xs">
        <Clock className="w-3 h-3 shrink-0" />
        {t("app.sla_remaining", { hours: remainingHours })}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
        <History className="w-3 h-3 shrink-0" />
        {elapsedHours < 1
          ? t("app.time_just_now")
          : elapsedHours < 24
            ? t("app.time_hours_ago", { hours: elapsedHours })
            : t("app.time_days_ago", { days: Math.floor(elapsedHours / 24) })}
      </span>
    ));
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-zinc-900 rounded-2xl p-4 border shadow-sm transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500 flex flex-col gap-3.5 min-h-[96px] ${
        isSafety
          ? "border-rose-500/80 dark:border-rose-600/80 ring-2 ring-rose-500/20"
          : isPendingReview
            ? "border-amber-400/80 dark:border-amber-500/80 ring-1 ring-amber-400/30"
            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-10 h-10 rounded-xl font-bold text-sm flex items-center justify-center shrink-0 shadow-xs ${
              isSafety
                ? "bg-rose-600 text-white animate-pulse"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            }`}
          >
            {issue.category}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-base text-zinc-900 dark:text-zinc-100 leading-tight truncate">
              {resolveLocationNameByCode(
                locations,
                issue.location_code,
                issue.location_name,
                locale,
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5 truncate">
              <span>
                {t("issue.code_prefix")}: {issue.location_code}
              </span>
              {issue.creator_name && (
                <span className="flex items-center gap-0.5">
                  • <User className="w-3 h-3 text-zinc-400 shrink-0 inline" />
                  <span>{issue.creator_name}</span>
                </span>
              )}
              {issue.resolver_name && (
                <span className="flex items-center gap-0.5">
                  • <Wrench className="w-3 h-3 text-zinc-400 shrink-0 inline" />
                  <span>{issue.resolver_name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            {slaBadge}
            {statusBadge}
          </div>
          {issue.score_rating && issue.score_rating > 0 && isClosed && (
            <div className="flex items-center gap-0.5 text-amber-500">
              {Array.from(
                { length: issue.score_rating },
                (_, starIdx) => `star-${issue.id}-${starIdx + 1}`,
              ).map((starKey) => (
                <Star
                  key={starKey}
                  className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0"
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Body: Vertical on mobile, 2-column horizontal on medium/large screens (meetings/projectors) */}
      <div className="flex flex-col md:flex-row md:items-start gap-3.5 w-full">
        {/* Photos: Before & After side-by-side */}
        {(issue.photo_before || issue.photo_after) && (
          <div className="flex items-center gap-2.5 shrink-0 overflow-hidden">
            {issue.photo_before && (
              <div className="relative group shrink-0">
                <img
                  src={resolvePhotoUrl(issue.photo_before, "before")}
                  alt={t("slider.before_alt")}
                  loading="lazy"
                  className={`${
                    issue.photo_after ? "w-32 h-24 sm:w-36 sm:h-26" : "w-44 h-28 sm:w-48 sm:h-32"
                  } rounded-xl object-cover bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800`}
                />
                <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white tracking-wide uppercase">
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
              <div className="relative group shrink-0">
                <img
                  src={resolvePhotoUrl(issue.photo_after, "after")}
                  alt={t("slider.after_alt")}
                  loading="lazy"
                  className="w-32 h-24 sm:w-36 sm:h-26 rounded-xl object-cover bg-zinc-100 dark:bg-zinc-800 border-2 border-emerald-500/60 dark:border-emerald-500/80"
                />
                <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-emerald-600 text-[10px] font-bold text-white tracking-wide uppercase">
                  {t("slider.after")}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Description & Tags: Right column on desktop, below photos on mobile */}
        <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch gap-2">
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
            <div className="flex flex-wrap gap-1 pt-1">
              {issue.tags.map((tag) => {
                const matchedTag = tags.find((item) => (item.tag_code || item.code) === tag);
                return (
                  <span
                    key={tag}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  >
                    #{matchedTag ? resolveTagLabel(matchedTag, locale) : tag}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
