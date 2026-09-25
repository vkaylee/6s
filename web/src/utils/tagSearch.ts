export interface SearchRecord {
  code?: string;
  tag_code?: string;
  name_vi?: string;
  label_vi?: string;
  name_en?: string;
  label_en?: string;
  name_zh?: string;
  label_zh?: string;
  use_count?: number;
}

export interface TagSearchRecord extends SearchRecord {}

export function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function tokenMatches(token: string, text: string, words: string[]): boolean {
  if (text.includes(token)) return true;
  if (token.length < 4) return false;
  return words.some((word) => {
    const distance = levenshteinDistance(token, word);
    return distance <= (token.length >= 7 ? 2 : 1);
  });
}

function recordFields(record: SearchRecord): string[] {
  return [
    record.code ?? record.tag_code ?? "",
    record.name_vi ?? record.label_vi ?? "",
    record.name_en ?? record.label_en ?? "",
    record.name_zh ?? record.label_zh ?? "",
  ].map(normalizeSearchText);
}

export function scoreRecord(record: SearchRecord, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const fields = recordFields(record);
  const [code, ...names] = fields;
  const queryTokens = normalizedQuery.split(" ");
  const queryHasMultipleTokens = queryTokens.length > 1;
  let score = 0;

  if (code === normalizedQuery) score += 1000;
  else if (code.includes(normalizedQuery)) score += 700;

  for (const name of names) {
    if (!name) continue;
    if (name === normalizedQuery) score = Math.max(score, 900);
    else if (name.startsWith(normalizedQuery)) score = Math.max(score, 600);
    else if (name.includes(normalizedQuery)) score = Math.max(score, 400);

    const words = name.split(" ");
    const matchedTokens = queryTokens.filter((token) => tokenMatches(token, name, words)).length;
    if (matchedTokens === queryTokens.length)
      score = Math.max(score, queryHasMultipleTokens ? 500 : 300);
    else score += matchedTokens * 80;
  }

  return score;
}

export function searchRecords<T extends SearchRecord>(records: T[], query: string): T[] {
  if (!normalizeSearchText(query)) return [...records];
  return records
    .map((record, index) => ({ record, index, score: scoreRecord(record, query) }))
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.record.use_count ?? 0) - (left.record.use_count ?? 0) ||
        left.index - right.index,
    )
    .map(({ record }) => record);
}

export function scoreTag(record: TagSearchRecord, query: string): number {
  return scoreRecord(record, query);
}

export function searchTags<T extends TagSearchRecord>(tags: T[], query: string): T[] {
  return searchRecords(tags, query);
}

export interface HighlightSegment {
  text: string;
  match: boolean;
  start: number;
}

/** Splits `text` into segments marking the parts matching any token of `query`. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!text || tokens.length === 0) return [{ text, match: false, start: 0 }];

  let norm = "";
  const charIndex: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const chunk = normalizeSearchText(text[index]);
    if (!chunk) continue;
    for (const char of chunk) {
      norm += char;
      charIndex.push(index);
    }
  }

  const matched = new Set<number>();
  for (const token of tokens) {
    for (let at = norm.indexOf(token); at !== -1; at = norm.indexOf(token, at + 1)) {
      for (let offset = at; offset < at + token.length; offset += 1) {
        matched.add(charIndex[offset]);
      }
    }
  }

  const segments: HighlightSegment[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const isMatch = matched.has(index);
    const last = segments[segments.length - 1];
    if (last && last.match === isMatch) last.text += text[index];
    else segments.push({ text: text[index], match: isMatch, start: index });
  }
  return segments;
}
