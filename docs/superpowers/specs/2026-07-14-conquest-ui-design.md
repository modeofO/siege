# Conquest UI — Design

Date: 2026-07-14
Branch: `feature/conquest-ui`
Status: approved (user waived per-section approval; overlay modal confirmed for attack UI)

## Goal

Make conquest playable from the web UI on `/world`:

1. **Attack flow** — initiate an attack on an adjacent enemy parcel via an overlay modal.
2. **Preset-defense editor** — configure the tier-gated defense presets used when the player is attacked.

## Decisions

- **Attack UI is a modal overlay** ("War Council"). The map will grow beyond the current 8x4 test grid, so the attack flow must not depend on page real estate below the map. Selecting an attackable parcel shows a compact selection bar under the map with an "OPEN WAR COUNCIL" button; the modal does the planning.
- **Win/loss is determined by re-reading state from Torii**, not by parsing `ConquestResolved` events. Resolution is synchronous in the tx, so once the receipt lands the fight is over. The modal polls Torii until `ConquestCooldown.last_attack_time` for the attacker reflects this attack (proves indexing caught up), then reads the target `Parcel.owner`: owner == attacker → victory, else defeat. On defeat, diff the attacker's owned parcels before/after to name the parcel lost to the defender (skip naming if the diff is empty — "last stand"). 30s polling deadline; on timeout show a neutral "battle resolved — check the map" state.
- **Follow FactionPanel / CreateFactionModal patterns**: war-room palette (`#1a1714` bg, `#3d3428` borders, `#daa520` gold, `#c44332` enemy red, `#7a7060` muted), `resilientExecute`, per-action `submitting`/`error` state, serif display labels.

## Contract facts the UI encodes

- Attacker budget 10 (`p0+p1+p2+g0+g1+g2 <= 10`); defender preset budget 12.
- Preset slots by tier (`tier_preset_count`): Polis 1, Strategos 2, Hegemonia 3, Basileia 4.
- Attack legality: attacker registered; target claimed, not a home, not own parcel, not a faction ally's parcel; attacker owns at least one parcel adjacent to target (hex distance 1, `frontend/src/lib/hex.ts` already ports the Cairo metric).
- Cooldown: 3600s per attacker from `ConquestCooldown.last_attack_time` (win or lose).
- Optional ability id 1-10, `ability_target` 0-2 (gate). The ability is **consumed** — escrowed into the conquest contract, never returned. UI must surface this before submission and in the result.
- The contract consumes Cartridge VRF via `Source::Nonce(conquest)`. The multicall MUST be `[request_random(conquest), initiate_conquest]` with nothing between (paymaster VRF wrapping constraint, same as `stakedMatch.ts`).
- Ability escrow uses `safe_transfer_from(attacker → conquest)` called by the conquest contract, so the attacker must have `set_approval_for_all(conquest, true)` on AbilityToken. Sent as a **separate tx before** the VRF multicall, unconditionally when an ability is selected (mirrors `createStakedMatch`).
- Defender with `preset_count == 0` and no allied reinforcement cannot be attacked (`'No defense set'` revert) — the selection bar surfaces this as a disabled reason if detectable, otherwise the tx error is shown verbatim.

## Components and files

### Lib: `frontend/src/lib/conquest.ts` (modify)

- **Fix `initiateConquest`**: build the two-call multicall `[vrfRequestRandomCall(CONQUEST_ADDRESS), initiate_conquest]` using `vrfRequestRandomCall` from `contracts1v1.ts`. Currently it sends a bare call and would revert on VRF consumption. Wait for receipt (reuse `waitForReceiptOrThrow` pattern) so callers know resolution happened.
- **Add `approveConquestAbilityOperator(account)`**: separate `set_approval_for_all(CONQUEST_ADDRESS, 1)` tx on AbilityToken.
- **Add `useConquestCooldown(playerAddress)`**: Torii SQL poll of `siege_dojo-ConquestCooldown` (`last_attack_time`), returns `{ lastAttackTime, remainingSeconds }` with a 1s local tick. `remainingSeconds = max(0, last + 3600 - now)`.
- **Add `getAttackability(parcel, myParcels, myFactionId, ownerFactionIds)`**: pure function returning `{ attackable: boolean, reason?: string }` covering: unclaimed, own parcel, home parcel, faction ally, not adjacent. Unit-testable.
- **Add `useOwnerFactionIds(owners)`** or fold into the page: Torii SQL `SELECT player, faction_id FROM "siege_dojo-FactionMember" WHERE player IN (...)` to grey out ally targets. If the query fails, fall back to attackable (contract enforces anyway).

### Lib: `frontend/src/lib/tiers.ts` (modify)

- Add `tierPresetCount(tier)` → 1/2/3/4, mirroring `tier_preset_count` in `world_system.cairo`.

### Component: `frontend/src/components/conquest/ConquestAllocator.tsx` (new)

Shared 6-field allocator in the war-room style (NOT the old blue `PressurePointAllocator`). Two groups:

- **Assault** — p0/p1/p2 against the defender's gates (East / Underground / West, matching 1v1 gate names).
- **Garrison** — g0/g1/g2 defending your own gates.

Stepper rows (− value +) with a remaining-budget readout that goes gold at 0 remaining and never permits exceeding the budget. Props: `values: number[6]`, `budget`, `onChange`. Used with budget 10 (attack) and 12 (presets).

### Component: `frontend/src/components/conquest/ConquestModal.tsx` (new)

Full-screen overlay (CreateFactionModal pattern). Phases, single component state machine:

1. **Plan** — target summary (type, coords, holder), `ConquestAllocator` (budget 10), ability picker (owned abilities via `fetchAllAbilityBalances`, styled like `AbilitySelector`; gate target 0-2 selectable when an ability is chosen; conquest takes an explicit `ability_target` for any ability). Persistent amber warning when an ability is selected: "This ability will be consumed — win or lose." Cooldown active → launch button disabled with live countdown. Launch button: "⚔ LAUNCH ASSAULT".
2. **Submitting** — approval tx (if ability) then VRF multicall; progress copy; errors surface verbatim with retry.
3. **Resolving** — receipt landed; polling Torii as described above.
4. **Result** — VICTORY (gold): "You seized <type> (col,row)". DEFEAT (red): "Assault repelled" + named lost parcel when the diff finds one, or "You held the line — last stand" when nothing was lost. Both show: ability-consumed notice (when used) and "Next assault available in 60:00" cooldown line. Close → `refresh()` the world page.

### Component: `frontend/src/components/conquest/PresetDefensePanel.tsx` (new)

Panel card on `/world` below the Hold summary ("STANDING DEFENSES"). Uses `usePresetDefense` + `tierPresetCount(kingdom.tier)`:

- One card per allowed slot. Saved slots show a compact readout (E/U/W assault + garrison values). Unsaved slots show "Not set".
- Edit expands the slot into a `ConquestAllocator` (budget 12) with SAVE / CANCEL. Save calls `setPresetDefense(account, index, ...)`, disables during submit, shows errors inline.
- Header note: "When attacked, fate picks one of your presets at random. Set at least one."
- Slots above the tier limit are not rendered; a muted line notes the next tier unlocks more.

### Component: `frontend/src/components/HexGrid.tsx` (modify)

- Lift selection: add optional `selectedParcel` / `onSelectParcel` props; when provided HexGrid is controlled (world page passes them), otherwise it keeps internal state (dev pages unaffected).
- Add optional `attackableParcelIds?: Set<number>`; those parcels get a red target ring / pulsing stroke so raidable borders read at a glance.

### Page: `frontend/src/app/world/page.tsx` (modify)

- Own `selectedParcel` state; compute `attackableParcelIds` (memoized) from parcels + `hex.ts` adjacency + faction data.
- Selection bar under the map when a parcel is selected: owned parcel → quiet info line; enemy parcel → attackability verdict, either "OPEN WAR COUNCIL" button or the disabled reason (on cooldown → countdown).
- Render `ConquestModal` when open; `PresetDefensePanel` after the Hold summary (registered players only).

## Testing

- `frontend/src/lib/__tests__/conquest.test.ts`: multicall shape for `initiateConquest` (request_random is call[0] keyed to conquest, initiate_conquest is call[1] — mirror `stakedMatch.test.ts` mock pattern); `getAttackability` matrix (unclaimed / own / home / ally / non-adjacent / attackable); budget math in a pure helper if extracted.
- `bun run lint`, `bun run test`, `bun run build` in `frontend/` must pass.
- Manual verification is the user's (no prescribed walkthrough).

## Constraints

- Strict `react-hooks/set-state-in-effect`: no synchronous setState in effect bodies — use `usePoll`, interval callbacks, and event handlers.
- `BigInt(0)`, not `0n`. Torii SQL reads only (no GraphQL). `sqlAddr`/`toNum` helpers for address/number columns.
- Session policies already cover `initiate_conquest`, `set_preset_defense`, `request_random`, `set_approval_for_all` — no policy change, no reconnect prompt needed.
- Do not touch `manifest_sepolia.json` (dirty in working tree) or other agents' worktrees under `.claude/worktrees/`.
