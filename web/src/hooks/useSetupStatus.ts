import { useEffect, useState } from "react";
import { apiClient } from "../api/client.ts";

export interface SetupStatusState {
  isSetupOpen: boolean;
  setIsSetupOpen: (open: boolean) => void;
}

export function useSetupStatus(): SetupStatusState {
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  useEffect(() => {
    apiClient<{ needs_setup: boolean }>("/api/auth/setup-status", { skipAuth: true })
      .then((response) => {
        if (response?.needs_setup) setIsSetupOpen(true);
      })
      .catch(() => {
        // ignore offline or failed status checks
      });
  }, []);

  return { isSetupOpen, setIsSetupOpen };
}
