import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useI18nStore } from "../i18n/index.ts";
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
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const comboboxId = useId();
  const listboxId = `${comboboxId}-listbox`;

  const selectedLoc = locations.find((l) => l.code === value);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveOptionIndex(-1);
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

  const selectedIndex = filteredLocations.findIndex((loc) => loc.code === value);
  const activeLoc = filteredLocations[activeOptionIndex];
  const activeOptionId = activeLoc ? `${comboboxId}-option-${activeOptionIndex}` : undefined;

  const openMenu = (
    index = selectedIndex >= 0 ? selectedIndex : filteredLocations.length > 0 ? 0 : -1,
  ) => {
    setIsOpen(true);
    setActiveOptionIndex(index);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
    setSearchTerm("");
    setActiveOptionIndex(-1);
    haptics.selection();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>, source: "trigger" | "input") => {
    if (event.key === "Escape") {
      if (!isOpen) return;
      event.preventDefault();
      setIsOpen(false);
      setActiveOptionIndex(-1);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Enter" || (event.key === " " && source === "trigger")) {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
      } else if (activeLoc) {
        handleSelect(activeLoc.code);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!isOpen) {
        openMenu(direction === 1 ? 0 : filteredLocations.length - 1);
        return;
      }
      if (filteredLocations.length > 0) {
        setActiveOptionIndex((current) =>
          Math.min(
            Math.max(current < 0 ? 0 : current + direction, 0),
            filteredLocations.length - 1,
          ),
        );
      }
      return;
    }

    if ((event.key === "Home" || event.key === "End") && isOpen) {
      event.preventDefault();
      setActiveOptionIndex(event.key === "Home" ? 0 : Math.max(filteredLocations.length - 1, 0));
    }
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-1">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("common.location")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            setActiveOptionIndex(-1);
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => handleKeyDown(event, "trigger")}
        className={`w-full text-left bg-zinc-50 dark:bg-zinc-800 border rounded-2xl p-3.5 min-h-[56px] flex items-center justify-between transition-all ${
          error
            ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/30 dark:bg-rose-950/20"
            : isOpen
              ? "border-blue-500 ring-2 ring-blue-500/20"
              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
        }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" aria-hidden="true" />
          </div>
          {selectedLoc ? (
            <div className="truncate">
              <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {resolveLocationName(selectedLoc, locale)}
              </div>
              <div className="text-[11px] font-mono font-semibold text-zinc-400">
                {selectedLoc.code}
              </div>
            </div>
          ) : (
            <span className="text-sm font-medium text-zinc-400">{t("issue.location_select")}</span>
          )}
        </div>
        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
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
            <div className="relative flex items-center">
              <Search
                aria-hidden="true"
                className="w-3.5 h-3.5 absolute left-3 text-zinc-400 pointer-events-none"
              />
              <input
                ref={inputRef}
                id={`${comboboxId}-search`}
                type="text"
                role="combobox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-activedescendant={isOpen ? activeOptionId : undefined}
                aria-label={t("issue.search_location_placeholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(event) => handleKeyDown(event, "input")}
                placeholder={t("issue.search_location_placeholder")}
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-8 pr-8 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  aria-label={t("common.filter")}
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
                >
                  <X aria-hidden="true" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label={t("common.location")}
            className="max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60 p-1"
          >
            {filteredLocations.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-400 font-medium">
                {t("issue.no_locations_found")}
              </div>
            ) : (
              filteredLocations.map((loc, index) => {
                const isSelected = loc.code === value;
                const isActive = index === activeOptionIndex;
                return (
                  <button
                    key={loc.code}
                    id={`${comboboxId}-option-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => handleSelect(loc.code)}
                    onMouseMove={() => setActiveOptionIndex(index)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200"
                        : isSelected
                          ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100">
                        {resolveLocationName(loc, locale)}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">{loc.code}</div>
                    </div>
                    {isSelected && (
                      <Check
                        aria-hidden="true"
                        className="w-4 h-4 text-blue-600 font-black shrink-0"
                      />
                    )}
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
