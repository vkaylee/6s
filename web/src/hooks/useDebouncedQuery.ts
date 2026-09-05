import { useEffect, useRef, useState } from "react";

export interface UseDebouncedQueryOptions<T> {
  /** Delay in milliseconds before triggering the query. Default: 300ms */
  delay?: number;
  /** Minimum characters of query string required to execute queryFn. Default: 0 */
  minChars?: number;
  /** Initial query string */
  initialQuery?: string;
  /** Initial data */
  initialData?: T;
  /** Async query function with AbortSignal support */
  queryFn: (query: string, signal: AbortSignal) => Promise<T>;
  /** Callback fired on query error (excluding AbortError) */
  onError?: (err: unknown) => void;
}

export interface UseDebouncedQueryResult<T> {
  /** Current raw input text for controlled inputs */
  query: string;
  /** Update the search input text */
  setQuery: (val: string) => void;
  /** The debounced query string currently reflected in data */
  debouncedQuery: string;
  /** Query result data */
  data: T;
  /** True while debounce delay is pending or request is in-flight */
  isLoading: boolean;
  /** Last error thrown by queryFn (if any) */
  error: Error | null;
  /** Manually trigger or re-run query immediately with an optional custom string */
  refetch: (overrideQuery?: string) => Promise<void>;
  /** Cancel any active in-flight request or pending debounce timer */
  cancel: () => void;
}

/**
 * Reusable auto-query hook with configurable debounce, in-flight AbortController,
 * and minimum length threshold.
 *
 * Prevents continuous API spamming on keystrokes and eliminates out-of-order race conditions.
 */
export function useDebouncedQuery<T>({
  delay = 300,
  minChars = 0,
  initialQuery = "",
  initialData,
  queryFn,
  onError,
}: UseDebouncedQueryOptions<T>): UseDebouncedQueryResult<T> {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [data, setData] = useState<T>(initialData as T);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  const execute = async (q: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setDebouncedQuery(q);
    setError(null);

    if (q.trim().length < minChars) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await queryFnRef.current(q, controller.signal);
      if (!controller.signal.aborted) {
        setData(res);
        setIsLoading(false);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        return;
      }
      const finalErr = err instanceof Error ? err : new Error(String(err));
      setError(finalErr);
      setIsLoading(false);
      onErrorRef.current?.(finalErr);
    }
  };

  const refetch = async (overrideQuery?: string) => {
    cancel();
    await execute(overrideQuery !== undefined ? overrideQuery : query);
  };

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      cancel();
      setDebouncedQuery(query);
      return;
    }

    setIsLoading(true);
    timerRef.current = setTimeout(() => {
      execute(query);
    }, delay) as unknown as number;

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [query, delay, minChars]);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, []);

  return {
    query,
    setQuery,
    debouncedQuery,
    data,
    isLoading,
    error,
    refetch,
    cancel,
  };
}
