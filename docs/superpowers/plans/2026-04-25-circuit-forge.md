# Circuit Forge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frontend-only cosmetic crafting subgame where players assemble real circuit topologies on a fantasy-skinned forge board to earn banners, parcel skins, and hold decorations.

**Architecture:** Single `/forge` route with 4 views (forge, celebration, gallery, profile) managed by local state. Drag-and-drop HTML5 API on an 8×6 SVG grid. State persisted to localStorage for forged circuits and equipped cosmetics. All circuit data is static TypeScript. Design reference files live at `frontend/design_handoff_circuit_forge/design/`.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, CSS Modules (forge-specific), HTML5 Drag API, localStorage, SVG

**Spec:** `docs/superpowers/specs/2026-04-25-circuit-forge-design.md`

**Branch:** `feat/circuit-forge`

---

## File Structure

```
frontend/src/
├── app/forge/
│   └── page.tsx                  — view router (forge | celebration | gallery | profile)
├── components/forge/
│   ├── RuneIcon.tsx              — SVG glyphs for each component kind
│   ├── EmberField.tsx            — decorative floating particles
│   ├── ForgeChrome.tsx           — wood-grain background, brackets, lanterns
│   ├── ForgeBoard.tsx            — 8×6 SVG grid, traces, components, drag-drop targets
│   ├── ComponentTray.tsx         — left panel: draggable inventory chips
│   ├── BlueprintPicker.tsx       — right panel: circuit selector + silhouette + reward preview
│   ├── IlluminatedBanner.tsx     — procedural SVG banner from circuit topology
│   ├── CircuitSchematic.tsx      — real EE schematic SVGs for reveal
│   ├── CelebrationView.tsx       — lit board + banner + reveal panel
│   ├── GalleryView.tsx           — cosmetic reliquary with tabs
│   └── ProfileCard.tsx           — warlord's card with equipped banner + stats
├── lib/forge/
│   ├── circuits.ts               — 7 circuit topology definitions + types
│   ├── topology.ts               — binary match validation
│   └── forgeState.ts             — useForgeState() hook + localStorage persistence
└── app/globals.css               — (modify) add forge keyframe animations
```

**Modify existing:**
- `frontend/src/components/Navbar.tsx` — add CIRCUIT FORGE link, rename FORGE → CRAFT
- `frontend/src/app/layout.tsx` — add JetBrains Mono font import

---

### Task 1: Circuit data types and definitions

**Files:**
- Create: `frontend/src/lib/forge/circuits.ts`

This is the foundation everything else builds on. Port the 7 circuit topologies from the design handoff (`frontend/design_handoff_circuit_forge/design/components/circuits.jsx`) into typed TypeScript.

- [ ] **Step 1: Create circuits.ts with types and all 7 circuit definitions**

```ts
// frontend/src/lib/forge/circuits.ts

export type ComponentKind =
  | "origin-crystal"
  | "void-drain"
  | "rune-stone"
  | "flux-well"
  | "spiral-coil"
  | "one-way-valve";

export interface CircuitComponent {
  id: string;
  kind: ComponentKind;
  col: number;
  row: number;
  label: string;
  locked?: boolean;
}

export interface CircuitTrace {
  points: [number, number][];
}

export type CosmeticType = "banner" | "parcelSkin" | "holdDecoration";

export interface Circuit {
  title: string;
  realName: string;
  category: string;
  blurb: string;
  cosmeticType: CosmeticType;
  components: CircuitComponent[];
  traces: CircuitTrace[];
}

export const CIRCUITS: Record<string, Circuit> = {
  "half-wave-rectifier": {
    title: "The First Gate",
    realName: "Half-Wave Rectifier",
    category: "rectifier · ac→dc · single-phase",
    blurb: "In the world before runes, this circuit took alternating current and let only one half through — turning a tide that surged in both directions into a current that flowed only forward. The valve permits, the well steadies, the rune throttles. The same as your gate.",
    cosmeticType: "banner",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "v1", kind: "one-way-valve", col: 2, row: 2, label: "VALVE" },
      { id: "r1", kind: "rune-stone", col: 4, row: 2, label: "RUNE" },
      { id: "f1", kind: "flux-well", col: 4, row: 4, label: "FLUX" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2]] },
      { points: [[2,2],[3,2],[4,2]] },
      { points: [[4,2],[5,2],[6,2],[7,2]] },
      { points: [[4,2],[4,3],[4,4]] },
      { points: [[4,4],[5,4],[6,4],[7,4],[7,3],[7,2]] },
    ],
  },
  "voltage-divider": {
    title: "Bleeder's Mark",
    realName: "Voltage Divider",
    category: "analog · scaling · two-resistor",
    blurb: "Two stones in a row, splitting the tide. What enters at full pressure leaves diminished — measured at the seam between the two, you find a fraction of the source. A bleeder's trick, stamped into countless instruments.",
    cosmeticType: "parcelSkin",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "r1", kind: "rune-stone", col: 2, row: 2, label: "RUNE I" },
      { id: "r2", kind: "rune-stone", col: 5, row: 2, label: "RUNE II" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2]] },
      { points: [[2,2],[3,2],[4,2],[5,2]] },
      { points: [[5,2],[6,2],[7,2]] },
      { points: [[4,2],[4,4]] },
    ],
  },
  "full-wave-rectifier": {
    title: "The Twin Tide",
    realName: "Full-Wave Rectifier",
    category: "rectifier · ac→dc · bridge",
    blurb: "Four valves in a diamond, taking the tide whichever way it surges and folding both halves into one steady forward current. The smith's bridge — twice the yield of the single gate.",
    cosmeticType: "banner",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "v1", kind: "one-way-valve", col: 3, row: 1, label: "VALVE I" },
      { id: "v2", kind: "one-way-valve", col: 5, row: 1, label: "VALVE II" },
      { id: "v3", kind: "one-way-valve", col: 3, row: 4, label: "VALVE III" },
      { id: "v4", kind: "one-way-valve", col: 5, row: 4, label: "VALVE IV" },
      { id: "r1", kind: "rune-stone", col: 6, row: 2, label: "RUNE" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[2,1],[3,1]] },
      { points: [[2,2],[2,4],[3,4]] },
      { points: [[3,1],[4,1],[5,1]] },
      { points: [[3,4],[4,4],[5,4]] },
      { points: [[5,1],[6,1],[6,2]] },
      { points: [[5,4],[6,4],[6,2]] },
      { points: [[6,2],[7,2]] },
    ],
  },
  "rc-low-pass": {
    title: "The Still Pool",
    realName: "RC Low-Pass Filter",
    category: "filter · passive · 1st order",
    blurb: "A throttle and a well, set in series. Sharp gusts are absorbed by the well's reservoir; only the slow, steady currents pass through to the drain. The first lesson in dampening — what stills the chatter, lets the song through.",
    cosmeticType: "banner",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "r1", kind: "rune-stone", col: 3, row: 2, label: "RUNE" },
      { id: "f1", kind: "flux-well", col: 5, row: 4, label: "FLUX" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[3,2]] },
      { points: [[3,2],[4,2],[5,2],[6,2],[7,2]] },
      { points: [[5,2],[5,3],[5,4]] },
      { points: [[5,4],[6,4],[7,4],[7,3],[7,2]] },
    ],
  },
  "lc-tank": {
    title: "The Singing Spire",
    realName: "LC Tank",
    category: "resonator · oscillator · parallel",
    blurb: "A coil and a well, joined in a closed ring. Energy passes between them in perfect cadence — magnetic field giving way to stored charge, then back again — ringing at one true note. The smiths use it to find a single frequency in a noisy sky.",
    cosmeticType: "banner",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "c1", kind: "spiral-coil", col: 3, row: 1, label: "COIL" },
      { id: "f1", kind: "flux-well", col: 5, row: 1, label: "FLUX" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[2,1],[3,1]] },
      { points: [[3,1],[4,1],[5,1]] },
      { points: [[5,1],[6,1],[6,2],[7,2]] },
      { points: [[3,1],[3,3],[5,3],[5,1]] },
    ],
  },
  "buck-converter": {
    title: "The Crown Step",
    realName: "Buck Converter",
    category: "switching · dc-dc · step-down",
    blurb: "A valve, a coil, and a well — switched in sequence to step a tall current down to a humbler one without losing its strength. The crown's secret: a torrent that becomes a brook, but the brook still turns the wheel.",
    cosmeticType: "holdDecoration",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "v1", kind: "one-way-valve", col: 2, row: 2, label: "SWITCH" },
      { id: "c1", kind: "spiral-coil", col: 4, row: 2, label: "COIL" },
      { id: "f1", kind: "flux-well", col: 6, row: 4, label: "FLUX" },
      { id: "v2", kind: "one-way-valve", col: 3, row: 4, label: "CATCH" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2]] },
      { points: [[2,2],[3,2],[4,2]] },
      { points: [[4,2],[5,2],[6,2],[7,2]] },
      { points: [[6,2],[6,3],[6,4]] },
      { points: [[6,4],[5,4],[4,4],[3,4]] },
      { points: [[3,4],[2,4],[2,2]] },
    ],
  },
  "common-emitter-amp": {
    title: "The Herald's Voice",
    realName: "Common-Emitter Amp",
    category: "amplifier · inverting · single-stage",
    blurb: "Two stones biasing the gate, a well to couple the song in, another to send it on — and at the heart, a gate that turns a whisper into a shout. The herald's trick: a small voice steers a large one.",
    cosmeticType: "parcelSkin",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 0, label: "ORIGIN", locked: true },
      { id: "r1", kind: "rune-stone", col: 2, row: 0, label: "BIAS I" },
      { id: "r2", kind: "rune-stone", col: 4, row: 0, label: "COLLECT" },
      { id: "r3", kind: "rune-stone", col: 2, row: 4, label: "BIAS II" },
      { id: "r4", kind: "rune-stone", col: 4, row: 4, label: "EMITTER" },
      { id: "f1", kind: "flux-well", col: 6, row: 2, label: "COUPLE" },
      { id: "v1", kind: "one-way-valve", col: 4, row: 2, label: "GATE" },
      { id: "drain", kind: "void-drain", col: 7, row: 4, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,0],[1,0],[2,0]] },
      { points: [[2,0],[3,0],[4,0]] },
      { points: [[4,0],[4,1],[4,2]] },
      { points: [[2,0],[2,1],[2,2]] },
      { points: [[2,2],[3,2],[4,2]] },
      { points: [[2,2],[2,3],[2,4]] },
      { points: [[2,4],[3,4],[4,4]] },
      { points: [[4,2],[4,3],[4,4]] },
      { points: [[4,2],[5,2],[6,2]] },
      { points: [[6,2],[6,3],[6,4],[7,4]] },
      { points: [[4,4],[5,4],[6,4]] },
    ],
  },
};

export type CircuitKey = keyof typeof CIRCUITS;
export const CIRCUIT_KEYS = Object.keys(CIRCUITS) as CircuitKey[];

export const COMPONENT_NAMES: Record<ComponentKind, string> = {
  "origin-crystal": "Origin Crystal",
  "void-drain": "Void Drain",
  "rune-stone": "Rune Stone",
  "flux-well": "Flux Well",
  "spiral-coil": "Spiral Coil",
  "one-way-valve": "One-Way Valve",
};

export const COMPONENT_FANTASY: Record<ComponentKind, string> = {
  "origin-crystal": "Source of arcane flow",
  "void-drain": "Where the current ends",
  "rune-stone": "Restricts arcane flow",
  "flux-well": "Stores and releases energy",
  "spiral-coil": "Smooths the aetheric current",
  "one-way-valve": "Permits flow in a single direction",
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit src/lib/forge/circuits.ts 2>&1 | head -20`

Expected: No errors (or only errors about missing module resolution which is fine for an isolated file check). Alternatively run:

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "circuits.ts" | head -5`

Expected: No errors referencing circuits.ts

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/forge/circuits.ts
git commit -m "feat(forge): add circuit topology definitions and types"
```

---

### Task 2: Topology validation

**Files:**
- Create: `frontend/src/lib/forge/topology.ts`

Pure function, no dependencies except the types from Task 1.

- [ ] **Step 1: Create topology.ts**

```ts
// frontend/src/lib/forge/topology.ts

import type { Circuit, ComponentKind } from "./circuits";

export interface PlacedComponent {
  col: number;
  row: number;
  kind: ComponentKind;
}

export function checkTopology(
  placed: Record<string, PlacedComponent>,
  circuit: Circuit,
): boolean {
  const targets = circuit.components.filter((c) => !c.locked);
  const entries = Object.values(placed);
  if (entries.length !== targets.length) return false;
  return targets.every((target) =>
    entries.some(
      (p) =>
        p.col === target.col && p.row === target.row && p.kind === target.kind,
    ),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/forge/topology.ts
git commit -m "feat(forge): add binary topology validation"
```

---

### Task 3: Forge state management hook

**Files:**
- Create: `frontend/src/lib/forge/forgeState.ts`

Custom hook managing session state (placements, view, lit) and persisted state (forged circuits, equipped cosmetics). localStorage key: `"siege:forgeState"`.

- [ ] **Step 1: Create forgeState.ts**

```ts
// frontend/src/lib/forge/forgeState.ts

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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "forgeState\|topology\|circuits" | head -10`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/forge/forgeState.ts
git commit -m "feat(forge): add useForgeState hook with localStorage persistence"
```

---

### Task 4: Forge CSS module and global keyframes

**Files:**
- Create: `frontend/src/components/forge/forge.module.css`
- Modify: `frontend/src/app/globals.css`

Add forge-specific keyframes to globals.css (they need to be global for SVG animation references) and create the CSS module for wood/parchment surface treatments.

- [ ] **Step 1: Add forge keyframes to globals.css**

Append after the existing keyframes (after the last `@keyframes` block in globals.css):

```css
/* Circuit Forge animations */
@keyframes pulse-flow {
  to { stroke-dashoffset: -24px; }
}
@keyframes glow-pulse {
  0%, 100% { filter: drop-shadow(0 0 4px rgba(255, 180, 80, 0.3)); }
  50% { filter: drop-shadow(0 0 10px rgba(255, 180, 80, 0.7)); }
}
@keyframes float-up {
  0% { transform: translateY(0); opacity: 0.7; }
  100% { transform: translateY(-50px); opacity: 0; }
}
@keyframes shimmer {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes banner-reveal {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
```

- [ ] **Step 2: Create forge.module.css**

```css
/* frontend/src/components/forge/forge.module.css */

.woodBg {
  background:
    repeating-linear-gradient(
      90deg,
      transparent 0px,
      transparent 88px,
      #0a0604 88px,
      #0a0604 92px
    ),
    radial-gradient(ellipse at 30% 40%, rgba(60, 40, 20, 0.4) 0%, transparent 60%),
    radial-gradient(ellipse at 70% 60%, rgba(50, 30, 15, 0.3) 0%, transparent 50%),
    linear-gradient(180deg, #1a0f08 0%, #2a190d 50%, #1a0f08 100%);
}

.woodGrain {
  position: relative;
}
.woodGrain::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    repeating-linear-gradient(
      2deg,
      transparent 0px,
      transparent 3px,
      rgba(255, 200, 140, 0.015) 3px,
      rgba(255, 200, 140, 0.015) 4px
    ),
    repeating-linear-gradient(
      178deg,
      transparent 0px,
      transparent 5px,
      rgba(0, 0, 0, 0.04) 5px,
      rgba(0, 0, 0, 0.04) 6px
    );
}

.bracket {
  position: absolute;
  width: 28px;
  height: 28px;
  border: 1px solid oklch(0.78 0.13 75);
  pointer-events: none;
  z-index: 10;
}
.bracketTl { top: 10px; left: 10px; border-right: none; border-bottom: none; }
.bracketTr { top: 10px; right: 10px; border-left: none; border-bottom: none; }
.bracketBl { bottom: 10px; left: 10px; border-right: none; border-top: none; }
.bracketBr { bottom: 10px; right: 10px; border-left: none; border-top: none; }

.lantern {
  position: absolute;
  width: 14px;
  height: 18px;
  background: radial-gradient(circle, rgba(255, 200, 120, 0.9) 0%, rgba(255, 160, 60, 0.4) 50%, transparent 70%);
  border-radius: 2px;
  box-shadow: 0 0 18px 4px rgba(255, 180, 80, 0.45), 0 0 40px 12px rgba(255, 160, 60, 0.18);
  pointer-events: none;
  z-index: 10;
}

.emberParticle {
  position: absolute;
  width: 3px;
  height: 3px;
  background: oklch(0.78 0.13 75);
  border-radius: 50%;
  animation: float-up 3s ease-out infinite;
  pointer-events: none;
}

.parchmentPanel {
  background: radial-gradient(ellipse at 50% 50%, #ddc69c 0%, #c4a774 60%, #9c7a44 100%);
  position: relative;
}
.parchmentPanel::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 18% 22%, rgba(80, 50, 20, 0.3) 0 5%, transparent 14%),
    radial-gradient(circle at 82% 78%, rgba(80, 50, 20, 0.25) 0 6%, transparent 16%),
    radial-gradient(circle at 60% 50%, rgba(80, 50, 20, 0.1) 0 3%, transparent 10%);
  pointer-events: none;
}

.btnGhost {
  background: transparent;
  border: 1px solid rgba(214, 193, 154, 0.25);
  color: #b39e74;
  font-family: Inter, sans-serif;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.2s;
}
.btnGhost:hover {
  background: rgba(255, 180, 80, 0.06);
}
.btnGhostAmber {
  composes: btnGhost;
  border-color: oklch(0.78 0.13 75);
  color: oklch(0.78 0.13 75);
}

.labelSm {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #6e5c3d;
}
.labelSmAmber {
  composes: labelSm;
  color: oklch(0.78 0.13 75);
}

.fontSerif {
  font-family: Cinzel, serif;
}
.fontMono {
  font-family: "JetBrains Mono", "Geist Mono", monospace;
}

.rule {
  border-color: rgba(214, 193, 154, 0.12);
}
.ruleStrong {
  border-color: rgba(214, 193, 154, 0.25);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/forge/forge.module.css frontend/src/app/globals.css
git commit -m "feat(forge): add forge CSS module and keyframe animations"
```

---

### Task 5: RuneIcon and EmberField atoms

**Files:**
- Create: `frontend/src/components/forge/RuneIcon.tsx`
- Create: `frontend/src/components/forge/EmberField.tsx`

Small SVG atoms used across many forge components.

- [ ] **Step 1: Create RuneIcon.tsx**

Port from design handoff `components/shared.jsx` `RuneIcon`. Convert to TypeScript with typed props.

```tsx
// frontend/src/components/forge/RuneIcon.tsx
"use client";

import type { ComponentKind } from "@/lib/forge/circuits";

interface RuneIconProps {
  kind: ComponentKind;
  size?: number;
  color?: string;
}

export function RuneIcon({ kind, size = 24, color = "currentColor" }: RuneIconProps) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.4,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "rune-stone":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="12,3 20,9 17,20 7,20 4,9" {...stroke} />
          <line x1="12" y1="7" x2="12" y2="17" {...stroke} />
          <line x1="9" y1="10" x2="15" y2="10" {...stroke} />
          <line x1="9" y1="14" x2="15" y2="14" {...stroke} />
        </svg>
      );
    case "flux-well":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" {...stroke} />
          <circle cx="12" cy="12" r="5" {...stroke} />
          <line x1="3" y1="12" x2="7" y2="12" {...stroke} />
          <line x1="17" y1="12" x2="21" y2="12" {...stroke} />
        </svg>
      );
    case "spiral-coil":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M3 12 Q 6 4, 12 12 T 21 12" {...stroke} />
          <path d="M3 12 Q 6 20, 12 12 T 21 12" {...stroke} />
        </svg>
      );
    case "one-way-valve":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="5,5 19,12 5,19" {...stroke} />
          <line x1="19" y1="5" x2="19" y2="19" {...stroke} />
        </svg>
      );
    case "origin-crystal":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="12,2 19,9 12,22 5,9" {...stroke} />
          <line x1="5" y1="9" x2="19" y2="9" {...stroke} />
          <line x1="12" y1="2" x2="12" y2="22" {...stroke} />
        </svg>
      );
    case "void-drain":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M7 7 L17 17 M17 7 L7 17" {...stroke} />
        </svg>
      );
    default:
      return <svg width={size} height={size} />;
  }
}
```

- [ ] **Step 2: Create EmberField.tsx**

```tsx
// frontend/src/components/forge/EmberField.tsx
"use client";

import { useMemo } from "react";
import styles from "./forge.module.css";

interface EmberFieldProps {
  count?: number;
}

export function EmberField({ count = 8 }: EmberFieldProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: 6 + Math.random() * 88,
        bottom: Math.random() * 30,
        delay: Math.random() * 3,
        dur: 2 + Math.random() * 2,
      })),
    [count],
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((p, i) => (
        <span
          key={i}
          className={styles.emberParticle}
          style={{
            left: `${p.left}%`,
            bottom: `${p.bottom}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/forge/RuneIcon.tsx frontend/src/components/forge/EmberField.tsx
git commit -m "feat(forge): add RuneIcon and EmberField atom components"
```

---

### Task 6: ForgeChrome wrapper

**Files:**
- Create: `frontend/src/components/forge/ForgeChrome.tsx`

Wraps any forge view in the wood-grain + brackets + lanterns frame.

- [ ] **Step 1: Create ForgeChrome.tsx**

```tsx
// frontend/src/components/forge/ForgeChrome.tsx
"use client";

import type { ReactNode } from "react";
import styles from "./forge.module.css";

interface ForgeChromeProps {
  children: ReactNode;
  width?: number;
  height?: number;
}

export function ForgeChrome({ children, width = 1280, height = 820 }: ForgeChromeProps) {
  return (
    <div
      className={`${styles.woodBg} ${styles.woodGrain}`}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {children}
      <span className={`${styles.bracket} ${styles.bracketTl}`} />
      <span className={`${styles.bracket} ${styles.bracketTr}`} />
      <span className={`${styles.bracket} ${styles.bracketBl}`} />
      <span className={`${styles.bracket} ${styles.bracketBr}`} />
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  meta?: string;
}

export function SectionHeader({ title, meta }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "20px 32px 16px",
        position: "relative",
        zIndex: 4,
      }}
    >
      <div
        className={styles.fontSerif}
        style={{ color: "oklch(0.78 0.13 75)", fontSize: 16, letterSpacing: "0.28em" }}
      >
        {title}
      </div>
      {meta && (
        <div className={`${styles.fontMono} ${styles.labelSm}`}>{meta}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/forge/ForgeChrome.tsx
git commit -m "feat(forge): add ForgeChrome and SectionHeader wrapper components"
```

---

### Task 7: ForgeBoard (SVG grid + traces + drag-drop)

**Files:**
- Create: `frontend/src/components/forge/ForgeBoard.tsx`

The interactive heart. 8×6 SVG grid with carved channels, component glyphs, trace rendering (lit/unlit), and HTML5 drag-drop targets. Reference: `frontend/design_handoff_circuit_forge/design/components/forge-board.jsx`.

- [ ] **Step 1: Create ForgeBoard.tsx**

```tsx
// frontend/src/components/forge/ForgeBoard.tsx
"use client";

import { useCallback } from "react";
import type { Circuit, ComponentKind } from "@/lib/forge/circuits";
import type { PlacedComponent } from "@/lib/forge/topology";

const COLS = 8;
const ROWS = 6;
const CELL = 56;

function cellToPx(col: number, row: number) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function tracePath(points: [number, number][]) {
  return points.map(([c, r]) => {
    const { x, y } = cellToPx(c, r);
    return `${x},${y}`;
  }).join(" ");
}

interface BoardComponentProps {
  kind: ComponentKind;
  col: number;
  row: number;
  label: string;
  lit: boolean;
  locked?: boolean;
}

function BoardComponent({ kind, col, row, lit, locked }: BoardComponentProps) {
  const { x, y } = cellToPx(col, row);
  const isSource = kind === "origin-crystal";
  const size = 44;
  const color = lit || isSource ? "oklch(0.78 0.13 75)" : "#b39e74";

  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2})`}>
      <rect
        width={size}
        height={size}
        fill="#2a190d"
        stroke={lit || isSource ? "oklch(0.78 0.13 75)" : "#1a0f08"}
        strokeWidth={lit || isSource ? 1.5 : 1}
        rx={2}
        style={{
          filter: lit || isSource ? "drop-shadow(0 0 8px rgba(255,180,80,0.6))" : "none",
          transition: "all 0.4s ease",
        }}
      />
      <rect x="2" y="2" width={size - 4} height={size - 4} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1" rx={1.5} />
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <g transform="translate(-12,-12)">
          <ComponentGlyph kind={kind} color={color} lit={lit} />
        </g>
      </g>
    </g>
  );
}

function ComponentGlyph({ kind, color, lit }: { kind: ComponentKind; color: string; lit: boolean }) {
  switch (kind) {
    case "origin-crystal":
      return (
        <g>
          <polygon points="12,2 19,9 12,22 5,9" fill="rgba(255,200,100,0.3)" stroke={color} strokeWidth="1.4" />
          <line x1="5" y1="9" x2="19" y2="9" stroke={color} strokeWidth="1.4" />
          <line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth="1.4" />
        </g>
      );
    case "void-drain":
      return (
        <g>
          <circle cx="12" cy="12" r="9" fill="rgba(0,0,0,0.6)" stroke={color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="5" fill="none" stroke={color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </g>
      );
    case "one-way-valve":
      return (
        <g>
          <polygon points="5,5 19,12 5,19" fill={lit ? "rgba(255,180,80,0.25)" : "none"} stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
          <line x1="19" y1="5" x2="19" y2="19" stroke={color} strokeWidth="1.4" />
        </g>
      );
    case "flux-well":
      return (
        <g>
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="5" fill={lit ? "rgba(255,180,80,0.25)" : "none"} stroke={color} strokeWidth="1.4" />
          <line x1="3" y1="12" x2="7" y2="12" stroke={color} strokeWidth="1.4" />
          <line x1="17" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1.4" />
        </g>
      );
    case "rune-stone":
      return (
        <g>
          <polygon points="12,3 20,9 17,20 7,20 4,9" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
          <line x1="12" y1="7" x2="12" y2="17" stroke={color} strokeWidth="1.4" />
          <line x1="9" y1="10" x2="15" y2="10" stroke={color} strokeWidth="1.4" />
          <line x1="9" y1="14" x2="15" y2="14" stroke={color} strokeWidth="1.4" />
        </g>
      );
    case "spiral-coil":
      return (
        <g>
          <path d="M3 12 Q 6 4, 12 12 T 21 12" fill="none" stroke={color} strokeWidth="1.4" />
          <path d="M3 12 Q 6 20, 12 12 T 21 12" fill="none" stroke={color} strokeWidth="1.4" />
        </g>
      );
    default:
      return null;
  }
}

interface ForgeBoardProps {
  circuit: Circuit;
  placedComponents: Record<string, PlacedComponent>;
  isLit: boolean;
  onDrop: (instanceId: string, kind: ComponentKind, col: number, row: number) => void;
  onRemove: (instanceId: string) => void;
  interactive?: boolean;
}

export function ForgeBoard({
  circuit,
  placedComponents,
  isLit,
  onDrop,
  onRemove,
  interactive = true,
}: ForgeBoardProps) {
  const W = COLS * CELL;
  const H = ROWS * CELL;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("forge/kind") as ComponentKind;
      const instanceId = e.dataTransfer.getData("forge/instanceId");
      if (!kind || !instanceId) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left - 16;
      const py = e.clientY - rect.top - 16;
      const col = Math.round(px / CELL - 0.5);
      const row = Math.round(py / CELL - 0.5);

      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

      const isOccupiedByLocked = circuit.components.some(
        (c) => c.locked && c.col === col && c.row === row,
      );
      if (isOccupiedByLocked) return;

      const isOccupiedByPlaced = Object.entries(placedComponents).some(
        ([id, p]) => id !== instanceId && p.col === col && p.row === row,
      );
      if (isOccupiedByPlaced) return;

      onDrop(instanceId, kind, col, row);
    },
    [circuit, placedComponents, onDrop],
  );

  const handlePlacedDragStart = useCallback(
    (e: React.DragEvent, instanceId: string, kind: ComponentKind) => {
      e.dataTransfer.setData("forge/kind", kind);
      e.dataTransfer.setData("forge/instanceId", instanceId);
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  return (
    <div
      style={{
        position: "relative",
        width: W + 32,
        height: H + 32,
        padding: 16,
        background: "radial-gradient(ellipse at 50% 50%, #3a2818 0%, #1f1208 80%)",
        border: "1px solid #0a0604",
        boxShadow: "inset 0 0 40px rgba(0,0,0,0.7), 0 4px 30px rgba(0,0,0,0.6)",
      }}
      onDragOver={interactive ? handleDragOver : undefined}
      onDrop={interactive ? handleDrop : undefined}
    >
      <svg width={W} height={H} style={{ display: "block", position: "relative" }}>
        <defs>
          <linearGradient id="trace-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.85 0.16 80)" />
            <stop offset="50%" stopColor="oklch(0.78 0.13 75)" />
            <stop offset="100%" stopColor="oklch(0.85 0.16 80)" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {Array.from({ length: ROWS + 1 }).map((_, r) => (
          <line key={`h${r}`} x1={0} y1={r * CELL} x2={W} y2={r * CELL} stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
        ))}
        {Array.from({ length: COLS + 1 }).map((_, c) => (
          <line key={`v${c}`} x1={c * CELL} y1={0} x2={c * CELL} y2={H} stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
        ))}

        {/* Peg dots */}
        {Array.from({ length: ROWS }).map((_, r) =>
          Array.from({ length: COLS }).map((_, c) => (
            <circle key={`d${r}-${c}`} cx={c * CELL + CELL / 2} cy={r * CELL + CELL / 2} r="2" fill="rgba(255,180,80,0.15)" />
          )),
        )}

        {/* Carved channel base (always visible) */}
        {circuit.traces.map((t, i) => (
          <polyline
            key={`base-${i}`}
            points={tracePath(t.points)}
            fill="none"
            stroke="rgba(0,0,0,0.7)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Hint silhouette */}
        {!isLit &&
          circuit.traces.map((t, i) => (
            <polyline
              key={`hint-${i}`}
              points={tracePath(t.points)}
              fill="none"
              stroke="rgba(255,180,80,0.12)"
              strokeWidth="3"
              strokeDasharray="4 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

        {/* Lit traces */}
        {isLit &&
          circuit.traces.map((t, i) => (
            <g key={`lit-${i}`} style={{ animation: "glow-pulse 2s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}>
              <polyline
                points={tracePath(t.points)}
                fill="none"
                stroke="url(#trace-grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="8 4"
                style={{ animation: "pulse-flow 2s linear infinite" }}
              />
              <polyline
                points={tracePath(t.points)}
                fill="none"
                stroke="oklch(0.85 0.16 80)"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
            </g>
          ))}

        {/* Locked components */}
        {circuit.components
          .filter((c) => c.locked)
          .map((comp) => (
            <BoardComponent key={comp.id} kind={comp.kind} col={comp.col} row={comp.row} label={comp.label} lit={isLit} locked />
          ))}

        {/* Placed components */}
        {Object.entries(placedComponents).map(([instanceId, p]) => (
          <g
            key={instanceId}
            style={{ cursor: interactive ? "grab" : "default" }}
            onDragStart={
              interactive
                ? (e: React.DragEvent<SVGGElement>) => {
                    const nativeEvent = e.nativeEvent as DragEvent;
                    if (nativeEvent.dataTransfer) {
                      nativeEvent.dataTransfer.setData("forge/kind", p.kind);
                      nativeEvent.dataTransfer.setData("forge/instanceId", instanceId);
                      nativeEvent.dataTransfer.effectAllowed = "move";
                    }
                  }
                : undefined
            }
          >
            <BoardComponent kind={p.kind} col={p.col} row={p.row} label="" lit={isLit} />
          </g>
        ))}
      </svg>

      {/* Component labels */}
      {circuit.components
        .filter((c) => c.locked)
        .map((comp) => {
          const { x, y } = cellToPx(comp.col, comp.row);
          return (
            <div
              key={`lbl-${comp.id}`}
              style={{
                position: "absolute",
                left: 16 + x,
                top: 16 + y + 28,
                transform: "translateX(-50%)",
                fontSize: 8,
                letterSpacing: "0.18em",
                color: isLit ? "oklch(0.55 0.09 75)" : "#6e5c3d",
                fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
                pointerEvents: "none",
              }}
            >
              {comp.label}
            </div>
          );
        })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "ForgeBoard" | head -5`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/forge/ForgeBoard.tsx
git commit -m "feat(forge): add ForgeBoard with SVG grid, traces, and drag-drop"
```

---

### Task 8: ComponentTray and BlueprintPicker

**Files:**
- Create: `frontend/src/components/forge/ComponentTray.tsx`
- Create: `frontend/src/components/forge/BlueprintPicker.tsx`

The left and right panels of the forge view.

- [ ] **Step 1: Create ComponentTray.tsx**

```tsx
// frontend/src/components/forge/ComponentTray.tsx
"use client";

import { useCallback } from "react";
import type { ComponentKind } from "@/lib/forge/circuits";
import { COMPONENT_NAMES, COMPONENT_FANTASY } from "@/lib/forge/circuits";
import { RuneIcon } from "./RuneIcon";
import styles from "./forge.module.css";

const TRAY_KINDS: ComponentKind[] = [
  "rune-stone",
  "flux-well",
  "spiral-coil",
  "one-way-valve",
];

interface ComponentTrayProps {
  inventory: Record<ComponentKind, number>;
}

let dragCounter = 0;

export function ComponentTray({ inventory }: ComponentTrayProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent, kind: ComponentKind) => {
      if (inventory[kind] <= 0) {
        e.preventDefault();
        return;
      }
      const instanceId = `${kind}-${++dragCounter}`;
      e.dataTransfer.setData("forge/kind", kind);
      e.dataTransfer.setData("forge/instanceId", instanceId);
      e.dataTransfer.effectAllowed = "move";
    },
    [inventory],
  );

  return (
    <div style={{ width: 240, flexShrink: 0 }}>
      <div className={styles.labelSmAmber} style={{ marginBottom: 12 }}>
        COMPONENT TRAY
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TRAY_KINDS.map((kind) => (
          <div
            key={kind}
            draggable={inventory[kind] > 0}
            onDragStart={(e) => handleDragStart(e, kind)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 10,
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(214,193,154,0.12)",
              borderRadius: 2,
              cursor: inventory[kind] > 0 ? "grab" : "not-allowed",
              opacity: inventory[kind] > 0 ? 1 : 0.4,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                background: "#1a0f08",
                border: "1px solid rgba(255,180,80,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RuneIcon kind={kind} size={22} color="oklch(0.78 0.13 75)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#efe3c5", letterSpacing: "0.04em" }}>
                {COMPONENT_NAMES[kind]}
              </div>
              <div style={{ fontSize: 10, color: "#6e5c3d", marginTop: 2 }}>
                {COMPONENT_FANTASY[kind]}
              </div>
            </div>
            <div
              className={styles.fontMono}
              style={{
                fontSize: 11,
                color: "oklch(0.78 0.13 75)",
                borderLeft: "1px solid rgba(214,193,154,0.12)",
                paddingLeft: 10,
                alignSelf: "stretch",
                display: "flex",
                alignItems: "center",
              }}
            >
              ×{inventory[kind]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create BlueprintPicker.tsx**

```tsx
// frontend/src/components/forge/BlueprintPicker.tsx
"use client";

import type { Circuit, CircuitKey } from "@/lib/forge/circuits";
import { CIRCUITS, CIRCUIT_KEYS } from "@/lib/forge/circuits";
import styles from "./forge.module.css";

interface BlueprintPickerProps {
  activeCircuit: CircuitKey;
  circuit: Circuit;
  isLit: boolean;
  onSelectCircuit: (key: CircuitKey) => void;
}

export function BlueprintPicker({
  activeCircuit,
  circuit,
  isLit,
  onSelectCircuit,
}: BlueprintPickerProps) {
  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <div className={styles.labelSmAmber} style={{ marginBottom: 12 }}>
        TARGET SILHOUETTE
      </div>
      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(214,193,154,0.12)",
          padding: 16,
        }}
      >
        <CircuitSilhouette title={circuit.title} />
        <div
          className={styles.fontMono}
          style={{ fontSize: 10, color: "#6e5c3d", marginTop: 10, lineHeight: 1.5 }}
        >
          {circuit.components.filter((c) => !c.locked).length} crafted parts. The shape is yours to divine.
        </div>
      </div>

      <div className={styles.labelSm} style={{ marginTop: 22, marginBottom: 10 }}>
        REWARD ON COMPLETION
      </div>
      <div
        style={{
          background: "linear-gradient(180deg, #2a1a08, #1a0f08)",
          border: "1px solid rgba(255,180,80,0.3)",
          padding: 14,
        }}
      >
        <div className={styles.fontSerif} style={{ fontSize: 14, color: "#efe3c5" }}>
          {circuit.title}
        </div>
        <div
          style={{
            fontSize: 9,
            color: isLit ? "oklch(0.55 0.09 75)" : "#6e5c3d",
            marginTop: 4,
            letterSpacing: "0.14em",
          }}
        >
          {isLit ? "FORGED — READY TO CLAIM" : "SEALED — UNTIL FORGED"}
        </div>
      </div>

      <div className={styles.labelSm} style={{ marginTop: 22, marginBottom: 10 }}>
        BLUEPRINT
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {CIRCUIT_KEYS.map((k) => {
          const c = CIRCUITS[k];
          const active = k === activeCircuit;
          return (
            <button
              key={k}
              onClick={() => onSelectCircuit(k)}
              style={{
                background: active ? "rgba(255,180,80,0.10)" : "transparent",
                border: `1px solid ${active ? "oklch(0.78 0.13 75)" : "rgba(214,193,154,0.12)"}`,
                color: active ? "oklch(0.78 0.13 75)" : "#b39e74",
                padding: "6px 10px",
                fontFamily: "Cinzel, serif",
                fontSize: 11,
                letterSpacing: "0.14em",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {c.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CircuitSilhouette({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 180 100" width="100%" height="100">
      <defs>
        <radialGradient id="sil-vellum" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#1a0e08" />
          <stop offset="100%" stopColor="#0a0604" />
        </radialGradient>
      </defs>
      <rect width="180" height="100" fill="url(#sil-vellum)" />
      <rect x="8" y="8" width="164" height="84" fill="none" stroke="rgba(255,180,80,0.35)" strokeWidth="0.8" />
      <rect x="11" y="11" width="158" height="78" fill="none" stroke="rgba(255,180,80,0.18)" strokeWidth="0.4" />
      <g transform="translate(90,46)">
        <circle r="20" fill="none" stroke="rgba(255,180,80,0.3)" strokeWidth="0.6" />
        <circle r="16" fill="none" stroke="rgba(255,180,80,0.18)" strokeWidth="0.4" strokeDasharray="2 2" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const x1 = Math.cos(a) * 20, y1 = Math.sin(a) * 20;
          const x2 = Math.cos(a) * 23, y2 = Math.sin(a) * 23;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,180,80,0.45)" strokeWidth="0.5" />;
        })}
        <text x="0" y="3" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="14" fontWeight="700" fill="rgba(255,180,80,0.55)">
          ?
        </text>
      </g>
      <text x="90" y="82" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="6.5" fontWeight="600" fill="rgba(255,180,80,0.7)" letterSpacing="2">
        {title.toUpperCase()}
      </text>
    </svg>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/forge/ComponentTray.tsx frontend/src/components/forge/BlueprintPicker.tsx
git commit -m "feat(forge): add ComponentTray and BlueprintPicker panels"
```

---

### Task 9: IlluminatedBanner

**Files:**
- Create: `frontend/src/components/forge/IlluminatedBanner.tsx`

Procedural SVG banner generated from circuit topology. Used in forge reward preview, celebration, gallery, and profile. Reference: `frontend/design_handoff_circuit_forge/design/components/screens.jsx` `IlluminatedBanner`.

- [ ] **Step 1: Create IlluminatedBanner.tsx**

```tsx
// frontend/src/components/forge/IlluminatedBanner.tsx
"use client";

import type { Circuit } from "@/lib/forge/circuits";

interface IlluminatedBannerProps {
  circuit: Circuit;
  name: string;
  scale?: number;
  locked?: boolean;
}

const ex = (c: number) => -55 + (c / 7) * 110;
const ey = (r: number) => -32 + (r / 5) * 64;

function HeraldGlyph({ kind, cx, cy, ink, gold }: { kind: string; cx: number; cy: number; ink: string; gold: string }) {
  switch (kind) {
    case "origin-crystal":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon points="0,-6 5,0 0,6 -5,0" fill={ink} />
          <polygon points="0,-9 7,0 0,9 -7,0" fill="none" stroke={gold} strokeWidth="0.6" />
        </g>
      );
    case "void-drain":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="6" fill="none" stroke={ink} strokeWidth="1.5" />
          <circle r="2" fill={ink} />
          <circle r="9" fill="none" stroke={gold} strokeWidth="0.6" strokeDasharray="2 2" />
        </g>
      );
    case "rune-stone":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <rect x="-5" y="-6" width="10" height="12" rx="1" fill={ink} />
          <line x1="-3" y1="-2" x2="3" y2="-2" stroke={gold} strokeWidth="0.6" />
          <line x1="-3" y1="2" x2="3" y2="2" stroke={gold} strokeWidth="0.6" />
        </g>
      );
    case "flux-well":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="6" fill="none" stroke={ink} strokeWidth="1.5" />
          <circle r="2.5" fill={ink} />
        </g>
      );
    case "spiral-coil":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle cx="-4" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
          <circle cx="0" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
          <circle cx="4" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
        </g>
      );
    case "one-way-valve":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon points="-5,-5 5,0 -5,5" fill={ink} />
          <line x1="5" y1="-5" x2="5" y2="5" stroke={ink} strokeWidth="1.5" />
        </g>
      );
    default:
      return null;
  }
}

export function IlluminatedBanner({ circuit, name, scale = 1, locked = false }: IlluminatedBannerProps) {
  const ink = locked ? "#3a2810" : "#7a3818";
  const gold = locked ? "#5a4520" : "#b8862c";

  return (
    <div
      style={{
        width: 280 * scale,
        height: 360 * scale,
        background: "linear-gradient(180deg, #d6c19a 0%, #b39768 100%)",
        position: "relative",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 0 40px rgba(120,80,30,0.3)",
        filter: locked ? "grayscale(0.9) brightness(0.4)" : "none",
      }}
    >
      {/* Aging stains */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 18% 22%, rgba(80,50,20,0.3) 0 5%, transparent 14%)," +
            "radial-gradient(circle at 82% 78%, rgba(80,50,20,0.25) 0 6%, transparent 16%)," +
            "radial-gradient(circle at 60% 50%, rgba(80,50,20,0.1) 0 3%, transparent 10%)",
        }}
      />

      {/* Gold borders */}
      <div style={{ position: "absolute", inset: 12, border: `${2 * scale}px solid ${gold}`, boxShadow: "inset 0 0 0 1px rgba(184,134,44,0.4)" }} />
      <div style={{ position: "absolute", inset: 18, border: `1px solid ${locked ? "#3a2810" : "rgba(184,134,44,0.5)"}` }} />

      {/* SVG content */}
      <svg
        viewBox="0 0 200 280"
        style={{ position: "absolute", inset: 28, width: "calc(100% - 56px)", height: "calc(100% - 56px)" }}
      >
        {/* Title */}
        <text x="100" y="36" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="11" fontWeight="700" fill={ink} letterSpacing="2.5">
          {circuit.title.toUpperCase()}
        </text>
        <line x1="40" y1="44" x2="160" y2="44" stroke={gold} strokeWidth="0.6" />

        {/* Central emblem */}
        <g transform="translate(100, 150)">
          <ellipse cx="0" cy="0" rx="70" ry="80" fill="none" stroke={gold} strokeWidth="1" />
          <ellipse cx="0" cy="0" rx="62" ry="72" fill="none" stroke={gold} strokeWidth="0.5" />

          {/* Topology traces as knotwork */}
          <g stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
            {circuit.traces.map((t, i) => (
              <polyline key={i} points={t.points.map(([c, r]) => `${ex(c)},${ey(r)}`).join(" ")} />
            ))}
          </g>
          <g stroke={gold} strokeWidth="0.4" fill="none" opacity="0.6">
            {circuit.traces.map((t, i) => (
              <polyline key={`h${i}`} points={t.points.map(([c, r]) => `${ex(c)},${ey(r) + 0.6}`).join(" ")} />
            ))}
          </g>

          {/* Component glyphs */}
          {circuit.components.map((comp) => (
            <HeraldGlyph key={comp.id} kind={comp.kind} cx={ex(comp.col)} cy={ey(comp.row)} ink={ink} gold={gold} />
          ))}

          {/* Corner flourishes */}
          <g stroke={gold} strokeWidth="0.7" fill="none">
            <path d="M -60 -50 Q -40 -60 -20 -50" />
            <path d="M 60 -50 Q 40 -60 20 -50" />
            <path d="M -60 60 Q -40 70 -20 60" />
            <path d="M 60 60 Q 40 70 20 60" />
          </g>

          {/* Top sigil */}
          <g transform="translate(0,-58)" fill={gold}>
            <polygon points="0,-5 1.4,-1.4 5,0 1.4,1.4 0,5 -1.4,1.4 -5,0 -1.4,-1.4" />
          </g>
        </g>

        <line x1="40" y1="245" x2="160" y2="245" stroke={gold} strokeWidth="0.6" />
        <text x="100" y="258" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="7" fontStyle="italic" fill={ink} letterSpacing="1.5">
          ut superius est inferius
        </text>
        <text x="100" y="270" textAnchor="middle" fontFamily='"JetBrains Mono", monospace' fontSize="5" fill={ink} letterSpacing="2">
          {name.toUpperCase()}
        </text>
      </svg>

      {/* Corner rivets */}
      {[
        [20, 20],
        [260 * scale - 20, 20],
        [20, 340 * scale - 20],
        [260 * scale - 20, 340 * scale - 20],
      ].map(([l, t], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: l,
            top: t,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: gold,
            boxShadow: "inset -1px -1px 1px rgba(0,0,0,0.3)",
          }}
        />
      ))}

      {/* Locked overlay */}
      {locked && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,6,4,0.55)",
          }}
        >
          <div style={{ color: "#b39e74", textAlign: "center", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>⊘</div>
            SEALED
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/forge/IlluminatedBanner.tsx
git commit -m "feat(forge): add procedural IlluminatedBanner component"
```

---

### Task 10: CircuitSchematic

**Files:**
- Create: `frontend/src/components/forge/CircuitSchematic.tsx`

Real EE schematics for the celebration reveal. Reference: `frontend/design_handoff_circuit_forge/design/components/circuit-art.jsx` `CircuitSchematic`.

- [ ] **Step 1: Create CircuitSchematic.tsx**

Port all 7 circuit schematics from the design handoff. This is a large file because each schematic is hand-drawn. Copy the exact SVG paths from `circuit-art.jsx`, converting JSX prop syntax and adding TypeScript types.

```tsx
// frontend/src/components/forge/CircuitSchematic.tsx
"use client";

import type { CircuitKey } from "@/lib/forge/circuits";

interface CircuitSchematicProps {
  circuitKey: CircuitKey;
}

const STROKE = "oklch(0.78 0.13 75)";
const SW = 1;
const LABEL: React.SVGAttributes<SVGTextElement> = {
  fill: "#6e5c3d",
  fontSize: 6.5,
  fontFamily: '"JetBrains Mono", monospace',
};

function Wire({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth={SW} />;
}

function Ground({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + 6} stroke={STROKE} strokeWidth={SW} />
      <line x1={x - 5} y1={y + 6} x2={x + 5} y2={y + 6} stroke={STROKE} strokeWidth={SW} />
      <line x1={x - 3} y1={y + 9} x2={x + 3} y2={y + 9} stroke={STROKE} strokeWidth={SW} />
      <line x1={x - 1.5} y1={y + 12} x2={x + 1.5} y2={y + 12} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

function Resistor({ x, y, label, horizontal = true }: { x: number; y: number; label: string; horizontal?: boolean }) {
  return (
    <g>
      {horizontal ? (
        <path d={`M${x - 10} ${y} l3 -4 l4 8 l4 -8 l4 8 l4 -8 l3 4`} fill="none" stroke={STROKE} strokeWidth={SW} />
      ) : (
        <path d={`M${x} ${y - 10} l-4 3 l8 4 l-8 4 l8 4 l-8 4 l4 3`} fill="none" stroke={STROKE} strokeWidth={SW} />
      )}
      <text x={x + (horizontal ? 0 : 10)} y={y + (horizontal ? -8 : 0)} textAnchor="middle" {...LABEL}>{label}</text>
    </g>
  );
}

function Capacitor({ x, y, label, vertical = true }: { x: number; y: number; label: string; vertical?: boolean }) {
  return (
    <g>
      {vertical ? (
        <>
          <line x1={x - 6} y1={y - 2} x2={x + 6} y2={y - 2} stroke={STROKE} strokeWidth={SW + 0.4} />
          <line x1={x - 6} y1={y + 2} x2={x + 6} y2={y + 2} stroke={STROKE} strokeWidth={SW + 0.4} />
        </>
      ) : (
        <>
          <line x1={x - 2} y1={y - 6} x2={x - 2} y2={y + 6} stroke={STROKE} strokeWidth={SW + 0.4} />
          <line x1={x + 2} y1={y - 6} x2={x + 2} y2={y + 6} stroke={STROKE} strokeWidth={SW + 0.4} />
        </>
      )}
      <text x={x + (vertical ? 10 : 0)} y={y + (vertical ? 1 : -8)} textAnchor="middle" {...LABEL}>{label}</text>
    </g>
  );
}

function Inductor({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <path d={`M${x - 12} ${y} q3 -6 6 0 q3 -6 6 0 q3 -6 6 0 q3 -6 6 0`} fill="none" stroke={STROKE} strokeWidth={SW} />
      <text x={x} y={y - 8} textAnchor="middle" {...LABEL}>{label}</text>
    </g>
  );
}

function Diode({ x, y, label, horizontal = true }: { x: number; y: number; label: string; horizontal?: boolean }) {
  return (
    <g>
      {horizontal ? (
        <>
          <polygon points={`${x - 5},${y - 4} ${x + 4},${y} ${x - 5},${y + 4}`} fill="none" stroke={STROKE} strokeWidth={SW} />
          <line x1={x + 4} y1={y - 4} x2={x + 4} y2={y + 4} stroke={STROKE} strokeWidth={SW} />
        </>
      ) : (
        <>
          <polygon points={`${x - 4},${y - 5} ${x},${y + 4} ${x + 4},${y - 5}`} fill="none" stroke={STROKE} strokeWidth={SW} />
          <line x1={x - 4} y1={y + 4} x2={x + 4} y2={y + 4} stroke={STROKE} strokeWidth={SW} />
        </>
      )}
      <text x={x + (horizontal ? 0 : 10)} y={y + (horizontal ? -8 : 0)} textAnchor="middle" {...LABEL}>{label}</text>
    </g>
  );
}

function Source({ x, y, label = "Vin" }: { x: number; y: number; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="6" fill="none" stroke={STROKE} strokeWidth={SW} />
      <text x={x} y={y + 2} textAnchor="middle" {...LABEL} style={{ fontSize: 7 }}>~</text>
      <text x={x - 10} y={y + 1} textAnchor="end" {...LABEL}>{label}</text>
    </g>
  );
}

function Dot({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="1.4" fill={STROKE} />;
}

function Out({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="1.8" fill="none" stroke={STROKE} strokeWidth={SW} />
      <text x={x + 5} y={y + 2} {...LABEL}>Vout</text>
    </g>
  );
}

export function CircuitSchematic({ circuitKey }: CircuitSchematicProps) {
  return (
    <svg viewBox="0 0 200 90" width="100%" height="80">
      <SchematicParts circuitKey={circuitKey} />
    </svg>
  );
}

function SchematicParts({ circuitKey }: { circuitKey: CircuitKey }) {
  switch (circuitKey) {
    case "half-wave-rectifier":
      return (
        <>
          <Source x={15} y={45} />
          <Wire x1={21} y1={45} x2={50} y2={45} />
          <Diode x={56} y={45} label="D1" />
          <Wire x1={60} y1={45} x2={100} y2={45} />
          <Resistor x={110} y={45} label="R" />
          <Wire x1={120} y1={45} x2={160} y2={45} />
          <Capacitor x={140} y={60} label="C" vertical={false} />
          <Wire x1={140} y1={45} x2={140} y2={54} />
          <Dot x={140} y={45} />
          <Wire x1={140} y1={66} x2={140} y2={75} />
          <Wire x1={15} y1={51} x2={15} y2={75} />
          <Wire x1={15} y1={75} x2={160} y2={75} />
          <Out x={160} y={45} />
          <Ground x={85} y={75} />
        </>
      );
    case "voltage-divider":
      return (
        <>
          <Source x={15} y={35} />
          <Wire x1={21} y1={35} x2={60} y2={35} />
          <Resistor x={70} y={35} label="R1" />
          <Wire x1={80} y1={35} x2={130} y2={35} />
          <Resistor x={140} y={35} label="R2" />
          <Wire x1={150} y1={35} x2={175} y2={35} />
          <Wire x1={15} y1={41} x2={15} y2={75} />
          <Wire x1={15} y1={75} x2={175} y2={75} />
          <Wire x1={175} y1={35} x2={175} y2={75} />
          <Dot x={105} y={35} />
          <Wire x1={105} y1={35} x2={105} y2={25} />
          <Out x={105} y={22} />
          <Ground x={95} y={75} />
        </>
      );
    case "full-wave-rectifier":
      return (
        <>
          <Source x={15} y={45} />
          <Wire x1={21} y1={45} x2={35} y2={45} />
          <Wire x1={35} y1={45} x2={35} y2={25} />
          <Wire x1={35} y1={45} x2={35} y2={65} />
          <Diode x={50} y={25} label="D1" />
          <Diode x={80} y={25} label="D2" />
          <Diode x={50} y={65} label="D3" />
          <Diode x={80} y={65} label="D4" />
          <Wire x1={35} y1={25} x2={45} y2={25} />
          <Wire x1={54} y1={25} x2={75} y2={25} />
          <Wire x1={84} y1={25} x2={95} y2={25} />
          <Wire x1={35} y1={65} x2={45} y2={65} />
          <Wire x1={54} y1={65} x2={75} y2={65} />
          <Wire x1={84} y1={65} x2={95} y2={65} />
          <Wire x1={95} y1={25} x2={95} y2={45} />
          <Wire x1={95} y1={65} x2={95} y2={45} />
          <Dot x={95} y={45} />
          <Wire x1={95} y1={45} x2={130} y2={45} />
          <Resistor x={140} y={45} label="R" />
          <Wire x1={150} y1={45} x2={175} y2={45} />
          <Out x={178} y={45} />
          <Wire x1={15} y1={51} x2={15} y2={90} />
          <Wire x1={15} y1={90} x2={175} y2={90} />
          <Wire x1={175} y1={45} x2={175} y2={90} />
          <Ground x={95} y={90} />
        </>
      );
    case "rc-low-pass":
      return (
        <>
          <Source x={15} y={35} />
          <Wire x1={21} y1={35} x2={70} y2={35} />
          <Resistor x={80} y={35} label="R" />
          <Wire x1={90} y1={35} x2={175} y2={35} />
          <Capacitor x={135} y={50} label="C" vertical={false} />
          <Wire x1={135} y1={35} x2={135} y2={44} />
          <Dot x={135} y={35} />
          <Wire x1={135} y1={56} x2={135} y2={75} />
          <Wire x1={15} y1={41} x2={15} y2={75} />
          <Wire x1={15} y1={75} x2={175} y2={75} />
          <Wire x1={175} y1={35} x2={175} y2={75} />
          <Out x={165} y={25} />
          <Wire x1={155} y1={35} x2={155} y2={25} />
          <Wire x1={155} y1={25} x2={165} y2={25} />
          <Dot x={155} y={35} />
          <Ground x={95} y={75} />
        </>
      );
    case "lc-tank":
      return (
        <>
          <Source x={15} y={50} />
          <Wire x1={21} y1={50} x2={50} y2={50} />
          <Wire x1={50} y1={50} x2={50} y2={30} />
          <Wire x1={50} y1={50} x2={50} y2={70} />
          <Wire x1={50} y1={30} x2={90} y2={30} />
          <Wire x1={50} y1={70} x2={90} y2={70} />
          <Inductor x={70} y={30} label="L" />
          <Capacitor x={70} y={70} label="C" />
          <Wire x1={90} y1={30} x2={90} y2={50} />
          <Wire x1={90} y1={70} x2={90} y2={50} />
          <Dot x={90} y={50} />
          <Wire x1={90} y1={50} x2={175} y2={50} />
          <Out x={178} y={50} />
          <Wire x1={15} y1={56} x2={15} y2={90} />
          <Wire x1={15} y1={90} x2={175} y2={90} />
          <Wire x1={175} y1={50} x2={175} y2={90} />
          <Ground x={95} y={90} />
        </>
      );
    case "buck-converter":
      return (
        <>
          <Source x={15} y={30} label="Vin" />
          <Wire x1={21} y1={30} x2={40} y2={30} />
          <g>
            <line x1={40} y1={30} x2={50} y2={22} stroke={STROKE} strokeWidth={SW} />
            <circle cx={40} cy={30} r="1.4" fill={STROKE} />
            <circle cx={52} cy={30} r="1.4" fill={STROKE} />
            <text x={46} y={14} textAnchor="middle" {...LABEL}>SW</text>
          </g>
          <Wire x1={52} y1={30} x2={75} y2={30} />
          <Inductor x={90} y={30} label="L" />
          <Wire x1={105} y1={30} x2={175} y2={30} />
          <Wire x1={75} y1={30} x2={75} y2={50} />
          <Diode x={75} y={60} label="D" horizontal={false} />
          <Wire x1={75} y1={65} x2={75} y2={80} />
          <Capacitor x={140} y={50} label="C" vertical={false} />
          <Wire x1={140} y1={30} x2={140} y2={44} />
          <Dot x={140} y={30} />
          <Wire x1={140} y1={56} x2={140} y2={80} />
          <Wire x1={15} y1={36} x2={15} y2={80} />
          <Wire x1={15} y1={80} x2={175} y2={80} />
          <Wire x1={175} y1={30} x2={175} y2={80} />
          <Out x={178} y={30} />
          <Ground x={95} y={80} />
        </>
      );
    case "common-emitter-amp":
      return (
        <>
          <text x={100} y={10} textAnchor="middle" {...LABEL}>+Vcc</text>
          <Wire x1={20} y1={14} x2={180} y2={14} />
          <Resistor x={50} y={30} label="R1" horizontal={false} />
          <Wire x1={50} y1={14} x2={50} y2={20} />
          <Wire x1={50} y1={40} x2={50} y2={50} />
          <Resistor x={120} y={30} label="Rc" horizontal={false} />
          <Wire x1={120} y1={14} x2={120} y2={20} />
          <Wire x1={120} y1={40} x2={120} y2={50} />
          <Capacitor x={25} y={50} label="Cin" />
          <Wire x1={15} y1={50} x2={19} y2={50} />
          <Wire x1={31} y1={50} x2={50} y2={50} />
          <Dot x={50} y={50} />
          <Resistor x={50} y={70} label="R2" horizontal={false} />
          <Wire x1={50} y1={60} x2={50} y2={65} />
          <Wire x1={50} y1={75} x2={50} y2={85} />
          <g>
            <circle cx={85} cy={50} r="9" fill="none" stroke={STROKE} strokeWidth={SW} />
            <line x1={50} y1={50} x2={76} y2={50} stroke={STROKE} strokeWidth={SW} />
            <line x1={78} y1={44} x2={78} y2={56} stroke={STROKE} strokeWidth={SW + 0.4} />
            <line x1={78} y1={46} x2={92} y2={38} stroke={STROKE} strokeWidth={SW} />
            <line x1={78} y1={54} x2={92} y2={62} stroke={STROKE} strokeWidth={SW} />
            <polygon points="88,60 92,62 87,64" fill={STROKE} />
            <text x={100} y={56} {...LABEL}>Q1</text>
          </g>
          <Wire x1={92} y1={38} x2={120} y2={38} />
          <Wire x1={120} y1={38} x2={120} y2={40} />
          <Dot x={120} y={50} />
          <Wire x1={120} y1={50} x2={140} y2={50} />
          <Capacitor x={150} y={50} label="Cout" />
          <Wire x1={156} y1={50} x2={175} y2={50} />
          <Wire x1={92} y1={62} x2={92} y2={70} />
          <Resistor x={92} y={75} label="Re" horizontal={false} />
          <Wire x1={92} y1={80} x2={92} y2={88} />
          <Wire x1={20} y1={88} x2={180} y2={88} />
          <Wire x1={50} y1={85} x2={50} y2={88} />
          <Out x={178} y={50} />
          <Ground x={100} y={88} />
        </>
      );
    default:
      return <text x={100} y={50} textAnchor="middle" {...LABEL}>—</text>;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/forge/CircuitSchematic.tsx
git commit -m "feat(forge): add real EE circuit schematics for reveal"
```

---

### Task 11: CelebrationView

**Files:**
- Create: `frontend/src/components/forge/CelebrationView.tsx`

The completion screen: lit board, illuminated banner, real circuit reveal panel, CTAs.

- [ ] **Step 1: Create CelebrationView.tsx**

```tsx
// frontend/src/components/forge/CelebrationView.tsx
"use client";

import type { Circuit, CircuitKey } from "@/lib/forge/circuits";
import type { PlacedComponent } from "@/lib/forge/topology";
import { ForgeChrome, SectionHeader } from "./ForgeChrome";
import { ForgeBoard } from "./ForgeBoard";
import { IlluminatedBanner } from "./IlluminatedBanner";
import { CircuitSchematic } from "./CircuitSchematic";
import { EmberField } from "./EmberField";
import styles from "./forge.module.css";

interface CelebrationViewProps {
  circuitKey: CircuitKey;
  circuit: Circuit;
  placedComponents: Record<string, PlacedComponent>;
  onEquip: () => void;
  onGallery: () => void;
  onForgeAgain: () => void;
}

export function CelebrationView({
  circuitKey,
  circuit,
  placedComponents,
  onEquip,
  onGallery,
  onForgeAgain,
}: CelebrationViewProps) {
  return (
    <ForgeChrome>
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 50%, rgba(255,180,80,0.18) 0%, transparent 55%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <EmberField count={24} />

      <SectionHeader title="THE GATE OPENS" />

      <div
        style={{
          position: "absolute",
          top: 60,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 3,
          padding: "40px 0",
          overflow: "auto",
        }}
      >
        <div
          className={styles.labelSmAmber}
          style={{ letterSpacing: "0.4em", animation: "shimmer 2s ease-in-out infinite" }}
        >
          ✦ TOPOLOGY COMPLETE ✦
        </div>
        <div
          className={styles.fontSerif}
          style={{
            fontSize: 32,
            color: "oklch(0.78 0.13 75)",
            marginTop: 14,
            letterSpacing: "0.24em",
            textShadow: "0 0 20px rgba(255,180,80,0.5)",
          }}
        >
          {circuit.title.toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: "#b39e74", letterSpacing: "0.2em", marginTop: 6 }}>
          A BANNER FORGED FROM THE OLD CRAFT
        </div>

        <div style={{ display: "flex", gap: 60, marginTop: 30, alignItems: "center" }}>
          <ForgeBoard
            circuit={circuit}
            placedComponents={placedComponents}
            isLit={true}
            onDrop={() => {}}
            onRemove={() => {}}
            interactive={false}
          />
          <div style={{ width: 280, animation: "banner-reveal 600ms cubic-bezier(.2,.8,.2,1) both" }}>
            <IlluminatedBanner circuit={circuit} name={circuitKey} />
          </div>
        </div>

        {/* Real circuit reveal */}
        <div
          style={{
            marginTop: 28,
            width: 760,
            background: "rgba(15, 10, 6, 0.85)",
            border: "1px solid oklch(0.78 0.13 75)",
            padding: "20px 28px",
            position: "relative",
            backdropFilter: "blur(4px)",
          }}
        >
          <span className={`${styles.bracket} ${styles.bracketTl}`} style={{ width: 16, height: 16, top: 6, left: 6 }} />
          <span className={`${styles.bracket} ${styles.bracketTr}`} style={{ width: 16, height: 16, top: 6, right: 6 }} />
          <span className={`${styles.bracket} ${styles.bracketBl}`} style={{ width: 16, height: 16, bottom: 6, left: 6 }} />
          <span className={`${styles.bracket} ${styles.bracketBr}`} style={{ width: 16, height: 16, bottom: 6, right: 6 }} />

          <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div className={styles.labelSmAmber}>THE OLD-WORLD NAME</div>
              <div
                className={styles.fontSerif}
                style={{ fontSize: 20, color: "#efe3c5", marginTop: 6, letterSpacing: "0.14em" }}
              >
                {circuit.realName}
              </div>
              <div style={{ fontSize: 12, color: "#b39e74", marginTop: 12, lineHeight: 1.6, fontStyle: "italic" }}>
                {circuit.blurb}
              </div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(214,193,154,0.12)" }} />
            <div style={{ width: 200 }}>
              <div className={styles.labelSm}>SCHEMATIC</div>
              <div style={{ marginTop: 6, padding: 8, background: "#0a0604", border: "1px solid rgba(214,193,154,0.12)" }}>
                <CircuitSchematic circuitKey={circuitKey} />
              </div>
              <div className={styles.labelSm} style={{ marginTop: 8 }}>CATEGORY</div>
              <div className={styles.fontMono} style={{ fontSize: 11, color: "#b39e74", marginTop: 4 }}>
                {circuit.category}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
          <button className={styles.btnGhostAmber} onClick={onEquip}>Equip Banner</button>
          <button className={styles.btnGhost} onClick={onGallery}>To Gallery</button>
          <button className={styles.btnGhost} onClick={onForgeAgain}>Forge Again</button>
        </div>
      </div>
    </ForgeChrome>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/forge/CelebrationView.tsx
git commit -m "feat(forge): add celebration view with circuit reveal"
```

---

### Task 12: GalleryView

**Files:**
- Create: `frontend/src/components/forge/GalleryView.tsx`

Collection gallery with tabs and locked/unlocked states.

- [ ] **Step 1: Create GalleryView.tsx**

```tsx
// frontend/src/components/forge/GalleryView.tsx
"use client";

import { useState } from "react";
import { CIRCUITS, CIRCUIT_KEYS, type CircuitKey, type CosmeticType } from "@/lib/forge/circuits";
import { ForgeChrome, SectionHeader } from "./ForgeChrome";
import { IlluminatedBanner } from "./IlluminatedBanner";
import styles from "./forge.module.css";

type TabFilter = "all" | CosmeticType;

const TABS: { label: string; filter: TabFilter }[] = [
  { label: "ALL", filter: "all" },
  { label: "BANNERS", filter: "banner" },
  { label: "PARCEL SKINS", filter: "parcelSkin" },
  { label: "HOLD DECORATIONS", filter: "holdDecoration" },
];

interface GalleryViewProps {
  forgedCircuits: CircuitKey[];
  onBack: () => void;
}

export function GalleryView({ forgedCircuits, onBack }: GalleryViewProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  const items = CIRCUIT_KEYS.filter(
    (k) => activeTab === "all" || CIRCUITS[k].cosmeticType === activeTab,
  );

  const forgedCount = forgedCircuits.length;

  return (
    <ForgeChrome>
      <SectionHeader
        title="THE COSMETIC RELIQUARY"
        meta={`${forgedCount} / ${CIRCUIT_KEYS.length} forged`}
      />

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 24,
          padding: "0 32px 16px",
          borderBottom: "1px solid rgba(214,193,154,0.12)",
        }}
      >
        {TABS.map(({ label, filter }) => {
          const count = filter === "all"
            ? CIRCUIT_KEYS.length
            : CIRCUIT_KEYS.filter((k) => CIRCUITS[k].cosmeticType === filter).length;
          const active = activeTab === filter;
          return (
            <button
              key={filter}
              onClick={() => setActiveTab(filter)}
              style={{
                paddingBottom: 10,
                borderBottom: active ? "2px solid oklch(0.78 0.13 75)" : "2px solid transparent",
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                background: "none",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: active ? "oklch(0.78 0.13 75)" : "transparent",
                cursor: "pointer",
              }}
            >
              <span
                className={styles.labelSm}
                style={{ color: active ? "oklch(0.78 0.13 75)" : "#6e5c3d" }}
              >
                {label}
              </span>
              <span className={styles.fontMono} style={{ fontSize: 10, color: "#6e5c3d" }}>
                {count}
              </span>
            </button>
          );
        })}
        <button
          className={styles.btnGhost}
          onClick={onBack}
          style={{ marginLeft: "auto", padding: "4px 12px" }}
        >
          Back to Forge
        </button>
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 24,
          padding: "28px 32px",
          position: "relative",
          zIndex: 3,
        }}
      >
        {items.map((key) => {
          const c = CIRCUITS[key];
          const unlocked = forgedCircuits.includes(key);
          return (
            <div
              key={key}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ transform: "scale(0.62)", transformOrigin: "top center", height: 360 * 0.62 + 4 }}>
                <IlluminatedBanner locked={!unlocked} name={key} circuit={c} />
              </div>
              <div style={{ textAlign: "center", marginTop: 6 }}>
                <div className={styles.labelSmAmber} style={{ fontSize: 9 }}>
                  {c.cosmeticType === "banner" ? "BANNER" : c.cosmeticType === "parcelSkin" ? "PARCEL SKIN" : "HOLD DECOR"}
                </div>
                <div
                  className={styles.fontSerif}
                  style={{
                    fontSize: 14,
                    color: unlocked ? "#efe3c5" : "#6e5c3d",
                    marginTop: 4,
                    letterSpacing: "0.14em",
                  }}
                >
                  {c.title}
                </div>
                <div className={styles.fontMono} style={{ fontSize: 10, color: "#6e5c3d", marginTop: 4, letterSpacing: "0.08em" }}>
                  {unlocked ? c.realName : "???"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ForgeChrome>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/forge/GalleryView.tsx
git commit -m "feat(forge): add gallery view (Cosmetic Reliquary)"
```

---

### Task 13: ProfileCard

**Files:**
- Create: `frontend/src/components/forge/ProfileCard.tsx`

Warlord's card with equipped banner and stats.

- [ ] **Step 1: Create ProfileCard.tsx**

```tsx
// frontend/src/components/forge/ProfileCard.tsx
"use client";

import { CIRCUITS, CIRCUIT_KEYS, type CircuitKey } from "@/lib/forge/circuits";
import { ForgeChrome } from "./ForgeChrome";
import { IlluminatedBanner } from "./IlluminatedBanner";
import { EmberField } from "./EmberField";
import styles from "./forge.module.css";

interface ProfileCardProps {
  equippedCosmetics: {
    banner: CircuitKey | null;
    parcelSkin: CircuitKey | null;
    holdDecoration: CircuitKey | null;
  };
  forgedCircuits: CircuitKey[];
  onChangeBanner: () => void;
  onBack: () => void;
}

export function ProfileCard({
  equippedCosmetics,
  forgedCircuits,
  onChangeBanner,
  onBack,
}: ProfileCardProps) {
  const bannerKey = equippedCosmetics.banner;
  const bannerCircuit = bannerKey ? CIRCUITS[bannerKey] : null;

  return (
    <ForgeChrome width={720} height={540}>
      <EmberField count={6} />

      <div
        style={{
          padding: "20px 32px",
          borderBottom: "1px solid rgba(214,193,154,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className={styles.fontSerif} style={{ color: "oklch(0.78 0.13 75)", fontSize: 14, letterSpacing: "0.28em" }}>
          WARLORD&apos;S CARD
        </div>
        <div className={`${styles.fontMono} ${styles.labelSm}`}>public profile · v3</div>
      </div>

      <div style={{ padding: 32, display: "flex", gap: 28, position: "relative", zIndex: 2 }}>
        {/* Banner */}
        <div>
          {bannerCircuit && bannerKey ? (
            <IlluminatedBanner scale={0.85} name={bannerKey} circuit={bannerCircuit} />
          ) : (
            <div
              style={{
                width: 238,
                height: 306,
                background: "rgba(0,0,0,0.3)",
                border: "1px dashed rgba(214,193,154,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6e5c3d",
                fontSize: 12,
                letterSpacing: "0.14em",
              }}
            >
              NO BANNER EQUIPPED
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div className={styles.labelSmAmber}>WARLORD</div>
          <div className={styles.fontSerif} style={{ fontSize: 24, color: "#efe3c5", marginTop: 6, letterSpacing: "0.16em" }}>
            MODUS, OF THE MARCHES
          </div>
          <div className={styles.fontMono} style={{ fontSize: 11, color: "#6e5c3d", marginTop: 6 }}>
            0x0502_13a0 · joined wk.124
          </div>

          <div style={{ marginTop: 20, padding: "14px 0", borderTop: "1px solid rgba(214,193,154,0.12)", borderBottom: "1px solid rgba(214,193,154,0.12)" }}>
            <div className={styles.labelSm}>EQUIPPED BANNER</div>
            <div style={{ marginTop: 6 }}>
              {bannerCircuit ? (
                <>
                  <div className={styles.fontSerif} style={{ fontSize: 16, color: "oklch(0.78 0.13 75)" }}>
                    {bannerCircuit.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#b39e74", marginTop: 4, fontStyle: "italic" }}>
                    {bannerCircuit.realName} · forged
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: "#6e5c3d" }}>None equipped</div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
            <div>
              <div className={styles.labelSm}>CIRCUITS FORGED</div>
              <div className={styles.fontMono} style={{ fontSize: 22, color: "oklch(0.78 0.13 75)", marginTop: 4 }}>
                {forgedCircuits.length} / {CIRCUIT_KEYS.length}
              </div>
            </div>
            <div>
              <div className={styles.labelSm}>HOLD STANDING</div>
              <div className={styles.fontMono} style={{ fontSize: 13, color: "#b39e74", marginTop: 4 }}>
                BANNERMAN · TIER II
              </div>
            </div>
          </div>

          <div style={{ marginTop: "auto", display: "flex", gap: 8, paddingTop: 16 }}>
            <button className={styles.btnGhostAmber} style={{ flex: 1 }} onClick={onChangeBanner}>
              Change Banner
            </button>
            <button className={styles.btnGhost} onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    </ForgeChrome>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/forge/ProfileCard.tsx
git commit -m "feat(forge): add ProfileCard (Warlord's Card) view"
```

---

### Task 14: Forge page (view router)

**Files:**
- Create: `frontend/src/app/forge/page.tsx`

The main page that switches between forge, celebration, gallery, and profile views.

- [ ] **Step 1: Create page.tsx**

```tsx
// frontend/src/app/forge/page.tsx
"use client";

import { useCallback, useEffect, useRef } from "react";
import { useForgeState } from "@/lib/forge/forgeState";
import { ForgeChrome, SectionHeader } from "@/components/forge/ForgeChrome";
import { ForgeBoard } from "@/components/forge/ForgeBoard";
import { ComponentTray } from "@/components/forge/ComponentTray";
import { BlueprintPicker } from "@/components/forge/BlueprintPicker";
import { CelebrationView } from "@/components/forge/CelebrationView";
import { GalleryView } from "@/components/forge/GalleryView";
import { ProfileCard } from "@/components/forge/ProfileCard";
import { EmberField } from "@/components/forge/EmberField";
import styles from "@/components/forge/forge.module.css";

export default function ForgePage() {
  const state = useForgeState();
  const litTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.isLit && state.currentView === "forge") {
      litTimerRef.current = setTimeout(() => {
        state.confirmForge();
      }, 2000);
      return () => {
        if (litTimerRef.current) clearTimeout(litTimerRef.current);
      };
    }
  }, [state.isLit, state.currentView]);

  const handleEquip = useCallback(() => {
    state.equipCosmetic(state.activeCircuit);
    state.setView("profile");
  }, [state]);

  if (state.currentView === "celebration") {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}>
        <CelebrationView
          circuitKey={state.activeCircuit}
          circuit={state.circuit}
          placedComponents={state.placedComponents}
          onEquip={handleEquip}
          onGallery={() => state.setView("gallery")}
          onForgeAgain={() => state.selectCircuit(state.activeCircuit)}
        />
      </div>
    );
  }

  if (state.currentView === "gallery") {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}>
        <GalleryView
          forgedCircuits={state.forgedCircuits}
          onBack={() => state.setView("forge")}
        />
      </div>
    );
  }

  if (state.currentView === "profile") {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}>
        <ProfileCard
          equippedCosmetics={state.equippedCosmetics}
          forgedCircuits={state.forgedCircuits}
          onChangeBanner={() => state.setView("gallery")}
          onBack={() => state.setView("forge")}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}>
      <ForgeChrome>
        <SectionHeader title="THE CIRCUIT FORGE" meta={`bench · ${state.forgedCircuits.length} / 7`} />

        <div style={{ display: "flex", gap: 20, padding: "0 32px", position: "relative", zIndex: 3 }}>
          <ComponentTray inventory={state.inventory} />

          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            <div style={{ position: "relative", padding: 20 }}>
              <span className={styles.lantern} style={{ left: 0, top: 0 }} />
              <span className={styles.lantern} style={{ right: 0, top: 0 }} />
              <span className={styles.lantern} style={{ left: 0, bottom: 0 }} />
              <span className={styles.lantern} style={{ right: 0, bottom: 0 }} />
              <ForgeBoard
                circuit={state.circuit}
                placedComponents={state.placedComponents}
                isLit={state.isLit}
                onDrop={state.placeComponent}
                onRemove={state.removeComponent}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                maxWidth: 530,
                padding: "14px 4px",
                borderTop: "1px solid rgba(214,193,154,0.12)",
                marginTop: 8,
              }}
            >
              <div>
                <div className={styles.labelSm}>PATTERN MATCH</div>
                <div
                  className={styles.fontMono}
                  style={{
                    fontSize: 13,
                    color: state.isLit ? "oklch(0.78 0.13 75)" : "#b39e74",
                    marginTop: 4,
                    letterSpacing: "0.06em",
                  }}
                >
                  {state.isLit
                    ? `${state.circuit.components.filter((c) => !c.locked).length} / ${state.circuit.components.filter((c) => !c.locked).length} conduits aligned`
                    : `${Object.keys(state.placedComponents).length} / ${state.circuit.components.filter((c) => !c.locked).length} conduits aligned`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={styles.btnGhost} onClick={() => state.setView("gallery")}>
                  Gallery
                </button>
                <button className={styles.btnGhost} onClick={() => state.setView("profile")}>
                  Profile
                </button>
                <button
                  className={styles.btnGhostAmber}
                  onClick={() => state.isLit && state.confirmForge()}
                  style={{
                    opacity: state.isLit ? 1 : 0.4,
                    cursor: state.isLit ? "pointer" : "not-allowed",
                    boxShadow: state.isLit ? "0 0 20px rgba(255,180,80,0.3)" : "none",
                  }}
                >
                  {state.isLit ? "◉ Aether Flowing" : "◯ Run Aether"}
                </button>
              </div>
            </div>
          </div>

          <BlueprintPicker
            activeCircuit={state.activeCircuit}
            circuit={state.circuit}
            isLit={state.isLit}
            onSelectCircuit={state.selectCircuit}
          />
        </div>

        {state.isLit && <EmberField count={14} />}
      </ForgeChrome>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors (or only pre-existing unrelated errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/forge/page.tsx
git commit -m "feat(forge): add forge page with view router"
```

---

### Task 15: Navigation and font integration

**Files:**
- Modify: `frontend/src/components/Navbar.tsx`
- Modify: `frontend/src/app/layout.tsx`

Wire the forge into the app: add nav link, add JetBrains Mono font.

- [ ] **Step 1: Add JetBrains Mono to layout.tsx**

In `frontend/src/app/layout.tsx`, add the JetBrains Mono import alongside the existing fonts:

```ts
import { Geist_Mono, Cinzel, JetBrains_Mono } from "next/font/google";
```

Add the font instance after the existing font declarations:

```ts
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });
```

Add the variable to the body className. Change:

```tsx
<body className={`${mono.variable} ${serif.variable} font-mono antialiased bg-[#0d0b0a] text-[#d4cfc6] min-h-screen`}>
```

to:

```tsx
<body className={`${mono.variable} ${serif.variable} ${jetbrains.variable} font-mono antialiased bg-[#0d0b0a] text-[#d4cfc6] min-h-screen`}>
```

- [ ] **Step 2: Update Navbar.tsx**

Change the "FORGE" link to "CRAFT" and add a "CIRCUIT FORGE" link. Find the nav links section and change:

```tsx
<Link href="/craft" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
  FORGE
</Link>
```

to:

```tsx
<Link href="/craft" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
  CRAFT
</Link>
<Link href="/forge" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
  CIRCUIT FORGE
</Link>
```

- [ ] **Step 3: Verify the dev server starts**

Run: `cd frontend && npx next build 2>&1 | tail -20`

Expected: Build succeeds. If there are pre-existing warnings, those are fine — look for no new errors in forge-related files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/components/Navbar.tsx
git commit -m "feat(forge): add CIRCUIT FORGE nav link and JetBrains Mono font"
```

---

### Task 16: Smoke test the full flow

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server and test the forge**

Run: `cd frontend && npm run dev`

Open `https://localhost:3000/forge` in a browser. Test:

1. The forge board renders with the wood-grain background, grid lines, and locked components (origin crystal + void drain)
2. Component tray shows 4 draggable component types with counts
3. Blueprint picker shows all 7 circuits; clicking each swaps the board
4. Dragging a component from the tray onto the board snaps to a grid peg
5. Placing all components correctly causes traces to light up (amber glow, flowing dashes)
6. After 2 seconds lit (or clicking "Run Aether"), celebration view appears
7. Celebration shows the lit board, illuminated banner, real circuit name + schematic
8. Clicking "Equip Banner" goes to profile with the banner displayed
9. Gallery shows all 7 circuits with correct locked/unlocked states
10. Refreshing the page preserves forged circuits and equipped cosmetics (localStorage)

- [ ] **Step 2: Fix any visual issues found during testing**

Adjust spacing, colors, or sizing as needed to match the design handoff. The design reference can be opened directly: `open frontend/design_handoff_circuit_forge/design/Circuit\ Forge.html`

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix(forge): visual polish from smoke test"
```

Only commit this if changes were needed. Skip if everything looks correct.
