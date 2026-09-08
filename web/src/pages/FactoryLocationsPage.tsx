import { useEffect, useState } from "react";
import { apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import type { LocationItem } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";

export function FactoryLocationsPage() {
  const { t } = useI18nStore();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newNameVi, setNewNameVi] = useState("");
  const [newNameZh, setNewNameZh] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newQr, setNewQr] = useState("");
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);
  const [editNameVi, setEditNameVi] = useState("");
  const [editNameZh, setEditNameZh] = useState("");
  const [editNameEn, setEditNameEn] = useState("");
  const [editQr, setEditQr] = useState("");
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    setIsLoadingLocations(true);
    try {
      const data = await apiClient<LocationItem[]>("/api/locations/all");
      setLocations(data || []);
    } catch {
      try {
        const fallback = await apiClient<LocationItem[]>("/api/locations");
        setLocations(fallback || []);
      } catch {
        // keep empty
      }
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newNameVi.trim()) {
      return;
    }
    setIsAddingLocation(true);
    const qrCodeVal = newQr.trim() || `LOC:${newCode.trim().toUpperCase()}`;
    try {
      const added = await apiClient<LocationItem>("/api/locations", {
        method: "POST",
        body: JSON.stringify({
          code: newCode.trim().toUpperCase(),
          name_vi: newNameVi.trim(),
          name_zh: newNameZh.trim(),
          name_en: newNameEn.trim(),
          qr_code: qrCodeVal,
        }),
      });
      haptics.success();
      setLocations((prev) => [...prev.filter((l) => l.code !== added.code), added]);
      setNewCode("");
      setNewNameVi("");
      setNewNameZh("");
      setNewNameEn("");
      setNewQr("");
      await modalDialog.alert(t("admin.location_add_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.location_add_error"));
    } finally {
      setIsAddingLocation(false);
    }
  };

  const handleOpenEditLocation = (loc: LocationItem) => {
    setEditingLocation(loc);
    setEditNameVi(loc.name_vi);
    setEditNameZh(loc.name_zh || "");
    setEditNameEn(loc.name_en || "");
    setEditQr(loc.qr_code || `LOC:${loc.code}`);
  };

  const handleSaveEditLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation || !editNameVi.trim()) {
      return;
    }
    setIsUpdatingLocation(true);
    const qrCodeVal = editQr.trim() || `LOC:${editingLocation.code}`;
    try {
      const updated = await apiClient<LocationItem>(
        `/api/locations/${encodeURIComponent(editingLocation.code)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name_vi: editNameVi.trim(),
            name_zh: editNameZh.trim(),
            name_en: editNameEn.trim(),
            qr_code: qrCodeVal,
          }),
        },
      );
      haptics.success();
      setLocations((prev) => prev.map((l) => (l.code === updated.code ? { ...l, ...updated } : l)));
      setEditingLocation(null);
      await modalDialog.alert(t("admin.location_update_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.location_update_error"));
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleToggleLocation = async (code: string, currentStatus: boolean) => {
    try {
      const updated = await apiClient<LocationItem>(
        `/api/locations/${encodeURIComponent(code)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: !currentStatus }),
        },
      );
      haptics.success();
      setLocations((prev) =>
        prev.map((l) => (l.code === code ? { ...l, is_active: updated.is_active } : l)),
      );
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.location_status_error"));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      {/* Page Heading */}
      <PageContainer className="pt-4">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => goBack()}
            aria-label={t("common.back")}
            className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 min-h-[44px] min-w-[44px]"
          >
            ←
          </button>
          <h1 className="text-base font-black">{t("admin.locations_page_title")}</h1>
        </div>
      </PageContainer>

      <PageContainer className="py-4 space-y-6">
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
            {t("admin.add_location_btn")}
          </h2>
          <form onSubmit={handleAddLocation} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.location_code_label")}
                </span>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder={t("admin.location_code_placeholder")}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                />
              </div>
              <div>
                <span className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.location_name_vi")}
                </span>
                <input
                  type="text"
                  value={newNameVi}
                  onChange={(e) => setNewNameVi(e.target.value)}
                  placeholder={t("admin.location_name_vi_placeholder")}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.location_name_zh")}
                </span>
                <input
                  type="text"
                  value={newNameZh}
                  onChange={(e) => setNewNameZh(e.target.value)}
                  placeholder={t("admin.location_name_zh_placeholder")}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                />
              </div>
              <div>
                <span className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.location_name_en")}
                </span>
                <input
                  type="text"
                  value={newNameEn}
                  onChange={(e) => setNewNameEn(e.target.value)}
                  placeholder={t("admin.location_name_en_placeholder")}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-bold text-zinc-500 mb-1">
                {t("admin.location_qr_label")}
              </span>
              <input
                type="text"
                value={newQr}
                onChange={(e) => setNewQr(e.target.value)}
                placeholder={t("admin.location_qr_placeholder")}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono min-h-[44px]"
              />
            </div>

            <button
              type="submit"
              disabled={isAddingLocation}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
            >
              {isAddingLocation ? t("admin.adding_location_btn") : t("admin.add_location_btn")}
            </button>
          </form>
        </section>

        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
              {t("admin.locations_page_title")} ({locations.length})
            </h2>
            <button
              type="button"
              onClick={loadLocations}
              className="text-xs font-bold text-blue-600 hover:underline p-1"
            >
              🔄
            </button>
          </div>

          {isLoadingLocations ? (
            <div className="text-sm text-zinc-400 py-6 text-center">
              {t("admin.loading_locations")}
            </div>
          ) : locations.length === 0 ? (
            <div className="text-sm text-zinc-400 py-6 text-center">
              {t("admin.empty_locations")}
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {locations.map((loc) => (
                <div key={loc.code} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        {loc.code}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          loc.is_active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {loc.is_active ? t("admin.active_status") : t("admin.inactive_status")}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-300 font-medium truncate mt-0.5">
                      {loc.name_vi} {loc.name_zh && `• ${loc.name_zh}`}{" "}
                      {loc.name_en && `• ${loc.name_en}`}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditLocation(loc)}
                      className="text-xs font-bold px-3 py-2 rounded-xl min-h-[44px] transition-colors border bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700"
                    >
                      ✏️ {t("admin.edit_location_btn")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleLocation(loc.code, loc.is_active)}
                      className={`text-xs font-bold px-3 py-2 rounded-xl min-h-[44px] transition-colors border ${
                        loc.is_active
                          ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-100"
                          : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100"
                      }`}
                    >
                      {loc.is_active ? t("admin.inactive_status") : t("admin.active_status")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {editingLocation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <div>
                  <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">
                    {t("admin.edit_location_title")}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">{editingLocation.code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingLocation(null)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg text-lg"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEditLocation} className="space-y-3">
                <div>
                  <span className="block text-xs font-bold text-zinc-500 mb-1">
                    {t("admin.location_code_label")}
                  </span>
                  <input
                    type="text"
                    value={editingLocation.code}
                    disabled
                    className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono text-zinc-500 min-h-[44px] cursor-not-allowed"
                  />
                </div>

                <div>
                  <span className="block text-xs font-bold text-zinc-500 mb-1">
                    {t("admin.location_name_vi")}
                  </span>
                  <input
                    type="text"
                    value={editNameVi}
                    onChange={(e) => setEditNameVi(e.target.value)}
                    placeholder={t("admin.location_name_vi_placeholder")}
                    required
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="block text-xs font-bold text-zinc-500 mb-1">
                      {t("admin.location_name_zh")}
                    </span>
                    <input
                      type="text"
                      value={editNameZh}
                      onChange={(e) => setEditNameZh(e.target.value)}
                      placeholder={t("admin.location_name_zh_placeholder")}
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                    />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-zinc-500 mb-1">
                      {t("admin.location_name_en")}
                    </span>
                    <input
                      type="text"
                      value={editNameEn}
                      onChange={(e) => setEditNameEn(e.target.value)}
                      placeholder={t("admin.location_name_en_placeholder")}
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold text-zinc-500 mb-1">
                    {t("admin.location_qr_label")}
                  </span>
                  <input
                    type="text"
                    value={editQr}
                    onChange={(e) => setEditQr(e.target.value)}
                    placeholder={t("admin.location_qr_placeholder")}
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono min-h-[44px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingLocation}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                >
                  {isUpdatingLocation
                    ? t("admin.saving_location_btn")
                    : t("admin.save_location_btn")}
                </button>
              </form>
            </div>
          </div>
        )}
      </PageContainer>
    </div>
  );
}
