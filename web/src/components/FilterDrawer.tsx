import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useI18nStore } from "../i18n/index.ts";
import { IssueCategory, IssueStatus, type LocationItem } from "../types/index.ts";

export interface FilterState {
  statuses: string[];
  categories: string[];
  locationCodes: string[];
}

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  locations: LocationItem[];
  filters: FilterState;
  onApply: (filters: FilterState) => void;
  onReset: () => void;
}

export function FilterDrawer({
  isOpen,
  onClose,
  locations,
  filters,
  onApply,
  onReset,
}: FilterDrawerProps) {
  const { t, locale } = useI18nStore();

  if (!isOpen) return null;

  const categories = [
    IssueCategory.S1,
    IssueCategory.S2,
    IssueCategory.S3,
    IssueCategory.S4,
    IssueCategory.S5,
    IssueCategory.S6,
  ];

  const statuses = [
    IssueStatus.OPEN,
    IssueStatus.PENDING_REVIEW,
    IssueStatus.CLOSED,
    IssueStatus.INVALID,
  ];

  const toggleCategory = (cat: string) => {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    onApply({ ...filters, categories: next });
  };

  const toggleStatus = (st: string) => {
    const next = filters.statuses.includes(st)
      ? filters.statuses.filter((s) => s !== st)
      : [...filters.statuses, st];
    onApply({ ...filters, statuses: next });
  };

  const toggleLocation = (locCode: string) => {
    const next = filters.locationCodes.includes(locCode)
      ? filters.locationCodes.filter((l) => l !== locCode)
      : [...filters.locationCodes, locCode];
    onApply({ ...filters, locationCodes: next });
  };

  const activeCount =
    filters.statuses.length + filters.categories.length + filters.locationCodes.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 h-full flex flex-col shadow-2xl border-l border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-rose-600" />
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">
              {t("filters.title")}
            </h2>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded-full">
                {activeCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Category Selector (Multi-select) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider block">
                {t("common.category")}
              </span>
              {filters.categories.length > 0 && (
                <button
                  type="button"
                  onClick={() => onApply({ ...filters, categories: [] })}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  {t("filters.clear_all")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => {
                const isSelected = filters.categories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition text-center min-h-[44px] flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span>{cat}</span>
                    <span className="text-[11px] opacity-80">
                      - {t(`s_categories.${cat}.name`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status Selector (Multi-select) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider block">
                {t("common.status")}
              </span>
              {filters.statuses.length > 0 && (
                <button
                  type="button"
                  onClick={() => onApply({ ...filters, statuses: [] })}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  {t("filters.clear_all")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {statuses.map((st) => {
                const isSelected = filters.statuses.includes(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleStatus(st)}
                    className={`py-2.5 px-3 rounded-xl border transition text-left min-h-[52px] flex flex-col justify-center ${
                      isSelected
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="font-bold text-xs">{t(`status.${st}`)}</span>
                    <span
                      className={`text-[11px] leading-snug mt-0.5 ${
                        isSelected ? "text-rose-100" : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {t(`status_hints.${st}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location Selector (Multi-select Chips) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider block">
                {t("common.location")}
              </span>
              {filters.locationCodes.length > 0 && (
                <button
                  type="button"
                  onClick={() => onApply({ ...filters, locationCodes: [] })}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  {t("filters.clear_all")}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800/40">
              {locations.map((loc) => {
                const isSelected = filters.locationCodes.includes(loc.code);
                const locName =
                  locale === "zh"
                    ? loc.name_zh || loc.name_vi
                    : locale === "en"
                      ? loc.name_en || loc.name_vi
                      : loc.name_vi;
                return (
                  <button
                    key={loc.code}
                    type="button"
                    onClick={() => toggleLocation(loc.code)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition text-left min-h-[36px] ${
                      isSelected
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                    }`}
                  >
                    [{loc.code}] {locName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            disabled={activeCount === 0}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t("filters.reset")}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 min-h-[48px] flex items-center justify-center shadow-md shadow-rose-600/20 transition"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
