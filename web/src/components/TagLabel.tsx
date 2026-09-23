import { useI18nStore } from "../i18n/index.ts";
import { resolveTagLabel, type TagItem, type TagStatus } from "../types/index.ts";

interface TagLabelProps {
  code: string;
  tags?: TagItem[];
  className?: string;
  status?: TagStatus;
}

export function TagLabel({ code, tags = [], className, status }: TagLabelProps) {
  const { locale, t } = useI18nStore();
  const tag = tags.find((item) => (item.code || item.tag_code) === code);
  const resolvedStatus = status || tag?.status;
  const label = tag ? resolveTagLabel(tag, locale) : code;
  const pending = resolvedStatus === "PENDING";
  const rejected = resolvedStatus === "REJECTED";

  return (
    <span
      className={`${className || ""} ${
        pending
          ? "border border-dashed border-amber-300 bg-amber-50/70 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          : rejected
            ? "border border-zinc-300 bg-zinc-100/70 text-zinc-500 opacity-75 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-400"
            : ""
      }`}
      title={
        pending
          ? t("issue.tag_status_pending")
          : rejected
            ? t("issue.tag_status_rejected")
            : undefined
      }
    >
      {pending ? "⏳ " : rejected ? "⊘ " : ""}#{label}
      {pending && (
        <span className="ml-1 text-[9px] font-medium">({t("issue.tag_status_pending")})</span>
      )}
    </span>
  );
}
