import { useState } from "react";
import type { DraftResolve } from "../db/indexeddb.ts";
import { useI18nStore } from "../i18n/index.ts";

interface ConflictModalProps {
  resolveItem: DraftResolve;
  serverVersion?: number;
  serverPhotoAfter?: string;
  onOverwrite: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

/**
 * 409 Conflict Resolution Screen (SPEC.md Section 7.3):
 * - Mobile (<640px): Segmented Toggle [Bản máy này] / [Bản máy chủ]
 * - Desktop (>=640px): Side-by-side comparison
 */
export function ConflictModal({
  resolveItem,
  serverVersion = 2,
  serverPhotoAfter,
  onOverwrite,
  onDiscard,
  onClose,
}: ConflictModalProps) {
  const { t, locale } = useI18nStore();
  const [activeTab, setActiveTab] = useState<"LOCAL" | "SERVER">("LOCAL");
  const localPhotoUrl = URL.createObjectURL(resolveItem.photo_after_blob);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-amber-50 dark:bg-amber-950/40">
          <div className="flex items-center space-x-2">
            <span className="text-xl">⚠️</span>
            <div>
              <h2 className="text-base font-black text-amber-900 dark:text-amber-200">
                {t("conflict.title")}
              </h2>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("conflict.desc", { id: resolveItem.issue_id })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Mobile Segmented Toggle (<640px) */}
        <div className="sm:hidden p-3 border-b border-zinc-200 dark:border-zinc-800 flex space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab("LOCAL")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs min-h-[44px] ${
              activeTab === "LOCAL"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {t("conflict.local_version", { version: resolveItem.expected_version })}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("SERVER")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs min-h-[44px] ${
              activeTab === "SERVER"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {t("conflict.server_version", { version: serverVersion })}
          </button>
        </div>

        {/* Diff View Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Mobile view */}
          <div className="sm:hidden">
            {activeTab === "LOCAL" ? (
              <div className="space-y-3">
                <div className="text-xs font-bold text-zinc-500 uppercase">
                  {t("conflict.local_photo_label")}
                </div>
                <img
                  src={localPhotoUrl}
                  alt={t("conflict.local_photo_alt")}
                  className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs"
                />
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t("conflict.recorded_at", {
                    time: new Date(resolveItem.resolved_at).toLocaleString(
                      locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN",
                    ),
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-bold text-zinc-500 uppercase">
                  {t("conflict.server_photo_label")}
                </div>
                {serverPhotoAfter ? (
                  <img
                    src={serverPhotoAfter}
                    alt={t("conflict.server_photo_alt")}
                    className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-xs text-zinc-400">
                    {t("conflict.no_preview")}
                  </div>
                )}
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t("conflict.current_server_version", { version: serverVersion })}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Side-by-Side (>=640px) */}
          <div className="hidden sm:grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {t("conflict.local_version", { version: resolveItem.expected_version })}
              </div>
              <img
                src={localPhotoUrl}
                alt={t("conflict.local_photo_alt")}
                className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs"
              />
              <div className="text-xs text-zinc-500">
                {t("conflict.captured_at", {
                  time: new Date(resolveItem.resolved_at).toLocaleString(
                    locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "vi-VN",
                  ),
                })}
              </div>
            </div>
            <div className="space-y-2">
              <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {t("conflict.server_version", { version: serverVersion })}
              </div>
              {serverPhotoAfter ? (
                <img
                  src={serverPhotoAfter}
                  alt={t("conflict.server_photo_alt")}
                  className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs"
                />
              ) : (
                <div className="w-full aspect-[4/3] bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-xs text-zinc-400">
                  {t("conflict.no_server_photo")}
                </div>
              )}
              <div className="text-xs text-zinc-500">{t("conflict.server_updated_notice")}</div>
            </div>
          </div>
        </div>

        {/* Action Controls (Zero-Data-Loss) */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onOverwrite}
            className="flex-1 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-bold py-3 px-4 rounded-xl min-h-[56px] text-sm"
          >
            {t("conflict.overwrite_btn")}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 active:scale-98 text-zinc-800 dark:text-zinc-200 font-bold py-3 px-4 rounded-xl min-h-[56px] text-sm"
          >
            {t("conflict.discard_btn")}
          </button>
        </div>
      </div>
    </div>
  );
}
