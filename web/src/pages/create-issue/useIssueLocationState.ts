import { useCallback, useState } from "react";
import type { LocationItem } from "../../types/index.ts";

const RECENT_LOCATIONS_KEY = "6s_recent_locations";
const MAX_RECENT_LOCATIONS = 3;

export function useIssueLocationState(locations: LocationItem[]) {
  const [locationCode, setLocationCode] = useState(locations[0]?.code || "");
  const [recentLocations, setRecentLocations] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(RECENT_LOCATIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const effectiveLocationCode = locationCode || locations[0]?.code || "";

  const updateRecentLocations = useCallback(
    (code: string) => {
      if (!code) return;
      const next = [code, ...recentLocations.filter((item) => item !== code)].slice(
        0,
        MAX_RECENT_LOCATIONS,
      );
      setRecentLocations(next);
      try {
        localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(next));
      } catch {}
    },
    [recentLocations],
  );

  return {
    locationCode,
    setLocationCode,
    recentLocations,
    effectiveLocationCode,
    updateRecentLocations,
  };
}
