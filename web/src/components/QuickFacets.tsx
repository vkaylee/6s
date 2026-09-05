import { useI18nStore } from "../i18n/index.ts";

export type FacetKey =
  | "ALL"
  | "MY_ISSUES"
  | "MY_LINE"
  | "SAFETY_6S"
  | "OVERDUE_48H"
  | "WAITING_MY_REVIEW";
interface QuickFacetsProps {
  activeFacet: FacetKey;
  onSelectFacet: (facet: FacetKey) => void;
  pendingReviewCount?: number;
}

const FACETS: { key: FacetKey; labelKey: string; isAlert?: boolean }[] = [
  { key: "ALL", labelKey: "facets.all" },
  { key: "MY_ISSUES", labelKey: "facets.my_issues" },
  { key: "MY_LINE", labelKey: "facets.my_line" },
  { key: "SAFETY_6S", labelKey: "facets.safety_6s", isAlert: true },
  { key: "OVERDUE_48H", labelKey: "facets.overdue_48h", isAlert: true },
  { key: "WAITING_MY_REVIEW", labelKey: "facets.waiting_my_review" },
];

export function QuickFacets({
  activeFacet,
  onSelectFacet,
  pendingReviewCount = 0,
}: QuickFacetsProps) {
  const { t } = useI18nStore();
  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2 px-4 flex items-center space-x-2 select-none">
      {FACETS.map((f) => {
        const isActive = activeFacet === f.key;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onSelectFacet(f.key)}
            className={`whitespace-nowrap px-4 py-2.5 rounded-full text-xs font-bold transition-all min-h-[44px] flex items-center space-x-1.5 border shadow-sm ${
              isActive
                ? f.isAlert
                  ? "bg-rose-600 border-rose-600 text-white shadow-rose-200 dark:shadow-none"
                  : "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900"
                : f.isAlert
                  ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                  : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <span>{t(f.labelKey)}</span>
            {f.key === "WAITING_MY_REVIEW" && pendingReviewCount > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {pendingReviewCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
