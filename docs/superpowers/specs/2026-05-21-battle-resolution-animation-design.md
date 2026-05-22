> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Battle Resolution Animation Design

**Date:** 2026-05-21
**Status:** Approved
**Scope:** 1v1 match resolution overlay animation

## Overview

Add a ~1.5s simultaneous-burst animation overlay that plays on top of the BattlefieldView each time a round resolves. Gate impacts, floating damage numbers, node flips, trap detonations, and ability effects all fire at once, then the overlay fades and the underlying UI updates to the new state.

The world/parcel animation work is separate and out of scope here.

## Tech Choice

**anime.js v4.4.1** for timeline orchestration + CSS keyframes for the visual effects.

### anime.js Audit (hard prerequisite)

Before installing, verify all of the following:

1. **Package provenance** — confirm `animejs` on npm maps to `juliangarnier/anime` on GitHub; check publish history for suspicious maintainer transfers
2. **Source inspection** — download the tarball directly (`npm pack animejs@4.4.1`), diff against the GitHub v4.4.1 release tag to confirm npm artifact matches the repo
3. **Dependency tree** — anime.js must have zero dependencies; any transitive deps are a red flag
4. **Install scripts** — check for `preinstall`/`postinstall` hooks in its `package.json` that could run arbitrary code
5. **Pin exact version** — `npm install animejs@4.4.1 --save-exact`, no caret/tilde ranges
6. **Lock integrity** — verify the sha512 in `package-lock.json` matches the tarball hash

If any step fails, fall back to pure CSS keyframes + `requestAnimationFrame` for timeline orchestration. The animation design works either way.

## Architecture

### Trigger Flow

1. Round resolves on-chain → new `RoundResult1v1` entry appears in `history`, `state.round` increments
2. Match page intercepts the new result and holds off updating displayed HP/node state
3. `<ResolutionOverlay>` mounts with the result data + battlefield `POSITIONS`
4. anime.js timeline plays (~1.5s)
5. Overlay calls `onComplete` → parent releases HP/node updates → existing 700ms CSS transitions on VaultDisplay/GateDisplay kick in
6. Overlay fades out and unmounts, next round's commit phase begins

### Component Structure

```
<div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]">
  <div className="relative">          ← wrapper gets position:relative
    <BattlefieldView ... />
    {pendingResult && (
      <ResolutionOverlay
        result={pendingResult}
        positions={POSITIONS}
        isPlayerA={isPlayerA}
        onComplete={releasePendingState}
      />
    )}
  </div>
  ...
</div>
```

The overlay is a sibling positioned absolutely over the battlefield, not injected inside BattlefieldView.

## Visual Effects

Five effect layers, all firing at t=0 with staggered durations for a burst feel.

### 1. Gate Impacts

- Radial flash at each gate position (percentage-based, matching `POSITIONS.gates`)
- Color intensity scales with damage: low = dim amber pulse, high = bright red-white flash
- Zero-damage gates get nothing
- Duration: 400ms (fast in, slow fade out)

### 2. Floating Damage Numbers

- "+N" in green floats up from enemy citadel, "-N" in red floats up from your citadel
- Per-gate damage numbers at gate positions
- Trap damage gets its own number in gold/orange, floating from the trapped node position
- Total vault damage near the HP bars
- Duration: 800ms (rise + fade out)

### 3. Node Ownership Flips

- Node marker pulses with the new owner's color (amber for you, red for enemy)
- Scale bounce: 1.0 → 1.4 → 1.0
- Only fires on nodes that actually changed hands
- Duration: 500ms

### 4. Trap Detonations

- Expanding ring at the trapped node position, red-orange color
- Fires 50ms before the trap damage number appears (slight lead for cause-then-effect)
- Duration: 350ms

### 5. Ability Effects (5 distinct visuals)

| Ability | Visual | Target Area |
|---------|--------|-------------|
| Siege Sword | Diagonal slash arc (two crossing SVG lines) | Targeted gate position |
| Stone Cloak | Shimmering half-dome outline | All 3 of your gate positions |
| Ember Blast | Expanding ember particles from center | Enemy citadel area |
| Hex | Purple ripple wave | Whole battlefield, subtle opacity |
| Fortify | Vertical wall-glow lines | All 3 of your gate positions |

Ability effects are SVG/CSS — no sprite sheets or external images. Both T1 and T2 abilities of the same type use the same visual but T2 effects are larger/brighter.

## Files

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/ResolutionOverlay.tsx` | Overlay component: absolutely-positioned SVG/CSS effects, anime.js timeline, skip button |
| `frontend/src/lib/animationEffects.ts` | Pure functions that build anime.js timeline configs for each effect type |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/app/match-1v1/[id]/page.tsx` | Intercept round resolution to hold HP state, mount/unmount overlay, pass result data |
| `frontend/src/app/match-1v1/[id]/spectate/page.tsx` | Same overlay integration for spectators |
| `frontend/src/components/BattlefieldView.tsx` | Export `POSITIONS` constant (currently module-internal) |
| `frontend/src/app/globals.css` | Add keyframes for flash, fade, float-up effects |
| `frontend/package.json` | Add `animejs@4.4.1` (exact pin, post-audit) |

### Not Changed

- No Cairo contract or game logic changes
- No changes to existing HP bar transitions (700ms ease-out stays, fires after overlay)
- No changes to War Dispatch Log (text breakdown remains)
- BattlefieldView internal rendering unchanged

## UX Details

### Skip Button

A small "SKIP" label in the overlay corner. Clicking it immediately completes the anime.js timeline and fires `onComplete`, releasing the state update. For players who've seen it many times.

### Reduced Motion

Check `prefers-reduced-motion: reduce` via `window.matchMedia`. If set, skip the overlay entirely — go straight to the existing instant-update behavior.

### Spectator Parity

Spectators see the same overlay. The `spectate/page.tsx` integration mirrors the player page — same component, same props, same timing.
