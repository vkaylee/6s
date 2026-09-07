import { useI18nStore } from "../i18n/index.ts";
import { resolveTagLabel, type TagItem } from "../types/index.ts";

interface TagLabelProps {
  code: string;
  tags?: TagItem[];
  className?: string;
}

export function TagLabel({ code, tags = [], className }: TagLabelProps) {
  const { locale } = useI18nStore();
  const tag = tags.find((item) => (item.tag_code || item.code) === code);
  const label = tag ? resolveTagLabel(tag, locale) : code;

  return <span className={className}>{`#${label}`}</span>;
}
