import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { IssueCategory } from "../../types/index.ts";
import { CATEGORY_COLORS } from "./reportConstants.ts";

type T = (path: string, params?: Record<string, string | number>) => string;

interface ReportsTrendsPanelProps {
  categoryData: { category: IssueCategory; count: number; percentage: number }[];
  trendData: { date: string; created: number; resolved: number }[];
  topTagsData: {
    tag_code: string;
    category: string;
    name_vi: string;
    name_zh: string;
    name_en: string;
    count: number;
  }[];
  daysRange: 7 | 14 | 30;
  totalIssues: number;
  locale: string;
  gridColor: string;
  textColor: string;
  tooltipBg: string;
  tooltipBorder: string;
  onCategoryDrilldown: (category: IssueCategory) => void;
  onTagDrilldown: (tagCode: string) => void;
  t: T;
}

export function ReportsTrendsPanel({
  categoryData,
  trendData,
  topTagsData,
  daysRange,
  totalIssues,
  locale,
  gridColor,
  textColor,
  tooltipBg,
  tooltipBorder,
  onCategoryDrilldown,
  onTagDrilldown,
  t,
}: ReportsTrendsPanelProps) {
  return (
    <div
      id="reports-panel-trends"
      role="tabpanel"
      aria-labelledby="reports-tab-trends"
      className="space-y-4 animate-fade-in"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
          <div className="mb-3">
            <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">
              {t("reports.chart_category_title")}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">{t("reports.chart_category_desc")}</p>
          </div>
          <div className="w-full h-72 flex flex-col sm:flex-row items-center justify-center">
            {totalIssues === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                {t("reports.empty_data")}
              </div>
            ) : (
              <>
                <div className="w-full sm:w-3/5 h-56 sm:h-full">
                  <ResponsiveContainer width="100%" height="100%" style={{ outline: "none" }}>
                    <PieChart style={{ outline: "none" }}>
                      <Pie
                        data={categoryData}
                        dataKey="count"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        cursor="pointer"
                        onClick={(data: unknown) => {
                          const item = data as {
                            category?: string;
                            payload?: { category?: string };
                          };
                          const category = item?.category || item?.payload?.category;
                          if (category) onCategoryDrilldown(category as IssueCategory);
                        }}
                      >
                        {categoryData.map((entry) => (
                          <Cell
                            key={`cell-${entry.category}`}
                            fill={CATEGORY_COLORS[entry.category] || "#71717a"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          borderColor: tooltipBorder,
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:w-2/5 grid grid-cols-2 sm:grid-cols-1 gap-1.5 pt-2 sm:pt-0">
                  {categoryData.map((item) => (
                    <button
                      key={item.category}
                      type="button"
                      onClick={() => onCategoryDrilldown(item.category)}
                      className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="flex items-center space-x-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor: CATEGORY_COLORS[item.category] || "#71717a",
                          }}
                        />
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                          {item.category}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-zinc-500 dark:text-zinc-400">
                        {item.count} ({item.percentage}%) ↗
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
          <div className="mb-3">
            <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">
              {t("reports.chart_trend_title")}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {t("reports.chart_trend_desc")}{" "}
              {t("reports.trend_days_subtitle", { days: String(daysRange) })}
            </p>
          </div>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%" style={{ outline: "none" }}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                <defs>
                  <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={textColor}
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis stroke={textColor} fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  name={t("reports.legend_created")}
                  dataKey="created"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#createdGrad)"
                />
                <Area
                  type="monotone"
                  name={t("reports.legend_resolved")}
                  dataKey="resolved"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#resolvedGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>🏷️</span>
              <span>{t("reports.top_tags_title")}</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">{t("reports.top_tags_desc")}</p>
          </div>
        </div>
        {topTagsData.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-xs text-zinc-400">
            {t("reports.empty_data")}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {topTagsData.map((item) => {
              const label =
                locale === "zh" ? item.name_zh : locale === "en" ? item.name_en : item.name_vi;
              return (
                <button
                  key={item.tag_code}
                  type="button"
                  onClick={() => onTagDrilldown(item.tag_code)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 border border-zinc-200 dark:border-zinc-700 transition-all text-left group"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[item.category] || "#71717a" }}
                  />
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {label}
                  </span>
                  <span className="text-[11px] font-mono font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                    {t("reports.occurrences", { count: item.count })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
