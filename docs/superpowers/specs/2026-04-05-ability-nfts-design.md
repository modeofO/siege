# Ability NFTs (Phase 2A.5) — Design Spec

## Goal

Promote crafted abilities from a Dojo ECS model (`PlayerAbilities` — on-chain but invisible to wallets) to ERC-1155 tokens so they appear in the Cartridge Controller wallet with name and art. One contract, five token IDs (1–5), one ID per ability. Crafting mints; Phase 2B (separate spec) will burn on use.

**Why now:** The existing crafting system works end-to-end, but players can't see their abilities in their wallet. Wallets index standard token contracts (ERC-20/721/1155), not custom Dojo models. ERC-1155 is the natural fit for a count-based inventory ("you own 3 Siege Swords" = `balance_of(player, 1) == 3`).

**Prior spec:** `docs/superpowers/specs/2026-04-04-crafting-abilities-design.md` (Phase 2A — introduces the Dojo-model version this spec replaces).

## Architecture

```
┌─────────────────┐   approve+craft    ┌──────────────────┐
│    Frontend     │ ─────────────────▶ │  crafting_1v1    │
│  (/craft page)  │                    │ (Dojo contract)  │
└────────┬────────┘                    └────────┬─────────┘
         │                                      │
         │ balance_of_batch                     │ mint(player, id, 1)
         │                                      ▼
         │                             ┌──────────────────┐
         └────────────────────────────▶│  AbilityToken    │
                                       │ (ERC-1155)       │
                                       └────────┬─────────┘
                                                │
                                                │ uri(id)
                                                ▼
                                       ┌──────────────────┐
                                       │ Next.js route    │
                                       │ /api/metadata/…  │
                                       └──────────────────┘
```

`crafting_1v1` remains a Dojo contract (no change to its gameplay role). `AbilityToken` is a pure Starknet contract (no Dojo dependency), deployed via a standalone TS script, matching the existing `ResourceToken` pattern. The two are wired together by storing `AbilityToken`'s address on a Dojo config model so the crafting contract can look it up.

## On-chain: AbilityToken Contract

New file: `src/tokens/ability_token.cairo`.

Pure Starknet contract (not a Dojo contract). Uses `openzeppelin_token::erc1155::ERC1155Component` for the standard interface (`balance_of`, `balance_of_batch`, `safe_transfer_from`, `uri`, events, etc.). Adds three role slots and a mutable base URI.

### Storage

| Field | Type | Purpose |
|---|---|---|
| `admin` | `ContractAddress` | Can rotate `minter`, `burner`, and `base_uri`. Set at constructor. |
| `minter` | `ContractAddress` | Only address allowed to call `mint`. Updatable by admin. |
| `burner` | `ContractAddress` | Only address allowed to call `burn`. Updatable by admin. Starts at `0x0` (no burns allowed until Phase 2B). |
| `base_uri` | `ByteArray` | Returned by `uri()`. Updatable by admin. |

Plus the standard OZ ERC1155Component storage (`balances`, `operator_approvals`, etc.).

### Interface

```cairo
#[starknet::interface]
pub trait IAbilityToken<T> {
    // Mint/burn — restricted
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
    fn burn(ref self: T, from: ContractAddress, token_id: u256, amount: u256);

    // Admin — restricted to `admin`
    fn set_minter(ref self: T, new_minter: ContractAddress);
    fn set_burner(ref self: T, new_burner: ContractAddress);
    fn set_base_uri(ref self: T, new_uri: ByteArray);

    // Read
    fn admin(self: @T) -> ContractAddress;
    fn minter(self: @T) -> ContractAddress;
    fn burner(self: @T) -> ContractAddress;
}
```

All standard ERC-1155 read/transfer methods come from `ERC1155MixinImpl` (balance_of, balance_of_batch, safe_transfer_from, uri, is_approved_for_all, etc.).

### Constructor

```cairo
fn constructor(
    ref self: ContractState,
    admin: ContractAddress,
    base_uri: ByteArray,  // may be empty at deploy — set_base_uri can populate later
)
```

Sets `admin`, stores `base_uri`, leaves `minter` and `burner` as `0x0`. Two separate post-deploy admin transactions then wire `set_minter(crafting_1v1_address)` and `set_base_uri(metadata_url)`. This two-step deploy avoids circular dependency (the crafting contract address isn't known until after the Dojo migrate, which depends on the token being built).

### Asserts

- `mint`: `assert(get_caller_address() == self.minter.read(), 'Not minter')`
- `burn`: `assert(get_caller_address() == self.burner.read(), 'Not burner')`. Also fails naturally if balance insufficient (ERC1155Component enforces this).
- `set_*`: `assert(get_caller_address() == self.admin.read(), 'Not admin')`

### Token IDs

| ID | Ability |
|---|---|
| 1 | Siege Sword |
| 2 | Stone Cloak |
| 3 | Ember Blast |
| 4 | Hex |
| 5 | Fortify |

IDs match the existing `ability_id` parameter to `crafting_1v1.craft_ability()`. No mapping table; the crafting contract passes the ability ID straight through as the ERC-1155 token ID.

### Transferability

ERC-1155's standard `safe_transfer_from` and `safe_batch_transfer_from` are inherited from the OZ component and remain enabled. Players can gift or trade abilities to other addresses — this is intentional, matching the existing ERC-20 resource tokens which are also tradeable. If Phase 2B's balance checks need "soul-bound" abilities (non-transferable), that should be a separate spec decision; this spec does not lock them down.

## On-chain: crafting_1v1 Rewire

Modified file: `src/systems/crafting_1v1.cairo`.

Changes:

1. **Remove** all `PlayerAbilities` imports, reads, and writes.
2. **Add** an `IAbilityTokenDispatcher` import and a helper that reads the ability token address from the world config.
3. **Replace** the "increment ability count" block with a single `ability_token.mint(caller, ability_id.into(), 1)` call.

The rest of `craft_ability` (resource burn logic) stays identical.

### Token address lookup

Two options, pick the one that minimizes ceremony:

- **Option A:** Extend `ResourceConfig` with a `ability_token: ContractAddress` field. One config model, one extra field.
- **Option B:** New `AbilityConfig` model with a single field.

**Picked: Option A.** Avoids model proliferation and keeps all token addresses in one place. The existing `actions_1v1.set_resource_config` setter already accepts token addresses — we'll add a dedicated `actions_1v1.set_ability_token(addr)` method to avoid re-passing the 6 resource addresses every time, but the storage lives on `ResourceConfig`.

## On-chain: Dropping PlayerAbilities

- Delete `src/models/player_abilities.cairo`
- Remove `pub mod player_abilities;` from `src/lib.cairo`
- Migrate (`sozo migrate`) — the already-deployed `PlayerAbilities` resource stays in the world as orphaned storage. Harmless; not queried anymore.
- The single crafted Siege Sword on Sepolia testnet is intentionally discarded. Acceptable per user confirmation ("this is just testing").

## Metadata Flow

**The whole point of this migration is that the wallet can display the ability.** That requires a resolvable metadata URI per token. This section documents the full chain end-to-end so future maintainers (and Claude sessions) can update any link in the chain without confusion.

> `<YOUR_HOST>` in the examples below is a placeholder — replace with the actual production frontend URL when implementing (e.g. whatever Vercel/Netlify/custom domain the Next.js app ships to). The on-chain `base_uri` must point to a host that is reachable from Cartridge's wallet indexer.

### End-to-end chain

```
┌───────────────┐     ┌────────────────┐     ┌─────────────────────┐     ┌────────────┐     ┌──────────┐
│ Cartridge     │ 1.  │ AbilityToken   │ 2.  │ Next.js route       │ 3.  │ Next.js    │ 4.  │ Wallet   │
│ wallet        │────▶│ uri(1)         │────▶│ /api/metadata/      │────▶│ /public/   │────▶│ renders  │
│ (indexer)     │     │ → base_uri     │     │ abilities/[id]      │     │ sprites/   │     │ card     │
└───────────────┘     └────────────────┘     │ returns JSON        │     │ abilities/ │     └──────────┘
                                             └─────────────────────┘     └────────────┘
```

1. **Wallet → contract:** Cartridge's token indexer sees the `TransferSingle` event when `mint` is called. It queries `uri(token_id)` on the contract. The contract returns `base_uri` verbatim (ERC-1155 convention is that the client substitutes `{id}` — the contract does not substitute). Example: the stored value is `https://<YOUR_HOST>/api/metadata/abilities/{id}` for all token IDs. (A single base URI applies to all IDs — this is standard ERC-1155 behavior and saves on-chain storage.)

2. **Wallet → metadata endpoint:** Wallet substitutes `{id}` with the hex-encoded token ID and fetches. Example: `https://<YOUR_HOST>/api/metadata/abilities/1` (note: some wallets use zero-padded 64-char hex `0x0…01`; the route handler should accept both decimal and hex forms for robustness).

3. **Next.js route handler → JSON:** `frontend/src/app/api/metadata/abilities/[id]/route.ts` parses the ID param, looks up the matching entry in the shared `ABILITIES` constant from `craftingContracts.ts`, and returns:
   ```json
   {
     "name": "Siege Sword",
     "description": "Max damage (10) to one gate for 1 round",
     "image": "https://<YOUR_HOST>/sprites/abilities/1.png",
     "attributes": [
       { "trait_type": "Cost", "value": "3 Iron + 2 Wood" },
       { "trait_type": "Phase", "value": "2B" }
     ]
   }
   ```
   The route reads `request.url` to derive the host dynamically, so local dev (`http://localhost:3000/…`) and production (`https://<YOUR_HOST>/…`) both work without hardcoded URLs.

4. **Wallet → image endpoint:** Wallet fetches the `image` URL, which is a static file in `frontend/public/sprites/abilities/<id>.png`. Served directly by Next.js.

5. **Wallet renders:** Name, description, and image are displayed on the Cartridge wallet card. Attribute chips may or may not appear depending on wallet UI — they're additive.

### Updating metadata without a contract redeploy

Three kinds of update, three different procedures:

| What changes | How | Transaction? |
|---|---|---|
| Art (sprite PNG) | Replace file in `frontend/public/sprites/abilities/<id>.png`, redeploy the Next.js app | No on-chain tx |
| Description / name / attributes | Update the `ABILITIES` array in `frontend/src/lib/craftingContracts.ts`, redeploy the Next.js app | No on-chain tx |
| Hosting location or URL scheme | Admin calls `ability_token.set_base_uri(new_uri)` | One admin tx |

Wallets typically cache metadata. Cartridge's refresh cadence varies; if a sprite swap doesn't appear, the fallback is to wait or trigger a refresh from the wallet UI.

### Placeholder strategy before sprites exist

Metadata goes live before the 5 ability sprites are drawn. The route handler will return a hardcoded placeholder image URL for any ID until the corresponding PNG exists:

```typescript
const imagePath = `/sprites/abilities/${id}.png`;
const placeholderPath = `/sprites/book_preview.png`; // reuses the book asset already in the repo
// route returns: `${host}${imagePath}` — but if that file is missing, Next.js 404s and the wallet shows a broken image
```

Two ways to handle missing sprites:

- **Simple:** always return the expected path. When the file is missing, the wallet renders a broken image icon. Acceptable for testnet.
- **Safer:** the route handler checks `fs.existsSync` and falls back to `/sprites/book_preview.png` when the real sprite doesn't exist yet.

**Picked: simple.** Existsync adds filesystem access in an edge route, which may not be available on all Next.js hosting targets. Broken images on testnet are acceptable and motivating.

## Frontend Changes

### New file: `frontend/src/lib/abilityToken.ts`

Exports:
- `ABILITY_TOKEN_ADDRESS` — reads `process.env.NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS` with the deployed address as default fallback (same pattern as `CRAFTING_1V1_ADDRESS`)
- `fetchAbilityBalances(provider, player)` — calls `balance_of_batch(player, [1,2,3,4,5])` via `provider.callContract`, returns `{ siege_sword, stone_cloak, ember_blast, hex, fortify }`

### New file: `frontend/src/app/api/metadata/abilities/[id]/route.ts`

Next.js App Router route handler. GET-only. Reads `params.id`, maps to an ability via `ABILITIES.find(a => a.id === Number(id))`, returns JSON or 404. Derives host from `request.url` so it works in dev and prod.

### Modified: `frontend/src/app/craft/page.tsx`

- Delete `fetchAbilities` (the Torii GraphQL query) and its types
- Delete the `siegeDojoPlayerAbilitiesModels` reference
- Replace with `fetchAbilityBalances(provider, address)` from the new helper
- Inventory display (`Owned: N` badges) stays identical — still reads from the same state shape
- No changes to the craft button flow, return-to-match link, or any other UX

### Modified: `frontend/.env.local`

Add:
```
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=0x<deployed_address>
```

### Modified: `frontend/src/app/providers.tsx`

Update session policies: the `approve` policies for the 6 resource ERC-20s stay. The `craft_ability` policy on `crafting_1v1` stays. **No new policy needed for the ability token** — the user doesn't directly call it during crafting (the crafting contract does the mint). Sessions for Phase 2B's burn flow will be added when that ships.

### Deleted frontend code

None beyond the inline changes. No whole files get deleted on the frontend side.

## Deployment Steps

Each step lands as its own commit where possible:

1. **Write contracts** — `AbilityToken` contract, `crafting_1v1` rewire, `set_ability_token` method on `actions_1v1`. Delete `player_abilities.cairo` and its `lib.cairo` registration.
2. **Build** — `sozo build -P sepolia`.
3. **Deploy AbilityToken** — `scripts/deploy-ability-token.ts` (new file, copy/adapt from `deploy-tokens.ts`). Declares the class, deploys an instance with `constructor(admin=deployer, base_uri="")`. Prints the address.
4. **Migrate Dojo world** — `sozo -P sepolia migrate`. Picks up the rewired `crafting_1v1` and the new `actions_1v1.set_ability_token` method. Drops `PlayerAbilities` (orphans its world resource).
5. **Grant writer perms** — if the crafting_1v1 resource hash changed: `sozo -P sepolia auth grant writer "siege_dojo,siege_dojo-crafting_1v1"`.
6. **Wire token into world** — call `actions_1v1.set_ability_token(<deployed_ability_token_address>)` from the deployer.
7. **Authorize minter** — call `ability_token.set_minter(<crafting_1v1_address>)` from the admin (deployer).
8. **Set metadata URI** — call `ability_token.set_base_uri("https://<YOUR_HOST>/api/metadata/abilities/{id}")` from the admin. (Use actual production URL.)
9. **Frontend** — add the env var, add `abilityToken.ts`, add the metadata route handler, rewire `/craft` to use `balance_of_batch`. Commit + deploy.
10. **Smoke test** — craft a Stone Cloak on Sepolia. Verify:
    - Resources decrement
    - `/craft` page shows "Owned: 1" on Stone Cloak
    - Cartridge Controller wallet shows the new token (name + placeholder image)
    - Metadata route returns valid JSON when hit directly in a browser

## Testing

New contract unit tests in `src/tests/test_ability_token.cairo`:

- `test_mint_only_by_minter` — unauthorized callers revert
- `test_burn_only_by_burner` — unauthorized callers revert
- `test_admin_rotates_minter` — only admin can call `set_minter`, new minter can then mint
- `test_admin_rotates_base_uri` — URI updates take effect
- `test_token_id_balances_isolated` — minting ID 1 doesn't affect ID 2 balance
- `test_zero_burner_blocks_all_burns` — default state with unset burner rejects burns

These are pure Starknet tests. They don't need the Dojo world spawn, which sidesteps the pre-existing VRF test infrastructure issue (the one that fails 12 existing `_1v1` tests). They follow the OpenZeppelin ERC1155 test patterns.

No new tests needed for `crafting_1v1` — the existing flow is already covered by Phase 2A tests (which still pass because they don't call `create_match_1v1`). The rewire is a mechanical substitution: one write to a Dojo model becomes one call to a dispatcher.

No new frontend tests — the `/craft` page logic is unchanged above the data-fetching layer, and the existing vitest suite doesn't mock contract calls.

## Burner Slot for Phase 2B

The `burner` slot is set to `0x0` at deploy. Until Phase 2B ships, **no contract can burn abilities**. Crafted abilities are effectively immortal for the duration of Phase 2A.5. This is correct — there's nothing to consume them yet.

When Phase 2B ships, the admin calls `ability_token.set_burner(<phase_2b_consume_contract>)` once. The Phase 2B contract then has the ability to burn tokens as part of its in-match ability activation logic. That spec is deferred.

## Rollback Plan

If the rewired `crafting_1v1` has a bug post-deploy, the prior version (writing to `PlayerAbilities`) can be restored via another `sozo migrate` after reverting the Cairo changes. The already-minted ERC-1155 balances become orphaned — they still exist on-chain but can't be read or written by the reverted crafting contract. Harmless on testnet. Not expected to be needed.

## Out of Scope

Explicitly deferred:

- **Resource sprites on `/craft` or match UI** — pure UI polish, separate task
- **IPFS metadata hosting** — the Next.js route is the v1; IPFS is a future mainnet-readiness task
- **Phase 2B ability consumption logic** — separate spec, uses `burner` slot
- **OpenZeppelin AccessControl component** — the 3-slot admin model is sufficient; revisit only if more than 2 roles are ever needed
- **Ability sprite display on the `/craft` cards themselves** — would duplicate work with the metadata route; craft cards stay text-only. (A future task could fetch the metadata JSON or import the sprite path from the same constant.)
- **Migration of the one existing crafted sword on Sepolia** — intentionally discarded; testnet data is ephemeral

## Deployment Notes & Risks

- The two-step deploy (token first, then minter auth) means there is a brief window where the token contract exists but crafting can't mint. Not a problem — nothing depends on mint happening immediately.
- `set_base_uri` is idempotent and free to re-run — if the hosting URL ever changes, one tx fixes it.
- If Vercel/your frontend host has a cold-start delay, the first `uri(1)` fetch after a long idle might time out in some wallet indexers. Keeping the route handler fast (no filesystem access, no I/O) mitigates this.
- The `ABILITIES` constant is the single source of truth for both the frontend UI and the metadata route. Any edit to it must redeploy the frontend to take effect. On-chain data is unaffected.
- OpenZeppelin Cairo v3.0.0 is confirmed as a Scarb.toml dependency; `erc1155::ERC1155Component` is available. Verify the exact import path during implementation (OZ reorganizes modules between versions).
