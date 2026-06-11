"use client";

import { useEffect, useSyncExternalStore, type DependencyList } from "react";
import { getToriiHealthy, subscribeToriiHealth } from "./toriiSql";

/**
 * Shared polling effect: runs `fn` immediately and every `intervalMs`.
 *
 * - Skips a tick while the previous one is still in flight, so slow Torii
 *   responses never stack overlapping requests.
 * - Passes an `alive()` accessor; callers must check it before setState to
 *   avoid writing state after unmount or after deps changed (which also
 *   guards against out-of-order responses clobbering fresh data).
 */
export function usePoll(
  fn: (alive: () => boolean) => Promise<void>,
  intervalMs: number,
  deps: DependencyList,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let inFlight = false;
    const alive = () => active;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await fn(alive);
      } finally {
        inFlight = false;
      }
    };

    const t = setTimeout(() => void tick(), 0);
    const i = setInterval(() => void tick(), intervalMs);
    return () => {
      active = false;
      clearTimeout(t);
      clearInterval(i);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
}

/** True while Torii is reachable; flips after consecutive query failures. */
export function useToriiHealth(): boolean {
  return useSyncExternalStore(subscribeToriiHealth, getToriiHealthy, () => true);
}
