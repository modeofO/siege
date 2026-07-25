"use client";

import { useSyncExternalStore } from "react";
import { networkStore, type Network } from "./network";

/**
 * The active network, safe to render.
 *
 * Use this instead of the `NETWORK` constant anywhere the value reaches the
 * DOM. The constant resolves from localStorage on the client but always equals
 * BUILD_NETWORK on the server, so rendering it directly would mismatch on
 * hydration for any player who has switched. useSyncExternalStore takes a
 * separate server snapshot and reconciles the difference properly.
 */
export function useNetwork(): Network {
  return useSyncExternalStore(
    networkStore.subscribe,
    networkStore.getSnapshot,
    networkStore.getServerSnapshot,
  );
}
