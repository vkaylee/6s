import { useEffect, useState } from "react";
import { apiClient } from "../../api/client.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import { haptics } from "../../utils/haptics.ts";

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface ScoringConfigSectionProps {
  active: boolean;
  t: Translate;
}

interface ScoringRuleItem {
  rule_key: string;
  points: number;
  description: string;
}

const DEFAULT_SCORING_RULES: Record<string, number> = {
  base_weekly_score: 100,
  penalty_normal: -2,
  penalty_safety: -10,
  penalty_overdue: -5,
  penalty_reopen: -2,
  bonus_kaizen: 1,
  reward_reporter_normal: 2,
  reward_reporter_safety: 5,
  penalty_reporter_invalid: -5,
};

export function ScoringConfigSection({ active, t }: ScoringConfigSectionProps) {
  const [rules, setRules] = useState<Record<string, number>>(DEFAULT_SCORING_RULES);
  const [applyFrom, setApplyFrom] = useState("");
  const [reason, setReason] = useState("");
  const [isRetroactive, setIsRetroactive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadScoringRules();
  }, []);

  const loadScoringRules = async () => {
    try {
      const data = await apiClient<ScoringRuleItem[]>("/api/config/scoring");
      const map: Record<string, number> = {};
      for (const item of data) {
        map[item.rule_key] = item.points;
      }
      setRules(map);
    } catch {
      setRules({
        penalty_normal: -3,
        penalty_safety: -20,
        penalty_overdue: -5,
        bonus_kaizen: 10,
        reward_reporter_normal: 2,
        reward_reporter_safety: 5,
        penalty_reporter_invalid: -5,
      });
    }
  };

  const handleStepPoint = (ruleKey: string, delta: number) => {
    haptics.success();
    setRules((prev) => ({
      ...prev,
      [ruleKey]: (prev[ruleKey] ?? 0) + delta,
    }));
  };

  const handleSave = async () => {
    if (isRetroactive && (!applyFrom || !reason.trim())) {
      modalDialog.alert(t("admin.retroactive_required"));
      return;
    }

    setIsSaving(true);
    try {
      await apiClient("/api/config/scoring", {
        method: "PUT",
        body: JSON.stringify({
          rules,
          is_retroactive: isRetroactive,
          apply_from: isRetroactive ? applyFrom : undefined,
          reason: isRetroactive ? reason : undefined,
        }),
      });
      haptics.success();
      await modalDialog.success(t("admin.save_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  if (!active) return null;

  return (
    <div className="space-y-4">
      <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
        <p className="text-xs text-zinc-500">{t("admin.stepper_hint")}</p>

        {Object.keys(rules).map((ruleKey) => (
          <div
            key={ruleKey}
            className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 min-h-[56px]"
          >
            <div>
              <div className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
                {t(`admin.scoring_rule_${ruleKey}`)}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleStepPoint(ruleKey, -1)}
                className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-black text-lg flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-600 min-h-[44px] min-w-[44px]"
              >
                -
              </button>
              <span className="w-12 text-center font-black text-base font-mono">
                {rules[ruleKey] > 0 ? `+${rules[ruleKey]}` : rules[ruleKey]}
              </span>
              <button
                type="button"
                onClick={() => handleStepPoint(ruleKey, 1)}
                className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-black text-lg flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-600 min-h-[44px] min-w-[44px]"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-3xl p-5 space-y-3">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRetroactive}
            onChange={(e) => setIsRetroactive(e.target.checked)}
            className="w-5 h-5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
          />
          <span className="font-bold text-sm text-amber-900 dark:text-amber-200">
            {t("admin.retroactive_label")}
          </span>
        </label>

        {isRetroactive && (
          <div className="space-y-3 pt-2">
            <div>
              <span className="block text-xs font-bold text-zinc-500 mb-1">
                {t("admin.apply_from_label")}
              </span>
              <input
                type="date"
                value={applyFrom}
                onChange={(e) => setApplyFrom(e.target.value)}
                className="w-full p-2.5 rounded-xl border bg-white dark:bg-zinc-800 text-sm"
              />
            </div>
            <div>
              <span className="block text-xs font-bold text-zinc-500 mb-1">
                {t("admin.reason_label")}
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("admin.reason_placeholder")}
                className="w-full p-2.5 rounded-xl border bg-white dark:bg-zinc-800 text-sm"
              />
            </div>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl min-h-[56px] shadow-lg shadow-blue-600/30 transition-transform active:scale-[0.98]"
      >
        {isSaving ? t("admin.saving_btn") : t("admin.save_config_btn")}
      </button>
    </div>
  );
}
