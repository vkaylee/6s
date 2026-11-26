import { useAuthStore } from "../../src/store/authStore.ts";
import { UserRole } from "../../src/types/index.ts";

export { WithMockState } from "./mockState.tsx";

export function resetAuthState() {
  useAuthStore.setState({
    isLoading: false,
    user: {
      id: 1,
      username: "operator_a",
      full_name: "Operator A",
      role: UserRole.LINE_LEADER,
      capabilities: ["reports:view"],
    },
    isOfflineGrace: false,
  });
}
