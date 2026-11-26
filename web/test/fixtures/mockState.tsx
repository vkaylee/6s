import * as React from "react";

type Dispatcher = Record<string, unknown> & {
  useState?: (init: unknown) => [unknown, () => void];
  useEffect?: (cb: () => undefined | (() => void)) => void;
};

type ReactInternals = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H: Dispatcher | null;
  };
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: {
    ReactCurrentDispatcher?: { current: Dispatcher | null };
  };
};

function getDispatcherSlot(): {
  get: () => Dispatcher | null;
  set: (d: Dispatcher | null) => void;
} {
  const reactInternals = React as unknown as ReactInternals;
  const r19 = reactInternals.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (r19) {
    return {
      get: () => r19.H,
      set: (d) => {
        r19.H = d;
      },
    };
  }
  const r18 =
    reactInternals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?.ReactCurrentDispatcher;
  if (r18) {
    return {
      get: () => r18.current,
      set: (d) => {
        r18.current = d;
      },
    };
  }
  throw new Error("React dispatcher internals unavailable");
}

function RestoreDispatcher({
  prev,
  onRestore,
}: {
  prev: Dispatcher | null;
  onRestore: (d: Dispatcher | null) => void;
}) {
  onRestore(prev);
  return null;
}

function resolveStateValue(values: unknown[], idx: number, init: unknown): unknown {
  if (idx < values.length) {
    return values[idx];
  }
  return typeof init === "function" ? (init as () => unknown)() : init;
}

export function WithMockState({
  values,
  children,
}: {
  values: unknown[];
  children: React.ReactNode;
}) {
  const slot = getDispatcherSlot();
  const prev = slot.get();
  let idx = 0;
  slot.set({
    ...prev,
    useState: (init: unknown) => [resolveStateValue(values, idx++, init), () => {}],
  });
  return (
    <>
      {children}
      <RestoreDispatcher prev={prev} onRestore={slot.set} />
    </>
  );
}

export function WithEffectSupport({ children }: { children: React.ReactNode }) {
  const slot = getDispatcherSlot();
  const prev = slot.get();
  const origEffect = prev?.useEffect;
  let ranEffect = false;
  slot.set({
    ...prev,
    useEffect: (cb: () => undefined | (() => void)) => {
      if (!ranEffect) {
        ranEffect = true;
        cb();
      } else {
        origEffect?.(cb);
      }
    },
  });
  return (
    <>
      {children}
      <RestoreDispatcher prev={prev} onRestore={slot.set} />
    </>
  );
}

export function WithHookMocks({
  children,
  initialStates = [],
}: {
  children: React.ReactNode;
  initialStates?: unknown[];
}) {
  const slot = getDispatcherSlot();
  const prev = slot.get();
  const origEffect = prev?.useEffect;
  let idx = 0;
  let ranEffect = false;
  slot.set({
    ...prev,
    useEffect: (cb: () => undefined | (() => void)) => {
      if (!ranEffect) {
        ranEffect = true;
        cb();
      } else {
        origEffect?.(cb);
      }
    },
    useState: (init: unknown) => [resolveStateValue(initialStates, idx++, init), () => {}],
  });
  return (
    <>
      {children}
      <RestoreDispatcher prev={prev} onRestore={slot.set} />
    </>
  );
}
