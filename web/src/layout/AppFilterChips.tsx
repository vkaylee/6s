import { X } from "lucide-react";
import type { FilterState } from "../components/FilterDrawer.tsx";
import type { FacetKey } from "../components/QuickFacets.tsx";

interface AppFilterChipsProps {
  advancedFilters: FilterState;
  applyAdvancedFilters: (filters: FilterState) => void;
  resetAdvancedFilters: () => void;
  setActiveFacet: (facet: FacetKey) => void;
  selectedTeamLabel: string;
  hasActiveFilters: boolean;
  t: (path: string, params?: Record<string, string | number>) => string;
}

export function AppFilterChips({
  advancedFilters,
  applyAdvancedFilters,
  resetAdvancedFilters,
  setActiveFacet,
  selectedTeamLabel,
  hasActiveFilters,
  t,
}: AppFilterChipsProps) {
  if (!hasActiveFilters) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-1 text-xs">
      <span className="text-zinc-400 text-[11px] font-medium">{t("filters.filter_active")}:</span>
      {advancedFilters.locationCodes.map((code) => (
        <span
          key={code}
          className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded-md font-semibold text-[11px]"
        >
          {code}
          <button
            type="button"
            onClick={() =>
              applyAdvancedFilters({
                ...advancedFilters,
                locationCodes: advancedFilters.locationCodes.filter((c) => c !== code),
              })
            }
            className="hover:text-rose-500"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {advancedFilters.categories.map((cat) => (
        <span
          key={cat}
          className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded-md font-semibold text-[11px]"
        >
          {cat}
          <button
            type="button"
            onClick={() =>
              applyAdvancedFilters({
                ...advancedFilters,
                categories: advancedFilters.categories.filter((c) => c !== cat),
              })
            }
            className="hover:text-rose-500"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {advancedFilters.statuses.map((st) => (
        <span
          key={st}
          className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded-md font-semibold text-[11px]"
        >
          {t(`status.${st}`)}
          <button
            type="button"
            onClick={() =>
              applyAdvancedFilters({
                ...advancedFilters,
                statuses: advancedFilters.statuses.filter((s) => s !== st),
              })
            }
            className="hover:text-rose-500"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {advancedFilters.assignedTeamId != null && (
        <span className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded-md font-semibold text-[11px]">
          {selectedTeamLabel}
          <button
            type="button"
            onClick={() => applyAdvancedFilters({ ...advancedFilters, assignedTeamId: null })}
            className="hover:text-rose-500"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
      {advancedFilters.mineTeam && (
        <span className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded-md font-semibold text-[11px]">
          {t("facets.my_team")}
          <button
            type="button"
            onClick={() => {
              setActiveFacet("ALL");
              applyAdvancedFilters({ ...advancedFilters, mineTeam: false });
            }}
            className="hover:text-rose-500"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
      <button
        type="button"
        onClick={resetAdvancedFilters}
        className="text-[11px] text-rose-600 dark:text-rose-400 font-bold hover:underline ml-1"
      >
        {t("filters.clear_all")}
      </button>
    </div>
  );
}
