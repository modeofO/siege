"use client";

import { useEffect, useState } from "react";

/**
 * Current unix time in seconds, re-rendering every `intervalMs`.
 *
 * Countdowns derived from an on-chain timestamp used to advance as a side
 * effect of the 4s Torii poll. Store selectors only recompute when the store
 * changes, so anything comparing against wall-clock now needs its own tick.
 * Pick the interval from display granularity: 1s for a seconds countdown,
 * 30s for one rendered as hours and minutes.
 */
export function useNowSeconds(intervalMs: number): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // setState lives in the interval callback, not the effect body — required by
  // react-hooks/set-state-in-effect (see frontend/CLAUDE.md).
  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(i);
  }, [intervalMs]);

  return now;
}
