import { useState } from "react";
import type { DraftResolve } from "../db/indexeddb.ts";

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
                Xung đột dữ liệu ngoại tuyến (HTTP 409)
              </h2>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Issue #{resolveItem.issue_id} đã được người khác xử lý trên máy chủ
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
            Bản máy này (v{resolveItem.expected_version})
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
            Bản máy chủ (v{serverVersion})
          </button>
        </div>

        {/* Diff View Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Mobile view */}
          <div className="sm:hidden">
            {activeTab === "LOCAL" ? (
              <div className="space-y-3">
                <div className="text-xs font-bold text-zinc-500 uppercase">
                  Ảnh chụp trên máy bạn:
                </div>
                <img
                  src={localPhotoUrl}
                  alt="Bản máy này"
                  className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs"
                />
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  Thời gian ghi nhận: {new Date(resolveItem.resolved_at).toLocaleString("vi-VN")}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-bold text-zinc-500 uppercase">
                  Ảnh đang có trên máy chủ:
                </div>
                {serverPhotoAfter ? (
                  <img
                    src={serverPhotoAfter}
                    alt="Bản máy chủ"
                    className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-xs text-zinc-400">
                    Không có ảnh xem trước
                  </div>
                )}
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  Phiên bản máy chủ hiện tại: v{serverVersion}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Side-by-Side (>=640px) */}
          <div className="hidden sm:grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                Bản máy này (v{resolveItem.expected_version})
              </div>
              <img
                src={localPhotoUrl}
                alt="Bản máy này"
                className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs"
              />
              <div className="text-xs text-zinc-500">
                Chụp lúc: {new Date(resolveItem.resolved_at).toLocaleString("vi-VN")}
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                Bản máy chủ (v{serverVersion})
              </div>
              {serverPhotoAfter ? (
                <img
                  src={serverPhotoAfter}
                  alt="Bản máy chủ"
                  className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs"
                />
              ) : (
                <div className="w-full aspect-[4/3] bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-xs text-zinc-400">
                  Không có ảnh máy chủ
                </div>
              )}
              <div className="text-xs text-zinc-500">Đã bị cập nhật trước khi máy bạn đồng bộ</div>
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
            Ghi đè bản ghi (Nếu có thẩm quyền)
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 active:scale-98 text-zinc-800 dark:text-zinc-200 font-bold py-3 px-4 rounded-xl min-h-[56px] text-sm"
          >
            Lưu ảnh về máy & Hủy bản nháp
          </button>
        </div>
      </div>
    </div>
  );
}
