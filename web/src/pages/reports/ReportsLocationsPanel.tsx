import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { LocationReportItem } from "../../utils/analytics.ts";
import type { LocationLimit, LocationSort } from "./useReportsData.ts";

type T = (path: string, params?: Record<string, string | number>) => string;
type LocationData = LocationReportItem & { location_name: string };

interface ReportsLocationsPanelProps {
  locationLimit: LocationLimit;
  setLocationLimit: (limit: LocationLimit) => void;
  locationSort: LocationSort;
  setLocationSort: (sort: LocationSort) => void;
  selectedLocationFilter: string;
  filteredLocationData: LocationData[];
  chartHeight: number;
  gridColor: string;
  textColor: string;
  onLocationDrilldown: (code: string) => void;
  t: T;
}

export function ReportsLocationsPanel({
  locationLimit,
  setLocationLimit,
  locationSort,
  setLocationSort,
  selectedLocationFilter,
  filteredLocationData,
  chartHeight,
  gridColor,
  textColor,
  onLocationDrilldown,
  t,
}: ReportsLocationsPanelProps) {
  return (
    <div
      id="reports-panel-locations"
      role="tabpanel"
      aria-labelledby="reports-tab-locations"
      className="space-y-4 animate-fade-in"
    >
      <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">
              {t("reports.chart_location_title")}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">{t("reports.chart_location_desc")}</p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl text-[11px] font-bold border border-zinc-200 dark:border-zinc-700">
              {(
                [
                  [5, "reports.top_5"],
                  [10, "reports.top_10"],
                  [0, "reports.all_locations"],
                ] as const
              ).map(([limit, label]) => (
                <button
                  key={limit}
                  type="button"
                  onClick={() => setLocationLimit(limit)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${locationLimit === limit && !selectedLocationFilter ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" : "text-zinc-500"}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-stretch gap-2 mb-4 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl text-[11px] font-bold border border-zinc-200 dark:border-zinc-700 shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => setLocationSort("HEALTH_ASC")}
              className={`px-2.5 py-1 rounded-lg transition-all ${locationSort === "HEALTH_ASC" ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-zinc-500"}`}
              title={t("reports.sort_lowest_health")}
            >
              {t("reports.sort_lowest_health")}
            </button>
            <button
              type="button"
              onClick={() => setLocationSort("OPEN_DESC")}
              className={`px-2.5 py-1 rounded-lg transition-all ${locationSort === "OPEN_DESC" ? "bg-white dark:bg-zinc-700 text-rose-600 dark:text-rose-400 shadow-sm" : "text-zinc-500"}`}
              title={t("reports.sort_most_open")}
            >
              {t("reports.sort_most_open")}
            </button>
          </div>
        </div>
        <div className="w-full max-h-[420px] overflow-y-auto pr-1">
          {filteredLocationData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-zinc-400">
              {t("reports.empty_data")}
            </div>
          ) : (
            <div style={{ height: `${chartHeight}px` }}>
              <ResponsiveContainer width="100%" height="100%" style={{ outline: "none" }}>
                <BarChart
                  layout="vertical"
                  data={filteredLocationData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                  style={{ outline: "none" }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis type="number" stroke={textColor} fontSize={11} tickLine={false} />
                  <YAxis type="category" dataKey="location_code" hide />
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as LocationData;
                      return (
                        <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg px-3 py-2 text-xs">
                          <div className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                            {item.location_name}
                          </div>
                          {payload.map((entry) => (
                            <div key={String(entry.dataKey)} className="flex items-center gap-2">
                              <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: entry.color || "#999" }}
                              />
                              <span className="text-zinc-600 dark:text-zinc-300">
                                {entry.name}:
                              </span>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                {entry.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    name={t("reports.legend_health_score")}
                    dataKey="health_score"
                    fill="#3b82f6"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(data: unknown) => {
                      const item = data as {
                        payload?: LocationReportItem;
                        location_code?: string;
                      };
                      const code = item?.payload?.location_code || item?.location_code;
                      if (code) onLocationDrilldown(code);
                    }}
                  >
                    <LabelList
                      dataKey="location_name"
                      position="top"
                      fill={textColor}
                      fontSize={11}
                      fontWeight="bold"
                      offset={4}
                    />
                    <LabelList
                      dataKey="health_score"
                      position="right"
                      fill={textColor}
                      fontSize={11}
                      fontWeight="bold"
                      offset={4}
                    />
                  </Bar>
                  <Bar
                    name={t("reports.legend_open_issues")}
                    dataKey="open_count"
                    fill="#f43f5e"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(data: unknown) => {
                      const item = data as {
                        payload?: LocationReportItem;
                        location_code?: string;
                      };
                      const code = item?.payload?.location_code || item?.location_code;
                      if (code) onLocationDrilldown(code);
                    }}
                  >
                    <LabelList
                      dataKey="open_count"
                      position="right"
                      fill={textColor}
                      fontSize={11}
                      fontWeight="bold"
                      offset={4}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
