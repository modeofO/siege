"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { BattlefieldVariant } from "@/components/battlefield3d/variants";

// Player-facing war-table art-direction choice, persisted per browser.
// useSyncExternalStore keeps the read SSR-safe (server snapshot is the warm
// default) and avoids setState-in-effect hydration dances.

const STORAGE_KEY = "siege:battlefield-variant";
// localStorage `storage` events only fire in OTHER tabs; this custom event
// notifies subscribers in the tab that made the change.
const CHANGE_EVENT = "siege:battlefield-variant-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): BattlefieldVariant {
  return localStorage.getItem(STORAGE_KEY) === "holo" ? "holo" : "warm";
}

function getServerSnapshot(): BattlefieldVariant {
  return "warm";
}

export function useBattlefieldVariant(): [BattlefieldVariant, (v: BattlefieldVariant) => void] {
  const variant = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setVariant = useCallback((v: BattlefieldVariant) => {
    localStorage.setItem(STORAGE_KEY, v);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [variant, setVariant];
}
