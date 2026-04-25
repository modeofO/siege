# Circuit Forge — Design Spec

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Frontend only (no Cairo contracts)

## Overview

Circuit Forge is a cosmetic crafting subgame where players assemble real electronic circuit topologies on a fantasy-skinned forge board. The player never sees EE schematic symbols during gameplay — resistors are Rune Stones, capacitors are Flux Wells, etc. On completion, a "reveal" moment shows the real circuit they just built ("You just constructed a Half-Wave Rectifier"), turning every cosmetic into a stealth electronics lesson.

Completed circuits unlock cosmetic rewards: banners, parcel skins, and hold decorations. These are purely visual — no gameplay advantage.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Topology validation | Binary (all-or-nothing) | Simpler to implement, no partial feedback |
| Platform | Desktop only | Game is PC-only; no touch/mobile drag-and-drop |
| Blueprint availability | All unlocked from start | Skip unlock gating for testing |
| Cosmetic slots | Multiple (banner + parcel skin + hold decoration) | Player asked for it |
| Persistence | localStorage | No backend until design is validated |
| Backend contracts | None yet | Frontend-only until mechanism is proven |

## Routing & Navigation

Single route at `/forge`. Views managed by local state, not sub-routes.

**Navbar update:**

| Label | Route | Notes |
|-------|-------|-------|
| SIEGE | `/` | Existing |
| CRAFT | `/craft` | Existing (renamed from FORGE) |
| CIRCUIT FORGE | `/forge` | New |
| WORLD | `/world` | Existing |

## Views

Four views rendered by `app/forge/page.tsx` based on `currentView` state:

### 1. Forge (default)

Three-column layout inside the ForgeChrome wood-grain frame:

- **Left (240px):** Component tray — draggable inventory chips showing RuneIcon + name + count. Resource balances below.
- **Center (flex):** ForgeBoard — 8×6 SVG grid with carved stone channels. Locked components (origin crystal, void drain) pre-placed. Drop targets at each grid peg. Traces rendered as polylines between component coordinates. Below the board: pattern match counter + "Run Aether" button.
- **Right (220px):** Target silhouette (abstract, no topology hints), reward preview (locked banner thumbnail), blueprint picker (list of all 7 circuits).

### 2. Celebration

Triggered after topology match + 2s lit state (or manual trigger). Two-column layout:

- **Left:** Lit ForgeBoard (auto-playing, ornate component skins).
- **Right:** Full-size IlluminatedBanner reward.
- **Bottom panel:** Real circuit reveal — EE name, category, narrative blurb, real schematic SVG.
- **CTAs:** Equip Banner, To Gallery, Forge Again.

### 3. Gallery (Cosmetic Reliquary)

4-column grid of all cosmetic items. Tabs: All, Banners, Parcel Skins, Hold Decorations. Each card shows:

- IlluminatedBanner at 0.62× scale (locked items grayscale + dimmed with lock glyph)
- Category label, title, real circuit name
- Progress indicator for locked items (not used currently since all are unlocked, but structure is there)

### 4. Profile (Warlord's Card)

Two-column layout:

- **Left:** Equipped IlluminatedBanner at 0.85× scale.
- **Right:** Player handle, wallet address, equipped banner info, stat grid (parcels held, circuits forged, hold standing, allegiance). Change Banner + Share buttons.

## Component Architecture

```
app/forge/
  page.tsx                — view router

components/forge/
  ForgeBoard.tsx          — 8×6 SVG grid, drag-drop targets, trace rendering, lit/unlit
  ComponentTray.tsx       — left panel: draggable component chips
  BlueprintPicker.tsx     — right panel: circuit selector + silhouette + reward preview
  CelebrationView.tsx     — lit board + banner + reveal panel
  GalleryView.tsx         — cosmetic reliquary with tabs
  ProfileCard.tsx         — warlord's card
  ComponentDetail.tsx     — hover popover
  IlluminatedBanner.tsx   — procedural SVG banner from circuit topology
  CircuitSchematic.tsx    — real EE schematics for reveal
  RuneIcon.tsx            — SVG glyphs per component kind
  EmberField.tsx          — floating amber particles
  ForgeChrome.tsx         — wood-grain background, corner brackets, lanterns

lib/forge/
  circuits.ts             — 7 circuit topology definitions
  forgeState.ts           — localStorage persistence + useForgeState() hook
  topology.ts             — binary match validation
```

## Circuit Data

7 circuits, each defined as:

```ts
interface Circuit {
  title: string;         // fantasy name ("The First Gate")
  realName: string;      // EE name ("Half-Wave Rectifier")
  category: string;      // "rectifier · ac→dc · single-phase"
  blurb: string;         // 2-3 sentence narrative for celebration
  cosmeticType: 'banner' | 'parcelSkin' | 'holdDecoration';
  components: Array<{
    id: string;
    kind: ComponentKind;
    col: number;         // 0..7
    row: number;         // 0..5
    label: string;
    locked?: boolean;    // pre-placed, not draggable
  }>;
  traces: Array<{
    points: [number, number][];  // [col, row] pairs
  }>;
}

type ComponentKind =
  | 'origin-crystal'   // voltage source
  | 'void-drain'       // ground/sink
  | 'rune-stone'       // resistor
  | 'flux-well'        // capacitor
  | 'spiral-coil'      // inductor
  | 'one-way-valve';   // diode
```

| Key | Fantasy Name | Real Name | Cosmetic Type |
|-----|-------------|-----------|---------------|
| `half-wave-rectifier` | The First Gate | Half-Wave Rectifier | Banner |
| `voltage-divider` | Bleeder's Mark | Voltage Divider | Parcel Skin |
| `full-wave-rectifier` | The Twin Tide | Full-Wave Rectifier | Banner |
| `rc-low-pass` | The Still Pool | RC Low-Pass Filter | Banner |
| `lc-tank` | The Singing Spire | LC Tank | Banner |
| `buck-converter` | The Crown Step | Buck Converter | Hold Decoration |
| `common-emitter-amp` | The Herald's Voice | Common-Emitter Amp | Parcel Skin |

## State Management

```ts
// Session state (resets on page load)
activeCircuit: CircuitKey
placedComponents: Record<string, { col: number; row: number }>
isLit: boolean
currentView: 'forge' | 'celebration' | 'gallery' | 'profile'

// Persisted state (localStorage key: "siege:forgeState")
forgedCircuits: CircuitKey[]
equippedCosmetics: {
  banner: CircuitKey | null
  parcelSkin: CircuitKey | null
  holdDecoration: CircuitKey | null
}
componentInventory: Record<ComponentKind, number>
```

Custom hook `useForgeState()` manages both layers. Actions:

- `placeComponent(componentId, col, row)` — snap to grid, run validation
- `removeComponent(componentId)` — return to tray
- `confirmForge()` — add to forgedCircuits, transition to celebration
- `equipCosmetic(circuitKey)` — set in equippedCosmetics by cosmetic type
- `selectCircuit(circuitKey)` — change active blueprint, clear placements
- `setView(view)` — switch between forge/celebration/gallery/profile

## Drag-and-Drop

HTML5 native drag API (desktop only):

1. Tray components have `draggable="true"`, set `dataTransfer` with component kind + id on `dragstart`
2. ForgeBoard grid cells listen for `dragover` (prevent default to allow drop) and `drop`
3. On drop: snap to nearest grid peg, update `placedComponents`
4. Already-placed components on the board are also draggable (reposition or drag back to tray area to remove)
5. After every placement change: run `checkTopology()`

## Topology Validation

```ts
function checkTopology(
  placed: Record<string, { col: number; row: number }>,
  circuit: Circuit
): boolean {
  const targets = circuit.components.filter(c => !c.locked);
  if (Object.keys(placed).length !== targets.length) return false;
  return targets.every(target =>
    Object.entries(placed).some(([id, pos]) =>
      pos.col === target.col &&
      pos.row === target.row &&
      getComponentKind(id) === target.kind
    )
  );
}
```

Binary: returns true only when every non-locked component is placed at the correct (kind, col, row). No partial credit, no incremental trace lighting.

## Visual Design

### Aesthetic

Oil-lantern-lit blackwood, brass corner brackets, parchment cards, gold-leaf heraldry. Self-contained in forge components — does not change the rest of the app's styling.

### Design Tokens

Defined in `forge.module.css`:

- Wood: `#1a0f08` → `#2a190d` → `#3a2415` → `#4a2e1a`
- Parchment: `#d6c19a`, `#b39768`, `#6a5028`
- Amber accent: `oklch(0.78 0.13 75)` family (configurable hue)
- Ink (text on dark): `#efe3c5`, `#b39e74`, `#6e5c3d`

### Typography

- **Cinzel** (already loaded) — screen titles, banner titles, headings
- **JetBrains Mono** (add to layout.tsx) — technical readouts, circuit names, stats
- **Geist Mono** (already loaded) — fallback body text where Inter would go

### Animations

| Animation | Property | Duration | Easing |
|-----------|----------|----------|--------|
| `pulse-flow` | stroke-dashoffset 0 → -24 | 2s (÷ traceSpeed) | linear, infinite |
| `glow-pulse` | filter drop-shadow | 1.6s | ease-in-out, alternate, infinite |
| `float-up` | translateY + opacity | 2-4s random | ease-out, infinite |
| `shimmer` | opacity 0.6 ↔ 1 | 2s | ease-in-out, infinite |
| Board lit transition | trace dash → solid | 800ms | ease-in-out |
| Banner reveal | scale 0.9 → 1 + opacity | 600ms | cubic-bezier(.2,.8,.2,1) |

### Procedural Banners

IlluminatedBanner is generated from circuit topology data:

- Parchment field with aging stains
- Gold borders (outer 2px + inner 1px) with 4 corner rivets
- SVG content: Cinzel title, horizontal rules, central mandorla (two concentric ellipses)
- Topology emblem: circuit traces mapped through `ex(c) = -55 + (c/7)*110`, `ey(r) = -32 + (r/5)*64` drawn as gold-leaf knotwork
- Component glyphs as heraldic inlays at mapped positions
- Corner flourishes, top sigil (8-point star), Latin motto
- Locked variant: `filter: grayscale(0.9) brightness(0.4)` + dark overlay + lock glyph

## Component Inventory (Testing Mode)

Since all blueprints are unlocked and there are no contracts, component inventory starts pre-stocked with enough of each kind to build any circuit. Initial inventory:

- Rune Stone: 10
- Flux Well: 6
- Spiral Coil: 4
- One-Way Valve: 8

Placing a component on the board decrements inventory; removing it increments. This is session-only state for now.

## Integration Points

- **Navbar:** Add "CIRCUIT FORGE" link, rename existing "FORGE" to "CRAFT"
- **layout.tsx:** Add JetBrains Mono font import
- **No other existing code touched**

## Out of Scope

- Cairo contracts / on-chain state
- Mobile / touch support
- Blueprint unlock progression (economy gating)
- Resource spending to craft components (uses pre-stocked inventory)
- Multiplayer / sharing forged banners
- Banner display on world map parcels (future integration)
- Electrical simulation
