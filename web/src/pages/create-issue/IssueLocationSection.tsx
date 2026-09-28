import { MapPin } from "lucide-react";
import { LocationCombobox } from "../../components/LocationCombobox.tsx";
import type { SupportedLocale } from "../../i18n/index.ts";
import { type LocationItem, resolveLocationName } from "../../types/index.ts";
import { haptics } from "../../utils/haptics.ts";

interface IssueLocationSectionProps {
  locations: LocationItem[];
  value: string;
  onChange: (code: string) => void;
  recentLocations: string[];
  locale: SupportedLocale;
  translate: (key: string) => string;
}

export function IssueLocationSection({
  locations,
  value,
  onChange,
  recentLocations,
  locale,
  translate,
}: IssueLocationSectionProps) {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
      <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
        {translate("issue.step_location")}
      </span>
      <LocationCombobox locations={locations} value={value} onChange={onChange} />
      {recentLocations.length > 0 && (
        <div className="pt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-zinc-400 mr-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {translate("issue.recent_locations")}
          </span>
          {recentLocations.map((code) => {
            const loc = locations.find((item) => item.code === code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onChange(code);
                  haptics.selection();
                }}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${value === code ? "bg-blue-600 text-white border-blue-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 border-zinc-200"}`}
              >
                <span>{loc ? resolveLocationName(loc, locale) : code}</span>{" "}
                <span className="text-[10px] opacity-70 font-mono">({code})</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
