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

export const CauseType = {
  CONDITION: "CONDITION",
  BEHAVIOR: "BEHAVIOR",
} as const;
export type CauseType = (typeof CauseType)[keyof typeof CauseType];

export const UserRole = {
  USER: "USER",
  LINE_LEADER: "LINE_LEADER",
  SAFETY_OFFICER: "SAFETY_OFFICER",
  ADMIN: "ADMIN",
  SUPERADMIN: "SUPERADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const IssueVisibilityClass = {
  SITE_PUBLIC: "SITE_PUBLIC",
  SAFETY_RESTRICTED: "SAFETY_RESTRICTED",
} as const;
export type IssueVisibilityClass = (typeof IssueVisibilityClass)[keyof typeof IssueVisibilityClass];

export const IssueWorkspace = {
  MY_WORK: "MY_WORK",
  SITE_FEED: "SITE_FEED",
  RESTRICTED: "RESTRICTED",
} as const;
export type IssueWorkspace = (typeof IssueWorkspace)[keyof typeof IssueWorkspace];

export const CauseStatus = {
  UNVERIFIED: "UNVERIFIED",
  CONFIRMED: "CONFIRMED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;
export type CauseStatus = "UNVERIFIED" | "CONFIRMED" | "NOT_APPLICABLE";

export const AuthSource = {
  LOCAL: "LOCAL",
  AD: "AD",
} as const;
export type AuthSource = (typeof AuthSource)[keyof typeof AuthSource];

export const ResponsibilityType = {
  OWNER: "OWNER",
  BACKUP: "BACKUP",
  REVIEWER: "REVIEWER",
} as const;
export type ResponsibilityType = (typeof ResponsibilityType)[keyof typeof ResponsibilityType];

export const TagStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  MERGED: "MERGED",
} as const;
export type TagStatus = (typeof TagStatus)[keyof typeof TagStatus];

export const TagReviewAction = {
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  MERGE: "MERGE",
} as const;
export type TagReviewAction = (typeof TagReviewAction)[keyof typeof TagReviewAction];

export const TargetType = {
  LOCATION: "LOCATION",
  USER: "USER",
} as const;
export type TargetType = (typeof TargetType)[keyof typeof TargetType];

export const EventType = {
  ISSUE_CREATED: "ISSUE_CREATED",
  ISSUE_UPDATED: "ISSUE_UPDATED",
  ISSUE_RESOLVED: "ISSUE_RESOLVED",
  ISSUE_CLOSED: "ISSUE_CLOSED",
  ISSUE_REOPENED: "ISSUE_REOPENED",
  ISSUE_INVALIDATED: "ISSUE_INVALIDATED",
  ISSUE_DELETED: "ISSUE_DELETED",
  ISSUE_RESTORED: "ISSUE_RESTORED",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const LocationSnapshotSource = {
  CLIENT_CAPTURE: "CLIENT_CAPTURE",
  SERVER_CAPTURE: "SERVER_CAPTURE",
} as const;
export type LocationSnapshotSource =
  (typeof LocationSnapshotSource)[keyof typeof LocationSnapshotSource];

export const SyncStatus = {
  PENDING: "PENDING",
  SYNCING: "SYNCING",
  FAILED: "FAILED",
  CONFLICT: "CONFLICT",
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const USER_ROLES: UserRole[] = [
  UserRole.USER,
  UserRole.LINE_LEADER,
  UserRole.SAFETY_OFFICER,
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
];

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
  return category === IssueCategory.S5 || Boolean(BEHAVIOR_TAG_MAP[tagCode]);
}

export function detectCauseType(category?: string | null, tags?: string[] | null): CauseType {
  if (category === IssueCategory.S5) return CauseType.BEHAVIOR;
  if ((tags ?? []).some((tag) => isBehaviorTag(tag, category || undefined))) {
    return CauseType.BEHAVIOR;
  }
  return CauseType.CONDITION;
}
