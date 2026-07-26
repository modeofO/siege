"use client";

import { useEffect, useSyncExternalStore, type DependencyList } from "react";
import { getToriiHealthy, subscribeToriiHealth } from "./toriiSql";

/**
 * Shared polling effect: runs `fn` immediately and every `intervalMs`.
 *
 * - Skips a tick while the previous one is still in flight, so slow Torii
 *   responses never stack overlapping requests.
 * - Skips a tick while the tab is hidden, and catches up with one immediate
 *   run when it becomes visible again. A backgrounded tab was previously
 *   polling indefinitely at full rate.
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
    // Set when a tick is skipped because the tab was hidden, so returning to
    // the tab refreshes immediately instead of waiting out the interval.
    let missedWhileHidden = false;
    const alive = () => active;

    const tick = async () => {
      if (inFlight) return;
      if (typeof document !== "undefined" && document.hidden) {
        missedWhileHidden = true;
        return;
      }
      inFlight = true;
      try {
        await fn(alive);
      } finally {
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (!document.hidden && missedWhileHidden) {
        missedWhileHidden = false;
        void tick();
      }
    };

    const t = setTimeout(() => void tick(), 0);
    const i = setInterval(() => void tick(), intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearTimeout(t);
      clearInterval(i);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
}

/** True while Torii is reachable; flips after consecutive query failures. */
export function useToriiHealth(): boolean {
  return useSyncExternalStore(subscribeToriiHealth, getToriiHealthy, () => true);
}
