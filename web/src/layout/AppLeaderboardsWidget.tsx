import { Link } from "wouter";
import type { DashboardDataErrors } from "../hooks/useDashboardData.ts";
import type { SupportedLocale } from "../i18n/index.ts";
import { resolveLocationNameByCode } from "../types/index.ts";
import { AppLeaderboardError } from "./AppSyncBanner.tsx";
import type { DashboardData } from "./types.ts";

interface AppLeaderboardsWidgetProps {
  locationHealth: DashboardData["locationHealth"];
  reporters: DashboardData["reporters"];
  locations: DashboardData["locations"];
  locale: SupportedLocale;
  leaderboardTab: "LOCATIONS" | "REPORTERS";
  setLeaderboardTab: (tab: "LOCATIONS" | "REPORTERS") => void;
  showAllLeaderboard: boolean;
  setShowAllLeaderboard: (show: boolean | ((prev: boolean) => boolean)) => void;
  dashboardErrors: DashboardDataErrors;
  retryLeaderboards: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function AppLeaderboardsWidget({
  locationHealth,
  reporters,
  locations,
  locale,
  leaderboardTab,
  setLeaderboardTab,
  showAllLeaderboard,
  setShowAllLeaderboard,
  dashboardErrors,
  retryLeaderboards,
  t,
}: AppLeaderboardsWidgetProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2.5 mb-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setLeaderboardTab("LOCATIONS");
              setShowAllLeaderboard(false);
            }}
            className={`text-xs font-black px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
              leaderboardTab === "LOCATIONS"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t("leaderboard.location_health")}
          </button>
          <button
            type="button"
            onClick={() => {
              setLeaderboardTab("REPORTERS");
              setShowAllLeaderboard(false);
            }}
            className={`text-xs font-black px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
              leaderboardTab === "REPORTERS"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t("leaderboard.top_reporters")}
          </button>
        </div>
        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60 px-2 py-0.5 rounded-md whitespace-nowrap">
          {leaderboardTab === "LOCATIONS"
            ? t("leaderboard.cycle_weekly")
            : t("leaderboard.cycle_monthly")}
        </span>
      </div>

      <AppLeaderboardError
        hasError={dashboardErrors.leaderboards}
        onRetry={retryLeaderboards}
        t={t}
      />

      {leaderboardTab === "LOCATIONS" ? (
        <div className="space-y-2">
          {locationHealth.length === 0 ? (
            <div className="text-xs text-zinc-400 py-2 text-center">
              {t("leaderboard.no_location_data")}
            </div>
          ) : (
            (showAllLeaderboard ? locationHealth : locationHealth.slice(0, 3)).map((loc) => (
              <Link
                key={loc.location_code}
                href={`/leaderboard/locations/${encodeURIComponent(loc.location_code)}`}
                className="w-full flex items-center justify-between gap-3 text-xs p-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-left group"
              >
                <div className="min-w-0 flex-1 space-y-1 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                  <span className="font-bold text-sm sm:text-xs text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 truncate block sm:inline">
                    {resolveLocationNameByCode(
                      locations,
                      loc.location_code,
                      loc.location_name,
                      locale,
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {loc.overdue_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white animate-pulse shrink-0">
                        {loc.overdue_count} {t("health_gauge.overdue_count").split(":")[0]}
                      </span>
                    )}
                    {loc.open_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 shrink-0">
                        {loc.open_count} {t("status.OPEN")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-black text-sm sm:text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {loc.health_score} {t("leaderboard.points_unit")}
                  </span>
                  <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-600 group-hover:translate-x-0.5 transition-transform">
                    →
                  </span>
                </div>
              </Link>
            ))
          )}
          {locationHealth.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllLeaderboard((prev) => !prev)}
              className="w-full text-center py-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAllLeaderboard
                ? t("common.collapse")
                : t("leaderboard.view_all").replace("{count}", String(locationHealth.length))}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {reporters.length === 0 ? (
            <div className="text-xs text-zinc-400 py-2 text-center">
              {t("leaderboard.no_reporter_data")}
            </div>
          ) : (
            (showAllLeaderboard ? reporters : reporters.slice(0, 3)).map((rep, idx) => (
              <Link
                key={rep.user_id}
                href={`/leaderboard/reporters/${encodeURIComponent(String(rep.user_id))}`}
                className="w-full flex items-center justify-between gap-3 text-xs p-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-left group"
              >
                <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                  <div className="font-bold text-sm sm:text-xs text-zinc-800 dark:text-zinc-200 group-hover:text-amber-600 truncate flex items-center gap-1.5">
                    <span className="shrink-0">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                    </span>
                    <span className="truncate">{rep.full_name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-medium whitespace-nowrap block sm:inline">
                    (🔍 {t("leaderboard.view_history")})
                  </span>
                </div>
                <div className="text-right shrink-0 sm:flex sm:items-center sm:gap-1.5">
                  <span className="font-black text-sm sm:text-xs text-amber-600 dark:text-amber-400 block sm:inline">
                    {rep.points} {t("leaderboard.points_unit")}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-medium block sm:inline">
                    ({rep.valid_count} {t("leaderboard.issues_unit")})
                  </span>
                </div>
              </Link>
            ))
          )}
          {reporters.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllLeaderboard((prev) => !prev)}
              className="w-full text-center py-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
            >
              {showAllLeaderboard
                ? t("common.collapse")
                : t("leaderboard.view_all").replace("{count}", String(reporters.length))}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
