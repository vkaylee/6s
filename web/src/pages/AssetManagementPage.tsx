import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { useMasterdataStore } from "../store/masterdataStore.ts";
import {
  type AssetItem,
  type LocationItem,
  resolveLocationName,
  type TeamItem,
} from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";

export function AssetManagementPage() {
  const { t, locale } = useI18nStore();
  const loadReference = useMasterdataStore((state) => state.loadReference);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDefaultTeamId, setNewDefaultTeamId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDefaultTeamId, setEditDefaultTeamId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [assetData, teamData, locationData] = await Promise.all([
        apiClient<AssetItem[]>("/api/assets"),
        apiClient<TeamItem[]>("/api/teams"),
        apiClient<LocationItem[]>("/api/locations/all"),
      ]);
      setAssets(assetData || []);
      setTeams(teamData || []);
      setLocations(locationData || []);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCode.trim() || !newName.trim() || !newLocation) return;
    setIsAdding(true);
    try {
      const created = await apiClient<AssetItem>("/api/admin/assets", {
        method: "POST",
        body: JSON.stringify({
          asset_code: newCode.trim().toUpperCase(),
          name: newName.trim(),
          asset_type: newType.trim() || null,
          location_code: newLocation,
          default_team_id: newDefaultTeamId ? Number(newDefaultTeamId) : null,
          is_active: true,
        }),
      });
      setAssets((prev) => [...prev.filter((asset) => asset.id !== created.id), created]);
      setNewCode("");
      setNewName("");
      setNewType("");
      setNewDefaultTeamId("");
      await loadReference(true);
      haptics.success();
      await modalDialog.success(t("admin.asset_add_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.asset_add_error"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleOpenEdit = (asset: AssetItem) => {
    setEditingAssetId(asset.id);
    setEditCode(asset.asset_code);
    setEditName(asset.name);
    setEditType(asset.asset_type || "");
    setEditLocation(asset.location_code);
    setEditDefaultTeamId(asset.default_team_id ? String(asset.default_team_id) : "");
  };

  const handleSaveAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingAssetId == null || !editCode.trim() || !editName.trim() || !editLocation) return;
    setIsSaving(true);
    try {
      const updated = await apiClient<AssetItem>(`/api/admin/assets/${editingAssetId}`, {
        method: "PUT",
        body: JSON.stringify({
          asset_code: editCode.trim().toUpperCase(),
          name: editName.trim(),
          asset_type: editType.trim() || null,
          location_code: editLocation,
          default_team_id: editDefaultTeamId ? Number(editDefaultTeamId) : null,
        }),
      });
      setAssets((prev) =>
        prev.map((asset) => (asset.id === updated.id ? { ...asset, ...updated } : asset)),
      );
      setEditingAssetId(null);
      await loadReference(true);
      haptics.success();
      await modalDialog.success(t("admin.asset_update_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.asset_update_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (asset: AssetItem) => {
    try {
      const updated = await apiClient<AssetItem>(`/api/admin/assets/${asset.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !asset.is_active }),
      });
      setAssets((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      await loadReference(true);
      haptics.success();
      await modalDialog.success(t("admin.location_status_updated"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.location_status_error"));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 pb-20 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <PageContainer className="pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goBack("/")}
            className="min-h-[40px] rounded-xl px-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← {t("common.back")}
          </button>
          <h1 className="text-lg font-black">{t("admin.assets_page_title")}</h1>
        </div>

        {loadError && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <span>{t("app.load_error_title")}</span>
            <button
              type="button"
              onClick={loadAll}
              className="min-h-[40px] w-fit rounded-xl bg-rose-600 px-4 text-xs font-bold text-white"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        <form
          onSubmit={handleAddAsset}
          className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold">
              <span>{t("admin.asset_code_label")}</span>
              <input
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                placeholder={t("admin.asset_code_placeholder")}
                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="space-y-1 text-xs font-bold">
              <span>{t("admin.asset_name_label")}</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t("admin.asset_name_placeholder")}
                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="space-y-1 text-xs font-bold">
              <span>{t("admin.asset_type_label")}</span>
              <input
                value={newType}
                onChange={(event) => setNewType(event.target.value)}
                placeholder={t("admin.asset_type_placeholder")}
                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="space-y-1 text-xs font-bold">
              <span>{t("admin.asset_location_label")}</span>
              <select
                value={newLocation}
                onChange={(event) => setNewLocation(event.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">{t("issue.location_select")}</option>
                {locations.map((location) => (
                  <option key={location.code} value={location.code}>
                    [{location.code}] {resolveLocationName(location, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold">
              <span>{t("admin.asset_default_team_label")}</span>
              <select
                value={newDefaultTeamId}
                onChange={(event) => setNewDefaultTeamId(event.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">{t("admin.no_default_team")}</option>
                {teams
                  .filter((team) => team.is_active)
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} ({team.code})
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={isAdding}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {isAdding ? t("admin.adding_asset_btn") : t("admin.add_asset_btn")}
          </button>
        </form>

        {isLoading && <p className="text-sm text-zinc-500">{t("admin.loading_assets")}</p>}
        {!isLoading && assets.length === 0 && (
          <p className="text-sm text-zinc-500">{t("admin.empty_assets")}</p>
        )}

        <ul className="space-y-3">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {editingAssetId === asset.id ? (
                <form onSubmit={handleSaveAsset} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={editCode}
                      onChange={(event) => setEditCode(event.target.value)}
                      aria-label={t("admin.asset_code_label")}
                      className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      aria-label={t("admin.asset_name_label")}
                      className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <input
                      value={editType}
                      onChange={(event) => setEditType(event.target.value)}
                      aria-label={t("admin.asset_type_label")}
                      className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <select
                      value={editLocation}
                      onChange={(event) => setEditLocation(event.target.value)}
                      aria-label={t("admin.asset_location_label")}
                      className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      {locations.map((location) => (
                        <option key={location.code} value={location.code}>
                          [{location.code}] {resolveLocationName(location, locale)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editDefaultTeamId}
                      onChange={(event) => setEditDefaultTeamId(event.target.value)}
                      aria-label={t("admin.asset_default_team_label")}
                      className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <option value="">{t("admin.no_default_team")}</option>
                      {teams
                        .filter((team) => team.is_active)
                        .map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name} ({team.code})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="min-h-[44px] rounded-xl bg-blue-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {t("admin.save_asset_btn")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAssetId(null)}
                      className="min-h-[44px] rounded-xl bg-zinc-100 px-4 text-xs font-bold dark:bg-zinc-800"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {asset.name}{" "}
                      <span className="text-xs font-normal text-zinc-500">
                        ({asset.asset_code})
                      </span>
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      [{asset.location_code}] {asset.asset_type || ""} ·{" "}
                      {asset.default_team_id
                        ? teams.find((team) => team.id === asset.default_team_id)?.name ||
                          t("admin.asset_default_team_label")
                        : t("admin.no_default_team")}{" "}
                      · {asset.is_active ? t("admin.active_status") : t("admin.inactive_status")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(asset)}
                      className="min-h-[40px] rounded-xl border border-zinc-200 px-3 text-xs font-bold dark:border-zinc-700"
                    >
                      {t("admin.toggle_status")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(asset)}
                      className="min-h-[40px] rounded-xl border border-zinc-200 px-3 text-xs font-bold dark:border-zinc-700"
                    >
                      {t("admin.edit_location_btn")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </PageContainer>
    </div>
  );
}
