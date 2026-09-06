import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationHealthScore,
  type TagItem,
} from "../types/index.ts";

export interface KPISummary {
  totalIssues: number;
  openIssues: number;
  pendingReviewIssues: number;
  closedIssues: number;
  invalidIssues: number;
  safetyIssues: number;
  overdueIssues: number;
  resolutionRate: number; // 0 - 100
  averageHealthScore: number;
}

export interface CategoryBreakdownItem {
  category: IssueCategory;
  count: number;
  percentage: number;
}

export interface LocationReportItem {
  location_code: string;
  location_name: string;
  health_score: number;
  open_count: number;
  overdue_count: number;
  total_issues: number;
}

export interface TagReportItem {
  tag_code: string;
  count: number;
  category: string;
  name_vi: string;
  name_zh: string;
  name_en: string;
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  created: number;
  resolved: number;
}

export function calculateKPISummary(
  issues: IssueItem[],
  locations: LocationHealthScore[],
): KPISummary {
  const totalIssues = issues.length;
  let openIssues = 0;
  let pendingReviewIssues = 0;
  let closedIssues = 0;
  let invalidIssues = 0;
  let safetyIssues = 0;
  let overdueIssues = 0;

  const now = Date.now();
  const OVERDUE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

  for (const issue of issues) {
    if (issue.status === IssueStatus.OPEN) {
      openIssues++;
      const createdTime = new Date(issue.created_at).getTime();
      if (!Number.isNaN(createdTime) && now - createdTime > OVERDUE_THRESHOLD_MS) {
        overdueIssues++;
      }
    } else if (issue.status === IssueStatus.PENDING_REVIEW) {
      pendingReviewIssues++;
    } else if (issue.status === IssueStatus.CLOSED) {
      closedIssues++;
    } else if (issue.status === IssueStatus.INVALID) {
      invalidIssues++;
    }

    if (issue.category === IssueCategory.S6) {
      safetyIssues++;
    }
  }

  const validTotal = closedIssues + openIssues + pendingReviewIssues;
  const resolutionRate = validTotal > 0 ? Math.round((closedIssues / validTotal) * 100) : 0;

  let averageHealthScore = 100;
  if (locations.length > 0) {
    const totalScore = locations.reduce((acc, loc) => acc + loc.health_score, 0);
    averageHealthScore = Math.round(totalScore / locations.length);
  }

  return {
    totalIssues,
    openIssues,
    pendingReviewIssues,
    closedIssues,
    invalidIssues,
    safetyIssues,
    overdueIssues,
    resolutionRate,
    averageHealthScore,
  };
}

export function calculateCategoryBreakdown(issues: IssueItem[]): CategoryBreakdownItem[] {
  const counts: Record<string, number> = {
    [IssueCategory.S1]: 0,
    [IssueCategory.S2]: 0,
    [IssueCategory.S3]: 0,
    [IssueCategory.S4]: 0,
    [IssueCategory.S5]: 0,
    [IssueCategory.S6]: 0,
  };

  for (const issue of issues) {
    if (counts[issue.category] !== undefined) {
      counts[issue.category]++;
    }
  }

  const total = issues.length;
  const categories = [
    IssueCategory.S1,
    IssueCategory.S2,
    IssueCategory.S3,
    IssueCategory.S4,
    IssueCategory.S5,
    IssueCategory.S6,
  ];

  return categories.map((cat) => {
    const count = counts[cat] || 0;
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return {
      category: cat,
      count,
      percentage,
    };
  });
}

export function calculateLocationReports(
  locations: LocationHealthScore[],
  issues: IssueItem[],
): LocationReportItem[] {
  const issueCounts: Record<string, number> = {};
  for (const issue of issues) {
    issueCounts[issue.location_code] = (issueCounts[issue.location_code] || 0) + 1;
  }

  return locations
    .map((loc) => ({
      location_code: loc.location_code,
      location_name: loc.location_name || loc.location_code,
      health_score: loc.health_score,
      open_count: loc.open_count,
      overdue_count: loc.overdue_count,
      total_issues: issueCounts[loc.location_code] || 0,
    }))
    .sort((a, b) => a.health_score - b.health_score);
}

export function calculateTopTags(
  issues: IssueItem[],
  tags: TagItem[],
  limit = 10,
): TagReportItem[] {
  const tagMap = new Map<string, TagItem>();
  for (const t of tags) {
    const code = t.tag_code || t.code || "";
    if (code) {
      tagMap.set(code, t);
    }
  }

  const countMap: Record<string, number> = {};
  for (const issue of issues) {
    if (issue.tags && Array.isArray(issue.tags)) {
      for (const tCode of issue.tags) {
        if (tCode) {
          countMap[tCode] = (countMap[tCode] || 0) + 1;
        }
      }
    }
  }

  return Object.entries(countMap)
    .map(([code, count]) => {
      const meta = tagMap.get(code);
      return {
        tag_code: code,
        count,
        category: meta?.category || "6S",
        name_vi: meta?.name_vi || meta?.label_vi || code,
        name_zh: meta?.name_zh || meta?.label_zh || code,
        name_en: meta?.name_en || meta?.label_en || code,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function calculateIssueTrends(
  issues: IssueItem[],
  days = 14,
  referenceDate = new Date(),
): TrendPoint[] {
  const points: Record<string, { created: number; resolved: number }> = {};
  const dateKeys: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    points[key] = { created: 0, resolved: 0 };
    dateKeys.push(key);
  }

  for (const issue of issues) {
    if (issue.created_at) {
      const createdKey = issue.created_at.slice(0, 10);
      if (points[createdKey]) {
        points[createdKey].created++;
      }
    }

    const resolvedTime = issue.closed_at || issue.resolved_at;
    if (resolvedTime) {
      const resolvedKey = resolvedTime.slice(0, 10);
      if (points[resolvedKey]) {
        points[resolvedKey].resolved++;
      }
    }
  }

  return dateKeys.map((key) => ({
    date: key,
    created: points[key].created,
    resolved: points[key].resolved,
  }));
}
