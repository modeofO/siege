# Auto-Resolve Race Condition Fix

**Date:** 2026-05-20
**Status:** Fixed

## Problem

The elected auto-resolve player (lower address) would fire `resolveRound1v1` immediately when `effectiveRevealCount >= 2`, but this count came from the Torii indexer which can be ahead of the Cartridge Controller's simulation endpoint. The simulation would reject the transaction because on-chain state still showed `reveal_count = 1`.

Two errors appeared every round:
1. **"Not all revealed"** — without-VRF attempt simulated against stale state
2. **"VrfProvider: not fulfilled"** — VRF-wrapped fallback also failed at simulation

Rounds still resolved because the MCP agent opponent would eventually call `siege_resolve_round` and succeed once on-chain state caught up.

## Root Cause

Torii (indexer) and the Cartridge RPC (simulation) can be on different infra with different block heights. `effectiveRevealCount` reaching 2 from Torii doesn't guarantee the simulation endpoint has processed that block yet. The original code used `setTimeout(..., 0)` — zero delay.

## Fix (frontend/src/app/match-1v1/[id]/page.tsx)

1. **Torii SQL pre-check**: Before attempting any transaction, query `reveal_count` directly from Torii SQL. If < 2, defer and retry without submitting a transaction. This eliminates noisy failed simulation errors entirely.

2. **Exponential backoff**: Delays of 2s → 4s → 6s → 10s → 15s across retry attempts (up to 5 total).

3. **Transient error handling**: Both "Not all revealed" and "VrfProvider: not fulfilled" are treated as transient (retry-eligible), since the thrown error from `resolveRound1v1` can contain either string depending on which internal attempt's error bubbles up.

## Future Speed Improvements

The current fix prioritizes reliability over speed. Areas to explore for faster commit/reveal/resolve:

- **Skip Cartridge simulation for resolve**: If starknet.js / Controller supports `skipValidation`, the transaction could go straight to the mempool where it would succeed once the block including the second reveal is mined. Eliminates the Torii-vs-simulation lag entirely.

- **VRF-first resolve**: `resolveRound1v1` always tries without-VRF first (for final rounds), then falls back to VRF-wrapped multicall. Could detect whether this is the final round upfront and skip the without-VRF attempt on non-final rounds, saving one round-trip.

- **Tighter Torii-RPC alignment**: If both Torii and the Cartridge RPC used the same Starknet node, the block-height mismatch would disappear. This is an infra-level change on Cartridge's side.

- **Optimistic resolve pipeline**: Instead of waiting for `reveal_count = 2` then scheduling resolve, the resolve transaction could be pre-built and submitted as soon as the second reveal's transaction hash is known (speculative execution).

- **Reduce overall round latency**: The commit → reveal → resolve pipeline has multiple waiting points (post-commit poll, auto-reveal gate on `commitCount >= 2`, post-reveal poll, auto-resolve gate). Each has its own polling interval and delay. A single event-driven pipeline (Torii gRPC subscription → immediate action) with no polling fallbacks would be faster but harder to make reliable.
