import { useI18nStore } from "../../i18n/index.ts";
import { IssueCategory, type TagItem, TagReviewAction, TagStatus } from "../../types/index.ts";

type TagItemData = TagItem;

export function TagCard({
  tag,
  compact = false,
  showToggle = false,
  onToggle,
  onEdit,
  onReview,
}: {
  tag: TagItemData;
  compact?: boolean;
  showToggle?: boolean;
  onToggle?: (code: string, active: boolean) => void;
  onEdit?: (tag: TagItemData) => void;
  onReview?: (tag: TagItemData, action: TagReviewAction) => void;
}) {
  const { t } = useI18nStore();
  const active = tag.is_active ?? true;
  const pending = tag.status === TagStatus.PENDING;
  const rejected = tag.status === TagStatus.REJECTED;
  return (
    <div
      className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 ${
        pending
          ? "border-amber-300 border-dashed bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20"
          : active
            ? "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40"
            : "border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-900/40 opacity-60"
      }`}
    >
      <div className="space-y-1 flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-2">
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tag.category === IssueCategory.S6 ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"}`}
          >
            {tag.category}
          </span>
          <span className="font-mono text-xs font-medium text-zinc-600 dark:text-zinc-300">
            {tag.code}
          </span>
          {pending && (
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
              ⏳ {t("issue.tag_status_pending")}
            </span>
          )}
          {rejected && (
            <span className="text-[10px] font-bold text-zinc-500">
              ⊘ {t("issue.tag_status_rejected")}
            </span>
          )}
          {!compact && !pending && (
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              {active ? t("admin.active_status") : t("admin.inactive_status")}
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tag.name_vi}</div>
        {(tag.name_zh || tag.name_en) && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {tag.name_zh} {tag.name_en && `• ${tag.name_en}`}
          </div>
        )}
        {!compact && (
          <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            {t("admin.tag_use_count").replace("{count}", String(tag.use_count))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(tag)}
            className="text-xs font-bold px-3 py-1.5 rounded-xl min-h-[44px] border"
          >
            {t("common.edit")}
          </button>
        )}
        {showToggle && onToggle && !pending && (
          <button
            type="button"
            onClick={() => tag.code && onToggle(tag.code, active)}
            className="text-xs font-bold px-3 py-1.5 rounded-xl min-h-[44px] border"
          >
            {active ? t("admin.tag_btn_disable") : t("admin.tag_btn_enable")}
          </button>
        )}
        {pending && onReview && tag.code && (
          <>
            <button
              type="button"
              onClick={() => onReview(tag, TagReviewAction.APPROVE)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl min-h-[44px] border border-emerald-300 text-emerald-700 dark:text-emerald-300"
            >
              {t("admin.tag_approve_btn")}
            </button>
            <button
              type="button"
              onClick={() => onReview(tag, TagReviewAction.REJECT)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl min-h-[44px] border border-rose-300 text-rose-700 dark:text-rose-300"
            >
              {t("admin.tag_reject_btn")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
