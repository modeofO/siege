> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Parcel Skins & Hold Crest Redesign — Arcane Ward Aesthetic

**Date:** 2026-05-17
**Status:** Draft
**Scope:** Redesign visual rendering of the 2 existing parcel skins and 1 hold crest from the Circuit Forge cosmetic system

## Problem

The current parcel skins render as SVG `<pattern>` fills — diagonal hatching (Bleeder's Mark) and concentric circles (Herald's Voice). These look like engineering drafting rather than medieval game cosmetics. The hold crest reuses the `IlluminatedBanner` parchment card at 0.5x scale in the sidebar, which is too tall and card-shaped for that context.

The visual language should be **circuit-meets-medieval** — the electronics heritage of the Circuit Forge is visible, but rendered through a fantasy lens.

## Design Direction: Arcane Wards

Each cosmetic renders its circuit topology (traces and component nodes from `circuits.ts`) as **glowing ward lines** — thin luminous traces that look like enchantments etched into the surface. The circuit data that already exists drives the visuals directly.

## Parcel Skins on Hex Grid

### Ward Lines (Traces)

The circuit's `traces` array (from `CIRCUITS[key].traces`) is projected onto the hex tile's interior coordinate space. The 8-column x 6-row circuit grid maps into a hex-inscribed rectangle.

Lines render as thin strokes (1.5–2px) with an SVG `feGaussianBlur` glow filter — a sharp bright core stroke with a soft diffused halo behind it.

### Parcel Type Tinting

The same skin design takes on different glow colors depending on the parcel type:

| Parcel Type | Core Color | Halo Color |
|-------------|-----------|------------|
| Forge (0)   | `#daa520` (gold/amber) | `#ff9500` |
| Quarry (1)  | `#7ab8e0` (steel-blue) | `#4a8ab8` |
| Grove (2)   | `#5ab87a` (emerald) | `#2a8a4a` |

### Node Sigils (Components)

Each circuit component renders as a small glyph at its grid position, using the same `HeraldGlyph` shapes already defined in `IlluminatedBanner.tsx`:

- Origin Crystal: diamond
- Void Drain: circle with dot
- Rune Stone: rectangle with crossbars
- Flux Well: circle
- Spiral Coil: triple circles
- One-Way Valve: triangle with bar

Rendered at ~6px scale. Nodes glow slightly brighter than traces — they're the anchor points of the ward.

### Outer Ward Ring

A single continuous inner hex polygon (replacing the current dashed ring) with the glow filter applied. Acts as the ward's containment boundary. Faint cross-hair corner marks at hex vertices instead of plain line segments.

### No Animation

Static rendering. Avoids visual noise when multiple parcels have wards equipped. Animation (subtle pulse on nodes) can be added as a follow-up if the static version looks flat.

### Projection Math

Circuit grid coordinates (col 0–7, row 0–5) map to a hex-inscribed rectangle:

```
hexInnerWidth  = HEX_SIZE * 1.2  (roughly sqrt(3)/2 * HEX_SIZE * 1.4)
hexInnerHeight = HEX_SIZE * 1.2

projX(col) = cx - hexInnerWidth/2 + (col / 7) * hexInnerWidth
projY(row) = cy - hexInnerHeight/2 + (row / 5) * hexInnerHeight
```

These constants may need tuning during implementation to avoid traces extending past hex edges.

## Hold Crest — Arcane Seal

### New Component: `ArcaneSeal`

A circular SVG component that replaces `IlluminatedBanner` in "equipped in context" displays.

**Structure:**
- Circular frame with double-ring border (outer ring solid 1.5px, inner ring dashed 0.8px)
- Circuit topology fills the interior — same glowing ward lines and node sigils as parcel skins
- Faint radial gradient background (dark center → transparent edge) so it floats without a card

**Title treatment:**
- Circuit title (e.g. "THE CROWN STEP") in small caps along the top arc of the outer ring
- Real circuit name (e.g. "Buck Converter") along the bottom arc in mono font, dimmer opacity

**Glow:**
- Soft outer glow on the seal boundary, using a neutral gold tint (`#daa520`)

### Props

```typescript
interface ArcaneSealProps {
  circuit: Circuit;
  name: string;
  size: number;        // diameter in px
  tintColor?: string;  // override glow color; defaults to gold
}
```

### Where It Renders

| Context | Replaces | Size |
|---------|----------|------|
| World sidebar ("Your Hold") | `IlluminatedBanner` at scale 0.5 | ~120px diameter |
| Match page (next to citadels) | `IlluminatedBanner` at scale 0.2 | ~60px diameter |

### What Stays

The `IlluminatedBanner` component is **not deleted**. It continues to be used in:
- `GalleryView` — browsing the full collection of forged circuits
- `ProfileCard` — the "Warlord's Card" showcase
- `CelebrationView` — post-forge reveal

These are "museum display" contexts where the parchment presentation fits. The `ArcaneSeal` is for "equipped in the field" contexts.

## Affected Files

### New Files

| File | Purpose |
|------|---------|
| `components/forge/ArcaneSeal.tsx` | Circular seal component for hold crest + banner display in context |

### Modified Files

| File | Change |
|------|--------|
| `components/HexGrid.tsx` | Replace `SKIN_DECOR` / `<pattern>` rendering with `WardOverlay` that projects circuit traces onto hex. Add glow filter defs. Remove `skin-divider` and `skin-emitter` pattern defs. |
| `app/world/page.tsx` | Replace `IlluminatedBanner` for hold crest with `ArcaneSeal` |
| `app/match-1v1/[id]/page.tsx` | Replace `IlluminatedBanner` for banner display with `ArcaneSeal` |

### Unchanged Files

| File | Reason |
|------|--------|
| `lib/forge/circuits.ts` | Circuit data (traces, components) already has everything needed |
| `lib/cosmetics.ts` | No data model changes |
| `lib/forge/forgeState.ts` | No state changes |
| `components/forge/IlluminatedBanner.tsx` | Stays for gallery/profile/celebration views |
| `components/forge/GalleryView.tsx` | Keeps using IlluminatedBanner |
| `components/forge/ProfileCard.tsx` | Keeps using IlluminatedBanner |
| Backend contracts | No on-chain changes |

## Performance

- Maximum 34 parcels on the grid; only owned parcels with an equipped skin get ward overlays — typically 3–12
- Static SVG, no animation, one shared `<filter>` definition in `<defs>` — minimal GPU cost
- If needed, ward overlays can be pre-rendered as `<symbol>` + `<use>` to deduplicate identical circuit topologies across multiple parcels

## Out of Scope

- Adding new circuit designs (new skins or crests)
- Animated ward effects (pulse, shimmer) — follow-up if static looks flat
- Changes to the Circuit Forge crafting UI itself
- Backend / contract changes
- Banner pennant redesign on the hex grid (the tiny flags on home parcels stay as-is)
