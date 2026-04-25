import { useState, useCallback, useEffect } from "react";
import {
  type CircuitKey,
  type ComponentKind,
  type CosmeticType,
  CIRCUITS,
} from "./circuits";
import { checkTopology, type PlacedComponent } from "./topology";

export type ForgeView = "forge" | "celebration" | "gallery" | "profile";

interface PersistedState {
  forgedCircuits: CircuitKey[];
  equippedCosmetics: {
    banner: CircuitKey | null;
    parcelSkin: CircuitKey | null;
    holdDecoration: CircuitKey | null;
  };
}

const STORAGE_KEY = "siege:forgeState";

const DEFAULT_PERSISTED: PersistedState = {
  forgedCircuits: [],
  equippedCosmetics: { banner: null, parcelSkin: null, holdDecoration: null },
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

const DEFAULT_INVENTORY: Record<ComponentKind, number> = {
  "origin-crystal": 0,
  "void-drain": 0,
  "rune-stone": 10,
  "flux-well": 6,
  "spiral-coil": 4,
  "one-way-valve": 8,
};

export function useForgeState() {
  const [currentView, setCurrentView] = useState<ForgeView>("forge");
  const [activeCircuit, setActiveCircuitRaw] = useState<CircuitKey>("half-wave-rectifier");
  const [placedComponents, setPlacedComponents] = useState<
    Record<string, PlacedComponent>
  >({});
  const [isLit, setIsLit] = useState(false);
  const [persisted, setPersisted] = useState<PersistedState>(DEFAULT_PERSISTED);
  const [inventory, setInventory] = useState<Record<ComponentKind, number>>(
    () => ({ ...DEFAULT_INVENTORY }),
  );

  useEffect(() => {
    setPersisted(loadPersisted());
  }, []);

  const persist = useCallback((next: PersistedState) => {
    setPersisted(next);
    savePersisted(next);
  }, []);

  const circuit = CIRCUITS[activeCircuit];

  const placeComponent = useCallback(
    (instanceId: string, kind: ComponentKind, col: number, row: number) => {
      setPlacedComponents((prev) => {
        const existing = prev[instanceId];
        const next = { ...prev, [instanceId]: { col, row, kind } };
        if (!existing) {
          setInventory((inv) => ({
            ...inv,
            [kind]: Math.max(0, inv[kind] - 1),
          }));
        }
        const matched = checkTopology(next, circuit);
        setIsLit(matched);
        return next;
      });
    },
    [circuit],
  );

  const removeComponent = useCallback((instanceId: string) => {
    setPlacedComponents((prev) => {
      const comp = prev[instanceId];
      if (!comp) return prev;
      const next = { ...prev };
      delete next[instanceId];
      setInventory((inv) => ({ ...inv, [comp.kind]: inv[comp.kind] + 1 }));
      setIsLit(false);
      return next;
    });
  }, []);

  const selectCircuit = useCallback((key: CircuitKey) => {
    setActiveCircuitRaw(key);
    setPlacedComponents({});
    setIsLit(false);
    setInventory({ ...DEFAULT_INVENTORY });
    setCurrentView("forge");
  }, []);

  const confirmForge = useCallback(() => {
    if (!isLit) return;
    const next: PersistedState = {
      ...persisted,
      forgedCircuits: persisted.forgedCircuits.includes(activeCircuit)
        ? persisted.forgedCircuits
        : [...persisted.forgedCircuits, activeCircuit],
    };
    persist(next);
    setCurrentView("celebration");
  }, [isLit, persisted, activeCircuit, persist]);

  const equipCosmetic = useCallback(
    (circuitKey: CircuitKey) => {
      const cosmeticType: CosmeticType = CIRCUITS[circuitKey].cosmeticType;
      const next: PersistedState = {
        ...persisted,
        equippedCosmetics: {
          ...persisted.equippedCosmetics,
          [cosmeticType]: circuitKey,
        },
      };
      persist(next);
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
    inventory,
    forgedCircuits: persisted.forgedCircuits,
    equippedCosmetics: persisted.equippedCosmetics,
    placeComponent,
    removeComponent,
    selectCircuit,
    confirmForge,
    equipCosmetic,
    setView,
  };
}
