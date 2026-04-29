# Handoff: Circuit Forge — Siege Dojo

## Overview

**Circuit Forge** is a cosmetic crafting subgame for *Siege Dojo*, a fantasy-themed competitive game. Players assemble real electronic circuit topologies on a forge board to earn unique cosmetic banners and items. The fantasy fiction (runes, crystals, valves, flux wells) is a 1:1 mapping of EE concepts (resistors, voltage sources, diodes, capacitors), and on completion the game reveals the *real* circuit the player just assembled — turning every cosmetic into a stealth electronics lesson.

The design covers **5 screens** for the subgame plus a Tweaks panel for live design exploration:

1. **Circuit Forge** — main interactive board where players place components onto a wood-and-iron schematic table
2. **Completion / Real Circuit Reveal** — celebration moment showing the actual EE schematic, name, and cosmetic reward
3. **Component Detail Card** — hover/inspect popover for an individual component
4. **Public Warlord's Card** — player profile with equipped banner and crafting stats
5. **Cosmetic Reliquary** — collection gallery of all 8 unlocked/locked banners

All five surfaces share an aesthetic: oil-lantern-lit blackwood, brass corner brackets, parchment cards, gold-leaf heraldry. **Cinzel** (Roman caps) for titles, **JetBrains Mono** for technical readouts, **Inter** for body.

## About the Design Files

The files in the `design/` folder are **HTML design references** — interactive prototypes built in JSX/React purely to show intended look and behavior. They are **not production code to copy directly**.

Your task is to **recreate these designs in your project's existing environment** (React, Vue, SwiftUI, Unity UI, native game UI, etc.) using its established patterns, design system, and component library. If no UI environment exists yet, choose the most appropriate framework for the project and implement the designs there.

Treat the prototype as the source of truth for *visual* and *interaction* design. Treat your codebase as the source of truth for *implementation patterns*.

## Fidelity

**High-fidelity (hifi).** All colors, typography, spacing, animations, and interactions are final and intentional. The developer should recreate these screens **pixel-perfectly** using the codebase's existing libraries. Specifically:

- The wood-grain background, gold corner brackets, parchment textures, and lantern glows are central to the brand of this subgame and should not be substituted with a flatter look.
- The 8×6 forge grid, component glyphs, and trace pulse animation are core gameplay UI — keep proportions and timing.
- The illuminated-manuscript banner art is generated procedurally from circuit topology data (see [Procedural Banners](#procedural-banners)) and should remain so, not pre-rendered.

---

## Design Tokens

### Colors

```css
/* Wood / chrome */
--wood-1: #1a0f08;          /* deepest plank */
--wood-2: #2a190d;
--wood-3: #3a2415;
--wood-4: #4a2e1a;
--plank-line: #0a0604;      /* gap between planks */
--rivet: #1c1209;

/* Parchment */
--parchment: #d6c19a;       /* primary banner field */
--parchment-dark: #b39768;
--parchment-shadow: #6a5028;

/* Accents (oklch — hue is configurable per "accent tone") */
--amber: oklch(0.78 0.13 75);          /* default primary */
--amber-soft: oklch(0.72 0.10 75);
--amber-dim: oklch(0.55 0.09 75);
--amber-glow: oklch(0.85 0.16 80);     /* lit-state pulse */
--ember: oklch(0.62 0.18 35);          /* fire/warning */
--void: oklch(0.55 0.14 290);          /* drain/locked */

/* Ink (text on dark) */
--ink: #efe3c5;             /* primary text */
--ink-dim: #b39e74;         /* secondary */
--ink-faint: #6e5c3d;       /* tertiary / labels */

/* Rules */
--rule: rgba(214, 193, 154, 0.12);
--rule-strong: rgba(214, 193, 154, 0.25);
```

### Accent palette (Tweakable theme)

The amber hue is the default. Three additional accent tones are supported by replacing the `h` in the oklch expressions above:

| Tone      | Hue | Hex (reference) | Use |
|-----------|-----|------|-----|
| amber     | 75  | `#e8a857` | Default — fire/forge identity |
| verdigris | 165 | `#5fb89a` | Aged-bronze / scholar variant |
| blood     | 25  | `#c46a4a` | Bloodoak / war variant |
| arcane    | 250 | `#8a86d8` | Mage / aether variant |

### Typography

- **Cinzel** — `font-serif`, weights 500/600/700. Roman square caps. Used for screen titles, banner titles, headings. `letter-spacing: 0.08em`–`0.32em` (varies by usage).
- **JetBrains Mono** — `font-mono`, weights 400/500. All technical readouts: wallet addresses, circuit names, stats, build counters, voltages.
- **Inter** — body / UI default. Weights 400/500/600. Used for nav labels, button text, paragraphs.

Sizes (px):

| Use | Family | Size | Weight | Letter-spacing |
|-----|--------|------|--------|----------------|
| Screen title (section header) | Cinzel | 16 | 600 | 0.28em |
| Banner title | Cinzel | 14 | 700 | 0.18em |
| Body / paragraphs | Inter | 13–14 | 400 | normal |
| Mono readout | JetBrains Mono | 11–12 | 400 | 0.08em |
| Small caps label (`.label-sm`) | Inter | 10 | 500 | 0.22em, uppercase |
| Pill/button text | Inter | 11 | 500 | 0.18em, uppercase |

### Spacing

- Section padding: `20px 32px 16px` (top right bottom left)
- Card padding: `28px 32px`
- Inline gaps (button rows): `24px`
- Component-internal gaps: `6–14px`

### Borders & Radii

- All borders use `--rule` or `--rule-strong`, 1px.
- Border-radius is generally **2px** (slight chamfer, evokes carved-wood cards). Banners and parchment have 0px (rectangular). Lantern glows are `border-radius: 2px`.

### Shadows

- Lantern glow: `box-shadow: 0 0 18px 4px rgba(255,180,80,0.45), 0 0 40px 12px rgba(255,160,60,0.18)`
- Banner: `box-shadow: 0 8px 32px rgba(0,0,0,0.6), inset 0 0 40px rgba(120,80,30,0.3)`
- Active component on board: `filter: drop-shadow(0 0 8px var(--amber-glow))` (animated via `glow-pulse` keyframe)

### Surface treatments

- **`.wood-bg`** — base wood plank background. Combines repeating linear gradients (plank seams every 88–92px) with two radial gradients (warm light pooling) and a base `linear-gradient(180deg, #1a0f08 → #2a190d → #1a0f08)`. A `::before` pseudo-element adds four corner rivets and a subtle bottom warm pool.
- **`.wood-grain`** — adds two repeating linear gradients on top for fine grain texture.
- **`.parchment-panel`** — radial gradient `#ddc69c → #c4a774 → #9c7a44` with three randomly-positioned dark stains via `::before`.
- **`.bracket.tl/.tr/.bl/.br`** — 28×28 right-angle brackets in `var(--amber)`, anchored 10px from the corners of any framed panel. Each bracket only renders the two relevant edges (e.g., `.tl` has `border-right: none; border-bottom: none;`).
- **`.lantern`** — 14×18 amber pip with double-stop radial gradient + glow. Anchored at panel corners to imply illumination.

---

## Screens / Views

### 1. Circuit Forge (1280×820)

**Purpose.** The interactive heart of the subgame. Player drags forged components from a tray onto an 8×6 grid to match a hidden topology, watches traces light when correctly placed, and triggers the celebration on completion.

**Layout.**
- `NavStrip` (44px tall, full width) — nav, wallet, profile chips
- `SectionHeader` — "THE FORGE TABLE" + mono meta string (current circuit's category, e.g. `rectifier · ac→dc · single-phase`)
- Body: 3-column flex
  - **LEFT (220px)** — Inventory tray: forged components ready to place
  - **CENTER (flex 1)** — `ForgeBoard` framed in brackets and lanterns
  - **RIGHT (220px)** — Target Silhouette card + Blueprint picker + objective

**Components.**

- `ForgeBoard` — 8 cols × 6 rows of pegs. Components snap to grid positions. Traces are polylines drawn between component coordinates, dashed when unlit, solid + animated when lit. Lit state pulses via `glow-pulse` and trace dashes flow via `pulse-flow` (24px loop, speed multiplied by `traceSpeed` tweak).
- **Component glyphs** (at the player's grid positions): `origin-crystal` (faceted diamond), `void-drain` (target rings), `rune-stone` (rune-inscribed lozenge), `flux-well` (concentric circles with center dot), `spiral-coil` (3 linked rings), `one-way-valve` (triangle + bar). All drawn in SVG, 24px standard size, stroke `var(--amber)`. See `components/shared.jsx` `RuneIcon` for canonical paths.
- **Inventory tray (left)** — each component appears as a mini parchment chip: glyph + label (`RUNE`, `FLUX`, etc.) + small "drag me" hint. Locked components (origin/drain) are pre-placed and dimmed to indicate "given."
- **Target Silhouette card (right top)** — abstract sigil cartouche. **DELIBERATELY GIVES NO TOPOLOGY HINTS.** Shows a decorative ring with runic tick marks, a centered "?" glyph, and the circuit's **fictional title** ("The First Gate", "The Twin Tide", etc.). The player must figure out the layout on their own. Below: small caption `{N} crafted parts. The shape is yours to divine.`
- **Blueprint picker (right bottom)** — list of 6 blueprint titles. Active row highlighted with `rgba(255,180,80,0.10)` background and amber side-bar; inactive rows transparent with `var(--ink-dim)` text. Click swaps the active circuit. Below the list, a small `"⚒ FORGE"` button triggers the lit/celebration state.

**States.**

- **Unlit (default).** Traces are dashed, components are mid-amber, no glow.
- **Lit.** Traces solid amber, dashes flow at `traceSpeed`-modulated rate, components glow-pulse, ember particles drift up from below the board (`EmberField`, 8 particles, randomized).
- **Locked component.** Used for origin/drain — desaturated, slightly smaller, no interaction.

### 2. Celebration / Real Circuit Reveal (1280×820)

**Purpose.** The payoff. After lighting the forge, this screen reveals what the player just built in *real EE terms* and grants the cosmetic.

**Layout.**
- Same `NavStrip` + `SectionHeader` ("THE GATE OPENS")
- Two equal columns
  - **LEFT** — Lit `ForgeBoard` (small, ornate, autoplaying), with celebratory text below: real circuit name, category tag, and a 2–3 sentence narrative blurb that ties the fiction to the function (see `circuits.jsx` `blurb` field).
  - **RIGHT** — `CircuitSchematic`: real EE schematic for the circuit, drawn with proper symbols (resistor zigzag, capacitor parallel plates, inductor humps, diode triangle+bar, transistor circle with three leads, ground triple-bar). Below: the granted cosmetic — full-size `IlluminatedBanner` reward.
- Bottom: pair of CTA buttons — `EQUIP BANNER` (filled amber) and `RETURN TO FORGE` (ghost).

### 3. Component Detail Card (720×540)

**Purpose.** Hover/inspect popover for a single component.

**Layout.** Single parchment card with brass brackets at all four corners, centered in a wood-grain wash backdrop.

**Content (top to bottom).**
- Pill chip with category (e.g., `RESISTIVE · LINEAR`)
- Big title in Cinzel (the fictional name, e.g. `RUNE STONE`)
- Subtitle in mono (the EE name, e.g. `Resistor — 4.7kΩ ±5%`)
- 3-row stat grid:
  - `RESISTANCE  4.7 kΩ`
  - `TOLERANCE   ±5%`
  - `RATING      0.25 W`
- Body paragraph of flavor text (Inter, 13px, 1.6 line-height, max ~50 chars/line)
- Bottom row: tag chips (`ANALOG`, `LINEAR`, `THERMAL-SAFE`)

### 4. Public Warlord's Card (720×540)

**Purpose.** Shareable player profile with equipped banner.

**Layout.** Two columns inside a wood-grain frame:
- **LEFT (40%)** — equipped `IlluminatedBanner` at 0.85× scale.
- **RIGHT (60%)** — Cinzel title (handle), mono wallet, body bio paragraph, then a bordered "EQUIPPED BANNER" block (Cinzel name + italic mono `{circuit.realName} · forged on day 47`), then a 4-stat grid (`CIRCUITS FORGED 47`, `BLUEPRINTS 6/12`, `WINS 312`, `RANK Captain II`).

### 5. Cosmetic Reliquary / Gallery (1280×820)

**Purpose.** Collection view — see what you've unlocked, what you're chasing.

**Layout.**
- Standard nav + section header "THE COSMETIC RELIQUARY", meta `3 / 8 forged`
- Tabs: `ALL (8) · BANNERS (4) · PARCEL SKINS (2) · HOLD DECORATIONS (1)`
- 4-column grid of cosmetic cards, each:
  - `IlluminatedBanner` at 0.62× scale (locked items rendered grayscale + dimmed via `filter: grayscale(0.9) brightness(0.4)` + dark overlay with a small lock glyph)
  - Category small-cap label (amber)
  - Cinzel title
  - Mono real-circuit name
  - For locked items: progress bar (30×2px rule, ember-fill proportional to progress) + percent text

---

## Procedural Banners

The `IlluminatedBanner` component is **generated from circuit topology data**, not pre-rendered art. The same data that drives the forge board drives the heraldic motif inside the banner. This is core: it ensures every cosmetic in the game is unique and earned.

**Banner anatomy (280×360 default size).**
- Parchment field with two radial stains for aging
- Outer gold border (2px, `--amber` family) + inner thin gold border (1px) — both inset 12/18px from edges
- 4 gold rivets at corners
- SVG content area (viewBox `0 0 200 280`):
  - Top: title in Cinzel caps (`{circuit.title.toUpperCase()}`), with horizontal rule below
  - Center: heraldic emblem inside a mandorla (two concentric ellipses, 70×80 + 62×72)
    - **Topology emblem.** Each circuit's `traces` (polylines on the 8×6 grid) and `components` (with kind/col/row) are mapped through `ex(c) = -55 + (c/7)*110` and `ey(r) = -32 + (r/5)*64` and drawn as gold-leaf knotwork inside the mandorla. Components become small heraldic glyphs (each kind has a custom inlay shape — see `components/screens.jsx` `IlluminatedBanner` `glyph` map).
    - 4 corner flourishes (curved arcs)
    - Top sigil: small 8-point star
  - Bottom: italic Latin motto `ut superius est inferius`, then mono kebab-case key
- **Locked variant** — entire banner gets `filter: grayscale(0.9) brightness(0.4)` and a dark overlay with center-aligned padlock glyph.

---

## Circuit data model

The 6 supported circuits are defined in `components/circuits.jsx`. Schema:

```ts
interface Circuit {
  title: string;        // fictional ("The First Gate")
  realName: string;     // EE name ("Half-Wave Rectifier")
  category: string;     // mono subtitle ("rectifier · ac→dc · single-phase")
  blurb: string;        // 2–3 sentences for celebration screen
  components: Array<{
    id: string;
    kind: 'origin-crystal' | 'void-drain' | 'rune-stone'
        | 'flux-well' | 'spiral-coil' | 'one-way-valve';
    col: number;        // 0..7
    row: number;        // 0..5
    label: string;      // shown on hover / detail
    locked?: boolean;   // if true, pre-placed; player can't move
  }>;
  traces: Array<{
    points: [number, number][];  // grid coords [col, row]
  }>;
}
```

Mapping fiction → EE:

| Fiction (in-game name) | Symbol | EE part |
|------------------------|--------|---------|
| origin-crystal | faceted diamond | Voltage source |
| void-drain     | target rings    | Ground / sink |
| rune-stone     | rune lozenge    | Resistor |
| flux-well      | concentric ⊙    | Capacitor |
| spiral-coil    | linked rings    | Inductor |
| one-way-valve  | ▷│              | Diode |

All 6 circuits in the prototype:

1. `half-wave-rectifier` — *The First Gate*
2. `voltage-divider` — *Bleeder's Mark*
3. `full-wave-rectifier` — *The Twin Tide* (4-diode bridge)
4. `rc-low-pass` — *The Still Pool*
5. `lc-tank` — *The Singing Spire* (parallel resonant)
6. `buck-converter` — *The Crown Step*

(The collection gallery references 2 more — Common-Emitter Amp / "The Herald's Voice" and "???" — not yet defined as playable.)

---

## Interactions & Behavior

### Forge Board

- **Drag-and-drop.** Components in the inventory tray are draggable. Drop targets are the 48 grid intersections. Snap to nearest peg on drop. Invalid drops (overlap, off-board) bounce back to tray.
- **Match detection.** When all non-locked components match the active blueprint's `(kind, col, row)` triples and the implied trace network is closed, the board transitions to **lit**.
- **Lit transition.** 800ms ease-in-out:
  - Traces fade dash→solid
  - Trace stroke dasharray begins flowing (`stroke-dashoffset` animates 0 → -24 over `2 / traceSpeed` seconds, infinite linear)
  - Component glyphs gain `glow-pulse` (1.6s ease-in-out alternate)
  - `EmberField` mounts at the bottom — 8 particles, each `float-up` 2–4s ease-out infinite with randomized delay/dur
- **Trigger reveal.** After 2s lit, auto-advance to Celebration screen (or click `⚒ FORGE` to advance immediately).

### Tweaks panel

The prototype includes a Tweaks panel for designers/devs to switch circuits and try variations live. **You don't need to ship this in production**; it's a design tool. The relevant production-facing toggles are:

- Active circuit (controls which blueprint is being forged)
- Lit/unlit preview state

### Animations & Timing

| Animation | Property | Duration | Easing |
|-----------|----------|----------|--------|
| `pulse-flow` | `stroke-dashoffset` 0 → -24 | `2 / traceSpeed`s | linear, infinite |
| `glow-pulse` | `filter` drop-shadow blur | 1.6s | ease-in-out, alternate, infinite |
| `float-up` | `translateY(0 → -40px)` + opacity 0.6 → 0 | 2–4s (random) | ease-out, infinite |
| `shimmer` | `opacity` 0.6 ↔ 1 | 2s | ease-in-out, infinite |
| Banner reveal (celebration) | scale 0.9 → 1 + opacity 0 → 1 | 600ms | cubic-bezier(.2,.8,.2,1) |
| Forge board lit transition | trace dash → solid | 800ms | ease-in-out |

### Hover states

- Buttons (`.btn-ghost`) — background `rgba(255,180,80,0.06)` on hover.
- Component on board — slight lift (translateY -1px), tooltip with `{label}` + `{kind}` after 400ms.
- Gallery card — banner brightness +5%, title color shift `--ink` → `--amber`.

---

## State Management

```ts
interface ForgeState {
  activeCircuitKey: CircuitKey;        // which blueprint
  placedComponents: Map<string, GridCoord>;   // player's drag state
  isLit: boolean;                      // true once topology matches
  unlockedCosmetics: Set<CircuitKey>;  // for gallery + profile
  equippedBanner: CircuitKey;          // for profile
  resources: { iron: number; stone: number; ember: number };
  accentTone: 'amber' | 'verdigris' | 'blood' | 'arcane';
}
```

Transitions:
- `place(component, coord)` → updates `placedComponents`, then runs `checkMatch()` → if match, sets `isLit: true` after a 200ms debounce.
- `confirmForge()` → pushes `activeCircuitKey` into `unlockedCosmetics`, opens Celebration.
- `equipBanner(key)` → sets `equippedBanner`.

No data fetching is required for the subgame mechanics themselves. Server roundtrip points: persisting unlocked cosmetics, equipped banner, and resources after a successful forge.

---

## Assets

All assets in this prototype are **inline SVG** drawn at runtime. There are no external image files.

- Component glyphs — see `RuneIcon` in `components/shared.jsx`
- Real EE schematic primitives (resistor, cap, inductor, diode, transistor, ground) — see `components/circuit-art.jsx` `CircuitSchematic`
- Banner heraldry — generated from circuit topology, see `components/screens.jsx` `IlluminatedBanner`
- Wood / parchment / lantern / bracket textures — pure CSS gradients, no images

Fonts (Google Fonts):
- Cinzel — weights 500, 600, 700
- JetBrains Mono — weights 400, 500
- Inter — weights 400, 500, 600

---

## Files in this bundle

```
design/
├── Circuit Forge.html       # entry point — open in a browser to see all 5 screens
├── app.jsx                  # top-level App, Tweaks panel wiring
├── design-canvas.jsx        # presentation canvas (NOT for production — design tool only)
├── tweaks-panel.jsx         # tweaks panel (NOT for production — design tool only)
└── components/
    ├── shared.jsx           # NavStrip, SectionHeader, EmberField, RuneIcon, ResourceChip, ACCENTS
    ├── circuits.jsx         # the 6 circuit topology definitions (CIRCUITS map)
    ├── circuit-art.jsx      # CircuitSilhouette + CircuitSchematic SVG components
    ├── forge-board.jsx      # the 8×6 ForgeBoard (grid, traces, glyphs, lit state)
    └── screens.jsx          # all 5 screens + IlluminatedBanner
```

**Files to recreate in production:** everything in `components/` plus the styles in the `<style>` block of `Circuit Forge.html`.

**Files to skip:** `design-canvas.jsx` and `tweaks-panel.jsx` — they are scaffolding for the design exploration tool, not part of the game.

---

## Open questions for product / engineering

These are intentionally left for the implementing team:

1. **Match detection threshold.** Should partial/incorrect placements give incremental feedback (a single trace lights when its endpoints are correct) or a binary lit-when-everything-correct gate? The prototype assumes binary.
2. **Drag affordance for touch.** The prototype is mouse/desktop; touch tweaks (long-press to lift, haptic on snap) are out of scope here.
3. **Circuit unlock progression.** The gallery shows percent-progress bars on locked items, but the actual unlock economy (do you discover blueprints by playing matches? buy them with ember?) is product-side.
4. **Banner equipped slot count.** The profile shows one. Engineering should confirm whether more slots (e.g., banner + parcel skin + hold decoration) are simultaneously equippable.
