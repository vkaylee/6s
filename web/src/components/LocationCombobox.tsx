import { useEffect, useRef, useState } from "react";
import { useI18nStore } from "../i18n/index.ts";
import { type I18nObject, type LocationItem, resolveI18n } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";

interface LocationComboboxProps {
  locations: LocationItem[];
  value: string;
  onChange: (val: string) => void;
  error?: I18nObject | null;
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .trim();
}

export function LocationCombobox({ locations, value, onChange, error }: LocationComboboxProps) {
  const { t, locale } = useI18nStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedLoc = locations.find((l) => l.code === value);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredLocations = locations.filter((loc) => {
    if (!searchTerm.trim()) return true;
    const term = normalize(searchTerm);
    return (
      normalize(loc.code).includes(term) ||
      normalize(loc.name_vi).includes(term) ||
      normalize(loc.name_en || "").includes(term) ||
      loc.name_zh.toLowerCase().includes(searchTerm.toLowerCase().trim())
    );
  });

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
    setSearchTerm("");
    haptics.selection();
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-1">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => {
            if (!isOpen) inputRef.current?.focus();
          }, 50);
        }}
        className={`w-full text-left bg-zinc-50 dark:bg-zinc-800 border rounded-2xl p-3.5 min-h-[56px] flex items-center justify-between transition-all ${
          error
            ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/30 dark:bg-rose-950/20"
            : isOpen
              ? "border-blue-500 ring-2 ring-blue-500/20"
              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
        }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <span className="text-lg">📍</span>
          {selectedLoc ? (
            <div className="truncate">
              <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {locale === "zh"
                  ? selectedLoc.name_zh || selectedLoc.name_vi
                  : locale === "en"
                    ? selectedLoc.name_en || selectedLoc.name_vi
                    : selectedLoc.name_vi}
              </div>
              <div className="text-[11px] font-mono font-semibold text-zinc-400">
                {selectedLoc.code}
              </div>
            </div>
          ) : (
            <span className="text-sm font-medium text-zinc-400">{t("issue.location_select")}</span>
          )}
        </div>
        <span className="text-xs text-zinc-400 font-bold ml-2">{isOpen ? "▲" : "▼"}</span>
      </button>

      {error && (
        <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 pl-1">
          {resolveI18n(error)}
        </p>
      )}

      {/* Dropdown Menu with Instant Search */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-fade-in">
          <div className="p-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("issue.search_location_placeholder")}
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 hover:text-zinc-600 p-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60 p-1">
            {filteredLocations.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-400 font-medium">
                {t("issue.no_locations_found")}
              </div>
            ) : (
              filteredLocations.map((loc) => {
                const isSelected = loc.code === value;
                return (
                  <button
                    key={loc.code}
                    type="button"
                    onClick={() => handleSelect(loc.code)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100">
                        {loc.name_vi}
                        {loc.name_zh && (
                          <span className="text-zinc-400 font-normal ml-1">/ {loc.name_zh}</span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">{loc.code}</div>
                    </div>
                    {isSelected && <span className="text-blue-600 font-black">✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
