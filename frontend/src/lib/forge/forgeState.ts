import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import type { AccountInterface } from "starknet";
import {
  type CircuitKey,
  type ComponentKind,
  type CosmeticType,
  CIRCUITS,
} from "./circuits";
import { checkTopology, type PlacedComponent } from "./topology";
import { setCosmetic } from "../cosmetics";

export type ForgeView = "forge" | "celebration" | "gallery" | "profile";

interface PersistedState {
  forgedCircuits: CircuitKey[];
  equippedCosmetics: {
    banner: CircuitKey | null;
    parcelSkin: CircuitKey | null;
    holdDecoration: CircuitKey | null;
  };
  componentInventory: Record<ComponentKind, number>;
}

const STORAGE_KEY = "siege:forgeState";

const EMPTY_INVENTORY: Record<ComponentKind, number> = {
  "origin-crystal": 0,
  "void-drain": 0,
  "rune-stone": 0,
  "flux-well": 0,
  "spiral-coil": 0,
  "one-way-valve": 0,
};

const DEFAULT_PERSISTED: PersistedState = {
  forgedCircuits: [],
  equippedCosmetics: { banner: null, parcelSkin: null, holdDecoration: null },
  componentInventory: { ...EMPTY_INVENTORY },
};

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERSISTED;
    const parsed = JSON.parse(raw);
    return {
      forgedCircuits: Array.isArray(parsed.forgedCircuits)
        ? parsed.forgedCircuits
        : [],
      equippedCosmetics: {
        banner: parsed.equippedCosmetics?.banner ?? null,
        parcelSkin: parsed.equippedCosmetics?.parcelSkin ?? null,
        holdDecoration: parsed.equippedCosmetics?.holdDecoration ?? null,
      },
      componentInventory: {
        ...EMPTY_INVENTORY,
        ...(parsed.componentInventory ?? {}),
      },
    };
  } catch {
    return DEFAULT_PERSISTED;
  }
}

function savePersisted(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be full or unavailable
  }
}

// Module-level store over localStorage, consumed via useSyncExternalStore:
// the server snapshot is DEFAULT_PERSISTED (so SSR/hydration match), and React
// re-renders with the real localStorage state right after hydration — replacing
// the old load-in-a-mount-effect pattern.
let persistedCache: PersistedState | null = null;
const persistedListeners = new Set<() => void>();

function subscribePersisted(listener: () => void): () => void {
  persistedListeners.add(listener);
  return () => {
    persistedListeners.delete(listener);
  };
}

function readPersisted(): PersistedState {
  if (persistedCache === null) persistedCache = loadPersisted();
  return persistedCache;
}

function readServerPersisted(): PersistedState {
  return DEFAULT_PERSISTED;
}

function writePersisted(next: PersistedState) {
  persistedCache = next;
  savePersisted(next);
  for (const listener of persistedListeners) listener();
}

export function useForgeState(account?: AccountInterface) {
  const [currentView, setCurrentView] = useState<ForgeView>("forge");
  const [activeCircuit, setActiveCircuitRaw] = useState<CircuitKey>("half-wave-rectifier");
  const [placedComponents, setPlacedComponents] = useState<
    Record<string, PlacedComponent>
  >({});
  const [isLit, setIsLit] = useState(false);
  const persisted = useSyncExternalStore(subscribePersisted, readPersisted, readServerPersisted);
  const [equipError, setEquipError] = useState<string | null>(null);
  // Session inventory is derived: persisted counts plus this session's delta
  // (placements subtract, removals add back, confirmForge cancels against the
  // persisted decrement). Deriving keeps it in lockstep with the store without
  // a seeding effect.
  const [inventoryDelta, setInventoryDelta] = useState<Record<ComponentKind, number>>(
    () => ({ ...EMPTY_INVENTORY }),
  );
  const sessionInventory = useMemo(() => {
    const out = { ...EMPTY_INVENTORY };
    for (const kind of Object.keys(EMPTY_INVENTORY) as ComponentKind[]) {
      out[kind] = Math.max(0, persisted.componentInventory[kind] + inventoryDelta[kind]);
    }
    return out;
  }, [persisted.componentInventory, inventoryDelta]);

  const persist = writePersisted;

  const circuit = CIRCUITS[activeCircuit];

  const placeComponent = useCallback(
    (instanceId: string, kind: ComponentKind, col: number, row: number) => {
      const isNew = !(instanceId in placedComponents);
      setPlacedComponents((prev) => {
        const next = { ...prev, [instanceId]: { col, row, kind } };
        setIsLit(checkTopology(next, circuit));
        return next;
      });
      if (isNew) {
        setInventoryDelta((d) => ({ ...d, [kind]: d[kind] - 1 }));
      }
    },
    [circuit, placedComponents],
  );

  const removeComponent = useCallback((instanceId: string) => {
    const comp = placedComponents[instanceId];
    if (!comp) return;
    setPlacedComponents((prev) => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
    setInventoryDelta((d) => ({ ...d, [comp.kind]: d[comp.kind] + 1 }));
    setIsLit(false);
  }, [placedComponents]);

  const selectCircuit = useCallback((key: CircuitKey) => {
    setActiveCircuitRaw(key);
    setPlacedComponents({});
    setIsLit(false);
    setInventoryDelta({ ...EMPTY_INVENTORY });
    setCurrentView("forge");
  }, []);

  const confirmForge = useCallback(() => {
    if (!isLit) return;
    const usedParts: Partial<Record<ComponentKind, number>> = {};
    for (const comp of Object.values(placedComponents)) {
      usedParts[comp.kind] = (usedParts[comp.kind] ?? 0) + 1;
    }

    const newInventory = { ...persisted.componentInventory };
    for (const [kind, count] of Object.entries(usedParts)) {
      const k = kind as ComponentKind;
      newInventory[k] = Math.max(0, newInventory[k] - count);
    }

    const next: PersistedState = {
      ...persisted,
      forgedCircuits: persisted.forgedCircuits.includes(activeCircuit)
        ? persisted.forgedCircuits
        : [...persisted.forgedCircuits, activeCircuit],
      componentInventory: newInventory,
    };
    persist(next);
    // The forge consumed the placed parts from persisted; cancel them in the
    // delta so the on-screen session counts don't drop twice.
    setInventoryDelta((d) => {
      const out = { ...d };
      for (const [kind, count] of Object.entries(usedParts)) {
        const k = kind as ComponentKind;
        out[k] = out[k] + (count ?? 0);
      }
      return out;
    });
    setCurrentView("celebration");
  }, [isLit, persisted, activeCircuit, placedComponents, persist]);

  const equipCosmetic = useCallback(
    async (circuitKey: CircuitKey) => {
      const cosmeticType: CosmeticType = CIRCUITS[circuitKey].cosmeticType;
      const next: PersistedState = {
        ...persisted,
        equippedCosmetics: {
          ...persisted.equippedCosmetics,
          [cosmeticType]: circuitKey,
        },
      };
      persist(next);
      setEquipError(null);

      if (account) {
        try {
          await setCosmetic(account, cosmeticType, circuitKey);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setEquipError(msg);
        }
      } else {
        setEquipError("Connect wallet to equip on-chain");
      }
    },
    [persisted, persist, account],
  );

  const unequipCosmetic = useCallback(
    async (cosmeticType: CosmeticType) => {
      const next: PersistedState = {
        ...persisted,
        equippedCosmetics: {
          ...persisted.equippedCosmetics,
          [cosmeticType]: null,
        },
      };
      persist(next);
      setEquipError(null);

      if (account) {
        try {
          await setCosmetic(account, cosmeticType, null);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setEquipError(msg);
        }
      }
    },
    [persisted, persist, account],
  );

  const addComponents = useCallback(
    (kind: ComponentKind, quantity: number) => {
      const next: PersistedState = {
        ...persisted,
        componentInventory: {
          ...persisted.componentInventory,
          [kind]: persisted.componentInventory[kind] + quantity,
        },
      };
      persist(next);
      // sessionInventory derives from persisted + delta, so the persisted
      // increment above already surfaces in the session counts.
    },
    [persisted, persist],
  );

  const setView = useCallback((view: ForgeView) => {
    setCurrentView(view);
  }, []);

  return {
    currentView,
    activeCircuit,
    circuit,
    placedComponents,
    isLit,
    inventory: sessionInventory,
    forgedCircuits: persisted.forgedCircuits,
    equippedCosmetics: persisted.equippedCosmetics,
    componentInventory: persisted.componentInventory,
    equipError,
    placeComponent,
    removeComponent,
    selectCircuit,
    confirmForge,
    equipCosmetic,
    unequipCosmetic,
    addComponents,
    setView,
  };
}
