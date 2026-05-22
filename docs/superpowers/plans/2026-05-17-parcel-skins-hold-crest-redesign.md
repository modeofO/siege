> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Parcel Skins & Hold Crest Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace engineering-drafting parcel skins with glowing arcane ward lines that project circuit topologies onto hex tiles, and create a circular ArcaneSeal component to replace IlluminatedBanner in "equipped in context" displays.

**Architecture:** Circuit topology data already exists in `circuits.ts` — traces (polylines) and components (positioned glyphs). The ward renderer projects these onto hex tiles or a circular seal using SVG with `feGaussianBlur` glow filters. Parcel type tints the glow color. No backend or data model changes.

**Tech Stack:** React 19, SVG, Next.js 16 (all frontend-only)

**Spec:** `docs/superpowers/specs/2026-05-17-parcel-skins-hold-crest-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/forge/wardProjection.ts` | Create | Pure functions: project circuit grid coords → hex or circle viewport, glow color lookup by parcel type |
| `frontend/src/components/forge/WardGlyph.tsx` | Create | Scaled-down ward version of HeraldGlyph (6px scale, glow-colored, no fill) |
| `frontend/src/components/forge/ArcaneSeal.tsx` | Create | Circular seal component for hold crest / banner in-context display |
| `frontend/src/components/HexGrid.tsx` | Modify | Remove SKIN_DECOR/pattern system, add WardOverlay using ward projection |
| `frontend/src/app/world/page.tsx` | Modify | Replace IlluminatedBanner with ArcaneSeal for hold crest |
| `frontend/src/app/match-1v1/[id]/page.tsx` | Modify | Replace IlluminatedBanner with ArcaneSeal for banner display |

---

### Task 1: Create ward projection utilities

**Files:**
- Create: `frontend/src/lib/forge/wardProjection.ts`

- [ ] **Step 1: Create the projection and color utility module**

```typescript
// frontend/src/lib/forge/wardProjection.ts
import type { CircuitTrace, CircuitComponent } from "./circuits";

export interface WardTint {
  core: string;
  halo: string;
}

const PARCEL_TINTS: Record<number, WardTint> = {
  0: { core: "#daa520", halo: "#ff9500" },   // Forge — amber
  1: { core: "#7ab8e0", halo: "#4a8ab8" },   // Quarry — steel-blue
  2: { core: "#5ab87a", halo: "#2a8a4a" },   // Grove — emerald
};

const DEFAULT_TINT: WardTint = { core: "#daa520", halo: "#ff9500" };

export function getWardTint(parcelType: number): WardTint {
  return PARCEL_TINTS[parcelType] ?? DEFAULT_TINT;
}

export function projectToHex(
  col: number,
  row: number,
  cx: number,
  cy: number,
  hexSize: number,
): { x: number; y: number } {
  const innerW = hexSize * 1.2;
  const innerH = hexSize * 1.2;
  return {
    x: cx - innerW / 2 + (col / 7) * innerW,
    y: cy - innerH / 2 + (row / 5) * innerH,
  };
}

export function projectToCircle(
  col: number,
  row: number,
  radius: number,
): { x: number; y: number } {
  const innerW = radius * 1.4;
  const innerH = radius * 1.4;
  return {
    x: -innerW / 2 + (col / 7) * innerW,
    y: -innerH / 2 + (row / 5) * innerH,
  };
}

export function traceToHexPoints(
  trace: CircuitTrace,
  cx: number,
  cy: number,
  hexSize: number,
): string {
  return trace.points
    .map(([c, r]) => {
      const { x, y } = projectToHex(c, r, cx, cy, hexSize);
      return `${x},${y}`;
    })
    .join(" ");
}

export function traceToCirclePoints(
  trace: CircuitTrace,
  radius: number,
): string {
  return trace.points
    .map(([c, r]) => {
      const { x, y } = projectToCircle(c, r, radius);
      return `${x},${y}`;
    })
    .join(" ");
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit src/lib/forge/wardProjection.ts`

If `tsc` complains about isolated module resolution, run `npx tsc --noEmit` (full project) instead and check that the new file has no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/forge/wardProjection.ts
git commit -m "feat: add ward projection utilities for arcane ward rendering"
```

---

### Task 2: Create WardGlyph component

**Files:**
- Create: `frontend/src/components/forge/WardGlyph.tsx`

The WardGlyph is a scaled-down, glow-colored version of HeraldGlyph from IlluminatedBanner. It renders at ~6px scale using stroke-only shapes (no solid fills) so the glow filter reads clearly at small hex size.

- [ ] **Step 1: Create the WardGlyph component**

```tsx
// frontend/src/components/forge/WardGlyph.tsx
"use client";

interface WardGlyphProps {
  kind: string;
  cx: number;
  cy: number;
  color: string;
}

export function WardGlyph({ kind, cx, cy, color }: WardGlyphProps) {
  switch (kind) {
    case "origin-crystal":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon points="0,-4 3.5,0 0,4 -3.5,0" fill="none" stroke={color} strokeWidth="1.2" />
          <circle r="1" fill={color} />
        </g>
      );
    case "void-drain":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="3.5" fill="none" stroke={color} strokeWidth="1" />
          <circle r="1.2" fill={color} />
        </g>
      );
    case "rune-stone":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <rect x="-3" y="-3.5" width="6" height="7" rx="0.5" fill="none" stroke={color} strokeWidth="1" />
          <line x1="-1.5" y1="0" x2="1.5" y2="0" stroke={color} strokeWidth="0.8" />
        </g>
      );
    case "flux-well":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="3.5" fill="none" stroke={color} strokeWidth="1" />
          <circle r="1.5" fill="none" stroke={color} strokeWidth="0.6" />
        </g>
      );
    case "spiral-coil":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle cx="-2.5" cy="0" r="1.8" fill="none" stroke={color} strokeWidth="0.8" />
          <circle cx="0" cy="0" r="1.8" fill="none" stroke={color} strokeWidth="0.8" />
          <circle cx="2.5" cy="0" r="1.8" fill="none" stroke={color} strokeWidth="0.8" />
        </g>
      );
    case "one-way-valve":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon points="-3,-3 3,0 -3,3" fill="none" stroke={color} strokeWidth="1" />
          <line x1="3" y1="-3" x2="3" y2="3" stroke={color} strokeWidth="1" />
        </g>
      );
    default:
      return null;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors related to WardGlyph.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/forge/WardGlyph.tsx
git commit -m "feat: add WardGlyph component for arcane ward node sigils"
```

---

### Task 3: Create ArcaneSeal component

**Files:**
- Create: `frontend/src/components/forge/ArcaneSeal.tsx`

The ArcaneSeal is a circular SVG component that renders a circuit's topology as glowing ward lines inside a double-ring seal frame. Used in world sidebar and match page to replace IlluminatedBanner for "equipped in context" displays.

- [ ] **Step 1: Create the ArcaneSeal component**

```tsx
// frontend/src/components/forge/ArcaneSeal.tsx
"use client";

import type { Circuit } from "@/lib/forge/circuits";
import { projectToCircle, traceToCirclePoints } from "@/lib/forge/wardProjection";
import { WardGlyph } from "./WardGlyph";

interface ArcaneSealProps {
  circuit: Circuit;
  name: string;
  size: number;
  tintColor?: string;
}

export function ArcaneSeal({ circuit, name, size, tintColor = "#daa520" }: ArcaneSealProps) {
  const r = size / 2;
  const traceRadius = r * 0.7;
  const filterId = `seal-glow-${name.replace(/\s+/g, "-")}`;

  return (
    <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`}>
      <defs>
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feFlood floodColor={tintColor} floodOpacity="0.5" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`seal-bg-${name.replace(/\s+/g, "-")}`}>
          <stop offset="0%" stopColor="#0a0604" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0a0604" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background */}
      <circle r={r - 2} fill={`url(#seal-bg-${name.replace(/\s+/g, "-")})`} />

      {/* Outer ring — solid */}
      <circle r={r - 3} fill="none" stroke={tintColor} strokeWidth="1.5" strokeOpacity="0.6" />
      {/* Inner ring — dashed */}
      <circle r={r - 8} fill="none" stroke={tintColor} strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="3 2" />

      {/* Title along top arc */}
      <defs>
        <path id={`seal-arc-top-${name.replace(/\s+/g, "-")}`} d={`M ${-(r - 12)},0 A ${r - 12},${r - 12} 0 0,1 ${r - 12},0`} fill="none" />
        <path id={`seal-arc-bot-${name.replace(/\s+/g, "-")}`} d={`M ${-(r - 12)},0 A ${r - 12},${r - 12} 0 0,0 ${r - 12},0`} fill="none" />
      </defs>
      {size >= 100 && (
        <>
          <text fill={tintColor} fillOpacity="0.7" fontSize={size > 100 ? 7 : 5} fontFamily="Cinzel, serif" letterSpacing="2" textAnchor="middle">
            <textPath href={`#seal-arc-top-${name.replace(/\s+/g, "-")}`} startOffset="50%">
              {circuit.title.toUpperCase()}
            </textPath>
          </text>
          <text fill={tintColor} fillOpacity="0.4" fontSize={size > 100 ? 5 : 4} fontFamily='"JetBrains Mono", monospace' letterSpacing="1.5" textAnchor="middle">
            <textPath href={`#seal-arc-bot-${name.replace(/\s+/g, "-")}`} startOffset="50%">
              {circuit.realName}
            </textPath>
          </text>
        </>
      )}

      {/* Ward traces */}
      <g filter={`url(#${filterId})`}>
        {circuit.traces.map((trace, i) => (
          <polyline
            key={i}
            points={traceToCirclePoints(trace, traceRadius)}
            fill="none"
            stroke={tintColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* Node sigils */}
        {circuit.components.map((comp) => {
          const { x, y } = projectToCircle(comp.col, comp.row, traceRadius);
          return <WardGlyph key={comp.id} kind={comp.kind} cx={x} cy={y} color={tintColor} />;
        })}
      </g>

      {/* Outer glow ring */}
      <circle r={r - 1} fill="none" stroke={tintColor} strokeWidth="0.5" strokeOpacity="0.2" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors related to ArcaneSeal.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/forge/ArcaneSeal.tsx
git commit -m "feat: add ArcaneSeal component for equipped-in-context cosmetic display"
```

---

### Task 4: Replace parcel skin rendering in HexGrid

**Files:**
- Modify: `frontend/src/components/HexGrid.tsx`

This is the biggest change. We remove the `SKIN_DECOR` interface, the `SKIN_DECOR` lookup object, the `getSkinDecor` function, and the two SVG `<pattern>` defs (`skin-divider`, `skin-emitter`). We replace them with a ward overlay that projects the circuit topology onto each skinned hex tile.

- [ ] **Step 1: Add imports for ward projection, WardGlyph, and CIRCUITS at the top of HexGrid.tsx**

Add after the existing imports (line 6):

```tsx
import { CIRCUITS } from "@/lib/forge/circuits";
import { projectToHex, traceToHexPoints, getWardTint } from "@/lib/forge/wardProjection";
import { WardGlyph } from "@/components/forge/WardGlyph";
```

- [ ] **Step 2: Remove the SkinDecor interface and SKIN_DECOR constant**

Delete lines 64–95 of `HexGrid.tsx`:

```
interface SkinDecor { ... }

const SKIN_DECOR: Record<string, SkinDecor> = { ... };

function getSkinDecor(skin: string | null): SkinDecor | null { ... }
```

These are being replaced by the ward projection system.

- [ ] **Step 3: Remove the pattern defs from the SVG**

In the `<defs>` section inside the SVG (currently lines 191–199), remove the two `<pattern>` elements:

```
{/* Parcel skin: Bleeder's Mark — gold diagonal slashes */}
<pattern id="skin-divider" ... > ... </pattern>
{/* Parcel skin: Herald's Voice — blue concentric rings */}
<pattern id="skin-emitter" ... > ... </pattern>
```

- [ ] **Step 4: Add ward glow filter defs**

In the `<defs>` section (after the existing `glow-gold` filter), add:

```tsx
<filter id="ward-glow" x="-30%" y="-30%" width="160%" height="160%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
  <feMerge>
    <feMergeNode in="blur" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>
```

- [ ] **Step 5: Replace the skin overlay rendering inside the parcel map**

Currently the parcel rendering block (around lines 207–277) does:
1. Computes `skinDecor` via `getSkinDecor(ownerCosmetics?.parcelSkin ?? null)`
2. Renders pattern fill, inner ring, corner marks, and center emblem using `skinDecor`

Replace `const skinDecor = getSkinDecor(...)` with:

```tsx
const skinKey = ownerCosmetics?.parcelSkin ?? null;
const skinCircuit = skinKey ? CIRCUITS[skinKey] : null;
```

Then replace the entire `{skinDecor && ( ... )}` JSX block (pattern fill, inner ring, corner marks, center emblem) with:

```tsx
{skinCircuit && (() => {
  const tint = getWardTint(parcel.parcelType);
  return (
    <g filter="url(#ward-glow)">
      {/* Ward containment ring */}
      <polygon
        points={hexPoints(x, y, HEX_SIZE - 5)}
        fill="none"
        stroke={tint.core}
        strokeWidth={1}
        strokeOpacity={0.5}
      />
      {/* Ward traces */}
      {skinCircuit.traces.map((trace, i) => (
        <polyline
          key={i}
          points={traceToHexPoints(trace, x, y, HEX_SIZE)}
          fill="none"
          stroke={tint.core}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.85}
        />
      ))}
      {/* Node sigils */}
      {skinCircuit.components.map((comp) => {
        const pos = projectToHex(comp.col, comp.row, x, y, HEX_SIZE);
        return (
          <WardGlyph
            key={comp.id}
            kind={comp.kind}
            cx={pos.x}
            cy={pos.y}
            color={tint.core}
          />
        );
      })}
      {/* Corner cross-hairs */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (Math.PI / 180) * (60 * i + 30);
        const r1 = HEX_SIZE - 5;
        const r2 = HEX_SIZE - 9;
        const x1 = x + r1 * Math.cos(angle);
        const y1 = y + r1 * Math.sin(angle);
        const x2 = x + r2 * Math.cos(angle);
        const y2 = y + r2 * Math.sin(angle);
        const perpAngle = angle + Math.PI / 2;
        const armLen = 1.5;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tint.core} strokeWidth={0.8} strokeOpacity={0.6} />
            <line
              x1={x2 - armLen * Math.cos(perpAngle)}
              y1={y2 - armLen * Math.sin(perpAngle)}
              x2={x2 + armLen * Math.cos(perpAngle)}
              y2={y2 + armLen * Math.sin(perpAngle)}
              stroke={tint.core}
              strokeWidth={0.8}
              strokeOpacity={0.6}
            />
          </g>
        );
      })}
    </g>
  );
})()}
```

- [ ] **Step 6: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/HexGrid.tsx
git commit -m "feat: replace pattern-fill parcel skins with arcane ward overlay"
```

---

### Task 5: Replace IlluminatedBanner with ArcaneSeal in world page

**Files:**
- Modify: `frontend/src/app/world/page.tsx`

- [ ] **Step 1: Update imports**

In `frontend/src/app/world/page.tsx`, replace the IlluminatedBanner import (line 15):

```tsx
import { IlluminatedBanner } from "@/components/forge/IlluminatedBanner";
```

with:

```tsx
import { ArcaneSeal } from "@/components/forge/ArcaneSeal";
```

- [ ] **Step 2: Replace hold crest rendering**

Find the hold decoration block (lines 295–309):

```tsx
{/* Hold decoration */}
<div className="space-y-1">
  <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Hold Crest</div>
  {myCosmetics?.holdDecoration && CIRCUITS[myCosmetics.holdDecoration] ? (
    <div className="flex justify-center">
      <IlluminatedBanner
        circuit={CIRCUITS[myCosmetics.holdDecoration]}
        name={CIRCUITS[myCosmetics.holdDecoration].title}
        scale={0.5}
      />
    </div>
  ) : (
    <div className="text-[10px] text-[#7a7060]">None equipped</div>
  )}
</div>
```

Replace with:

```tsx
{/* Hold decoration */}
<div className="space-y-1">
  <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Hold Crest</div>
  {myCosmetics?.holdDecoration && CIRCUITS[myCosmetics.holdDecoration] ? (
    <div className="flex justify-center">
      <ArcaneSeal
        circuit={CIRCUITS[myCosmetics.holdDecoration]}
        name={myCosmetics.holdDecoration}
        size={120}
      />
    </div>
  ) : (
    <div className="text-[10px] text-[#7a7060]">None equipped</div>
  )}
</div>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. Check that `IlluminatedBanner` is no longer imported (it's only used for the hold crest in this file).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/world/page.tsx
git commit -m "feat: replace IlluminatedBanner with ArcaneSeal for hold crest in world sidebar"
```

---

### Task 6: Replace IlluminatedBanner with ArcaneSeal in match page

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

- [ ] **Step 1: Update imports**

In `frontend/src/app/match-1v1/[id]/page.tsx`, replace the IlluminatedBanner import (line 28):

```tsx
import { IlluminatedBanner } from "@/components/forge/IlluminatedBanner";
```

with:

```tsx
import { ArcaneSeal } from "@/components/forge/ArcaneSeal";
```

- [ ] **Step 2: Replace "Your Citadel" banner rendering**

Find the your-citadel banner block (lines 616–622):

```tsx
{(() => {
  const yourCosmetics = isPlayerA ? cosmeticsA : cosmeticsB;
  const bannerKey = yourCosmetics?.banner;
  return bannerKey && CIRCUITS[bannerKey] ? (
    <IlluminatedBanner circuit={CIRCUITS[bannerKey]} name={CIRCUITS[bannerKey].title} scale={0.2} />
  ) : null;
})()}
```

Replace with:

```tsx
{(() => {
  const yourCosmetics = isPlayerA ? cosmeticsA : cosmeticsB;
  const bannerKey = yourCosmetics?.banner;
  return bannerKey && CIRCUITS[bannerKey] ? (
    <ArcaneSeal circuit={CIRCUITS[bannerKey]} name={bannerKey} size={60} />
  ) : null;
})()}
```

- [ ] **Step 3: Replace "Enemy Citadel" banner rendering**

Find the enemy-citadel banner block (lines 658–664):

```tsx
{(() => {
  const enemyCosmetics = isPlayerA ? cosmeticsB : cosmeticsA;
  const bannerKey = enemyCosmetics?.banner;
  return bannerKey && CIRCUITS[bannerKey] ? (
    <IlluminatedBanner circuit={CIRCUITS[bannerKey]} name={CIRCUITS[bannerKey].title} scale={0.2} />
  ) : null;
})()}
```

Replace with:

```tsx
{(() => {
  const enemyCosmetics = isPlayerA ? cosmeticsB : cosmeticsA;
  const bannerKey = enemyCosmetics?.banner;
  return bannerKey && CIRCUITS[bannerKey] ? (
    <ArcaneSeal circuit={CIRCUITS[bannerKey]} name={bannerKey} size={60} />
  ) : null;
})()}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. `IlluminatedBanner` import is removed, `ArcaneSeal` is used.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/match-1v1/\[id\]/page.tsx
git commit -m "feat: replace IlluminatedBanner with ArcaneSeal for banner display in match page"
```

---

### Task 7: Visual verification

**Files:** (none — manual testing)

- [ ] **Step 1: Start the dev server**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: Verify parcel skins on the hex grid**

Navigate to the world page. If you have parcel skins equipped, the owned parcels should show glowing ward lines (circuit topology traces) instead of the old diagonal-hatch or concentric-ring patterns. Check:
- Ward traces follow the circuit topology shape
- Glow color tints correctly: amber on Forge parcels, steel-blue on Quarry, emerald on Grove
- Ward containment ring is visible as a continuous inner hex border
- Cross-hair corner marks at hex vertices
- Node sigils (diamond, circle, rectangle, etc.) are visible at trace junctions

- [ ] **Step 3: Verify hold crest in world sidebar**

On the world page, check the "Your Hold" panel. If a hold crest is equipped, it should render as a circular glowing seal (~120px) with the circuit topology inside and the title/real name along the arcs.

- [ ] **Step 4: Verify banner in match page**

Navigate to a match page. If either player has a banner equipped, it should render as a small glowing seal (~60px) next to each citadel. Title text should be hidden at this small size (the `size >= 100` guard in ArcaneSeal).

- [ ] **Step 5: Verify Gallery and Profile still use IlluminatedBanner**

Navigate to the forge page, open Gallery and Profile views. These should still render the parchment-card IlluminatedBanner component — unchanged.

- [ ] **Step 6: Final commit (if any tuning was needed)**

If projection constants or glow parameters needed adjustment during visual testing:

```bash
git add -A
git commit -m "fix: tune ward projection and glow parameters after visual testing"
```
