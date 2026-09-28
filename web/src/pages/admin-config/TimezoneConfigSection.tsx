import { useEffect, useState } from "react";
import { apiClient } from "../../api/client.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import { haptics } from "../../utils/haptics.ts";

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface TimezoneConfigSectionProps {
  active: boolean;
  t: Translate;
}

export function TimezoneConfigSection({ active, t }: TimezoneConfigSectionProps) {
  const [factoryTimezone, setFactoryTimezone] = useState("Asia/Ho_Chi_Minh");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadTimezone();
  }, []);

  const loadTimezone = async () => {
    try {
      const data = await apiClient<{ timezone: string }>("/api/admin/settings/timezone");
      if (data?.timezone) setFactoryTimezone(data.timezone);
    } catch {
      // retain safe default
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiClient("/api/admin/settings/timezone", {
        method: "PATCH",
        body: JSON.stringify({ timezone: factoryTimezone }),
      });
      haptics.success();
      await modalDialog.success(t("admin.factory_timezone_save_success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.factory_timezone_save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  if (!active) return null;

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
          {t("admin.factory_timezone_title")}
        </h2>
        <p className="text-sm text-zinc-500 mt-1">{t("admin.factory_timezone_description")}</p>
      </div>
      <div>
        <label htmlFor="factory-timezone" className="block text-xs font-bold text-zinc-500 mb-1">
          {t("admin.factory_timezone_label")}
        </label>
        <select
          id="factory-timezone"
          value={factoryTimezone}
          onChange={(e) => setFactoryTimezone(e.target.value)}
          className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[48px] focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (UTC+07:00)</option>
          <option value="Asia/Shanghai">Asia/Shanghai (UTC+08:00)</option>
          <option value="Asia/Tokyo">Asia/Tokyo (UTC+09:00)</option>
          <option value="Europe/Berlin">Europe/Berlin</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="UTC">UTC</option>
        </select>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-800"
      >
        {isSaving ? t("admin.factory_timezone_saving") : t("common.save")}
      </button>
    </section>
  );
}
