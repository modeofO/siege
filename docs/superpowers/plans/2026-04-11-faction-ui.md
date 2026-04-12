# Faction UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend surface for the faction/alliance system on `/world` — player-visible UI for all six backend entrypoints (create, invite, accept, leave, kick, reinforcement toggle) plus a member list.

**Architecture:** One inline `FactionPanel` component on `/world` that branches across four UX states (Polis-locked, Unaligned, Pending invites, In faction) plus one full-screen `CreateFactionModal` overlay. All read state comes from polling hooks in `lib/factions.ts` (4s interval). No new routes, no navbar changes. Mirrors the existing `RegisterKingdom` visual + interaction patterns.

**Tech Stack:** Next.js 16 app router, React 19, Tailwind 4, Starknet.js v8.9.2, Cartridge Controller. No new dependencies.

**Design spec:** `docs/superpowers/specs/2026-04-11-faction-ui-design.md`

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/worldState.ts` | Modify | Extend `usePlayerKingdom` + `PlayerKingdomData` with `tier`, `totalWins`, `factionReinforcementEnabled` |
| `frontend/src/lib/factions.ts` | Modify | Add `useFactionMembers(factionId)` hook |
| `frontend/src/components/FactionPanel.tsx` | Create | Inline panel with 4-state branching, all call-site handlers, inline helpers |
| `frontend/src/components/CreateFactionModal.tsx` | Create | Full-screen modal for `create_faction` with form, validation, cost display |
| `frontend/src/app/world/page.tsx` | Modify | Import and render `FactionPanel` after the Kingdom summary |

---

## Verification conventions used throughout

Run from `frontend/` directory (use `cd /Users/modeofo/Apps/siege/frontend` or absolute paths):

- **Typecheck:** `npx tsc --noEmit` — catches type errors across the whole project. Expected: clean (0 errors). Pre-existing project-wide lint warnings are **not** typecheck errors and should not appear.
- **Scoped lint:** `npx eslint src/path/to/file.tsx` — lints only the file you just changed. Avoids the 5 pre-existing project-wide lint errors (in `BookLink.tsx`, `KingdomUpgrade.tsx`, `toriiSubscription.ts`, `match/create/page.tsx`) which are out of scope.
- **Test suite:** `npx vitest run` — runs the 39 existing frontend tests. Expected: all pass. No new tests added in this plan.

---

## Task 1: Extend `usePlayerKingdom` with tier + faction fields

**Files:**
- Modify: `frontend/src/lib/worldState.ts:93-152`

The existing hook doesn't query `tier`, `total_wins`, or `faction_reinforcement_enabled`. Extend it additively — no existing consumer breaks because they destructure only the fields they need.

- [ ] **Step 1: Extend the `PlayerKingdomData` interface**

Edit `frontend/src/lib/worldState.ts`. Replace the existing interface:

```ts
export interface PlayerKingdomData {
  registered: boolean;
  home0: number;
  home1: number;
  home2: number;
  parcelCount: number;
  freeCraftUsed: boolean;
}
```

with:

```ts
export interface PlayerKingdomData {
  registered: boolean;
  home0: number;
  home1: number;
  home2: number;
  parcelCount: number;
  freeCraftUsed: boolean;
  tier: number;
  totalWins: number;
  factionReinforcementEnabled: boolean;
}
```

- [ ] **Step 2: Extend the `usePlayerKingdom` default state**

Replace the existing `useState` call:

```ts
const [kingdom, setKingdom] = useState<PlayerKingdomData>({
  registered: false,
  home0: 0, home1: 0, home2: 0,
  parcelCount: 0,
  freeCraftUsed: false,
});
```

with:

```ts
const [kingdom, setKingdom] = useState<PlayerKingdomData>({
  registered: false,
  home0: 0, home1: 0, home2: 0,
  parcelCount: 0,
  freeCraftUsed: false,
  tier: 0,
  totalWins: 0,
  factionReinforcementEnabled: false,
});
```

- [ ] **Step 3: Extend the GraphQL query and response shape**

Replace the existing query type + query string:

```ts
const data = await toriiQuery<{
  siegeDojoPlayerKingdomModels: GraphEdges<{
    registered: boolean;
    home_0: string;
    home_1: string;
    home_2: string;
    parcel_count: string;
    free_craft_used: boolean;
  }>;
}>(`
  query {
    siegeDojoPlayerKingdomModels(where: { player: "${playerAddress}" }) {
      edges { node {
        registered home_0 home_1 home_2 parcel_count free_craft_used
      } }
    }
  }
`);
```

with:

```ts
const data = await toriiQuery<{
  siegeDojoPlayerKingdomModels: GraphEdges<{
    registered: boolean;
    home_0: string;
    home_1: string;
    home_2: string;
    parcel_count: string;
    free_craft_used: boolean;
    tier: string;
    total_wins: string;
    faction_reinforcement_enabled: boolean;
  }>;
}>(`
  query {
    siegeDojoPlayerKingdomModels(where: { player: "${playerAddress}" }) {
      edges { node {
        registered home_0 home_1 home_2 parcel_count free_craft_used
        tier total_wins faction_reinforcement_enabled
      } }
    }
  }
`);
```

- [ ] **Step 4: Extend the `setKingdom` call in the fetch handler**

Replace:

```ts
if (node) {
  setKingdom({
    registered: !!node.registered,
    home0: toNum(node.home_0),
    home1: toNum(node.home_1),
    home2: toNum(node.home_2),
    parcelCount: toNum(node.parcel_count),
    freeCraftUsed: !!node.free_craft_used,
  });
}
```

with:

```ts
if (node) {
  setKingdom({
    registered: !!node.registered,
    home0: toNum(node.home_0),
    home1: toNum(node.home_1),
    home2: toNum(node.home_2),
    parcelCount: toNum(node.parcel_count),
    freeCraftUsed: !!node.free_craft_used,
    tier: toNum(node.tier),
    totalWins: toNum(node.total_wins),
    factionReinforcementEnabled: !!node.faction_reinforcement_enabled,
  });
}
```

- [ ] **Step 5: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors. If errors appear that reference `PlayerKingdomData`, another file is using the old shape — investigate and decide whether it needs updating.

- [ ] **Step 6: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/lib/worldState.ts
```

Expected: no errors.

- [ ] **Step 7: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/lib/worldState.ts && git commit -m "feat: extend usePlayerKingdom with tier + faction fields"
```

---

## Task 2: Add `useFactionMembers` hook

**Files:**
- Modify: `frontend/src/lib/factions.ts` (append after `useAllFactions` around line 286)

Mirrors the `useAllFactions` pattern but fetches FactionMember rows and filters client-side by `factionId`. Client-side filtering is used instead of a GraphQL `where` filter to avoid depending on Torii's non-key-field filter support — factions are small enough in v1 (< ~1000 members total) that fetching everything and filtering in JS is negligible overhead.

- [ ] **Step 1: Add the hook to `lib/factions.ts`**

Append this function immediately after the existing `useAllFactions` export (around line 286):

```ts
export function useFactionMembers(factionId: number | null): FactionMemberData[] {
  const [data, setData] = useState<FactionMemberData[]>([]);

  useEffect(() => {
    if (!factionId || factionId <= 0) {
      setData([]);
      return;
    }

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoFactionMemberModels: GraphEdges<{
          player: string;
          faction_id: string;
          joined_at: string;
          last_leave_time: string;
        }>;
      }>(`
        query {
          siegeDojoFactionMemberModels(first: 1000) {
            edges { node { player faction_id joined_at last_leave_time } }
          }
        }
      `);

      const entries = (result?.siegeDojoFactionMemberModels?.edges || [])
        .map((e) => ({
          player: e.node.player,
          factionId: toNum(e.node.faction_id),
          joinedAt: toNum(e.node.joined_at),
          lastLeaveTime: toNum(e.node.last_leave_time),
        }))
        .filter((m) => m.factionId === factionId);

      entries.sort((a, b) => a.joinedAt - b.joinedAt);
      setData(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [factionId]);

  return data;
}
```

- [ ] **Step 2: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/lib/factions.ts
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/lib/factions.ts && git commit -m "feat: add useFactionMembers hook to factions library"
```

---

## Task 3: Scaffold `FactionPanel` with state-branching shell

**Files:**
- Create: `frontend/src/components/FactionPanel.tsx`
- Modify: `frontend/src/app/world/page.tsx`

Create the panel with all 4 states returning placeholder content. Wire it into the world page. Later tasks replace each state's placeholder with real content. This guarantees the app continues to build and render through every intermediate commit.

- [ ] **Step 1: Create `FactionPanel.tsx` with the full skeleton**

Create `frontend/src/components/FactionPanel.tsx` with this content:

```tsx
"use client";

import { useState } from "react";
import type { AccountInterface } from "starknet";
import {
  usePlayerFaction,
  usePendingInvites,
  useFactionMembers,
  inviteMember,
  acceptInvite,
  leaveFaction,
  kickMember,
  setFactionReinforcement,
  formatCooldown,
} from "@/lib/factions";
import type { PlayerKingdomData } from "@/lib/worldState";

interface FactionPanelProps {
  account: AccountInterface;
  address: string;
  kingdom: PlayerKingdomData;
  worldSystemAddress: string;
  refresh: () => void;
}

// BigInt-safe address equality — handles unpadded/padded Torii variants.
const addrEq = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) return false;
  try { return BigInt(a) === BigInt(b); } catch { return false; }
};

// Short display form of an address.
const truncAddr = (a: string): string =>
  a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a || "");

// Silence unused-import warnings for functions wired up in later tasks.
// These are referenced here so ESLint doesn't flag the imports while we
// scaffold the panel. They get used inside the state sub-views.
void useFactionMembers;
void inviteMember;
void acceptInvite;
void leaveFaction;
void kickMember;
void setFactionReinforcement;
void formatCooldown;
void addrEq;
void truncAddr;

export function FactionPanel({ account, address, kingdom, worldSystemAddress, refresh }: FactionPanelProps) {
  const { member, faction, cooldownRemaining } = usePlayerFaction(address);
  const invites = usePendingInvites(address);

  // Silence unused prop warnings on the scaffold — consumed in later tasks.
  void account;
  void worldSystemAddress;
  void refresh;
  void cooldownRemaining;

  const inFaction = member && member.factionId !== 0 && faction;

  if (inFaction) {
    return <InFactionView />;
  }

  if (invites.length > 0) {
    return <InvitesView />;
  }

  if (kingdom.tier < 1) {
    return <PolisLockedView />;
  }

  return <UnalignedView />;
}

function PolisLockedView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Factions
      </div>
      <div className="text-[11px] text-[#7a7060]">
        (Polis locked — built in Task 4)
      </div>
    </div>
  );
}

function UnalignedView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Unaligned
      </div>
      <div className="text-[11px] text-[#7a7060]">
        (Unaligned + create — built in Task 5)
      </div>
    </div>
  );
}

function InvitesView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Pending Invites
      </div>
      <div className="text-[11px] text-[#7a7060]">
        (Invites list + accept — built in Task 7)
      </div>
    </div>
  );
}

function InFactionView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Your Faction
      </div>
      <div className="text-[11px] text-[#7a7060]">
        (In-faction management — built in Tasks 8–12)
      </div>
    </div>
  );
}
```

The `void` statements on unused imports and props are a deliberate scaffolding shim — they prevent the strict-unused warnings while we build incrementally. They get removed naturally in later tasks as the real call-site handlers consume each import.

- [ ] **Step 2: Wire `FactionPanel` into `/world/page.tsx`**

Edit `frontend/src/app/world/page.tsx`. Add the import near the top:

```tsx
import { FactionPanel } from "@/components/FactionPanel";
```

Then, inside the returned JSX, add the panel after the "Kingdom summary" block (at the end of the `{kingdom.registered && (...)}` region, after the closing `</div>` of the Kingdom summary). The final return becomes:

```tsx
return (
  <div className="space-y-4 py-4">
    {/* Registration overlay */}
    {!kingdom.registered && parcels.length > 0 && (
      <RegisterKingdom
        account={account}
        worldSystemAddress={WORLD_SYSTEM_ADDRESS}
        onRegistered={refresh}
      />
    )}

    {/* Map header */}
    <div className="flex items-center justify-between">
      <h1 className="text-lg font-bold font-serif text-[#daa520] tracking-wider">
        THE REALM
      </h1>
      {kingdom.registered && (
        <div className="text-xs text-[#7a7060]">
          {kingdom.parcelCount} parcels owned
        </div>
      )}
    </div>

    {/* Hex grid */}
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4">
      {parcels.length === 0 ? (
        <div className="text-center text-[#7a7060] py-12">
          World not initialized. No parcels found.
        </div>
      ) : (
        <HexGrid
          parcels={parcels}
          playerAddress={address}
          homeParcelIds={
            kingdom.registered
              ? [kingdom.home0, kingdom.home1, kingdom.home2]
              : []
          }
        />
      )}
    </div>

    {/* Kingdom summary */}
    {kingdom.registered && (
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
        <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
          Your Kingdom
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Home parcels */}
          <div className="space-y-1">
            <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Home Parcels</div>
            <div className="flex gap-2">
              {homeParcelTypes.map((p, i) => (
                <div
                  key={i}
                  className="px-2 py-1 rounded text-[10px] font-bold border border-[#daa520]/30"
                  style={{ color: p ? { 0: "#b87333", 1: "#8a8a9a", 2: "#4a7c59" }[p.parcelType as 0 | 1 | 2] : "#7a7060" }}
                >
                  {p ? PARCEL_TYPE_NAMES[p.parcelType] : "?"}
                </div>
              ))}
            </div>
          </div>

          {/* Abilities */}
          <div className="space-y-1">
            <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Abilities</div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(abilities).map(([name, count]) =>
                count > 0 ? (
                  <div key={name} className="px-2 py-1 rounded text-[10px] bg-[#252019] text-[#d4cfc6]">
                    {name}: {count}
                  </div>
                ) : null,
              )}
              {Object.values(abilities).every((c) => c === 0) && (
                <div className="text-[10px] text-[#7a7060]">None</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Faction panel */}
    {kingdom.registered && (
      <FactionPanel
        account={account}
        address={address}
        kingdom={kingdom}
        worldSystemAddress={WORLD_SYSTEM_ADDRESS}
        refresh={refresh}
      />
    )}
  </div>
);
```

The panel is gated on `kingdom.registered` because none of the faction states make sense for a player who hasn't claimed their kingdom yet (they can't be in a faction, can't create one, can't receive invites).

- [ ] **Step 3: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx src/app/world/page.tsx
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx frontend/src/app/world/page.tsx && git commit -m "feat: scaffold FactionPanel with state branching shell"
```

---

## Task 4: Build State 1 — Polis locked

**Files:**
- Modify: `frontend/src/components/FactionPanel.tsx` (replace the `PolisLockedView` function)

Simple static panel. No interactivity.

- [ ] **Step 1: Replace `PolisLockedView` with the real content**

Find the scaffolded `PolisLockedView` function in `FactionPanel.tsx`:

```tsx
function PolisLockedView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Factions
      </div>
      <div className="text-[11px] text-[#7a7060]">
        (Polis locked — built in Task 5)
      </div>
    </div>
  );
}
```

Replace with:

```tsx
function PolisLockedView() {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Factions
      </div>
      <div className="text-[11px] text-[#7a7060] leading-relaxed">
        Reach <span className="text-[#daa520] font-bold">Strategos</span> tier to form or join a faction. Factions share borders, reinforce each other in conquest fights, and pool contributions toward campaign objectives.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx && git commit -m "feat: build FactionPanel State 1 — Polis locked"
```

---

## Task 5: Build State 2 — Unaligned + modal trigger

**Files:**
- Modify: `frontend/src/components/FactionPanel.tsx`

Render the unaligned CTA and wire it to a local `modalOpen` state. The modal itself is a placeholder — Task 6 replaces it with the real `CreateFactionModal`.

- [ ] **Step 1: Lift `modalOpen` state to `FactionPanel`**

In the main `FactionPanel` function, add the modal state at the top of the function body. Replace:

```tsx
export function FactionPanel({ account, address, kingdom, worldSystemAddress, refresh }: FactionPanelProps) {
  const { member, faction, cooldownRemaining } = usePlayerFaction(address);
  const invites = usePendingInvites(address);

  // Silence unused prop warnings on the scaffold — consumed in later tasks.
  void account;
  void worldSystemAddress;
  void refresh;
  void cooldownRemaining;

  const inFaction = member && member.factionId !== 0 && faction;

  if (inFaction) {
    return <InFactionView />;
  }

  if (invites.length > 0) {
    return <InvitesView />;
  }

  if (kingdom.tier < 1) {
    return <PolisLockedView />;
  }

  return <UnalignedView />;
}
```

with:

```tsx
export function FactionPanel({ account, address, kingdom, worldSystemAddress, refresh }: FactionPanelProps) {
  const { member, faction, cooldownRemaining } = usePlayerFaction(address);
  const invites = usePendingInvites(address);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Silence unused prop/hook warnings for scaffolded states still being built.
  void account;
  void worldSystemAddress;
  void refresh;
  void cooldownRemaining;

  const inFaction = member && member.factionId !== 0 && faction;

  const openCreate = () => setCreateModalOpen(true);
  const closeCreate = () => setCreateModalOpen(false);
  const onCreated = () => {
    setCreateModalOpen(false);
    refresh();
  };

  // Silence unused-until-later callbacks.
  void onCreated;

  if (inFaction) {
    return <InFactionView />;
  }

  if (invites.length > 0) {
    return <InvitesView />;
  }

  if (kingdom.tier < 1) {
    return <PolisLockedView />;
  }

  return (
    <>
      <UnalignedView onCreate={openCreate} />
      {createModalOpen && (
        <CreateFactionPlaceholder onClose={closeCreate} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Replace `UnalignedView` with interactive CTA**

Find the scaffolded `UnalignedView` and replace it with:

```tsx
interface UnalignedViewProps {
  onCreate: () => void;
}

function UnalignedView({ onCreate }: UnalignedViewProps) {
  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-4">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Unaligned
      </div>
      <div className="text-[11px] text-[#7a7060] leading-relaxed">
        Form a faction to lead allies, or wait for an invitation. Faction leaders share borders with members and reinforce each other in conquest fights.
      </div>
      <button
        onClick={onCreate}
        className="w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all bg-[#daa520]/10 border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520]/20"
      >
        ⚔ FOUND A FACTION ⚔
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add the placeholder modal component**

Add this function at the bottom of `FactionPanel.tsx` (before the last closing brace of the file is not needed — these are top-level functions). It exists only until Task 6 replaces it.

```tsx
interface CreateFactionPlaceholderProps {
  onClose: () => void;
}

function CreateFactionPlaceholder({ onClose }: CreateFactionPlaceholderProps) {
  return (
    <div className="fixed inset-0 bg-[#0d0b0a]/90 flex items-center justify-center z-50">
      <div className="bg-[#1a1714] border border-[#3d3428] rounded-lg p-6 max-w-lg w-full mx-4 space-y-4">
        <div className="text-center text-[#daa520] font-serif tracking-wider">
          FOUND A FACTION (placeholder — Task 6)
        </div>
        <button
          onClick={onClose}
          className="w-full py-2 rounded text-xs tracking-wider bg-[#252019] text-[#7a7060] border border-[#3d3428] hover:text-[#d4cfc6]"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx && git commit -m "feat: build FactionPanel State 2 — unaligned CTA with modal trigger"
```

---

## Task 6: Build `CreateFactionModal`

**Files:**
- Create: `frontend/src/components/CreateFactionModal.tsx`
- Modify: `frontend/src/components/FactionPanel.tsx` (swap out the placeholder)

Full-screen modal matching `RegisterKingdom`'s visual pattern. Owns its own form state, validation, submission, error display.

- [ ] **Step 1: Create `CreateFactionModal.tsx`**

Create `frontend/src/components/CreateFactionModal.tsx` with this full content:

```tsx
"use client";

import { useState } from "react";
import type { AccountInterface } from "starknet";
import { createFaction } from "@/lib/factions";

interface CreateFactionModalProps {
  account: AccountInterface;
  onClose: () => void;
  onCreated: () => void;
}

const RESOURCE_COSTS = [
  { name: "IRON", amount: 30, color: "#b87333" },
  { name: "STONE", amount: 30, color: "#8a8a9a" },
  { name: "WOOD", amount: 20, color: "#4a7c59" },
];

export function CreateFactionModal({ account, onClose, onCreated }: CreateFactionModalProps) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const validate = (): string | null => {
    const n = name.trim();
    const t = tag.trim();
    if (!n) return "Faction name required.";
    if (n.length > 31) return "Faction name must be 31 characters or fewer.";
    if (!t) return "Banner tag required.";
    if (t.length > 6) return "Banner tag must be 6 characters or fewer.";
    return null;
  };

  const handleSubmit = async () => {
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createFaction(account, name.trim(), tag.trim());
      onCreated();
    } catch (e) {
      console.error("Create faction failed:", e);
      setError(e instanceof Error ? e.message : "Create faction failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !submitting) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-[#0d0b0a]/90 flex items-center justify-center z-50"
      onClick={handleBackdrop}
    >
      <div className="bg-[#1a1714] border border-[#3d3428] rounded-lg p-6 max-w-lg w-full mx-4 space-y-5 relative">
        <button
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
          className="absolute top-3 right-3 text-[#7a7060] hover:text-[#d4cfc6] text-lg leading-none disabled:opacity-30"
        >
          ✕
        </button>

        <div className="text-center">
          <h2 className="text-xl font-bold font-serif text-[#daa520] tracking-wider">
            ⚔ FOUND A FACTION ⚔
          </h2>
          <p className="text-xs text-[#7a7060] mt-2">
            Rally allies under your banner.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
              Faction Name
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={31}
              placeholder="House Atreides"
              disabled={submitting}
              className="w-full px-3 py-2 rounded bg-[#252019] border border-[#3d3428] text-[#d4cfc6] text-sm font-serif placeholder-[#3d3428] focus:outline-none focus:border-[#daa520]/50"
            />
            <div className="text-[9px] text-[#7a7060] text-right">{name.length} / 31</div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
              Banner Tag
            </div>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={6}
              placeholder="ATR"
              disabled={submitting}
              className="w-full px-3 py-2 rounded bg-[#252019] border border-[#3d3428] text-[#daa520] text-sm font-serif font-bold tracking-wider placeholder-[#3d3428] focus:outline-none focus:border-[#daa520]/50"
            />
            <div className="text-[9px] text-[#7a7060] text-right">{tag.length} / 6</div>
          </div>
        </div>

        <div className="border border-[#3d3428] rounded p-3 space-y-2 bg-[#0d0b0a]/40">
          <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
            Formation Cost
          </div>
          <div className="grid grid-cols-3 gap-2">
            {RESOURCE_COSTS.map((r) => (
              <div
                key={r.name}
                className="text-center px-2 py-1 rounded border border-[#3d3428] bg-[#1a1510]"
              >
                <div className="text-sm font-bold" style={{ color: r.color }}>
                  {r.amount}
                </div>
                <div className="text-[9px] text-[#7a7060] tracking-wider">
                  {r.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all bg-[#daa520]/10 border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520]/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? "ESTABLISHING..." : "⚔ ESTABLISH FACTION ⚔"}
        </button>

        {error && (
          <div className="text-[#ff3344] text-xs text-center break-words">{error}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Swap the placeholder in `FactionPanel.tsx`**

In `FactionPanel.tsx`, add the import at the top:

```tsx
import { CreateFactionModal } from "@/components/CreateFactionModal";
```

In the main `FactionPanel` return block for the unaligned state, replace:

```tsx
return (
  <>
    <UnalignedView onCreate={openCreate} />
    {createModalOpen && (
      <CreateFactionPlaceholder onClose={closeCreate} />
    )}
  </>
);
```

with:

```tsx
return (
  <>
    <UnalignedView onCreate={openCreate} />
    {createModalOpen && (
      <CreateFactionModal
        account={account}
        onClose={closeCreate}
        onCreated={onCreated}
      />
    )}
  </>
);
```

Then **delete** the entire `CreateFactionPlaceholder` function (including its props interface) from `FactionPanel.tsx` — it's replaced.

Also remove the `void onCreated;` line from the scaffolded unused-silencers section, since `onCreated` is now wired up.

- [ ] **Step 3: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/CreateFactionModal.tsx src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/CreateFactionModal.tsx frontend/src/components/FactionPanel.tsx && git commit -m "feat: build CreateFactionModal with form, validation, cost display"
```

---

## Task 7: Build State 3 — Pending invites list

**Files:**
- Modify: `frontend/src/components/FactionPanel.tsx`

Render the list of pending invites with per-row accept buttons. Cooldown gates the Accept buttons (`accept_invite` enforces cooldown). The secondary Found button is NOT cooldown-gated (`create_faction` ignores cooldown).

- [ ] **Step 1: Replace `InvitesView` with the real content**

Find the scaffolded `InvitesView` and replace it. Also update the `FactionPanel` dispatcher to pass the needed props.

In the `FactionPanel` main function body, change the "InvitesView" return from:

```tsx
if (invites.length > 0) {
  return <InvitesView />;
}
```

to:

```tsx
if (invites.length > 0) {
  return (
    <>
      <InvitesView
        invites={invites}
        account={account}
        cooldownRemaining={cooldownRemaining}
        canCreate={kingdom.tier >= 1}
        onCreate={openCreate}
        onAccepted={refresh}
      />
      {createModalOpen && (
        <CreateFactionModal
          account={account}
          onClose={closeCreate}
          onCreated={onCreated}
        />
      )}
    </>
  );
}
```

Remove the `void account;` and `void refresh;` and `void cooldownRemaining;` lines from the scaffolded unused-silencers section at the top of `FactionPanel`, since all three are now consumed.

Replace the scaffolded `InvitesView` function with:

```tsx
interface InvitesViewProps {
  invites: ReturnType<typeof usePendingInvites>;
  account: AccountInterface;
  cooldownRemaining: number;
  canCreate: boolean;
  onCreate: () => void;
  onAccepted: () => void;
}

function InvitesView({ invites, account, cooldownRemaining, canCreate, onCreate, onAccepted }: InvitesViewProps) {
  const [accepting, setAccepting] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleAccept = async (factionId: number) => {
    setAccepting(factionId);
    setError("");
    try {
      await acceptInvite(account, factionId);
      onAccepted();
    } catch (e) {
      console.error("Accept invite failed:", e);
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setAccepting(null);
    }
  };

  const cooldownLocked = cooldownRemaining > 0;

  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-4">
      <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
        Pending Invites
      </div>

      {cooldownLocked && (
        <div className="text-[10px] text-[#daa520]/70 bg-[#daa520]/5 border border-[#daa520]/20 rounded px-2 py-1">
          Leave cooldown active — {formatCooldown(cooldownRemaining)} remaining before you can accept an invite.
        </div>
      )}

      <div className="space-y-2">
        {invites.map((inv) => (
          <div
            key={`${inv.factionId}-${inv.invitedBy}`}
            className="flex items-center justify-between border border-[#3d3428] rounded p-2 bg-[#0d0b0a]/40"
          >
            <div className="text-[11px] text-[#d4cfc6]">
              <div className="font-serif">Faction #{inv.factionId}</div>
              <div className="text-[9px] text-[#7a7060]">
                from {truncAddr(inv.invitedBy)}
              </div>
            </div>
            <button
              onClick={() => handleAccept(inv.factionId)}
              disabled={cooldownLocked || accepting !== null}
              className="px-3 py-1 rounded text-[10px] font-bold tracking-wider border border-[#daa520] text-[#daa520] hover:bg-[#daa520]/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {accepting === inv.factionId ? "..." : "ACCEPT"}
            </button>
          </div>
        ))}
      </div>

      {canCreate && (
        <button
          onClick={onCreate}
          className="w-full py-2 rounded font-bold tracking-wider text-[11px] font-serif transition-all bg-[#252019] border border-[#3d3428] text-[#7a7060] hover:text-[#daa520] hover:border-[#daa520]/50"
        >
          Or found your own faction
        </button>
      )}

      {error && (
        <div className="text-[#ff3344] text-xs text-center">{error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx && git commit -m "feat: build FactionPanel State 3 — pending invites list"
```

---

## Task 8: Build State 4 — In-faction header + reinforcement toggle

**Files:**
- Modify: `frontend/src/components/FactionPanel.tsx`

Start populating the in-faction view. Header shows faction name, tag, leader, member count. Below it, the reinforcement toggle row. Member list, invite form, and leave button come in subsequent tasks.

- [ ] **Step 1: Add `FactionData` and `FactionMemberData` to the factions import**

In `FactionPanel.tsx`, extend the existing `@/lib/factions` import to include the two types. Change:

```tsx
import {
  usePlayerFaction,
  usePendingInvites,
  useFactionMembers,
  inviteMember,
  acceptInvite,
  leaveFaction,
  kickMember,
  setFactionReinforcement,
  formatCooldown,
} from "@/lib/factions";
```

to:

```tsx
import {
  usePlayerFaction,
  usePendingInvites,
  useFactionMembers,
  inviteMember,
  acceptInvite,
  leaveFaction,
  kickMember,
  setFactionReinforcement,
  formatCooldown,
  type FactionData,
  type FactionMemberData,
} from "@/lib/factions";
```

- [ ] **Step 2: Replace `InFactionView` and wire props from the dispatcher**

Update the `FactionPanel` dispatcher to pass faction/member/kingdom/account/refresh to the in-faction view:

Change:

```tsx
if (inFaction) {
  return <InFactionView />;
}
```

to:

```tsx
if (inFaction && faction && member) {
  return (
    <InFactionView
      account={account}
      address={address}
      faction={faction}
      member={member}
      kingdom={kingdom}
      refresh={refresh}
    />
  );
}
```

Replace the scaffolded `InFactionView` with:

```tsx
interface InFactionViewProps {
  account: AccountInterface;
  address: string;
  faction: FactionData;
  member: FactionMemberData;
  kingdom: PlayerKingdomData;
  refresh: () => void;
}

function InFactionView({ account, address, faction, member, kingdom, refresh }: InFactionViewProps) {
  const isLeader = addrEq(address, faction.leader);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");

  // Member is not consumed by header/toggle yet but will be in later tasks.
  void member;

  const handleToggleReinforcement = async () => {
    setToggling(true);
    setToggleError("");
    try {
      await setFactionReinforcement(account, !kingdom.factionReinforcementEnabled);
      refresh();
    } catch (e) {
      console.error("Toggle reinforcement failed:", e);
      setToggleError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(false);
    }
  };

  const reinforcementOn = kingdom.factionReinforcementEnabled;

  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold font-serif text-[#daa520] tracking-wider">
              {faction.name || `Faction #${faction.factionId}`}
            </h3>
            {faction.tag && (
              <div className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border border-[#daa520]/50 text-[#daa520] bg-[#daa520]/5">
                {faction.tag}
              </div>
            )}
          </div>
          <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
            Led by {truncAddr(faction.leader)} {isLeader && "· you"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-serif text-[#d4cfc6]">
            {faction.memberCount}
          </div>
          <div className="text-[9px] text-[#7a7060] tracking-wider uppercase">
            {faction.memberCount === 1 ? "Member" : "Members"}
          </div>
        </div>
      </div>

      {/* Reinforcement toggle */}
      <div className="border-t border-[#3d3428] pt-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="text-[10px] text-[#7a7060] tracking-wider uppercase font-serif">
              Faction Reinforcement
            </div>
            <div className="text-[11px] text-[#7a7060] leading-relaxed">
              Adjacent faction allies contribute a defense preset to conquest fights against your parcels.
            </div>
          </div>
          <button
            onClick={handleToggleReinforcement}
            disabled={toggling}
            aria-pressed={reinforcementOn}
            className={`shrink-0 px-4 py-2 rounded text-[10px] font-bold tracking-wider border transition-colors ${
              reinforcementOn
                ? "bg-[#daa520]/15 border-[#daa520] text-[#daa520]"
                : "bg-[#252019] border-[#3d3428] text-[#7a7060] hover:text-[#d4cfc6]"
            } ${toggling ? "opacity-60 cursor-wait" : ""}`}
          >
            {toggling ? "..." : reinforcementOn ? "ON" : "OFF"}
          </button>
        </div>
        {toggleError && (
          <div className="text-[#ff3344] text-[10px] text-right mt-1">{toggleError}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx && git commit -m "feat: build FactionPanel State 4 — header + reinforcement toggle"
```

---

## Task 9: Build State 4 — Member list with leader badge

**Files:**
- Modify: `frontend/src/components/FactionPanel.tsx`

Consume `useFactionMembers(faction.factionId)` and render one row per member. Leader row gets a gold star badge. Kick buttons come in the next task.

- [ ] **Step 1: Extend `InFactionView` with the member list section**

Inside the `InFactionView` function body, just after the destructure and `const reinforcementOn = ...` line and BEFORE the `return` statement, add:

```tsx
  const members = useFactionMembers(faction.factionId);
```

Then inside the returned JSX, add a new section AFTER the reinforcement toggle block (`</div>` that closes the `border-t border-[#3d3428] pt-3` wrapper) and BEFORE the outermost `</div>` (the panel wrapper):

```tsx
      {/* Member list */}
      <div className="border-t border-[#3d3428] pt-3 space-y-2">
        <div className="text-[10px] text-[#7a7060] tracking-wider uppercase font-serif">
          Members
        </div>
        {members.length === 0 ? (
          <div className="text-[10px] text-[#7a7060] italic">Loading members…</div>
        ) : (
          <div className="space-y-1">
            {members.map((m) => {
              const isMemberLeader = addrEq(m.player, faction.leader);
              const isSelf = addrEq(m.player, address);
              return (
                <div
                  key={m.player}
                  className="flex items-center justify-between px-2 py-1.5 rounded border border-[#3d3428] bg-[#0d0b0a]/40"
                >
                  <div className="flex items-center gap-2">
                    {isMemberLeader && (
                      <span className="text-[#daa520] text-[11px]" title="Faction leader">★</span>
                    )}
                    <span className="text-[11px] text-[#d4cfc6] font-mono">
                      {truncAddr(m.player)}
                    </span>
                    {isSelf && (
                      <span className="text-[9px] text-[#7a7060] tracking-wider uppercase">
                        you
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
```

- [ ] **Step 2: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx && git commit -m "feat: build FactionPanel State 4 — member list with leader badge"
```

---

## Task 10: Build State 4 — Kick buttons with two-click confirmation

**Files:**
- Modify: `frontend/src/components/FactionPanel.tsx`

Add per-row kick buttons (leader-only, excluded for self-row). Two-click confirmation prevents misfires. Auto-revert after 5 seconds.

- [ ] **Step 1: Add kick state and handler to `InFactionView`**

Inside `InFactionView`, just after `const members = useFactionMembers(faction.factionId);`, add:

```tsx
  // target address currently in "confirm kick" state, or null
  const [kickPending, setKickPending] = useState<string | null>(null);
  const [kickSubmitting, setKickSubmitting] = useState<string | null>(null);
  const [kickError, setKickError] = useState<{ target: string; message: string } | null>(null);

  // Auto-revert kick confirmation after 5 seconds
  useEffect(() => {
    if (!kickPending) return;
    const t = setTimeout(() => setKickPending(null), 5000);
    return () => clearTimeout(t);
  }, [kickPending]);

  const handleKickRequest = (target: string) => {
    setKickError(null);
    setKickPending(target);
  };

  const handleKickCancel = () => {
    setKickPending(null);
  };

  const handleKickConfirm = async (target: string) => {
    setKickSubmitting(target);
    setKickError(null);
    try {
      await kickMember(account, target);
      setKickPending(null);
      refresh();
    } catch (e) {
      console.error("Kick member failed:", e);
      setKickError({
        target,
        message: e instanceof Error ? e.message : "Kick failed",
      });
    } finally {
      setKickSubmitting(null);
    }
  };
```

Note: this uses `useEffect` — add it to the existing React import at the top of the file. Change the import from:

```tsx
import { useState } from "react";
```

to:

```tsx
import { useEffect, useState } from "react";
```

- [ ] **Step 2: Render kick controls inside each member row**

Find the member row JSX inside `InFactionView`:

```tsx
<div
  key={m.player}
  className="flex items-center justify-between px-2 py-1.5 rounded border border-[#3d3428] bg-[#0d0b0a]/40"
>
  <div className="flex items-center gap-2">
    {isMemberLeader && (
      <span className="text-[#daa520] text-[11px]" title="Faction leader">★</span>
    )}
    <span className="text-[11px] text-[#d4cfc6] font-mono">
      {truncAddr(m.player)}
    </span>
    {isSelf && (
      <span className="text-[9px] text-[#7a7060] tracking-wider uppercase">
        you
      </span>
    )}
  </div>
</div>
```

Replace it with:

```tsx
<div
  key={m.player}
  className="px-2 py-1.5 rounded border border-[#3d3428] bg-[#0d0b0a]/40"
>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      {isMemberLeader && (
        <span className="text-[#daa520] text-[11px]" title="Faction leader">★</span>
      )}
      <span className="text-[11px] text-[#d4cfc6] font-mono">
        {truncAddr(m.player)}
      </span>
      {isSelf && (
        <span className="text-[9px] text-[#7a7060] tracking-wider uppercase">
          you
        </span>
      )}
    </div>
    {isLeader && !isSelf && (
      <div className="flex items-center gap-1">
        {kickPending === m.player ? (
          <>
            <button
              onClick={() => handleKickConfirm(m.player)}
              disabled={kickSubmitting === m.player}
              className="px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border border-[#ff3344] text-[#ff3344] hover:bg-[#ff3344]/10 disabled:opacity-30"
            >
              {kickSubmitting === m.player ? "..." : "CONFIRM"}
            </button>
            <button
              onClick={handleKickCancel}
              disabled={kickSubmitting === m.player}
              className="px-2 py-0.5 rounded text-[9px] text-[#7a7060] hover:text-[#d4cfc6] disabled:opacity-30"
              aria-label="Cancel kick"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            onClick={() => handleKickRequest(m.player)}
            className="px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border border-[#3d3428] text-[#7a7060] hover:border-[#ff3344] hover:text-[#ff3344]"
          >
            KICK
          </button>
        )}
      </div>
    )}
  </div>
  {kickError && addrEq(kickError.target, m.player) && (
    <div className="text-[#ff3344] text-[9px] mt-1">{kickError.message}</div>
  )}
</div>
```

- [ ] **Step 3: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx && git commit -m "feat: build FactionPanel State 4 — kick buttons with confirmation"
```

---

## Task 11: Build State 4 — Leader invite form

**Files:**
- Modify: `frontend/src/components/FactionPanel.tsx`

Leader-only text input for inviting a wallet address. Client-side regex validation. Fire-and-forget — no pending-invite tracking for the leader.

- [ ] **Step 1: Add invite state and handler to `InFactionView`**

Inside `InFactionView`, after the kick handlers but before the `return` statement, add:

```tsx
  const [inviteTarget, setInviteTarget] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const validateInvite = (value: string): string | null => {
    const v = value.trim();
    if (!v) return "Address required.";
    if (!/^0x[0-9a-fA-F]+$/.test(v)) return "Invalid address format.";
    if (v.length < 3) return "Address too short.";
    return null;
  };

  const handleInviteSubmit = async () => {
    const validation = validateInvite(inviteTarget);
    if (validation) {
      setInviteError(validation);
      return;
    }
    setInviteSubmitting(true);
    setInviteError("");
    setInviteSuccess(false);
    try {
      await inviteMember(account, inviteTarget.trim());
      setInviteTarget("");
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (e) {
      console.error("Invite member failed:", e);
      setInviteError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviteSubmitting(false);
    }
  };
```

- [ ] **Step 2: Render the invite form section (leader-only)**

Inside the returned JSX of `InFactionView`, add a new section AFTER the Member list block's closing `</div>` and BEFORE the outermost panel wrapper's closing `</div>`:

```tsx
      {/* Leader-only: invite form */}
      {isLeader && (
        <div className="border-t border-[#3d3428] pt-3 space-y-2">
          <div className="text-[10px] text-[#7a7060] tracking-wider uppercase font-serif">
            Invite a Player
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteTarget}
              onChange={(e) => { setInviteTarget(e.target.value); setInviteError(""); }}
              placeholder="0x0123..."
              disabled={inviteSubmitting}
              className="flex-1 px-3 py-2 rounded bg-[#252019] border border-[#3d3428] text-[#d4cfc6] text-[11px] font-mono placeholder-[#3d3428] focus:outline-none focus:border-[#daa520]/50"
            />
            <button
              onClick={handleInviteSubmit}
              disabled={inviteSubmitting}
              className="px-4 py-2 rounded text-[10px] font-bold tracking-wider border border-[#daa520] text-[#daa520] hover:bg-[#daa520]/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {inviteSubmitting ? "..." : "INVITE"}
            </button>
          </div>
          {inviteError && (
            <div className="text-[#ff3344] text-[10px]">{inviteError}</div>
          )}
          {inviteSuccess && (
            <div className="text-[#4a7c59] text-[10px]">Invite sent.</div>
          )}
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx && git commit -m "feat: build FactionPanel State 4 — leader invite form"
```

---

## Task 12: Build State 4 — Leave button with two-click confirmation

**Files:**
- Modify: `frontend/src/components/FactionPanel.tsx`

Destructive-styled leave button at the bottom. Two-click confirmation. Copy differs for leader (dissolves faction) vs member (24h cooldown).

- [ ] **Step 1: Add leave state and handler to `InFactionView`**

Inside `InFactionView`, after the invite handlers but before the `return` statement, add:

```tsx
  const [leavePending, setLeavePending] = useState(false);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  const handleLeaveRequest = () => {
    setLeaveError("");
    setLeavePending(true);
  };

  const handleLeaveCancel = () => {
    setLeavePending(false);
  };

  const handleLeaveConfirm = async () => {
    setLeaveSubmitting(true);
    setLeaveError("");
    try {
      await leaveFaction(account);
      setLeavePending(false);
      refresh();
    } catch (e) {
      console.error("Leave faction failed:", e);
      setLeaveError(e instanceof Error ? e.message : "Leave failed");
    } finally {
      setLeaveSubmitting(false);
    }
  };
```

- [ ] **Step 2: Render the leave button section**

Inside the returned JSX of `InFactionView`, add a new section AFTER the leader-invite form's closing `</div>` and BEFORE the outermost panel wrapper's closing `</div>`:

```tsx
      {/* Leave faction (all members) */}
      <div className="border-t border-[#3d3428] pt-3 space-y-2">
        {!leavePending ? (
          <button
            onClick={handleLeaveRequest}
            className="w-full py-2 rounded text-[11px] font-bold tracking-wider border border-[#ff3344]/40 text-[#ff3344]/80 hover:bg-[#ff3344]/5 hover:border-[#ff3344]"
          >
            LEAVE FACTION
          </button>
        ) : (
          <div className="space-y-2">
            <div className="text-[10px] text-[#ff3344]/80 text-center">
              {isLeader
                ? "Confirm leave · This will DISSOLVE the faction for all members"
                : "Confirm leave · 24h cooldown before rejoining any faction"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleLeaveConfirm}
                disabled={leaveSubmitting}
                className="flex-1 py-2 rounded text-[10px] font-bold tracking-wider border border-[#ff3344] text-[#ff3344] hover:bg-[#ff3344]/10 disabled:opacity-30"
              >
                {leaveSubmitting ? "LEAVING..." : "CONFIRM LEAVE"}
              </button>
              <button
                onClick={handleLeaveCancel}
                disabled={leaveSubmitting}
                className="px-4 py-2 rounded text-[10px] text-[#7a7060] border border-[#3d3428] hover:text-[#d4cfc6] disabled:opacity-30"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
        {leaveError && (
          <div className="text-[#ff3344] text-[10px] text-center">{leaveError}</div>
        )}
      </div>
```

- [ ] **Step 3: Typecheck**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Scoped lint**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/components/FactionPanel.tsx
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
cd /Users/modeofo/Apps/siege && git add frontend/src/components/FactionPanel.tsx && git commit -m "feat: build FactionPanel State 4 — leave button with confirmation"
```

---

## Task 13: Final sweep — full test + lint + typecheck

**Files:**
- Verify all new/modified files

Confirms the full feature is green. No new code in this task — it's purely verification.

- [ ] **Step 1: Run the full frontend test suite**

```
cd /Users/modeofo/Apps/siege/frontend && npx vitest run
```

Expected: `Test Files 2 passed (2)`, `Tests 39 passed (39)`. Same as before the plan started — this plan adds no new tests.

- [ ] **Step 2: Typecheck the whole project**

```
cd /Users/modeofo/Apps/siege/frontend && npx tsc --noEmit
```

Expected: 0 errors across the whole codebase.

- [ ] **Step 3: Scoped lint on all new/modified files**

```
cd /Users/modeofo/Apps/siege/frontend && npx eslint src/lib/worldState.ts src/lib/factions.ts src/components/FactionPanel.tsx src/components/CreateFactionModal.tsx src/app/world/page.tsx
```

Expected: no errors. Warnings are acceptable if they are `<img>` → `next/image` suggestions or other style nits, but no new errors or react-hooks violations.

- [ ] **Step 4: Inspect the git log**

```
cd /Users/modeofo/Apps/siege && git log --oneline -15
```

Expected: 12 new `feat:` commits from Tasks 1–12, each small and self-contained. Verify each commit message is accurate and no stray files slipped in.

- [ ] **Step 5: Final commit (if any lint/typecheck fixes were needed)**

If Steps 1–3 uncovered any issues, fix them inline and commit. If everything was already green, **skip this step** — don't create an empty commit.

```
cd /Users/modeofo/Apps/siege && git add <touched-files> && git commit -m "fix: <specific fix>"
```

---

## Known gotchas the implementer may hit

1. **Torii field casing.** Cairo fields are `snake_case` (`faction_id`, `total_wins`, `faction_reinforcement_enabled`); Torii preserves this in GraphQL. The frontend library transforms to `camelCase` (`factionId`, `totalWins`, `factionReinforcementEnabled`) on the consumer side. The GraphQL query strings and inline type annotations must use snake_case; everything else uses camelCase.

2. **Address comparison is felt-based.** Torii may return addresses padded or unpadded (with or without leading zeros). String equality will fail. Always use the `addrEq` helper that converts both sides to `BigInt`.

3. **`usePlayerFaction` returns `member: null` for never-faction players.** The first access to `member.factionId` without a null check will crash. The dispatcher already handles this via `member && member.factionId !== 0`.

4. **Pre-existing lint errors.** Running `npm run lint` project-wide will surface 5 errors in `BookLink.tsx`, `KingdomUpgrade.tsx`, `toriiSubscription.ts`, and `match/create/page.tsx`. These are out of scope for this plan — do not fix them here. The scoped `npx eslint <file>` commands avoid them.

5. **Two `usePlayerKingdom` hooks exist** — one in `lib/worldState.ts` (the one we extend) and one in `lib/gameState1v1.ts` (used only by match-1v1 flows, has its own query that includes `tier` already). The world page imports the worldState one. Don't touch the gameState1v1 copy.

6. **`setTimeout` + `useEffect` pattern.** The existing faction hooks use `const t = setTimeout(() => { void doFetch(); }, 0);` inside the effect. The `setTimeout` with 0 delay is a deliberate deferral so the first fetch fires after the current render cycle completes. Preserve this pattern in `useFactionMembers`.

7. **`void` silencers in the scaffold task.** Task 3 uses `void someFunc;` statements to satisfy the unused-import rule while the scaffold is being built incrementally. Each subsequent task removes the corresponding silencer as it wires up the real consumer. By the end of Task 12, zero `void` lines should remain at the top of `FactionPanel.tsx`. If Task 13's scoped lint surfaces unused-import errors, check that every silencer was cleaned up.
