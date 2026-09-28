import { Fragment, type ReactNode } from "react";
import type { SupportedLocale } from "../../i18n/index.ts";
import { type ProposedTagItem, resolveTagLabel, type TagItem } from "../../types/index.ts";

export function resolveAIResponseLocale(
  text: string,
  fallbackLocale: SupportedLocale,
): SupportedLocale {
  if (/[\u3400-\u9fff]/u.test(text)) return "zh";
  if (/[ăâđêôơưĂÂĐÊÔƠƯà-ỹÀ-Ỹ]/u.test(text)) return "vi";
  if (/[A-Za-z]/u.test(text)) return "en";
  return fallbackLocale;
}

function TagPill({ code, tag, locale }: { code: string; tag: TagItem; locale: SupportedLocale }) {
  return (
    <span
      className="mx-0.5 inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-200"
      title={code}
    >
      {resolveTagLabel(tag, locale)}
    </span>
  );
}

function renderInlineMarkdown(
  text: string,
  tags: TagItem[],
  proposedTags: ProposedTagItem[],
  locale: SupportedLocale,
): ReactNode[] {
  const parts: ReactNode[] = [];
  const tagsByAlias: Record<string, TagItem> = {};
  for (const tag of tags) {
    for (const alias of [tag.code, tag.tag_code, tag.name_vi, tag.name_zh, tag.name_en]) {
      if (alias?.trim()) tagsByAlias[alias.trim()] = tag;
    }
  }
  for (const proposal of proposedTags) {
    const tag: TagItem = {
      code: proposal.name_vi,
      name_vi: proposal.name_vi,
      name_zh: proposal.name_zh,
      name_en: proposal.name_en,
    };
    for (const alias of [proposal.name_vi, proposal.name_zh, proposal.name_en]) {
      if (alias?.trim()) tagsByAlias[alias.trim()] = tag;
    }
  }
  const aliases = Object.keys(tagsByAlias).sort((a, b) => b.length - a.length);
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openingWrappers = "'\"‘“([{<«‹「『（【《〈";
  const closingWrappers = "'\"’”)]}>»›」』）】》〉";
  const wrapperPattern = (wrappers: string) => `(?:${[...wrappers].map(escapeRegex).join("|")})`;
  const aliasPattern = aliases.map(escapeRegex).join("|");
  const wrappedTagPattern = `${wrapperPattern(openingWrappers)}[ \\t]*#?(?:${aliasPattern})[ \\t]*${wrapperPattern(closingWrappers)}`;
  const tagPattern = aliases.length
    ? `(?<![\\p{L}\\p{N}_-])(?:${wrappedTagPattern}|#?(?:${aliasPattern}))(?![\\p{L}\\p{N}_-])`
    : "(?!x)x";
  const pattern = new RegExp(
    `(\`[^\`]+\`|\\*\\*[^*]+\\*\\*|__[^_]+__|\\*[^*]+\\*|_[^_]+_|\\[[^\\]]+\\]\\(https?:\\/\\/[^)]+\\)|${tagPattern})`,
    "gu",
  );
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    const unwrapped = value.replace(
      new RegExp(
        `^(?:\\s|${wrapperPattern(openingWrappers)})+|(?:\\s|${wrapperPattern(closingWrappers)})+$`,
        "gu",
      ),
      "",
    );
    const directAlias = unwrapped.startsWith("#") ? unwrapped.slice(1) : unwrapped;
    const directTag = tagsByAlias[directAlias];
    const inlineAlias = value.startsWith("`") && value.endsWith("`") ? value.slice(1, -1) : "";
    const inlineTag = inlineAlias ? tagsByAlias[inlineAlias] : undefined;
    if (directTag)
      parts.push(
        <TagPill key={`${index}-tag`} code={directAlias} tag={directTag} locale={locale} />,
      );
    else if (inlineTag)
      parts.push(
        <TagPill key={`${index}-tag`} code={inlineAlias} tag={inlineTag} locale={locale} />,
      );
    else if (value.startsWith("`") && value.endsWith("`"))
      parts.push(
        <code
          key={`${index}-code`}
          className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-700/70"
        >
          {inlineAlias}
        </code>,
      );
    else if (
      (value.startsWith("**") && value.endsWith("**")) ||
      (value.startsWith("__") && value.endsWith("__"))
    )
      parts.push(<strong key={`${index}-strong`}>{value.slice(2, -2)}</strong>);
    else if (
      (value.startsWith("*") && value.endsWith("*")) ||
      (value.startsWith("_") && value.endsWith("_"))
    )
      parts.push(<em key={`${index}-em`}>{value.slice(1, -1)}</em>);
    else {
      const link = value.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      parts.push(
        link ? (
          <a
            key={`${index}-link`}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {link[1]}
          </a>
        ) : (
          value
        ),
      );
    }
    lastIndex = index + value.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function MarkdownText({
  text,
  tags,
  proposedTags = [],
  locale,
}: {
  text: string;
  tags: TagItem[];
  proposedTags?: ProposedTagItem[];
  locale: SupportedLocale;
}) {
  const lines = text.split("\n");
  const responseLocale = resolveAIResponseLocale(text, locale);
  return (
    <span className="block space-y-1">
      {lines.map((line) => {
        const heading = line.match(/^\s{0,3}#{1,3}\s+(.+)$/);
        const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        const content = heading?.[1] ?? bullet?.[1] ?? ordered?.[1] ?? line;
        const rendered = renderInlineMarkdown(content, tags, proposedTags, responseLocale);
        return (
          <Fragment key={line}>
            {heading ? (
              <strong className="block">{rendered}</strong>
            ) : bullet ? (
              <span className="block pl-3 before:mr-1 before:content-['•']">{rendered}</span>
            ) : ordered ? (
              <span className="block pl-3">{rendered}</span>
            ) : (
              rendered
            )}
            {line !== lines[lines.length - 1] && !heading && !bullet && !ordered && <br />}
          </Fragment>
        );
      })}
    </span>
  );
}

export function AnimatedLoadingText({ text }: { text: string }) {
  const label = text.replace(/\.{3,}$/, "");
  return (
    <span className="inline-flex items-baseline">
      {label}
      <span className="ml-0.5 inline-flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="inline-block animate-bounce text-violet-500"
            style={{ animationDelay: `${dot * 150}ms` }}
          >
            .
          </span>
        ))}
      </span>
    </span>
  );
}
