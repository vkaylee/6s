import { Users } from "lucide-react";
import type * as React from "react";
import { useI18nStore } from "../../i18n/index.ts";
import type { TeamItem } from "../../types/index.ts";

interface TeamCardProps {
  team: TeamItem;
  isEditing: boolean;
  editCode: string;
  editName: string;
  isSaving: boolean;
  isExpanded: boolean;
  isLoadingMembers: boolean;
  onEditCodeChange: (code: string) => void;
  onEditNameChange: (name: string) => void;
  onSaveTeam: (event: React.FormEvent) => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  children?: React.ReactNode;
}

export function TeamCard({
  team,
  isEditing,
  editCode,
  editName,
  isSaving,
  isExpanded,
  isLoadingMembers,
  onEditCodeChange,
  onEditNameChange,
  onSaveTeam,
  onCancelEdit,
  onStartEdit,
  onToggleExpand,
  onToggleActive,
  children,
}: TeamCardProps) {
  const { t } = useI18nStore();

  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {isEditing ? (
        <form onSubmit={onSaveTeam} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={editCode}
              onChange={(event) => onEditCodeChange(event.target.value)}
              aria-label={t("admin.team_code_label")}
              className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              value={editName}
              onChange={(event) => onEditNameChange(event.target.value)}
              aria-label={t("admin.team_name_label")}
              className="min-h-[44px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-[44px] rounded-xl bg-blue-600 px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {t("admin.save_team_btn")}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="min-h-[44px] rounded-xl bg-zinc-100 px-4 text-xs font-bold dark:bg-zinc-800"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">
                {team.name} <span className="text-xs font-normal text-zinc-500">({team.code})</span>
              </p>
              <p className="text-[11px] font-bold text-zinc-500">
                {team.is_active ? t("admin.active_status") : t("admin.inactive_status")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onToggleExpand}
                aria-expanded={isExpanded}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-xs font-bold dark:border-zinc-700"
              >
                <Users className="h-3.5 w-3.5" />
                {t("admin.team_members_title")}
              </button>
              <button
                type="button"
                onClick={onToggleActive}
                className="min-h-[40px] rounded-xl border border-zinc-200 px-3 text-xs font-bold dark:border-zinc-700"
              >
                {t("admin.toggle_status")}
              </button>
              <button
                type="button"
                onClick={onStartEdit}
                className="min-h-[40px] rounded-xl border border-zinc-200 px-3 text-xs font-bold dark:border-zinc-700"
              >
                {t("admin.edit_location_btn")}
              </button>
            </div>
          </div>

          {isExpanded && (
            <div
              className="mt-3 space-y-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"
              aria-busy={isLoadingMembers}
            >
              {children}
            </div>
          )}
        </>
      )}
    </li>
  );
}
