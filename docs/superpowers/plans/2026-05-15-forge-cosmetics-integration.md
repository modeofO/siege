> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Forge Cosmetics Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Circuit Forge cosmetics (banners, parcel skins, hold decorations) into the live game so they persist on-chain and are visible to other players.

**Architecture:** Add a `PlayerCosmetics` Dojo model keyed by player address, storing 3 felt252 circuit keys. A `set_cosmetic` entrypoint on `world_system` writes the choice. The frontend reads cosmetics via Torii SQL and renders them on the hex grid (banners on parcels), the "Your Hold" section (hold decorations), and the match board (banners next to citadels). The forge page writes on-chain when the player equips a cosmetic.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0 (contracts), Next.js + Starknet.js v8 (frontend), Torii SQL (reads), Cartridge Controller (sessions). Docker image `katana-siege` for sozo tooling.

---

### Task 1: Cairo Model — PlayerCosmetics

**Files:**
- Create: `src/models/player_cosmetics.cairo`
- Modify: `src/lib.cairo` (add module declaration)

- [ ] **Step 1: Create the model file**

```cairo
// src/models/player_cosmetics.cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct PlayerCosmetics {
    #[key]
    pub player: ContractAddress,
    pub banner: felt252,
    pub parcel_skin: felt252,
    pub hold_decoration: felt252,
}
```

Circuit keys are short strings (max 18 chars, e.g. `'half-wave-rectifier'`) which fit in felt252 (31-byte limit). A value of `0` means "none equipped".

- [ ] **Step 2: Register the model in lib.cairo**

In `src/lib.cairo`, inside `pub mod models { ... }`, add after the `faction_invite` line:

```cairo
    pub mod player_cosmetics;
```

- [ ] **Step 3: Commit**

```bash
git add src/models/player_cosmetics.cairo src/lib.cairo
git commit -m "$(cat <<'EOF'
feat: add PlayerCosmetics Dojo model

On-chain storage for equipped forge cosmetics (banner, parcel_skin,
hold_decoration) keyed by player address. Values are felt252-encoded
circuit keys from the Circuit Forge.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Cairo System — set_cosmetic entrypoint

**Files:**
- Modify: `src/systems/world_system.cairo` (interface + implementation)

The entrypoint takes a `cosmetic_type` felt252 (`'banner'`, `'parcel_skin'`, or `'hold_decoration'`) and a `circuit_key` felt252 (the circuit identifier, or `0` to unequip). Requires the caller to be a registered player.

- [ ] **Step 1: Add to the IWorldSystem interface**

In `src/systems/world_system.cairo`, add after the `set_faction_reinforcement` line in the trait:

```cairo
    fn set_cosmetic(ref self: T, cosmetic_type: felt252, circuit_key: felt252);
```

- [ ] **Step 2: Add the import for the new model**

At the top of the `#[dojo::contract] pub mod world_system` block, alongside the existing model imports, add:

```cairo
    use siege_dojo::models::player_cosmetics::PlayerCosmetics;
```

- [ ] **Step 3: Add the implementation**

Inside the `impl WorldSystemImpl of IWorldSystem<ContractState>` block, after the `set_faction_reinforcement` function (around line 1118), add:

```cairo
        fn set_cosmetic(ref self: ContractState, cosmetic_type: felt252, circuit_key: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let kingdom: PlayerKingdom = world.read_model(caller);
            assert(kingdom.registered, 'Not registered');

            let mut cosmetics: PlayerCosmetics = world.read_model(caller);
            cosmetics.player = caller;

            if cosmetic_type == 'banner' {
                cosmetics.banner = circuit_key;
            } else if cosmetic_type == 'parcel_skin' {
                cosmetics.parcel_skin = circuit_key;
            } else if cosmetic_type == 'hold_decoration' {
                cosmetics.hold_decoration = circuit_key;
            } else {
                panic!("Invalid cosmetic type");
            }

            world.write_model(@cosmetics);
        }
```

- [ ] **Step 4: Commit**

```bash
git add src/systems/world_system.cairo
git commit -m "$(cat <<'EOF'
feat: add set_cosmetic entrypoint to world_system

Registered players can equip/unequip forge cosmetics on-chain.
Takes cosmetic_type ('banner', 'parcel_skin', 'hold_decoration')
and circuit_key (felt252-encoded circuit name, or 0 to unequip).

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Cairo Test — test_cosmetics

**Files:**
- Modify: `src/tests/test_world.cairo` (add new model to namespace_def + test function)

- [ ] **Step 1: Add the model import**

In `src/tests/test_world.cairo`, in the imports section (around line 80), add:

```cairo
    use siege_dojo::models::player_cosmetics::{PlayerCosmetics, m_PlayerCosmetics};
```

- [ ] **Step 2: Register the model in namespace_def**

In the `namespace_def()` function, add to the `resources` array (after `m_WorldConfig`):

```cairo
                TestResource::Model(m_PlayerCosmetics::TEST_CLASS_HASH),
```

- [ ] **Step 3: Add test functions**

After the existing test functions in the `tests` module, add:

```cairo
    #[test]
    fn test_set_cosmetic_banner() {
        let (mut world, ws) = setup();

        let user = deploy_user();
        let ability_token = deploy_ability_token(user);

        // Initialize world with 6 parcels (2 of each type)
        starknet::testing::set_contract_address(user);
        ws.set_ability_token(ability_token.contract_address);
        ws.initialize_world(array![0, 1, 2, 3, 4, 5], array![0, 0, 0, 1, 1, 1]);

        // Register player
        starknet::testing::set_contract_address(user);
        ws.register_player(array![0, 1, 2]);

        // Set banner cosmetic
        ws.set_cosmetic('banner', 'half-wave-rectifier');

        let cosmetics: PlayerCosmetics = world.read_model(user);
        assert(cosmetics.banner == 'half-wave-rectifier', 'banner mismatch');
        assert(cosmetics.parcel_skin == 0, 'skin should be empty');
        assert(cosmetics.hold_decoration == 0, 'decoration should be empty');
    }

    #[test]
    fn test_set_cosmetic_all_types() {
        let (mut world, ws) = setup();

        let user = deploy_user();
        let ability_token = deploy_ability_token(user);

        starknet::testing::set_contract_address(user);
        ws.set_ability_token(ability_token.contract_address);
        ws.initialize_world(array![0, 1, 2, 3, 4, 5], array![0, 0, 0, 1, 1, 1]);
        ws.register_player(array![0, 1, 2]);

        ws.set_cosmetic('banner', 'full-wave-rectifier');
        ws.set_cosmetic('parcel_skin', 'voltage-divider');
        ws.set_cosmetic('hold_decoration', 'buck-converter');

        let cosmetics: PlayerCosmetics = world.read_model(user);
        assert(cosmetics.banner == 'full-wave-rectifier', 'banner');
        assert(cosmetics.parcel_skin == 'voltage-divider', 'skin');
        assert(cosmetics.hold_decoration == 'buck-converter', 'decoration');
    }

    #[test]
    fn test_set_cosmetic_unequip() {
        let (mut world, ws) = setup();

        let user = deploy_user();
        let ability_token = deploy_ability_token(user);

        starknet::testing::set_contract_address(user);
        ws.set_ability_token(ability_token.contract_address);
        ws.initialize_world(array![0, 1, 2, 3, 4, 5], array![0, 0, 0, 1, 1, 1]);
        ws.register_player(array![0, 1, 2]);

        ws.set_cosmetic('banner', 'lc-tank');
        let c1: PlayerCosmetics = world.read_model(user);
        assert(c1.banner == 'lc-tank', 'should be set');

        ws.set_cosmetic('banner', 0);
        let c2: PlayerCosmetics = world.read_model(user);
        assert(c2.banner == 0, 'should be unequipped');
    }

    #[test]
    #[should_panic(expected: ('Not registered',))]
    fn test_set_cosmetic_unregistered() {
        let (_world, ws) = setup();
        let user = deploy_user();
        starknet::testing::set_contract_address(user);
        ws.set_cosmetic('banner', 'lc-tank');
    }

    #[test]
    #[should_panic]
    fn test_set_cosmetic_invalid_type() {
        let (_world, ws) = setup();

        let user = deploy_user();
        let ability_token = deploy_ability_token(user);

        starknet::testing::set_contract_address(user);
        ws.set_ability_token(ability_token.contract_address);
        ws.initialize_world(array![0, 1, 2, 3, 4, 5], array![0, 0, 0, 1, 1, 1]);
        ws.register_player(array![0, 1, 2]);

        ws.set_cosmetic('invalid_type', 'lc-tank');
    }
```

- [ ] **Step 4: Run tests**

```bash
docker compose run --rm builder sozo test
```

Expected: all existing tests pass + 4 new cosmetic tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tests/test_world.cairo
git commit -m "$(cat <<'EOF'
test: add PlayerCosmetics tests

Tests set_cosmetic for banner/parcel_skin/hold_decoration, unequip
(set to 0), rejection for unregistered players, and invalid type panic.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Build & Verify

**Files:** None (verification only)

- [ ] **Step 1: Build contracts**

```bash
docker compose run --rm builder sozo build
```

Expected: clean build, no errors.

- [ ] **Step 2: Run full test suite**

```bash
docker compose run --rm builder sozo test
```

Expected: all ~135+ tests pass including the new cosmetics tests.

---

### Task 5: Frontend — Cosmetics Data Layer

**Files:**
- Create: `frontend/src/lib/cosmetics.ts`

This file provides the Torii SQL read hook and the contract call for setting cosmetics.

- [ ] **Step 1: Create the cosmetics module**

```typescript
// frontend/src/lib/cosmetics.ts
import { useState, useEffect, useCallback } from "react";
import { Account, shortString } from "starknet";
import { toriiSql, toNum } from "./toriiSql";
import type { CircuitKey } from "./forge/circuits";
import type { CosmeticType } from "./forge/circuits";

const WORLD_SYSTEM_ADDRESS =
  process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "0x0";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const DEVNET_TX_OPTS = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
    l2_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
    l1_data_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
  },
};

export interface PlayerCosmeticsData {
  banner: CircuitKey | null;
  parcelSkin: CircuitKey | null;
  holdDecoration: CircuitKey | null;
}

const EMPTY_COSMETICS: PlayerCosmeticsData = {
  banner: null,
  parcelSkin: null,
  holdDecoration: null,
};

function feltToCircuitKey(felt: string | null): CircuitKey | null {
  if (!felt || felt === "0x0" || felt === "0") return null;
  try {
    const decoded = shortString.decodeShortString(felt);
    return decoded as CircuitKey;
  } catch {
    return null;
  }
}

export function usePlayerCosmetics(
  playerAddress: string | undefined,
  refreshKey?: number,
): PlayerCosmeticsData {
  const [data, setData] = useState<PlayerCosmeticsData>(EMPTY_COSMETICS);

  useEffect(() => {
    if (!playerAddress) return;

    let cancelled = false;

    const fetchCosmetics = async () => {
      const rows = await toriiSql<{
        banner: string;
        parcel_skin: string;
        hold_decoration: string;
      }>(
        `SELECT banner, parcel_skin, hold_decoration FROM "siege_dojo-PlayerCosmetics" WHERE player = '${playerAddress}'`,
      );

      if (cancelled) return;

      if (rows.length === 0) {
        setData(EMPTY_COSMETICS);
        return;
      }

      const row = rows[0];
      setData({
        banner: feltToCircuitKey(row.banner),
        parcelSkin: feltToCircuitKey(row.parcel_skin),
        holdDecoration: feltToCircuitKey(row.hold_decoration),
      });
    };

    fetchCosmetics();
    const interval = setInterval(fetchCosmetics, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playerAddress, refreshKey]);

  return data;
}

export function useBulkPlayerCosmetics(
  playerAddresses: string[],
  refreshKey?: number,
): Record<string, PlayerCosmeticsData> {
  const [data, setData] = useState<Record<string, PlayerCosmeticsData>>({});

  useEffect(() => {
    if (playerAddresses.length === 0) return;

    let cancelled = false;

    const fetchAll = async () => {
      const rows = await toriiSql<{
        player: string;
        banner: string;
        parcel_skin: string;
        hold_decoration: string;
      }>(`SELECT player, banner, parcel_skin, hold_decoration FROM "siege_dojo-PlayerCosmetics"`);

      if (cancelled) return;

      const map: Record<string, PlayerCosmeticsData> = {};
      for (const row of rows) {
        map[row.player] = {
          banner: feltToCircuitKey(row.banner),
          parcelSkin: feltToCircuitKey(row.parcel_skin),
          holdDecoration: feltToCircuitKey(row.hold_decoration),
        };
      }
      setData(map);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playerAddresses.length, refreshKey]);

  return data;
}

const COSMETIC_TYPE_MAP: Record<CosmeticType, string> = {
  banner: "banner",
  parcelSkin: "parcel_skin",
  holdDecoration: "hold_decoration",
};

export async function setCosmetic(
  account: Account,
  cosmeticType: CosmeticType,
  circuitKey: CircuitKey | null,
): Promise<string> {
  const typeStr = COSMETIC_TYPE_MAP[cosmeticType];
  const typeFelt = shortString.encodeShortString(typeStr);
  const keyFelt = circuitKey
    ? shortString.encodeShortString(circuitKey)
    : "0x0";

  const result = await account.execute(
    [
      {
        contractAddress: WORLD_SYSTEM_ADDRESS,
        entrypoint: "set_cosmetic",
        calldata: [typeFelt, keyFelt],
      },
    ],
    IS_DEVNET ? DEVNET_TX_OPTS : undefined,
  );

  return result.transaction_hash;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/cosmetics.ts
git commit -m "$(cat <<'EOF'
feat: add cosmetics data layer (Torii reads + contract call)

usePlayerCosmetics — single player's equipped cosmetics via Torii SQL
useBulkPlayerCosmetics — all players' cosmetics (for hex grid)
setCosmetic — writes cosmetic choice on-chain via world_system

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Frontend — Session Policy

**Files:**
- Modify: `frontend/src/app/providers.tsx`

- [ ] **Step 1: Add set_cosmetic to session policies**

In `providers.tsx`, find the `WORLD_SYSTEM_ADDRESS` contract section in `SESSION_POLICIES.contracts`. Add `set_cosmetic` to its method array. After the existing `"set_faction_reinforcement"` entry, add:

```typescript
            { entrypoint: "set_cosmetic" },
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/providers.tsx
git commit -m "$(cat <<'EOF'
feat: add set_cosmetic to Cartridge session policies

Players must disconnect + reconnect their Controller to pick up
the new policy. Without this, equipping cosmetics prompts the
"Review Transactions" sheet.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Frontend — Forge Page On-Chain Equip

**Files:**
- Modify: `frontend/src/lib/forge/forgeState.ts`
- Modify: `frontend/src/app/forge/page.tsx`

When a player equips a cosmetic, the forge page now calls `setCosmetic()` on-chain in addition to updating localStorage. This requires the connected account, so the forge page passes it in.

- [ ] **Step 1: Add account parameter and on-chain write to forgeState**

Modify `frontend/src/lib/forge/forgeState.ts`:

1. Add the import at the top:

```typescript
import { Account } from "starknet";
import { setCosmetic } from "../cosmetics";
```

2. Change the `useForgeState` function signature to accept an optional account:

```typescript
export function useForgeState(account?: Account) {
```

3. Update the `equipCosmetic` callback to also write on-chain:

```typescript
  const equipCosmetic = useCallback(
    (circuitKey: CircuitKey) => {
      const cosmeticType: CosmeticType = CIRCUITS[circuitKey].cosmeticType;
      const next: PersistedState = {
        ...persisted,
        equippedCosmetics: {
          ...persisted.equippedCosmetics,
          [cosmeticType]: circuitKey,
        },
      };
      persist(next);

      if (account) {
        setCosmetic(account, cosmeticType, circuitKey).catch(() => {});
      }
    },
    [persisted, persist, account],
  );
```

- [ ] **Step 2: Pass account from the forge page**

Modify `frontend/src/app/forge/page.tsx`:

1. Add the import:

```typescript
import { useAccount } from "@/app/providers";
```

2. Inside `ForgePage`, before the `useForgeState` call, add:

```typescript
  const { account } = useAccount();
```

3. Update the `useForgeState` call:

```typescript
  const state = useForgeState(account ?? undefined);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/forge/forgeState.ts frontend/src/app/forge/page.tsx
git commit -m "$(cat <<'EOF'
feat: write cosmetic equips on-chain from forge page

When a player equips a banner/skin/decoration, the forge now calls
set_cosmetic on world_system in addition to updating localStorage.
Fire-and-forget — localStorage remains the optimistic source of truth.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Frontend — Banners on Hex Grid (World Map)

**Files:**
- Modify: `frontend/src/components/HexGrid.tsx`
- Modify: `frontend/src/app/world/page.tsx`

Show a small banner indicator on owned parcels where the owner has an equipped banner cosmetic.

- [ ] **Step 1: Add cosmetics prop to HexGrid**

In `frontend/src/components/HexGrid.tsx`, update the props interface to accept cosmetics data:

Add import at top:

```typescript
import type { PlayerCosmeticsData } from "@/lib/cosmetics";
```

Update the component props (find the existing interface and add):

```typescript
  cosmeticsMap?: Record<string, PlayerCosmeticsData>;
```

- [ ] **Step 2: Render banner glyph on owned parcels**

Inside the HexGrid SVG, after the existing parcel rendering (the hex polygon and type letter), add a banner indicator for parcels whose owner has an equipped banner. Add this inside the parcel map, after the existing hex content:

```tsx
{/* Banner indicator */}
{parcel.owner !== "0x0" && cosmeticsMap?.[parcel.owner]?.banner && (
  <g transform={`translate(${px + 14}, ${py - 20})`}>
    <rect
      x={-6} y={-8} width={12} height={16} rx={1}
      fill="rgba(200,164,78,0.25)"
      stroke="#c8a44e"
      strokeWidth={0.8}
    />
    <line x1={0} y1={-8} x2={0} y2={-14} stroke="#c8a44e" strokeWidth={0.8} />
    <circle cx={0} cy={-14} r={1.2} fill="#c8a44e" />
  </g>
)}
```

This renders a small pennant glyph in the top-right of owned hexes.

- [ ] **Step 3: Pass cosmetics data from world page**

In `frontend/src/app/world/page.tsx`:

1. Add imports:

```typescript
import { useBulkPlayerCosmetics } from "@/lib/cosmetics";
```

2. Inside the component, after `useWorldParcels`, compute unique owner addresses and fetch cosmetics:

```typescript
  const ownerAddresses = parcels
    .map((p) => p.owner)
    .filter((o) => o && o !== "0x0");
  const cosmeticsMap = useBulkPlayerCosmetics(ownerAddresses, refreshKey);
```

3. Pass to HexGrid:

```tsx
<HexGrid
  parcels={parcels}
  playerAddress={address}
  homeParcelIds={kingdom.registered ? [kingdom.home0, kingdom.home1, kingdom.home2] : []}
  cosmeticsMap={cosmeticsMap}
/>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/HexGrid.tsx frontend/src/app/world/page.tsx
git commit -m "$(cat <<'EOF'
feat: show banner pennants on owned parcels in hex grid

Parcels owned by players with an equipped banner cosmetic now display
a small gold pennant glyph. Cosmetics fetched via bulk Torii SQL query.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Frontend — Parcel Skins on Hex Grid

**Files:**
- Modify: `frontend/src/components/HexGrid.tsx`

Apply visual differentiation to parcels whose owners have equipped a parcel skin. The skin modifies the hex stroke pattern.

- [ ] **Step 1: Add parcel skin styling**

In `HexGrid.tsx`, in the section where hex polygons are rendered, modify the stroke styling for owned parcels that have a parcel skin equipped.

Add a helper function before the component:

```typescript
function parcelSkinStyle(skin: string | null): { strokeDasharray?: string; strokeWidth?: number } {
  if (!skin) return {};
  switch (skin) {
    case "voltage-divider":
      return { strokeDasharray: "6 3", strokeWidth: 2.5 };
    case "common-emitter-amp":
      return { strokeDasharray: "8 2 2 2", strokeWidth: 2.5 };
    default:
      return { strokeDasharray: "4 2", strokeWidth: 2.5 };
  }
}
```

Then apply it to the hex polygon's style when the owner has a parcel skin:

```tsx
const skin = parcel.owner !== "0x0" ? cosmeticsMap?.[parcel.owner]?.parcelSkin : null;
const skinStyle = parcelSkinStyle(skin ?? null);
```

Merge `skinStyle` into the existing `<polygon>` props (strokeDasharray and strokeWidth).

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/HexGrid.tsx
git commit -m "$(cat <<'EOF'
feat: apply parcel skin stroke patterns on hex grid

Owners with an equipped parcel skin get a distinctive stroke pattern
on their hexes — each circuit maps to a different dash style.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Frontend — Hold Decoration in "Your Hold"

**Files:**
- Modify: `frontend/src/app/world/page.tsx`

Show the equipped hold decoration as a decorative element in the "Your Hold" section.

- [ ] **Step 1: Import player cosmetics hook and IlluminatedBanner**

Add imports to `frontend/src/app/world/page.tsx`:

```typescript
import { usePlayerCosmetics } from "@/lib/cosmetics";
import { IlluminatedBanner } from "@/components/forge/IlluminatedBanner";
import { CIRCUITS } from "@/lib/forge/circuits";
```

- [ ] **Step 2: Fetch player's own cosmetics**

Inside the component, after the existing hooks:

```typescript
  const myCosmetics = usePlayerCosmetics(address, refreshKey);
```

- [ ] **Step 3: Render hold decoration in "Your Hold" section**

In the "Your Hold" `<div>`, expand the grid to 3 columns and add the decoration column. Replace the existing `grid-cols-2` with `grid-cols-3` and add after the Abilities column:

```tsx
{/* Hold Decoration */}
<div className="space-y-1">
  <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Decoration</div>
  {myCosmetics.holdDecoration && CIRCUITS[myCosmetics.holdDecoration] ? (
    <div className="flex items-center gap-2">
      <IlluminatedBanner
        circuit={CIRCUITS[myCosmetics.holdDecoration]}
        name={myCosmetics.holdDecoration}
        scale={0.18}
      />
      <span className="text-[10px] text-[#c8a44e] font-serif">
        {CIRCUITS[myCosmetics.holdDecoration].title}
      </span>
    </div>
  ) : (
    <div className="text-[10px] text-[#7a7060]">None</div>
  )}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/world/page.tsx
git commit -m "$(cat <<'EOF'
feat: show hold decoration in Your Hold section

Displays a miniature IlluminatedBanner and circuit title when the
player has equipped a hold decoration cosmetic from the forge.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Frontend — Banners on Match Board

**Files:**
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx`

Show each player's equipped banner next to their citadel in the match header.

- [ ] **Step 1: Add imports**

In `frontend/src/app/match-1v1/[id]/page.tsx`, add:

```typescript
import { usePlayerCosmetics } from "@/lib/cosmetics";
import { IlluminatedBanner } from "@/components/forge/IlluminatedBanner";
import { CIRCUITS } from "@/lib/forge/circuits";
```

- [ ] **Step 2: Fetch both players' cosmetics**

Inside `Match1v1Page`, after the existing hooks (around line 70), add:

```typescript
  const myCosmetics = usePlayerCosmetics(address);
  const opponentAddr = isPlayerA ? state?.playerB : state?.playerA;
  const opponentCosmetics = usePlayerCosmetics(opponentAddr ?? undefined);
```

- [ ] **Step 3: Render banners next to citadels**

In the citadel grid section (around line 466, the `grid grid-cols-2 gap-6` div), wrap each citadel's `<Image>` in a flex container that also shows the banner.

For "Your Citadel" (first column), add before the `<Image>`:

```tsx
{myCosmetics.banner && CIRCUITS[myCosmetics.banner] && (
  <div className="absolute -left-2 top-0">
    <IlluminatedBanner
      circuit={CIRCUITS[myCosmetics.banner]}
      name={myCosmetics.banner}
      scale={0.14}
    />
  </div>
)}
```

Wrap the citadel `<div>` in `relative` positioning to support the absolute banner placement.

For "Enemy Citadel" (second column), add the same pattern using `opponentCosmetics.banner` and position it `-right-2` instead:

```tsx
{opponentCosmetics.banner && CIRCUITS[opponentCosmetics.banner] && (
  <div className="absolute -right-2 top-0">
    <IlluminatedBanner
      circuit={CIRCUITS[opponentCosmetics.banner]}
      name={opponentCosmetics.banner}
      scale={0.14}
    />
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/match-1v1/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
feat: show player banners next to citadels on match board

Both players' equipped banner cosmetics are displayed as miniature
illuminated banners beside their citadel images in the match header.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Local Dev Verification

**Files:** None (verification only)

- [ ] **Step 1: Build contracts locally**

```bash
docker compose run --rm builder sozo build
```

- [ ] **Step 2: Start local dev stack**

```bash
./scripts/local-dev.sh
```

Verify Katana starts, migration succeeds (including new `PlayerCosmetics` model), Torii indexes the model.

- [ ] **Step 3: Verify Torii indexes the model**

Once Torii is running, query:

```bash
curl -s "http://localhost:8080/sql?query=SELECT+*+FROM+%22siege_dojo-PlayerCosmetics%22" | head
```

Expected: empty array `[]` (no cosmetics set yet), confirming the table exists.

- [ ] **Step 4: Start frontend and test the flow**

```bash
cd frontend && npm run dev
```

1. Navigate to `/world`, register a player
2. Navigate to `/forge`, complete a circuit, equip it
3. Verify the hex grid shows the banner pennant on your parcels
4. Verify "Your Hold" shows the hold decoration (if that type was equipped)
5. Start a match and verify banners appear next to citadels

---

### Task 13: Auth Grants for Sepolia

**Files:** None (operational task)

When deploying to Sepolia, the `world_system` contract already has namespace-wide writer permission, so `PlayerCosmetics` is already writable. No additional `sozo auth grant` is needed — the existing grant covers all models in the `siege_dojo` namespace.

However, after migration, verify the model is registered:

- [ ] **Step 1: Migrate to Sepolia**

```bash
docker compose run --rm builder sozo -P sepolia migrate
```

- [ ] **Step 2: Verify model in Torii**

```bash
curl -s "https://api.cartridge.gg/x/siege-dojo/torii/sql?query=SELECT+*+FROM+%22siege_dojo-PlayerCosmetics%22+LIMIT+1"
```

Expected: empty result set confirming the table exists.

---

## File Map Summary

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/models/player_cosmetics.cairo` | Dojo model for on-chain cosmetic storage |
| Modify | `src/lib.cairo` | Register model module |
| Modify | `src/systems/world_system.cairo` | `set_cosmetic` entrypoint |
| Modify | `src/tests/test_world.cairo` | 4 test cases for cosmetics |
| Create | `frontend/src/lib/cosmetics.ts` | Torii read hooks + contract call |
| Modify | `frontend/src/app/providers.tsx` | Session policy for `set_cosmetic` |
| Modify | `frontend/src/lib/forge/forgeState.ts` | On-chain write on equip |
| Modify | `frontend/src/app/forge/page.tsx` | Pass account to forge state |
| Modify | `frontend/src/components/HexGrid.tsx` | Banner pennants + parcel skins |
| Modify | `frontend/src/app/world/page.tsx` | Cosmetics data + hold decoration |
| Modify | `frontend/src/app/match-1v1/[id]/page.tsx` | Banner next to citadels |
