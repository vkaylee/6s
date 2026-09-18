import { create } from "zustand";
import { apiClient } from "../api/client.ts";
import type { AssetItem, TeamItem, TeamMemberItem } from "../types/index.ts";

export type MasterdataStatus = "idle" | "loading" | "ready" | "error";

interface MasterdataState {
  assets: AssetItem[];
  teams: TeamItem[];
  membersByTeam: Record<number, TeamMemberItem[]>;
  membersStatusByTeam: Record<number, MasterdataStatus>;
  status: MasterdataStatus;
  /** Reference data shared by the responsibility pickers, dashboard filters and detail views. */
  loadReference: (force?: boolean) => Promise<void>;
  /** Active members of a team; served by the assign-capable lookup endpoint. */
  loadMembers: (teamId: number, force?: boolean) => Promise<void>;
}

export const useMasterdataStore = create<MasterdataState>((set, get) => ({
  assets: [],
  teams: [],
  membersByTeam: {},
  membersStatusByTeam: {},
  status: "idle",

  loadReference: async (force = false) => {
    const { status } = get();
    if (!force && (status === "loading" || status === "ready")) return;
    set({ status: "loading" });
    try {
      const [assets, teams] = await Promise.all([
        apiClient<AssetItem[]>("/api/assets"),
        apiClient<TeamItem[]>("/api/teams"),
      ]);
      set({ assets: assets || [], teams: teams || [], status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },

  loadMembers: async (teamId, force = false) => {
    if (!Number.isFinite(teamId) || teamId <= 0) return;
    const { membersStatusByTeam } = get();
    const current = membersStatusByTeam[teamId];
    if (!force && (current === "loading" || current === "ready")) return;
    set((state) => ({
      membersStatusByTeam: { ...state.membersStatusByTeam, [teamId]: "loading" },
    }));
    try {
      const members = await apiClient<TeamMemberItem[]>(`/api/teams/${teamId}/members`);
      set((state) => ({
        membersByTeam: { ...state.membersByTeam, [teamId]: members || [] },
        membersStatusByTeam: { ...state.membersStatusByTeam, [teamId]: "ready" },
      }));
    } catch {
      set((state) => ({
        membersStatusByTeam: { ...state.membersStatusByTeam, [teamId]: "error" },
      }));
    }
  },
}));
