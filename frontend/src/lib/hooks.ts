import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError } from "./errors";
import type { ApiError } from "./types";

/** Fetch-on-mount with manual refresh and typed errors. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const alive = useRef(true);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loader();
      if (alive.current) {
        setData(result);
        setError(null);
      }
    } catch (caught) {
      if (alive.current) setError(toApiError(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    void run();
    return () => {
      alive.current = false;
    };
  }, [run]);

  return { data, loading, error, refresh: run, setData };
}

/** Poll while `active` is true. Used for ingestion progress. */
export function usePolling(callback: () => void, intervalMs: number, active: boolean) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => saved.current(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
}

export function useHotkey(combo: { key: string; meta?: boolean; shift?: boolean }, handler: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const metaMatch = combo.meta ? event.metaKey || event.ctrlKey : true;
      const shiftMatch = combo.shift ? event.shiftKey : true;
      if (event.key.toLowerCase() === combo.key.toLowerCase() && metaMatch && shiftMatch) {
        event.preventDefault();
        handler();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [combo.key, combo.meta, combo.shift, handler]);
}
