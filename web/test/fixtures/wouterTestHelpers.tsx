import * as React from "react";
import { useAuthStore } from "../../src/store/authStore.ts";
import { UserRole } from "../../src/types/index.ts";

export function WithMockState({
  values,
  children,
}: {
  values: unknown[];
  children: React.ReactNode;
}) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: {
          current: { useState: (init: unknown) => [unknown, () => void] };
        };
      };
    }
  ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let idx = 0;
  internals.current.useState = (init: unknown) => {
    const val =
      idx < values.length
        ? values[idx++]
        : typeof init === "function"
          ? (init as () => unknown)()
          : init;
    return [val, () => {}];
  };
  return <>{children}</>;
}

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
