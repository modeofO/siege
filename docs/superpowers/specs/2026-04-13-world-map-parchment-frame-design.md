# World Map Parchment Frame — Design Spec

**Date:** 2026-04-13
**Status:** Approved design
**Relates to:** `docs/blender-style-guide.md`, `frontend/src/app/world/page.tsx`, `frontend/src/components/HexGrid.tsx`

## Problem

The `/world` page renders a bare SVG hex grid on the existing desk background. The hex grid itself is functional but the area *around* it is empty space — the world has no sense of place, no atmosphere, no landscape beyond the playable parcels. The page reads as "a diagram on a table" rather than "a campaign map on a war-room desk."

This spec covers a visual-only enhancement: a static, Blender-rendered parchment map asset that frames the hex grid with a painted landscape ring, plus CSS-driven ambient motion (torches, clouds) to make the frame feel alive.

## Design decisions

1. **Frame composition (hybrid).** The parchment carries a rough painted landscape ring — mountains, dunes, forest, coast — that fades into ornamental parchment and brass props (compass rose, map pins) at the outer edge. Medieval-campaign-map aesthetic; not an illuminated manuscript and not a literal extended world map.

2. **Composition is independent of edge tiles.** The painted landscape zones (mountains N / dunes E / forest S / coast W) are fixed and do not need to match the parcel types that happen to sit at the hex grid's edge. One asset works for any future world layout.

3. **Static render with CSS ambient motion.** One pre-rendered PNG for the parchment + props; one pre-rendered PNG for an unlit torch sconce. All motion (torch flicker, cloud drift) is CSS on top. No Three.js, no live-rendered 3D, no reactivity to game state in v1.

4. **Hex grid is untouched.** Another agent is iterating on `HexGrid.tsx` and tile rendering. This work only adds layers *around* the grid — no changes to the grid component, its tiles, its tooltip, or tile icons.

5. **Blender pipeline (consistent with existing sprites).** Reuses the established camera rig, lighting recipe, and material library from `docs/blender-style-guide.md`. Parchment variant of `Book_OpenPages`; compass rose and map pins use `Book_Brass`. Adds one new collection offset per the +100 X convention.

## Scope

### In scope

- Build a parchment-map Blender asset (new collection in the existing scene).
- Build a torch-sconce Blender asset (new collection, separate render).
- Render both to RGBA PNGs in `frontend/public/sprites/`.
- Wrap the existing `<HexGrid>` call site in `frontend/src/app/world/page.tsx` with a fixed-aspect container that layers the parchment image behind the grid and CSS-animated overlays in front.
- Add a `parchment.module.css` file holding `flicker-opacity`, `flicker-scale`, and `drift` keyframes, gated behind `prefers-reduced-motion: no-preference`.

### Out of scope

- Any edit to `HexGrid.tsx`, the hex tiles, tile icons, or the tooltip.
- Reactivity to game state (pillage smoke, faction color washes, etc.) — static v1 only.
- Bespoke per-world landscape (terrain that matches which parcel types sit at the edges).
- Mobile-specific layout polish beyond proportional scaling.
- A flame sprite for torches (pure CSS radial gradient is sufficient at this size).
- Additional ambient elements (animated compass needle, map-pin shimmer, particle effects).
- Changes to any other page section (header, Your Hold, Battles, FactionPanel).

## Architecture

### Layer stack

```
z=3  CSS ambient overlay    torch flicker + cloud drift (new)
z=2  SVG hex grid            existing HexGrid.tsx (untouched)
z=1  Parchment map asset     new Blender render (new)
z=0  Desk background         existing body background (unchanged)
```

All z=1…z=3 layers live inside a single fixed-aspect wrapper rendered from `world/page.tsx`. The desk background continues to be applied at the `body` level and is unchanged.

### File changes

**New files**

| File | Purpose |
|---|---|
| `frontend/public/sprites/parchment-map.png` | Blender render, 2400×1600 RGBA. Painted landscape ring + brass props on a parchment sheet. Transparent surroundings. |
| `frontend/public/sprites/torch-sconce.png` | Blender render, ~512×512 RGBA. Unlit brass/iron sconce, transparent background. |
| `frontend/src/app/world/parchment.module.css` | CSS module with `@keyframes flicker-opacity`, `@keyframes flicker-scale`, `@keyframes drift`, and the `.torch`, `.torch-glow`, `.cloud` class selectors. Keyframes wrapped in `@media (prefers-reduced-motion: no-preference)`. |

**Modified files**

| File | Change |
|---|---|
| `frontend/src/app/world/page.tsx` | Replace the current `<HexGrid …/>` call site with a fixed-aspect wrapper (see layout below). Add inline `TorchOverlay` and `CloudDrift` components (or keep them as small siblings in the same file). Import the new CSS module. |

**Untouched**

- `frontend/src/components/HexGrid.tsx`
- All other components under `frontend/src/components/`
- All lib files under `frontend/src/lib/`
- `frontend/src/app/providers.tsx`

## Parchment asset spec (Blender)

### Collection and placement

- New collection named `Parchment` at scene offset `(400, 100, 0)` (next free +100 X slot per the style-guide convention).
- Camera named `ParchmentCam`, lights named `ParchmentKey`, `ParchmentFill`, `ParchmentRim`, all parented into the collection.

### Camera

- Orthographic, 28° tilt from vertical — matches the closed-book cam so the parchment reads as a real piece of paper sitting on the desk, not a flat decal.
- Ortho scale ≈ 10 (tune per final composition; bigger than book's 4.2, smaller than desk's 22).
- Position computed from the same formula as the book:
  `cam_y = -sin(28°) * CAM_DIST`, `cam_z = cos(28°) * CAM_DIST`, with `CAM_DIST` scaled up to match the asset's larger footprint.

### Lighting

Standard 3-point rig from the style guide, sized for a mid-scale asset (between book and desk):

- Key: warm tungsten `(1.0, 0.85, 0.65)`, upper-left, energy ≈ 800–1200, size ≈ 6–8.
- Fill: cool daylight `(0.75, 0.85, 1.0)`, opposite side, energy ≈ 300.
- Rim: warm amber `(1.0, 0.75, 0.45)`, behind subject, energy ≈ 400.

Key-light direction matches the desk and book so shadows read as unified across props.

### Composition

- **Parchment sheet** — rectangular sheet, roughly 14 × 9 Blender units (3:2 aspect), occupies ~80% of the render. Edges slightly curled/torn; corners subtly ripple. Material: new `Parchment_Map` derived from `Book_OpenPages`, with a larger stain-noise scale and added edge-darkening to read as "aged campaign map."
- **Painted landscape ring** — decorative paint on the parchment, not 3D terrain. Implemented as a procedural material layered over the parchment base:
  - Mountain zone along the top: ink-stroke-style noise + ColorRamp to warm grey/blue-grey, subtle bump so key light catches the "ink ridges."
  - Dune zone east: warm ochre gradient, horizontal wave texture at low amplitude for dune line suggestion.
  - Forest zone south: desaturated green stipple (dense noise), small bump for canopy texture.
  - Coast/sea zone west: muted blue-grey with horizontal wave, meets the parchment at a ragged coastline.
  - All zones blend into the center "map zone" via a ColorRamp mask driven by distance-from-center on Generated coords.
- **Inner map zone** — central inset of mostly-blank parchment where the hex grid will sit. No painted terrain here; just the base parchment material with light stain variation.
- **Brass props** (3D objects, reusing `Book_Brass`):
  - Compass rose in one corner (propose NE). Flat disc with raised directional arms, a pointer, and engraved labels.
  - 4–6 scattered map pins along the parchment's edges and painted zones. Simple pin = small sphere + tapered cone.
  - Optional: a small dagger or rolled scroll-weight in one corner for visual interest. Can skip in v1 if modeling time is tight.

### Render settings

```python
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 2400
scene.render.resolution_y = 1600
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.eevee.taa_render_samples = 128
scene.eevee.use_gtao = True
scene.eevee.use_bloom = False
scene.view_settings.look = 'AgX - Medium High Contrast'
```

Output path: `frontend/public/sprites/parchment-map.png`.

### Iteration plan

Build the parchment + one brass prop + landscape material as a rough first pass, render, drop into the frontend. Iterate on:

- Ortho scale (ensures the inner map zone is big enough for the hex grid).
- Exact inset rectangle for the inner map zone (coordinated with the CSS wrapper — see Frontend integration).
- Landscape zone boundaries and saturation.
- Number and placement of brass props.

## Torch-sconce asset spec (Blender)

### Collection and placement

- New collection `TorchSconce` at offset `(500, 100, 0)`.
- Camera `TorchCam`, lights `TorchKey`, `TorchFill`, `TorchRim`.

### Camera and lighting

- Orthographic, 28° tilt, ortho scale ≈ 2.0 (small asset).
- Same 3-point rig, scaled down: key energy ≈ 200, fill ≈ 60, rim ≈ 100.

### Composition

Unlit brass/iron sconce only — no flame, no glow. A short wall-mount bracket holding a cup-shaped fuel reservoir with the remains of a burnt torch stick. Materials: reuse `Book_Brass` for the bracket fittings and `NailIron` for the main sconce body.

### Render settings

Same as parchment except `resolution_x = 512`, `resolution_y = 512`. Output path: `frontend/public/sprites/torch-sconce.png`.

## CSS ambient overlay

### Torches

Four torches, one at each corner of the parchment wrapper, positioned in percentages relative to the wrapper so they scale with it.

```jsx
// conceptual
<div className={styles.torch} style={{ top: '4%', left: '3%' }}>
  <span className={styles.torchGlow} />
</div>
```

- Sconce: `<div>` with `background-image: url(/sprites/torch-sconce.png)` and `background-size: contain`.
- Flame glow: pseudo-element `::before` (or nested `<span>`) with a warm radial gradient `(amber → orange → transparent)`, heavy CSS blur, positioned just above the sconce cup. Pure CSS — no flame sprite.
- Flicker: two stacked animations on the glow element:
  - `flicker-opacity` — keyframes vary opacity 0.7 ↔ 1.0, duration 0.7s, `ease-in-out`, infinite alternate.
  - `flicker-scale` — keyframes vary `transform: scale(0.95) ↔ scale(1.08)`, duration 1.3s, `ease-in-out`, infinite alternate.
  - Prime-ish durations chosen so the two animations don't visibly sync, reading as natural flicker.

### Clouds

Two or three wispy cloud shapes drifting across the top strip of the parchment wrapper.

- Cloud shape: inline SVG in `page.tsx` — a few overlapping blurred ellipses with soft off-white fill and low opacity (~0.2). Alternatively a single `cloud.png` if hand-authored SVG is awkward.
- Clipping wrapper: `<div style={{ position: 'absolute', top: 0, height: '25%', overflow: 'hidden' }}>` so clouds appear to pass above the painted mountains and don't spill below.
- Motion: `animation: drift <duration> linear infinite`, each cloud with a different duration (35s / 50s / 65s) and different initial `animation-delay` so they don't clump.
- `@keyframes drift` translates `translateX(-15%)` → `translateX(115%)`.

### Accessibility

All animations wrapped in:

```css
@media (prefers-reduced-motion: no-preference) {
  .torchGlow { animation: flicker-opacity 0.7s ease-in-out infinite alternate, flicker-scale 1.3s ease-in-out infinite alternate; }
  .cloud { animation: drift var(--cloud-duration, 40s) linear infinite; }
}
```

Users with `prefers-reduced-motion: reduce` see a static torch glow (rendered at 85% opacity) and no cloud drift.

### Performance budget

- 4 torches × 1 animated element each = 4 animated elements.
- 2–3 clouds = 2–3 animated elements.
- Total: ≤ 7 animated elements, all using `opacity` and `transform` only — both GPU-composited, no layout thrash.
- No JS animation loop, no canvas, no WebGL. Strictly cheaper than a Three.js alternative.

## Frontend integration

### Wrapper layout in `world/page.tsx`

```jsx
<div className={`${styles.parchmentFrame} mx-auto relative aspect-[3/2] max-w-5xl w-full`}>
  <img
    src="/sprites/parchment-map.png"
    alt=""
    className="absolute inset-0 w-full h-full pointer-events-none select-none"
  />
  <div className="absolute" style={{ top: '12%', right: '14%', bottom: '14%', left: '14%' }}>
    <HexGrid parcels={parcels} playerAddress={address} homeParcelIds={homes} />
  </div>
  <TorchOverlay />
  <CloudDrift />
</div>
```

- Aspect ratio `3/2` matches the parchment render.
- `max-w-5xl` caps at ~64rem (1024px) on desktop; `w-full` lets it shrink proportionally on narrower viewports.
- The inner rectangle `top: 12%; right: 14%; bottom: 14%; left: 14%` is the parchment's "blank map zone." Values are eyeballed after the first Blender render and tuned.
- `HexGrid`'s existing `className="w-full max-h-[60vh]"` on its SVG now scales inside the positioned inner rectangle; `max-h-[60vh]` remains a safe cap so the map cannot blow past the fold on tall screens.

### `TorchOverlay` and `CloudDrift`

Both are small inline components in `world/page.tsx` (~30 lines each). Inline for now since they're only used on the world page; promote to sibling files under `app/world/` only if they grow.

### Responsive behavior

- Desktop (≥ 1024px): full `max-w-5xl` parchment, 1024×683 rendered, hex grid fills its ~72% × 74% inner rectangle.
- Tablet (~768px): parchment shrinks to container width, everything scales proportionally.
- Mobile (≤ 480px): parchment still scales; hex grid remains usable because its own SVG auto-fits its viewBox. No mobile-specific layout adjustments in v1 — we accept that the parchment may feel dominant on small screens and iterate if it's a problem.

### Untouched surfaces

- `HexGrid.tsx` — no changes. The SVG, tile rendering, tooltip, and hover/click state all stay exactly as-is.
- All other sections of `world/page.tsx` — header, Your Hold, Battles, FactionPanel, RegisterKingdom modal — are unchanged.

## Build sequence

1. **Blender — parchment.** Build the `Parchment` collection: sheet geometry, parchment material, painted landscape material, compass rose, map pins. Add camera and 3-point lights. Render to `parchment-map.png`.
2. **Blender — torch sconce.** Build the `TorchSconce` collection. Add camera and lights. Render to `torch-sconce.png`.
3. **Frontend — wrapper.** Add the fixed-aspect wrapper around `<HexGrid>` in `world/page.tsx`. Drop in the parchment image. Eyeball-tune the inner rectangle so the hex grid sits on the parchment's blank center.
4. **Frontend — CSS module.** Create `parchment.module.css` with keyframes. Wire up the `TorchOverlay` (4 positioned torches with CSS flicker) and `CloudDrift` (2–3 SVG clouds in a clipping wrapper with CSS drift).
5. **Iterate.** View at desktop/tablet widths, screenshot, tune Blender composition or CSS percentages as needed.

## Open iteration points

These are expected to need one or two tuning passes during implementation, not upfront decisions:

- Ortho scale and exact camera framing for the parchment render.
- Exact inset-percentage values for the inner "map zone" rectangle.
- Landscape zone saturation and painted-stroke bump strength.
- Torch positioning percentages (corners vs slight insets; above-parchment vs on-desk reading).
- Cloud count, duration, and opacity (too subtle vs too busy).
- Whether the dagger/scroll-weight corner ornament makes the cut or gets deferred.

## Future work (explicitly deferred)

- Reactive border: smoke plumes on parcels under pillage, faction color wash as territory grows, active-conquest fires.
- Painted terrain that responds to the actual edge-tile composition of a given world.
- Animated flame sprites or particle effects for richer torches.
- Animated compass needle or map-pin highlights for hover/select state.
- Per-region ambient sound (wind, distant crows) — would require audio plumbing not currently in the app.
- Mobile-specific layout mode (e.g., collapsing the frame on narrow screens).
