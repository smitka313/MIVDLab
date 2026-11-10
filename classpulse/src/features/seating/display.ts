"use client";

import * as React from "react";
import { DEFAULT_DISPLAY, type ChartDisplay } from "./seating-chart";

/** Seating-chart display options. A per-device convenience, kept in localStorage. */
const KEY = "classpulse.chartDisplay";
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: ChartDisplay } | null = null;

function read(): ChartDisplay {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    /* unavailable */
  }
  if (cached && cached.raw === raw) return cached.value;
  let value = DEFAULT_DISPLAY;
  try {
    if (raw) value = { ...DEFAULT_DISPLAY, ...(JSON.parse(raw) as Partial<ChartDisplay>) };
  } catch {
    /* ignore bad value */
  }
  cached = { raw, value };
  return value;
}

export function useChartDisplay() {
  const value = React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => DEFAULT_DISPLAY,
  );
  const update = React.useCallback((patch: Partial<ChartDisplay>) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
    } catch {
      /* unavailable: ignore */
    }
    listeners.forEach((l) => l());
  }, []);
  return [value, update] as const;
}
