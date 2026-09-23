import { useEffect, useState } from "react";
import { getSetupStatus } from "../api/generated/index.ts";

export interface SetupStatusState {
  isSetupOpen: boolean;
  setIsSetupOpen: (open: boolean) => void;
}

export function useSetupStatus(): SetupStatusState {
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  useEffect(() => {
    getSetupStatus({
      headers: { "X-Skip-Auth": "true" },
      throwOnError: true,
    })
      .then((res) => {
        const payload = res.data as { data?: { needs_setup?: boolean }; needs_setup?: boolean };
        if ((payload.data?.needs_setup ?? payload.needs_setup) === true) {
          setIsSetupOpen(true);
        }
      })
      .catch(() => {
        // ignore offline or failed status checks
      });
  }, []);

  return { isSetupOpen, setIsSetupOpen };
}
