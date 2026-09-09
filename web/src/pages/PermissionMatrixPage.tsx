import { useEffect, useState } from "react";
import { ApiError, apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { useHeaderVisibility } from "../hooks/useHeaderVisibility.ts";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { UserRole } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";

interface PermissionItem {
  code: string;
  description: string;
}

interface RolePermissions {
  role: string;
  permissions: string[];
}

// ADMIN must retain management safeguards; SUPERADMIN is immutable and always effective.
const LOCKED_ADMIN: Record<string, true> = { "user:manage": true, "permission:manage": true };

function eqSet(a: string[] | undefined, b: string[]): boolean {
  const ka = [...new Set(a ?? [])].sort().join("\u0000");
  const kb = [...new Set(b)].sort().join("\u0000");
  return ka === kb;
}

// State order: [permissions, matrix, drafts, isLoading, loadError, savingRole]
export function PermissionMatrixPage() {
  useHeaderVisibility();
  const { t } = useI18nStore();
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [matrix, setMatrix] = useState<RolePermissions[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient<{
        permissions: PermissionItem[];
        roles: RolePermissions[];
      }>("/api/admin/permissions");
      const roles = data?.roles ?? [];
      setPermissions(data?.permissions ?? []);
      setMatrix(roles);
      setDrafts(Object.fromEntries(roles.map((r) => [r.role, r.permissions])));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("admin.permissions_load_error"));
    } finally {
      setIsLoading(false);
    }
  };

  const toggle = (role: string, code: string) => {
    setDrafts((prev) => {
      const cur = prev[role] ?? [];
      const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
      return { ...prev, [role]: next };
    });
  };

  const dirtyRoles = matrix.filter((m) => !eqSet(drafts[m.role], m.permissions));

  const resetDrafts = () => {
    setDrafts(Object.fromEntries(matrix.map((m) => [m.role, m.permissions])));
  };

  const saveAll = async () => {
    if (dirtyRoles.length === 0 || savingRole) return;
    const confirmed = await modalDialog.confirm(
      t("admin.permissions_save_confirm", { count: dirtyRoles.length }),
    );
    if (!confirmed) return;
    for (const m of dirtyRoles) {
      setSavingRole(m.role);
      try {
        const perms = drafts[m.role] ?? [];
        const payload =
          m.role === UserRole.ADMIN
            ? Array.from(new Set([...perms, ...Object.keys(LOCKED_ADMIN)]))
            : perms;
        const updated = await apiClient<RolePermissions>(`/api/admin/roles/${m.role}/permissions`, {
          method: "PUT",
          body: JSON.stringify({ permissions: payload }),
        });
        setMatrix((prev) =>
          prev.map((x) =>
            x.role === updated.role ? { ...x, permissions: updated.permissions } : x,
          ),
        );
        setDrafts((prev) => ({ ...prev, [m.role]: updated.permissions }));
        haptics.success();
      } catch (err) {
        haptics.errorOrConflict();
        modalDialog.alert(
          err instanceof ApiError ? err.message : t("admin.permissions_update_error"),
        );
        return; // stop on first failure; remaining drafts stay dirty
      } finally {
        setSavingRole(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      {/* Page Heading */}
      <PageContainer className="pt-4 pb-2">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => goBack()}
            aria-label={t("common.back")}
            className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 min-h-[44px] min-w-[44px]"
          >
            ←
          </button>
          <h1 className="text-base font-black">{t("admin.permissions_tab")}</h1>
        </div>
      </PageContainer>

      <PageContainer>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 px-1 mt-2">
          {t("admin.permissions_subtitle")}
        </p>

        <section aria-live="polite" aria-busy={isLoading || savingRole !== null} className="mt-3">
          {isLoading ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 animate-pulse"
                >
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-2/3" />
                </div>
              ))}
              <span className="sr-only">{t("common.loading")}</span>
            </div>
          ) : loadError ? (
            <div className="space-y-3">
              <div
                role="alert"
                className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-2xl p-4 text-sm font-bold"
              >
                ⚠️ {loadError}
              </div>
              <button
                type="button"
                onClick={loadPermissions}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-blue-800"
              >
                🔄 {t("common.retry")}
              </button>
            </div>
          ) : permissions.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-400 text-center">
              {t("admin.permissions_empty")}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">{t("admin.permissions_subtitle")}</caption>
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th
                        scope="col"
                        className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase"
                      >
                        {t("admin.permissions_permission_col")}
                      </th>
                      {matrix.map((m) => (
                        <th
                          key={m.role}
                          scope="col"
                          className="px-2 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-200 whitespace-nowrap"
                        >
                          {m.role}
                          {dirtyRoles.some((d) => d.role === m.role) && (
                            <span
                              className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle"
                              aria-hidden="true"
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {permissions.map((p) => (
                      <tr key={p.code}>
                        <th scope="row" className="text-left px-4 py-3 font-normal">
                          <div className="font-mono text-xs font-bold">{p.code}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {p.description}
                          </div>
                        </th>
                        {matrix.map((m) => {
                          const locked =
                            m.role === UserRole.SUPERADMIN ||
                            (m.role === UserRole.ADMIN && LOCKED_ADMIN[p.code] === true);
                          return (
                            <td key={m.role} className="text-center px-2 py-3">
                              <input
                                type="checkbox"
                                checked={(drafts[m.role] ?? []).includes(p.code)}
                                disabled={locked || savingRole !== null}
                                aria-label={`${m.role} • ${p.code}`}
                                onChange={() => toggle(m.role, p.code)}
                                title={
                                  locked
                                    ? m.role === UserRole.SUPERADMIN
                                      ? t("admin.permissions_superadmin_locked_hint")
                                      : t("admin.permissions_locked_hint", {
                                          role: m.role,
                                          code: p.code,
                                        })
                                    : undefined
                                }
                                className="h-5 w-5 accent-blue-600 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-600"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={resetDrafts}
                  disabled={dirtyRoles.length === 0 || savingRole !== null}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-3 px-4 rounded-xl min-h-[48px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {t("admin.permissions_reset")}
                </button>
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={dirtyRoles.length === 0 || savingRole !== null}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-800"
                >
                  {savingRole ? t("admin.users_saving") : t("common.save")}
                </button>
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-2 min-h-[16px]">
                {savingRole
                  ? `${savingRole}: ${t("admin.users_saving")}`
                  : dirtyRoles.length > 0
                    ? t("admin.permissions_dirty_hint", { count: dirtyRoles.length })
                    : ""}
              </p>
            </>
          )}
        </section>
      </PageContainer>
    </div>
  );
}
