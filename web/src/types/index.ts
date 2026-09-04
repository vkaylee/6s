export type IssueCategory = "1S" | "2S" | "3S" | "4S" | "5S" | "6S";
export type IssueStatus = "OPEN" | "PENDING_REVIEW" | "CLOSED" | "INVALID";
export type UserRole = "USER" | "LINE_LEADER" | "SAFETY_OFFICER" | "ADMIN";

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
  hint_vi: string;
  hint_zh: string;
  isSafety?: boolean;
}[] = [
  { key: "1S", name: "Sàng lọc", hint_vi: "Đồ thừa / Phế phẩm", hint_zh: "整理 / 废弃物" },
  { key: "2S", name: "Sắp xếp", hint_vi: "Sai chỗ / Thiếu vạch", hint_zh: "整顿 / 缺标线" },
  { key: "3S", name: "Sạch sẽ", hint_vi: "Bẩn / Rò rỉ dầu", hint_zh: "清扫 / 漏油灰尘" },
  { key: "4S", name: "Săn sóc", hint_vi: "Hỏng chuẩn / Bảng tin", hint_zh: "清洁 / 标准失效" },
  { key: "5S", name: "Sẵn sàng", hint_vi: "Sai tác phong / Nội quy", hint_zh: "素养 / 违规违纪" },
  {
    key: "6S",
    name: "An toàn",
    hint_vi: "Nguy hiểm / Cháy nổ",
    hint_zh: "安全 / 紧急危险",
    isSafety: true,
  },
];
