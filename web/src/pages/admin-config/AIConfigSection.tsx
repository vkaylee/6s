import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client.ts";
import { invalidateAiStatus } from "../../hooks/useAiStatus.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import type { AIConfigData, AIDNSTestResponse, AITestResponse } from "../../types/index.ts";
import { haptics } from "../../utils/haptics.ts";

type Translate = (key: string, params?: Record<string, string | number>) => string;
type TestTarget = "api_key" | "default" | "translate" | "vision" | "summary";

interface AIConfigSectionProps {
  active: boolean;
  t: Translate;
}

interface AIResultBoxProps {
  result: AITestResponse;
  t: Translate;
}

function AIResultBox({ result, t }: AIResultBoxProps) {
  return (
    <div
      className={`mt-1.5 p-2 rounded-xl text-xs font-medium border ${
        result.success
          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
          : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
      }`}
    >
      {result.success
        ? t("admin.ai_test_success", {
            ms: String(result.latency_ms || 0),
            model: result.model_used || "",
          })
        : `✗ ${result.error}`}
      {result.check && <span className="block opacity-70">{result.check}</span>}
      {result.translation_checks?.map((check) => (
        <div
          key={`${check.source}-${check.target}`}
          className="mt-1 border-t border-current/10 pt-1"
        >
          <span>
            {check.success ? "✓" : "✗"} {check.source}→{check.target}
          </span>
          {check.error && <span className="block opacity-80">{check.error}</span>}
          {check.reply && (
            <span className="block font-mono break-words opacity-90">→ {check.reply}</span>
          )}
        </div>
      ))}
      {!result.translation_checks?.length && result.reply && (
        <span className="block mt-1 font-mono break-words opacity-90">→ {result.reply}</span>
      )}
    </div>
  );
}

export function AIConfigSection({ active, t }: AIConfigSectionProps) {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiHasApiKey, setAiHasApiKey] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiDefaultModel, setAiDefaultModel] = useState("");
  const [aiModelTranslate, setAiModelTranslate] = useState("");
  const [aiModelVision, setAiModelVision] = useState("");
  const [aiModelSummary, setAiModelSummary] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [testingTarget, setTestingTarget] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AITestResponse>>({});
  const [dnsTestResult, setDnsTestResult] = useState<AIDNSTestResponse | null>(null);

  const prevActiveRef = useRef(active);
  useEffect(() => {
    void loadConfig();
  }, []);
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      void loadConfig();
    }
    prevActiveRef.current = active;
  }, [active]);
  const loadConfig = async () => {
    try {
      const data = await apiClient<AIConfigData>("/api/config/ai");
      if (data) {
        setAiEnabled(data.is_enabled);
        setAiBaseUrl(data.base_url || "");
        setAiHasApiKey(data.has_api_key);
        setAiDefaultModel(data.default_model || "");
        setAiModelTranslate(data.model_translate || "");
        setAiModelVision(data.model_vision || "");
        setAiModelSummary(data.model_summary || "");
      }
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiClient("/api/config/ai", {
        method: "PUT",
        body: JSON.stringify({
          is_enabled: aiEnabled,
          base_url: aiBaseUrl,
          api_key: aiApiKey,
          default_model: aiDefaultModel,
          model_translate: aiModelTranslate,
          model_vision: aiModelVision,
          model_summary: aiModelSummary,
        }),
      });
      haptics.success();
      invalidateAiStatus();
      setAiApiKey("");
      await loadConfig();
      await modalDialog.success(t("admin.save_ai_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.save_ai_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAI = async (target: TestTarget) => {
    setTestingTarget(target);
    try {
      let model = "";
      if (target === "default") model = aiDefaultModel;
      else if (target === "translate") model = aiModelTranslate;
      else if (target === "vision") model = aiModelVision;
      else if (target === "summary") model = aiModelSummary;

      const res = await apiClient<AITestResponse>("/api/config/ai/test", {
        method: "POST",
        body: JSON.stringify({
          base_url: aiBaseUrl,
          api_key: aiApiKey,
          model,
          purpose: target === "api_key" ? "default" : target,
        }),
      });
      setTestResults((prev) => ({ ...prev, [target]: res }));
      res.success ? haptics.success() : haptics.errorOrConflict();
    } catch (err: unknown) {
      haptics.errorOrConflict();
      const msg = err instanceof Error ? err.message : t("admin.ai_test_error");
      setTestResults((prev) => ({ ...prev, [target]: { success: false, error: msg } }));
    } finally {
      setTestingTarget(null);
    }
  };

  const handleTestDNS = async () => {
    setTestingTarget("dns");
    try {
      const res = await apiClient<AIDNSTestResponse>("/api/config/ai/test-dns", {
        method: "POST",
        body: JSON.stringify({ base_url: aiBaseUrl }),
      });
      setDnsTestResult(res);
      res.success ? haptics.success() : haptics.errorOrConflict();
    } catch (err: unknown) {
      haptics.errorOrConflict();
      const msg = err instanceof Error ? err.message : t("admin.ai_dns_test_error");
      setDnsTestResult({ success: false, error: msg });
    } finally {
      setTestingTarget(null);
    }
  };

  const modelField = (
    target: "default" | "translate" | "vision" | "summary",
    label: string,
    value: string,
    placeholder: string,
    setValue: (value: string) => void,
  ) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="block text-xs font-bold uppercase text-zinc-500">{t(label)}</span>
        <button
          type="button"
          onClick={() => handleTestAI(target)}
          disabled={testingTarget !== null}
          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
        >
          {testingTarget === target ? t("admin.ai_testing") : t("admin.ai_test_btn")}
        </button>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(placeholder)}
        className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
      />
      {testResults[target] && <AIResultBox result={testResults[target]} t={t} />}
    </div>
  );

  if (!active) return null;

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
      <label className="flex items-center space-x-2 cursor-pointer border-b pb-3 dark:border-zinc-800">
        <input
          type="checkbox"
          checked={aiEnabled}
          onChange={(e) => setAiEnabled(e.target.checked)}
          className="rounded text-blue-600 focus:ring-blue-500 w-5 h-5"
        />
        <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
          {t("admin.ai_enable_label")}
        </span>
      </label>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="block text-xs font-bold uppercase text-zinc-500">
            {t("admin.ai_base_url_label")}
          </span>
          <button
            type="button"
            onClick={handleTestDNS}
            disabled={testingTarget !== null}
            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
          >
            {testingTarget === "dns" ? t("admin.ai_testing") : t("admin.ai_test_dns_btn")}
          </button>
        </div>
        <input
          type="text"
          value={aiBaseUrl}
          onChange={(e) => setAiBaseUrl(e.target.value)}
          placeholder={t("admin.ai_base_url_placeholder")}
          className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        />
        {dnsTestResult && (
          <div
            className={`mt-1.5 p-2 rounded-xl text-xs font-medium border ${
              dnsTestResult.success
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
            }`}
          >
            {dnsTestResult.success
              ? t("admin.ai_dns_test_success", {
                  host: dnsTestResult.host || "",
                  ips: dnsTestResult.ips?.join(", ") || "",
                  ms: String(dnsTestResult.latency_ms || 0),
                })
              : `✗ ${dnsTestResult.error}`}
          </div>
        )}
      </div>

      <div>
        <span className="block text-xs font-bold uppercase text-zinc-500 mb-1">
          {t("admin.ai_api_key_label")}
        </span>
        <input
          type="password"
          value={aiApiKey}
          onChange={(e) => setAiApiKey(e.target.value)}
          placeholder={t("admin.ai_api_key_placeholder")}
          className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center justify-between mt-1.5">
          <div>
            {aiHasApiKey && !aiApiKey && (
              <p className="text-xs text-emerald-600 font-bold">{t("admin.has_api_key_hint")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleTestAI("api_key")}
            disabled={testingTarget !== null}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 transition-colors"
          >
            {testingTarget === "api_key" ? t("admin.ai_testing") : t("admin.ai_test_key_btn")}
          </button>
        </div>
        {testResults.api_key && (
          <div className="mt-2">
            <AIResultBox result={testResults.api_key} t={t} />
          </div>
        )}
      </div>

      {modelField(
        "default",
        "admin.ai_default_model_label",
        aiDefaultModel,
        "admin.ai_default_model_placeholder",
        setAiDefaultModel,
      )}
      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
        <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider">
          {t("admin.ai_specialized_models_title")}
        </h3>
        {modelField(
          "translate",
          "admin.ai_model_translate_label",
          aiModelTranslate,
          "admin.ai_model_translate_placeholder",
          setAiModelTranslate,
        )}
        {modelField(
          "vision",
          "admin.ai_model_vision_label",
          aiModelVision,
          "admin.ai_model_vision_placeholder",
          setAiModelVision,
        )}
        {modelField(
          "summary",
          "admin.ai_model_summary_label",
          aiModelSummary,
          "admin.ai_model_summary_placeholder",
          setAiModelSummary,
        )}
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl min-h-[56px] shadow-lg shadow-blue-600/30 transition-transform active:scale-[0.98] mt-2"
        >
          {isSaving ? t("admin.saving_btn") : t("admin.save_config_btn")}
        </button>
      </div>
    </section>
  );
}
