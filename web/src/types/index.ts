import type { I18nObject } from "./i18n.ts";

export {
  resolveI18n,
  resolveLocationName,
  resolveLocationNameByCode,
  resolveTagLabel,
} from "./i18n.ts";
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

export type CauseType = "CONDITION" | "BEHAVIOR";

export const BEHAVIOR_TAG_MAP: Record<string, true> = {
  ppe_violation: true,
  improper_storage: true,
  sop_noncompliance: true,
  eating_at_workstation: true,
  sleeping_on_shift: true,
  phone_use_operating: true,
  running_in_workshop: true,
  safety_gear: true,
  forklift_speeding: true,
};

export function isBehaviorTag(tagCode: string, category?: string): boolean {
  return category === "5S" || Boolean(BEHAVIOR_TAG_MAP[tagCode]);
}

export function detectCauseType(category?: string | null, tags: string[] = []): CauseType {
  if (category === "5S") return "BEHAVIOR";
  if (tags.some((tag) => isBehaviorTag(tag, category || undefined))) {
    return "BEHAVIOR";
  }
  return "CONDITION";
}

export const UserRole = {
  USER: "USER",
  LINE_LEADER: "LINE_LEADER",
  SAFETY_OFFICER: "SAFETY_OFFICER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

import type {
  Issue as OpenApiIssue,
  PaginationMeta as OpenApiPaginationMeta,
} from "../api/generated/index.ts";

export type IssueItem = OpenApiIssue & {
  cause_type?: CauseType;
  location_name: string;
  creator_name: string;
  resolver_name?: string | null;
  translated_description?: string | null;
  score_deducted?: number;
};

export type PaginationMeta = OpenApiPaginationMeta;

export interface PaginatedResult<T> {
  data: T;
  pagination?: PaginationMeta;
}

export type LocationItem = {
  code: string;
  name_vi: string;
  name_zh: string;
  name_en: string;
  qr_code?: string;
  is_active: boolean;
};

export type TagItem = {
  tag_code: string;
  category: string;
  label_vi: string;
  label_zh: string;
  label_en?: string;
  target_kind?: "OBJECT" | "BEHAVIOR";
  code?: string;
  name_vi?: string;
  name_zh?: string;
  name_en?: string;
  use_count?: number;
  is_preset?: boolean;
};

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

export interface ScoreLogItem {
  id: number;
  issue_id: number;
  target_type: "LOCATION" | "USER";
  target_id: string;
  rule_key: string;
  rule_description: string;
  points: number;
  created_at: string;
  penalty_date?: string;
  issue_category?: string;
  issue_description?: string;
  issue_status?: string;
}

export const S_CATEGORIES: {
  key: IssueCategory;
  name: string;
  name_i18n?: I18nObject;
  hint_vi: string;
  hint_zh: string;
  hint_en?: string;
  hint_i18n?: I18nObject;
  description_i18n?: I18nObject;
  action_i18n?: I18nObject;
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
    description_i18n: {
      vi: "Vật dụng thừa, máy móc hỏng, phế liệu, rác chiếm lối đi hoặc mặt sàn.",
      zh: "闲置工具、报废托盘、多余物料、占用通道的无用物品。",
      en: "Unneeded items, broken equipment, scrap material, or stagnant WIP.",
    },
    action_i18n: {
      vi: "Gắn thẻ đỏ, di dời hoặc đưa vào khu vực thanh lý.",
      zh: "贴红牌警示，清理出作业现场或移交报废区。",
      en: "Apply red tag, move out of work area, or scrap.",
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
    description_i18n: {
      vi: "Để đồ sai vị trí, thiếu biển tên/nhãn mác, mờ vạch kẻ sàn, dây cáp lộn xộn.",
      zh: "物品乱放未归位、缺定位标线、箱体无标签、线缆凌乱、超高码放。",
      en: "Items in wrong place, missing floor markings, missing labels, or tangled cables.",
    },
    action_i18n: {
      vi: "Quy định vị trí, dán nhãn nhận diện, kẻ vạch và đặt về đúng chỗ.",
      zh: "定置定位、标识清楚、整理线缆并归位放置。",
      en: "Designate location, label clearly, mark boundaries, and return to place.",
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
    description_i18n: {
      vi: "Rò rỉ dầu mỡ/nước, bụi bẩn bám máy, rác vương vãi, thùng rác đầy tràn.",
      zh: "设备漏油漏水、积灰积垢、地面污迹、垃圾桶溢出。",
      en: "Oil/water leaks, dust accumulation, stained floors, or overflowing trash.",
    },
    action_i18n: {
      vi: "Lau chùi sạch sẽ, xử lý dứt điểm điểm rò rỉ, vệ sinh thiết bị.",
      zh: "彻底清扫擦拭、消除泄漏源并清理地面污迹。",
      en: "Clean thoroughly, fix source of leak, and wipe down machines.",
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
    description_i18n: {
      vi: "Bảng tin rách hỏng, biểu mẫu vệ sinh không cập nhật, chuẩn 3S bị bỏ bê.",
      zh: "标准化标识损坏、点检表未更新、清扫维护未形成例行机制。",
      en: "Damaged notice boards, missing checklists, or neglected 3S routines.",
    },
    action_i18n: {
      vi: "Thay mới bảng biểu, duy trì lịch kiểm tra và chuẩn hóa quy trình.",
      zh: "更新标准化看板与检查表，坚持每日点检维护。",
      en: "Update visual boards, maintain check schedules, and enforce standards.",
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
    description_i18n: {
      vi: "Vi phạm nội quy xưởng, không mang bảo hộ cá nhân (PPE), ý thức tự giác kém.",
      zh: "违反厂规厂纪、未穿戴劳保用品(PPE)、吸烟乱扔或缺乏自律意识。",
      en: "Disregarding factory rules, missing PPE, or lacking safety habits.",
    },
    action_i18n: {
      vi: "Nhắc nhở, đào tạo lại nhận thức và kiểm điểm tuân thủ nội quy.",
      zh: "现场提醒纠正、重新培训并严格执行规程。",
      en: "Remind immediately, retrain personnel, and enforce compliance.",
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
    description_i18n: {
      vi: "Chặn lối thoát hiểm/bình chữa cháy, hở dây điện, máy mất che chắn an toàn.",
      zh: "堵塞消防栓/逃生通道、电线裸露破损、防护罩缺失、存在起火隐患。",
      en: "Blocked emergency exits, exposed wiring, missing guards, or fire risks.",
    },
    action_i18n: {
      vi: "XỬ LÝ NGAY LẬP TỨC: Cảnh báo khu vực, dừng thao tác nguy hiểm, báo an toàn.",
      zh: "立即就地整改：设置警示、停止危险作业并通知安全员。",
      en: "IMMEDIATE ACTION: Cord off area, halt hazard, alert safety supervisor.",
    },
    isSafety: true,
  },
];

export interface ReportKPISummary {
  totalIssues: number;
  openIssues: number;
  pendingReviewIssues: number;
  closedIssues: number;
  invalidIssues: number;
  safetyIssues: number;
  overdueIssues: number;
  resolutionRate: number;
}

export interface ReportCategoryBreakdownItem {
  category: IssueCategory;
  count: number;
  percentage: number;
}

export interface ReportTrendPoint {
  date: string;
  created: number;
  resolved: number;
}

export interface ReportTagItem {
  tag_code: string;
  category: string;
  name_vi: string;
  name_zh: string;
  name_en: string;
  count: number;
}

export interface ReportSummaryResponse {
  kpi: ReportKPISummary;
  categories: ReportCategoryBreakdownItem[];
  trends: ReportTrendPoint[];
  topTags: ReportTagItem[];
}

export interface AIConfigData {
  is_enabled: boolean;
  base_url: string;
  has_api_key: boolean;
  default_model: string;
  model_translate: string;
  model_vision: string;
  model_summary: string;
  updated_at?: string;
}

export interface AITranslateResponse {
  translated_text: string;
}

export interface AITestResponse {
  success: boolean;
  latency_ms?: number;
  model_used?: string;
  purpose?: string;
  check?: string;
  reply?: string;
  error?: string;
}

export interface AIDNSTestResponse {
  success: boolean;
  host?: string;
  ips?: string[];
  latency_ms?: number;
  error?: string;
}
