"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Kit } from "./types";

const POLL_MS = 1500;

export function useKit(id: string) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Kit>(`v1/kits/${id}`);

      setKit(data);
      setError(null);

      if ((data.status === "ready" || data.status === "failed") && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load kit");
    }
  }, [id]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void load();
    }, 0);

    timer.current = setInterval(() => {
      void load();
    }, POLL_MS);

    return () => {
      clearTimeout(initialLoad);

      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [load]);

  return {
    kit,
    setKit,
    error,
    reload: load,
  };
}
