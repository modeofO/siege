# Living Battle Scene — Design

**Date:** 2026-07-04
**Status:** Approved direction, pending spec review

## Problem

The 1v1 battle scene is boring for two compounding reasons:

1. **Dead air.** After committing, the player waits through commit-index → reveal tx → reveal-index → resolve tx → resolve-index. Even with both players acting instantly, chain + Torii lag adds 30–60+ seconds per round with nothing to do or watch.
2. **No visual action.** The battlefield is mostly static sprites; resolution is numbers appearing.

Diagnosis from design discussion: the wait would be tolerable if there were something to watch, do, or strategize during it. Set-piece replay animations were explicitly rejected — a fixed sequence every round becomes its own boredom. The direction is a battlefield that is **always alive**, with fast punchy resolution effects and persistent aftermath.

## Key insight

Once both reveals are indexed, the round outcome is fully deterministic — damage, node contests, traps, repair, and abilities are pure functions of the two revealed moves plus known state. Only *next round's* gate modifiers (VRF) and resource minting require the chain. The frontend currently waits for `resolve_round` to tell it something it can compute itself, roughly 30–45 seconds early.

## Decomposition

Three subsystems, each with its own plan → implementation cycle, in order:

1. Optimistic resolution engine (foundation)
2. Living war table (three.js battlefield)
3. War table intel (cross-match opponent analysis + pre-draft)

---

## 1. Optimistic resolution engine

`frontend/src/lib/resolution1v1.ts` — a pure function, no React, no network:

```ts
resolveRoundLocal(inputs: RoundInputs): RoundOutcome
```

**Inputs:** both revealed moves (indexed the moment reveal #2 lands), current node owners, vault HPs, this round's gate modifiers (known since the previous resolve), both players' match abilities.

**Outputs:** per-gate damage breakdowns, node ownership changes, trap triggers, repair amounts (including enemy Stone Cloak T2 negation), ability effects, final HPs — plus an **ordered event list** (`troops_clash`, `trap_detonated`, `node_captured`, `vault_damaged`, `vault_repaired`, …) that the battlefield consumes as its choreography script.

**Deliberately not computed:** next round's gate modifiers (VRF) and resource mints. These arrive with the real `resolve_round`, during the aftermath animation, so the gap is invisible.

**Correctness:**

- Mirror `resolution_1v1.cairo` block by block, preserving operation order: node contests → gate modifiers (Narrow Pass, Mirror, Deadlock, Reflection) → repair → gate damage → Ember Blast → traps.
- Extract ~20 test vectors (inputs + expected outputs) from the existing Cairo test suite into a vitest suite. A future Cairo balance change that isn't mirrored fails CI loudly.
- Chain is authoritative. At reconcile time (real resolve indexed), compare against the local outcome; on mismatch, log a console error and snap all UI state to chain truth.

**Wiring:** `match-1v1/[id]/page.tsx` currently shows "Resolving round..." dead air after both reveals. Instead: reveals indexed → `resolveRoundLocal` → battlefield plays the outcome immediately → existing auto-resolve election and background confirm untouched.

---

## 2. Living war table (three.js)

Replaces the `BattlefieldView` panel with a 3D scene. Reference aesthetic: `frontend/public/style_idea.png` — medieval war-room table with holographic parchment map.

**Core aesthetic decision: troops are game pieces, not soldiers.** Carved miniatures (pewter knights, siege engines, banner markers) pushed around a parchment map on a wooden table. Thematically exact for a command tent, and it eliminates character animation: pieces slide, tip, burn, and get knocked over. Combat drama comes from motion, light, and particles.

**Scene:** camera at ~50° looking down at the table. Player citadel piece near-side, enemy far-side, three gate arches between, three resource-node markers flanking.

**Always alive (ambient layer):** candle-flame light flicker, dust motes in light beams, subtle holographic cyan shimmer over the map, cloth banners with gentle vertex wave, vault pieces that smoke progressively as HP drops.

**Input is physical:** dragging an attack slider slides troop pieces from the citadel toward that gate in real time. Committing stamps a wax seal onto the deployment (pieces lock, glow). Opponent commit materializes *cloaked* pieces on their side — presence without information, honoring commit-reveal.

**Resolution choreography:** the engine's event list plays in ~3–5 seconds — pieces advance and clash (impact flash + particles scaled to damage), traps detonate node markers, repair glows the vault, HP ticks. No set-piece replay.

**Persistent aftermath:** scorch decals on breached gates, player banner planted on captured nodes, cumulative battle damage across rounds.

**Tech:**

- React Three Fiber + drei (idiomatic for Next 16 / React 19).
- Scene code lazy-loaded so the three.js bundle never blocks the page.
- Current 2D `BattlefieldView` kept as automatic fallback when WebGL is unavailable or fails to init.
- Allocation form stays DOM in the side panel; only the battlefield panel becomes 3D.

---

## 3. War table intel

A drawer on the match page, most prominent during wait phases. Read-only; no contract changes, no new transactions.

**Data source:** Torii SQL. All matches for an opponent via `MatchState1v1` (player_a or player_b), all revealed moves via `RoundMoves1v1` per match, head-to-head via the existing `MatchRecord` model. Aggregation client-side, cached per opponent; cache key grows only by whole match ids.

**Panel contents:**

- **Gate habits:** attack/defense heatmap across East/West/Underground, split early (R1–3) / mid (R4–6) / endgame (R7–10).
- **Tendencies:** trap frequency per owned node, repair spend rate below 30 HP, node-contest aggression, ability timing by round.
- **Head to head:** record vs. this opponent and what won before.
- **Bluff detector:** deviation of this match's revealed moves from their historical pattern.

**Pre-draft:** while waiting, sketch next round's allocation against the projected budget (`computeBudget` with current node ownership + escalation). Stored locally; one tap loads it into the real allocation form when the commit phase opens.

---

## Testing

- Resolution engine: vitest suite with Cairo-derived vectors (the load-bearing correctness test for the whole feature).
- Intel aggregations: unit tests on fixed move-history fixtures.
- three.js scene: type/lint/build gates; visual behavior is verified by eye (no snapshot theater).

## Out of scope

- Contract changes of any kind (round structure, deadlines, merged reveal+resolve).
- Prediction/"call their move" mini-game — possible later addition to the intel drawer.
- Reskinning the rest of the app to the war-room aesthetic (tracked separately in style direction).
