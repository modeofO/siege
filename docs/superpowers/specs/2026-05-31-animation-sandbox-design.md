# Animation Sandbox Design

**Date:** 2026-05-31
**Status:** Draft
**Scope:** Frontend-only animation prototyping page at `/sandbox/animations`

## Overview

A Next.js route inside the existing frontend app where you can click buttons and watch battle animations play on a real BattlefieldView with real sprites. No game state, no wallet, no on-chain interaction — just hardcoded mock data driving anime.js timelines.

The goal is to prototype, iterate on, and evaluate battle animations before integrating them into the live match flow. The current `ResolutionOverlay` uses anime.js for a single fade-out and CSS keyframes for everything else. This sandbox is where we build the next generation of animations that fully leverage anime.js timelines.

## What You See

A page with a row of scene buttons across the top and the battlefield filling the rest. Click a button, the animation plays. Click again to replay.

**Scene buttons:**

| Button | What plays |
|--------|-----------|
| Troop March | Troops start massed at base, march in staggered formation to assigned gate/node/repair positions (~800ms) |
| Gate Clash | Attackers charge into defenders at gates, impact flash, screen shake, damage numbers fly out, defeated troops fade (~1000ms) |
| Full Round | The complete cinematic: deploy → clash → nodes → traps → abilities → repair → vault HP → retreat (~4s) |
| Siege Sword | T1 and T2 slash trail at targeted gate |
| Stone Cloak | Shield dome shimmer around player base |
| Ember Blast | Explosion burst and particle scatter at enemy base |
| Hex | Expanding curse ripples across battlefield |
| Fortify | Rising golden beam at player base |
| Vault Breach | Final blow: slow-mo, vault crumble, screen flash, victory banner |

Each scene has its own hardcoded mock data (troop allocations, damage values, ability IDs) baked into the sandbox — no configuration needed.

## Architecture

### Route

`frontend/src/app/sandbox/animations/page.tsx` — a `"use client"` page component.

### How It Works

1. Page renders the real `BattlefieldView` component with mock allocations and modifiers.
2. Each scene button has a corresponding function that creates an anime.js `createTimeline()` with the animation sequence.
3. Animations target real DOM elements — troop sprites, gate markers, overlay divs for effects.
4. Clicking a button resets state to the scene's starting positions, then plays the timeline.
5. The `ResolutionOverlay` component is also available as a scene to compare old vs new.

### Mock Data

Each scene defines a static object with the data it needs:

- **Troop March:** `allocations` array (e.g. `[3, 2, 0, 2, 1, 0, 1, 1, 0, 0]`)
- **Gate Clash:** allocations for both sides plus a `RoundResult1v1` with gate damage
- **Abilities:** `abilityId` and `target` values
- **Vault Breach:** result where one vault hits 0 HP

Mock data lives in `frontend/src/app/sandbox/animations/mockData.ts`.

### Animation Modules

New animation functions go in `frontend/src/lib/animations/`. Each module exports a function that takes DOM refs and game data, and returns an anime.js timeline:

| File | Export | Purpose |
|------|--------|---------|
| `troopMarch.ts` | `createMarchTimeline(troopEls, targets)` | Staggered troop movement from base to positions |
| `gateClash.ts` | `createClashTimeline(containerEl, troopEls, result)` | Charge, impact shake, flash, damage numbers, casualty fade |
| `abilityEffects.ts` | `createAbilityTimeline(abilityId, target, containerEl)` | Per-ability visual effect |
| `vaultBreach.ts` | `createBreachTimeline(containerEl, isWinner)` | End-of-match dramatic sequence |
| `roundResolution.ts` | `createRoundTimeline(...)` | Master timeline composing all sub-timelines |

Each function returns an anime.js timeline object. The sandbox page calls `.play()` on it. The same functions will later be imported by the real match page when we integrate.

### What Gets Reused vs. What's Sandbox-Only

**Reusable (moves to production later):**
- Everything in `frontend/src/lib/animations/` — the timeline factory functions
- Any new sprite assets added during prototyping

**Sandbox-only:**
- `frontend/src/app/sandbox/animations/` — the page, mock data, button UI
- Can be excluded from production builds later via Next.js route config or just left as a dev tool

## File Plan

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/app/sandbox/animations/page.tsx` | Sandbox page with buttons and battlefield |
| `frontend/src/app/sandbox/animations/mockData.ts` | Hardcoded mock allocations, results, ability data per scene |
| `frontend/src/lib/animations/troopMarch.ts` | Troop march timeline factory |
| `frontend/src/lib/animations/gateClash.ts` | Gate clash timeline factory |
| `frontend/src/lib/animations/abilityEffects.ts` | Ability effect timelines (all 5 types) |
| `frontend/src/lib/animations/vaultBreach.ts` | Vault breach / match end timeline |
| `frontend/src/lib/animations/roundResolution.ts` | Master timeline composing sub-timelines |

### Not Changed

- No modifications to existing `ResolutionOverlay.tsx` or `animationEffects.ts` — those stay as-is until we're ready to swap in the new animations
- No Cairo or contract changes
- No changes to the live match page
- No new dependencies — anime.js 4.4.1 is already installed

## Anime.js Usage

This is where we actually use anime.js properly. Key API surface:

- `createTimeline()` — orchestrate multi-step sequences with precise offsets
- Stagger functions — troops departing base with delay between each
- Spring easing — natural troop movement
- Value animation — HP counting down, color interpolation
- DOM property targeting — transform, opacity, scale on real elements
- Playback control — `.play()`, `.pause()`, `.restart()` for sandbox replay

## Build Order

1. Scaffold the route with a static battlefield and dummy buttons
2. Troop March — the simplest and most visually impactful starting point
3. Gate Clash — builds on troop march, adds impact effects
4. Ability effects — one at a time, starting with Ember Blast (most dramatic)
5. Vault Breach — match-ending drama
6. Full Round Resolution — compose everything into the master timeline

Each step is independently demoable. We don't need all six to start evaluating the feel.
