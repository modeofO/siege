> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Faction UI — Design Spec

**Date:** 2026-04-11
**Status:** Approved design
**Relates to:** `2026-04-10-alliance-faction-system-design.md`, `2026-04-10-alliance-faction-system.md` (implementation plan)

## Problem

The faction/alliance backend is shipped — all six entrypoints (`create_faction`, `invite_member`, `accept_invite`, `leave_faction`, `kick_member`, `set_faction_reinforcement`) are live, the conquest reinforcement pool is working, the friendly-fire and pillage-protection guards are in place, and `frontend/src/lib/factions.ts` exposes polling hooks and call builders for all of it.

There is no UI. To actually form, join, manage, or leave a faction today, a player has to call contract entrypoints by hand through `sozo execute` or a raw Starknet call. This spec covers the frontend surface that turns the faction system into a first-class player-visible feature.

## Design decisions

1. **Location** — inline panel on `/world`, below the existing "Your Kingdom" summary. Matches the established "world is the hub" pattern. No new route, no navbar changes. `CreateFactionModal` uses the same full-screen overlay pattern as `RegisterKingdom`.

2. **Scope** — full self-service: all six entrypoints get UI. Includes create, invite, accept, leave, kick, reinforcement toggle. Excludes the all-factions browser and cross-cutting faction tag badges on match/pillage pages (those are a separate polish pass).

3. **Member list** — full member list, rendered via a new `useFactionMembers(factionId)` hook added to `lib/factions.ts`. The list drives ergonomic per-row kick buttons and is what makes the panel feel like a faction instead of a form.

## Architecture & file layout

### New files

| File | Purpose |
|---|---|
| `frontend/src/components/FactionPanel.tsx` | Inline component rendered on `/world`. Branches internally across four UX states (see below). Owns all call-site logic for faction actions. |
| `frontend/src/components/CreateFactionModal.tsx` | Full-screen modal overlay for `create_faction`. Mirrors `RegisterKingdom` visual/interaction patterns. |

### Modified files

| File | Change |
|---|---|
| `frontend/src/lib/worldState.ts` | Extend `usePlayerKingdom` and `PlayerKingdomData` to include `tier`, `totalWins`, and `factionReinforcementEnabled`. Current hook queries `registered / home_0-2 / parcel_count / free_craft_used` only; faction UI needs the tier and reinforcement toggle state. Extension is additive — no existing consumers break. |
| `frontend/src/lib/factions.ts` | Add `useFactionMembers(factionId: number \| null)` hook that polls Torii for `FactionMember` rows matching the given faction_id. Mirrors the existing `useAllFactions` shape. |
| `frontend/src/app/world/page.tsx` | Import `FactionPanel`, render it after the "Your Kingdom" card. Pass `{ account, address, kingdom, refresh }` as props. The `kingdom` prop already flows through (no wiring changes) — the extension in `worldState.ts` automatically provides `tier` and `factionReinforcementEnabled` on the existing object. |

### Component responsibilities

**`FactionPanel({ account, address, kingdom, refresh })`** — reads `usePlayerFaction(address)` and `usePendingInvites(address)` internally, dispatches to one of four render states, and owns all call-site handlers (create-open, invite, accept, leave, kick, toggle). Every successful mutation calls the `refresh` prop so the parent's `PlayerKingdom` prop re-reads.

**`CreateFactionModal({ account, worldSystemAddress, onClose, onCreated })`** — owns its own form state, validation, and submission. Calls `createFaction(account, name, tag)` on submit, invokes `onCreated()` on success (which dismisses the modal and triggers parent refresh).

**Why no further component splitting:** the panel has ~6 render regions (header / toggle / member list / invite form / leave / empty-states) but each is a simple list or button row. Splitting into sub-components would add indirection without reducing complexity. At an expected ~250 lines the panel is comparable to existing single-file world components like `KingdomUpgrade` and `AllocationForm1v1`. Revisit if it grows past ~400 lines.

## UX states

`FactionPanel` branches on this logic:

```
Read:   usePlayerFaction(address)   → { member, faction, cooldownRemaining }
        usePendingInvites(address)  → invites[]
Props:  kingdom.tier
        kingdom.factionReinforcementEnabled

Branch:
  !member || member.factionId === 0   (player not currently in a faction)
    ├─ invites.length > 0    → State 3: pending invites
    ├─ kingdom.tier < 1      → State 1: locked (Polis)
    └─ kingdom.tier ≥ 1      → State 2: unaligned, can create
  member && member.factionId !== 0    → State 4: in faction
```

Note: `usePlayerFaction` returns `member: null` for a player who has never been in any faction (no `FactionMember` row exists yet). After leaving a faction, the row persists with `factionId = 0` and `lastLeaveTime` populated. Both cases must route to State 1/2/3.

### State 1 — Polis locked

Subdued panel. Title `FACTIONS`, body `Reach Strategos tier to form or join a faction.` No buttons, no interaction.

### State 2 — Unaligned (Strategos+)

Title `UNALIGNED`, body `Form a faction to lead allies, or wait for an invitation.` Single primary button `⚔ FOUND A FACTION ⚔` that opens `CreateFactionModal`. The create-faction entrypoint does not respect the 24h leave cooldown (only `accept_invite` does), so this button is always enabled for Strategos+ players.

### State 3 — Invites present

Title `PENDING INVITES`. One row per invite with:

- Faction name (gold, serif)
- Tag (small gold badge)
- Invited by `0x12a4…8bfe` (truncated)
- `[Accept]` button (right-aligned, gold outline)

Below the list: if `kingdom.tier >= 1`, also show the `⚔ FOUND A FACTION ⚔` button as a secondary option. Cooldown applies only to the Accept buttons (`accept_invite` enforces the 24h leave cooldown); the Found button is not cooldown-gated because `create_faction` does not check `lastLeaveTime`. When `cooldownRemaining > 0`, Accept buttons are disabled and display a countdown; the Found button remains enabled.

### State 4 — In faction

Main management panel. Top-to-bottom:

1. **Header row** — faction name (serif gold), tag badge, `LED BY 0x12a4…8bfe`, member count.
2. **Reinforcement toggle** — labeled row with on/off switch. Label `FACTION REINFORCEMENT`, description `Adjacent faction allies contribute a defense preset to conquest fights against your parcels.` Reads `kingdom.factionReinforcementEnabled`, calls `setFactionReinforcement(account, next)` on change.
3. **Member list** — one row per member from `useFactionMembers(faction.factionId)`. Row contents: truncated address, joined date, gold `★` leader badge, `[Kick]` button on the right (leader-only, excluded for self-row).
4. **Invite form** — leader-only. Label `INVITE A PLAYER`, wallet-address text input, `[Invite]` button.
5. **Leave button** — destructive treatment (red outline). Two-click confirmation pattern (see below).

## Data flow

All faction hooks in `lib/factions.ts` already poll Torii every 4 seconds via internal `setInterval`. The panel relies on these polls for state updates after transactions — explicit refresh plumbing is not threaded into the existing hook signatures. Updates are visible within 4 seconds of any successful mutation.

The existing world-page `refreshKey` mechanism is still used for the `kingdom` prop (so the reinforcement toggle change propagates to the parent) and for non-faction world state, but is not forwarded into the faction hooks.

Call-site handlers clear local UI state optimistically on tx success (e.g. empty the invite input, dismiss the confirmation sub-line) so the user sees immediate feedback before the 4s poll catches up.

### New hook: `useFactionMembers`

Mirrors `useAllFactions` structure. Signature:

```ts
export function useFactionMembers(factionId: number | null): FactionMemberData[]
```

Short-circuits when `factionId` is null or 0. GraphQL query against `siegeDojoFactionMemberModels(where: { faction_id: <id> })`, returning all matching rows. Uses the same `POLL_INTERVAL` (4000 ms) as existing hooks.

## Interaction details

### Create faction

`CreateFactionModal` layout:

1. Title `⚔ FOUND A FACTION ⚔`
2. Subtitle `Rally allies under your banner.`
3. **Name input** — label `FACTION NAME`, soft cap 31 chars (felt252 limit)
4. **Tag input** — label `BANNER TAG`, soft cap 6 chars
5. **Formation cost display** — bordered sub-panel, three resource rows: `30 IRON` (`#b87333`), `30 STONE` (`#8a8a9a`), `20 WOOD` (`#4a7c59`)
6. **Submit button** — `⚔ ESTABLISH FACTION ⚔`, disabled while submitting, shows `ESTABLISHING...` mid-tx
7. **Error row** — `#ff3344` inline message, form values preserved across errors
8. **Close affordance** — `✕` top-right, or click-outside-card-to-close

Client-side validation before submit: name non-empty and ≤31 chars, tag non-empty and ≤6 chars. Invalid input shows inline red text under the offending field.

No resource-balance precheck. If the player lacks resources, the contract panics in `burn_upgrade_resources`; the error is caught and surfaced inline. The cost display is upfront so the contract panic is rarely the first indication.

### Kick member (leader-only)

Per-row button, two-click confirmation:

1. First click — button flips from `[Kick]` to `[Confirm]` with a `✕` cancel affordance alongside. Auto-reverts after 5 seconds if untouched.
2. Second click — submits `kickMember(account, target)`. Button shows pending indicator. On success, the member list poll removes the row within 4s. On error, inline red text in that row.

### Leave faction

Red-outline button at the bottom of the panel, two-click confirmation:

1. First click — reveals a confirmation sub-line with Confirm / Cancel buttons.
   - Member copy: `Confirm leave · 24h cooldown before rejoining any faction`
   - Leader copy: `Confirm leave · This will DISSOLVE the faction for all members`
2. Confirm click — submits `leaveFaction(account)`. On success, `usePlayerFaction` transitions the panel to State 2 within 4s.

### Invite member (leader-only)

Simple row above the Leave button:

- Label `INVITE A PLAYER`
- Full-width text input, placeholder `0x0123...`
- Client-side validation: regex `^0x[0-9a-fA-F]+$` and length > 2
- `[Invite]` button on the right
- On submit: calls `inviteMember(account, target)`, shows pending state, clears input on success
- On error: inline red text below the input

No tracking of pending invites from the leader's side — the backend doesn't index invites by sender, so a leader fires and forgets. A leader who wants to know if a target accepted checks the member list.

### Reinforcement toggle

Labeled row near the top of State 4:

- Label `FACTION REINFORCEMENT`
- Description `Adjacent faction allies contribute a defense preset to conquest fights against your parcels.`
- Toggle switch on the right
- Reads from `kingdom.factionReinforcementEnabled`
- On change: calls `setFactionReinforcement(account, next)`, shows pending indicator on the switch until tx resolves, then calls `refresh()` so the `kingdom` prop re-reads

## Validation & error handling

- **Create form**: name 1–31 chars, tag 1–6 chars — client-side regex and length checks before submit. Invalid fields show inline red text under the field; submit blocked.
- **Invite form**: wallet address regex `^0x[0-9a-fA-F]+$`, length > 2 — inline validation.
- **Transaction errors**: all mutation handlers wrap the library call in `try/catch`. On error, set a local `error` state and render red inline text at the relevant location. Form values are preserved so the user can retry or edit.
- **Contract panics** (e.g. insufficient resources, tier too low, already in a faction): surfaced as raw error messages in the same inline red text treatment. The cost/requirements display upfront minimizes the surprise of contract-side failures.

## Styling palette

Matches existing `/world` components (`RegisterKingdom`, `KingdomUpgrade`, `HexGrid`):

| Purpose | Color |
|---|---|
| Panel background | `#1a1714` |
| Panel border | `#3d3428` |
| Modal overlay | `#0d0b0a` @ 90% |
| Primary gold accent | `#daa520` |
| Text primary | `#d4cfc6` |
| Text muted | `#7a7060` |
| Error / destructive | `#ff3344` |

Typography: `font-serif font-bold` for titles, `tracking-wider` for all-caps labels, text sizes `text-[10px]` (micro-labels), `text-xs` (secondary), `text-sm` (buttons/body), `text-lg`/`text-xl` (section titles).

## Helpers

Inline in `FactionPanel.tsx`:

```ts
// BigInt-safe address equality — handles unpadded/padded Torii variants.
const addrEq = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return false;
  try { return BigInt(a) === BigInt(b); } catch { return false; }
};

// Short display form of an address.
const truncAddr = (a: string): string =>
  a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
```

## Testing

No new `vitest` tests in v1. The existing frontend test suite (39 tests in 2 files) covers pure logic in `src/lib/*`; there is no precedent for React component tests in the project. The new `useFactionMembers` hook mirrors existing hooks (`useFaction`, `useAllFactions`) that have no unit tests. Verification is left to the user once the code is in place.

If component or hook tests are desired later, they can be added as a follow-up session — the helper functions (`addrEq`, `truncAddr`, any future validator) are the natural first targets.

## Explicit non-goals

Out of scope for v1 — may be follow-up sessions:

- Faction tag badges rendered on `/match-1v1/*`, pillage UI, or hex map player inspector (cross-cutting, deferred)
- All-factions browser / leaderboard (`useAllFactions` is built but not consumed by UI)
- Resource-balance precheck before create (contract panic is acceptable feedback for v1)
- Username / ENS-style resolution for addresses (no system exists)
- Dissolved-faction history view
- Leader transfer, faction rename, voluntary dissolve-without-leaving (no backend support)

## Implementation order

Rough order for the implementation plan (will be detailed in a separate plan document):

1. Extend `usePlayerKingdom` in `lib/worldState.ts` to include `tier`, `totalWins`, `factionReinforcementEnabled`
2. Add `useFactionMembers` hook to `lib/factions.ts`
3. Scaffold `FactionPanel.tsx` with the four-state branch returning placeholder content per state
4. Wire `FactionPanel` into `/world/page.tsx`
5. Build State 1 (locked, trivial)
6. Build State 2 (unaligned + create button), stub the modal
7. Build `CreateFactionModal.tsx` (form, validation, cost display, submit)
8. Build State 3 (invite list + accept buttons + cooldown handling)
9. Build State 4 header + reinforcement toggle
10. Build State 4 member list with leader badge
11. Build State 4 kick buttons with two-click confirmation
12. Build State 4 invite form
13. Build State 4 leave button with two-click confirmation
14. Final lint/typecheck pass on new files only (pre-existing lint debt is out of scope)
