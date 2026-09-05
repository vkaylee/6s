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

const FACETS: { key: FacetKey; label_vi: string; label_zh: string; isAlert?: boolean }[] = [
  { key: "ALL", label_vi: "Tất cả", label_zh: "全部" },
  { key: "MY_ISSUES", label_vi: "Của tôi", label_zh: "我的上报" },
  { key: "MY_LINE", label_vi: "Chuyền của tôi", label_zh: "我的产线" },
  { key: "SAFETY_6S", label_vi: "Khẩn cấp 6S", label_zh: "6S安全紧急", isAlert: true },
  { key: "OVERDUE_48H", label_vi: "Tồn đọng >48h", label_zh: "超期滞留", isAlert: true },
  { key: "WAITING_MY_REVIEW", label_vi: "Chờ tôi duyệt", label_zh: "待我审核" },
];

export function QuickFacets({
  activeFacet,
  onSelectFacet,
  pendingReviewCount = 0,
}: QuickFacetsProps) {
  const { locale } = useI18nStore();
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
            <span>{locale === "zh" ? f.label_zh : locale === "en" ? f.key : f.label_vi}</span>
            {locale !== "zh" && <span className="opacity-60 text-[10px]">/ {f.label_zh}</span>}
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
