import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { type SupportedLocale, useI18nStore } from "../i18n/index.ts";
import {
  type I18nObject,
  type LocationItem,
  resolveI18n,
  resolveLocationName,
} from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";

interface LocationComboboxProps {
  locations: LocationItem[];
  value: string;
  onChange: (val: string) => void;
  error?: I18nObject | null;
}

const RECENT_LOCATIONS_KEY = "recent_locations";
const RECENT_LIMIT = 3;

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function readRecentLocations(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_LOCATIONS_KEY) ?? "[]");
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
  } catch {
    return [];
  }
}

export function LocationCombobox({ locations, value, onChange, error }: LocationComboboxProps) {
  const { t, locale } = useI18nStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [recentCodes, setRecentCodes] = useState<string[]>(readRecentLocations);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const dialogId = useId();
  const selectedLoc = locations.find((location) => location.code === value);
  const recentLocations = recentCodes
    .map((code) => locations.find((location) => location.code === code))
    .filter((location): location is LocationItem => Boolean(location));
  const term = normalize(searchTerm);
  const filteredLocations = locations.filter((location) => {
    if (!term) return true;
    return [location.code, location.name_vi, location.name_en, location.name_zh].some((name) =>
      normalize(name ?? "").includes(term),
    );
  });
  const visibleRecent = recentLocations.filter((location) => filteredLocations.includes(location));
  const showSearch = locations.length > 20;

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      if (showSearch) searchRef.current?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, showSearch]);

  const closePicker = () => {
    setIsOpen(false);
    setSearchTerm("");
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const handleSelect = (code: string) => {
    const nextRecentCodes = [
      code,
      ...recentCodes.filter((recentCode) => recentCode !== code),
    ].slice(0, RECENT_LIMIT);
    setRecentCodes(nextRecentCodes);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(nextRecentCodes));
    onChange(code);
    haptics.selection();
    closePicker();
  };

  return (
    <div className="w-full space-y-1">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("common.location")}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        onClick={() => setIsOpen(true)}
        className={`w-full text-left bg-zinc-50 dark:bg-zinc-800 border rounded-2xl p-3.5 min-h-[56px] flex items-center justify-between transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          error
            ? "border-rose-500 ring-2 ring-rose-500/20"
            : isOpen
              ? "border-blue-500 ring-2 ring-blue-500/20"
              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
        }`}
      >
        <span className="flex items-center gap-2.5 overflow-hidden">
          <span className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" aria-hidden="true" />
          </span>
          {selectedLoc ? (
            <span className="truncate">
              <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {resolveLocationName(selectedLoc, locale)}
              </span>
              <span className="block text-[11px] font-mono font-semibold text-zinc-400">
                {selectedLoc.code}
              </span>
            </span>
          ) : (
            <span className="text-sm font-medium text-zinc-400">{t("issue.location_select")}</span>
          )}
        </span>
        <ChevronDown aria-hidden="true" className="w-4 h-4 text-zinc-400 shrink-0" />
      </button>

      {error && (
        <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 pl-1">
          {resolveI18n(error)}
        </p>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
          role="presentation"
        >
          <section
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            className="w-full sm:max-w-lg max-h-[92dvh] bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-fade-in"
          >
            <header className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <h2
                id={`${dialogId}-title`}
                className="text-base font-bold text-zinc-900 dark:text-zinc-100"
              >
                {t("common.location")}
              </h2>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={closePicker}
                className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </header>
            {showSearch && (
              <div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
                <label htmlFor={`${dialogId}-search`} className="sr-only">
                  {t("issue.search_location_placeholder")}
                </label>
                <div className="relative">
                  <Search
                    className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchRef}
                    id={`${dialogId}-search`}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={t("issue.search_location_placeholder")}
                    className="w-full min-h-12 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
            <div
              role="listbox"
              aria-label={t("common.location")}
              className="overflow-y-auto p-3 space-y-2"
            >
              {!term && visibleRecent.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                    {t("issue.recent_locations")}
                  </p>
                  {visibleRecent.map((location) => (
                    <LocationOption
                      key={`recent-${location.code}`}
                      location={location}
                      selected={location.code === value}
                      locale={locale}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}
              <div>
                {visibleRecent.length > 0 && !term && (
                  <p className="px-2 pt-2 pb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                    {t("common.all")}
                  </p>
                )}
                {filteredLocations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-400">
                    {t("issue.no_locations_found")}
                  </p>
                ) : (
                  filteredLocations.map((location) => (
                    <LocationOption
                      key={location.code}
                      location={location}
                      selected={location.code === value}
                      locale={locale}
                      onSelect={handleSelect}
                    />
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function LocationOption({
  location,
  selected,
  locale,
  onSelect,
}: {
  location: LocationItem;
  selected: boolean;
  locale: SupportedLocale;
  onSelect: (code: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(location.code)}
      className={`w-full min-h-12 px-3 py-2.5 rounded-xl flex items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selected ? "bg-blue-50 dark:bg-blue-950/50" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"}`}
    >
      <span className="truncate pr-2">
        <span className="block font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
          {resolveLocationName(location, locale)}
        </span>
        <span className="block text-[10px] font-mono text-zinc-400">{location.code}</span>
      </span>
      {selected && <Check aria-hidden="true" className="w-5 h-5 text-blue-600 shrink-0" />}
    </button>
  );
}
