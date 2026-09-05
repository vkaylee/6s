import type { I18nObject } from "./i18n.ts";

export { resolveI18n } from "./i18n.ts";
export type { I18nObject };

export const IssueCategory = {
  S1: "1S",
  S2: "2S",
  S3: "3S",
  S4: "4S",
  S5: "5S",
  S6: "6S",
} as const;
export type IssueCategory = (typeof IssueCategory)[keyof typeof IssueCategory];

export const IssueStatus = {
  OPEN: "OPEN",
  PENDING_REVIEW: "PENDING_REVIEW",
  CLOSED: "CLOSED",
  INVALID: "INVALID",
} as const;
export type IssueStatus = (typeof IssueStatus)[keyof typeof IssueStatus];

export const UserRole = {
  USER: "USER",
  LINE_LEADER: "LINE_LEADER",
  SAFETY_OFFICER: "SAFETY_OFFICER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface IssueItem {
  id: number;
  client_uuid: string;
  version: number;
  creator_id: number;
  creator_name: string;
  resolver_id?: number | null;
  resolver_name?: string | null;
  category: IssueCategory;
  location_code: string;
  location_name: string;
  description: string;
  reject_reason?: string | null;
  photo_before: string;
  photo_detail?: string | null;
  photo_after?: string | null;
  score_rating?: number | null;
  status: IssueStatus;
  created_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  tags: string[];
}

export interface LocationItem {
  code: string;
  name_vi: string;
  name_zh: string;
  name_en: string;
  qr_code?: string;
  is_active: boolean;
}

export interface TagItem {
  tag_code: string;
  category: string;
  label_vi: string;
  label_zh: string;
}

export interface LocationHealthScore {
  location_code: string;
  location_name: string;
  health_score: number;
  open_count: number;
  overdue_count: number;
}

export interface ReporterLeaderboard {
  user_id: number;
  full_name: string;
  points: number;
  valid_count: number;
  safety_count: number;
}

export const S_CATEGORIES: {
  key: IssueCategory;
  name: string;
  name_i18n?: I18nObject;
  hint_vi: string;
  hint_zh: string;
  hint_en?: string;
  hint_i18n?: I18nObject;
  isSafety?: boolean;
}[] = [
  {
    key: "1S",
    name: "Sàng lọc",
    name_i18n: { vi: "Sàng lọc", en: "Sort", zh: "整理" },
    hint_vi: "Đồ thừa / Phế phẩm",
    hint_zh: "整理 / 废弃物",
    hint_en: "Clutter / Scrap",
    hint_i18n: {
      vi: "Đồ thừa / Phế phẩm",
      en: "Clutter / Scrap",
      zh: "整理 / 废弃物",
    },
  },
  {
    key: "2S",
    name: "Sắp xếp",
    name_i18n: { vi: "Sắp xếp", en: "Set in Order", zh: "整顿" },
    hint_vi: "Sai chỗ / Thiếu vạch",
    hint_zh: "整顿 / 缺标线",
    hint_en: "Wrong place / Missing line",
    hint_i18n: {
      vi: "Sai chỗ / Thiếu vạch",
      en: "Wrong place / Missing line",
      zh: "整顿 / 缺标线",
    },
  },
  {
    key: "3S",
    name: "Sạch sẽ",
    name_i18n: { vi: "Sạch sẽ", en: "Shine", zh: "清扫" },
    hint_vi: "Bẩn / Rò rỉ dầu",
    hint_zh: "清扫 / 漏油灰尘",
    hint_en: "Dirty / Oil leak",
    hint_i18n: {
      vi: "Bẩn / Rò rỉ dầu",
      en: "Dirty / Oil leak",
      zh: "清扫 / 漏油灰尘",
    },
  },
  {
    key: "4S",
    name: "Săn sóc",
    name_i18n: { vi: "Săn sóc", en: "Standardize", zh: "清洁" },
    hint_vi: "Hỏng chuẩn / Bảng tin",
    hint_zh: "清洁 / 标准失效",
    hint_en: "Broken standard / Notice board",
    hint_i18n: {
      vi: "Hỏng chuẩn / Bảng tin",
      en: "Broken standard / Notice board",
      zh: "清洁 / 标准失效",
    },
  },
  {
    key: "5S",
    name: "Sẵn sàng",
    name_i18n: { vi: "Sẵn sàng", en: "Sustain", zh: "素养" },
    hint_vi: "Sai tác phong / Nội quy",
    hint_zh: "素养 / 违规违纪",
    hint_en: "Discipline / Rules",
    hint_i18n: {
      vi: "Sai tác phong / Nội quy",
      en: "Discipline / Rules",
      zh: "素养 / 违规违纪",
    },
  },
  {
    key: "6S",
    name: "An toàn",
    name_i18n: { vi: "An toàn", en: "Safety", zh: "安全" },
    hint_vi: "Nguy hiểm / Cháy nổ",
    hint_zh: "安全 / 紧急危险",
    hint_en: "Danger / Fire hazard",
    hint_i18n: {
      vi: "Nguy hiểm / Cháy nổ",
      en: "Danger / Fire hazard",
      zh: "安全 / 紧急危险",
    },
    isSafety: true,
  },
];
