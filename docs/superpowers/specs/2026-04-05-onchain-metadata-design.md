# On-chain Ability Metadata (Phase 2A.6) — Design Spec

## Goal

Rewrite `AbilityToken` to serve fully on-chain metadata — `uri(token_id)` returns a `data:application/json;base64,...` URI with the ability's name, description, attributes, and an inline SVG image. Eliminates the frontend dependency for wallet display (currently a Next.js route handler that requires a publicly reachable host). No external servers, no IPFS, no broken images when localhost isn't running.

**Prior spec:** `docs/superpowers/specs/2026-04-05-ability-nfts-design.md` (Phase 2A.5 — introduced the ERC-1155 token with off-chain metadata)

**Reference implementation:** [Provable-Games/beasts](https://github.com/Provable-Games/beasts) (Cairo 2.15, OZ v3.0.0). Key files studied:
- `lib.cairo` — selective ERC721 component composition (skip `ERC721MetadataImpl`, provide custom `token_uri`)
- `metadata_generator.cairo` — JSON builder using ByteArray concatenation + base64 encoding
- `encoding.cairo` — 70-line pure-Cairo base64 encoder
- `beast_svg.cairo` — SVG construction via ByteArray chunks
- `beast_png_regular_data.cairo` — per-beast PNG data as hardcoded ByteArray constants in a separate contract

## Architecture

```
┌──────────────┐    craft_ability    ┌──────────────────┐
│  Frontend    │ ──────────────────▶ │  crafting_1v1    │
│  (/craft)    │                     │ (Dojo contract)  │
└──────┬───────┘                     └────────┬─────────┘
       │                                      │
       │ balance_of_batch                     │ mint(player, id, 1)
       │                                      ▼
       │                             ┌──────────────────┐
       └────────────────────────────▶│  AbilityToken v2 │
                                     │ (ERC-1155)       │
                                     │                  │
                                     │ uri(1) returns:  │
                                     │ data:application │
                                     │ /json;base64,... │
                                     └──────────────────┘
                                        ↑ no external call
                                        ↑ all data inline
```

Same end-to-end flow as Phase 2A.5 — `crafting_1v1` burns resources then calls `AbilityToken.mint`. The ONLY change is how `uri(token_id)` works: instead of returning a URL that the wallet fetches, it returns the complete metadata inline as a data URI. The wallet reads it directly from the contract call — no HTTP fetch needed.

## Key Technical Insight: Selective Component Composition

OZ Cairo v3.0.0 ERC-1155 has four separate embeddable impls:
- `ERC1155Impl` — core (balance_of, transfer, approve)
- `ERC1155MetadataURIImpl` — `uri(token_id)` that returns stored `base_uri`
- `ERC1155CamelImpl` — camelCase aliases
- `ERC1155MixinImpl` — aggregate of all above + SRC5

Phase 2A.5 embedded `ERC1155MixinImpl`, which forced the default `uri()` behavior. Phase 2A.6 decomposes this:

```cairo
// Embed core + camelCase (no metadata impl — we provide our own)
#[abi(embed_v0)]
impl ERC1155Impl = ERC1155Component::ERC1155Impl<ContractState>;
#[abi(embed_v0)]
impl ERC1155CamelImpl = ERC1155Component::ERC1155CamelImpl<ContractState>;
impl ERC1155InternalImpl = ERC1155Component::InternalImpl<ContractState>;

// SRC5 separately (no duplicate since we're not embedding the mixin)
#[abi(embed_v0)]
impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

// Custom metadata — returns per-token on-chain data URIs
#[abi(embed_v0)]
impl AbilityMetadataURI of IERC1155MetadataURI<ContractState> {
    fn uri(self: @ContractState, token_id: u256) -> ByteArray {
        build_ability_data_uri(self, token_id)
    }
}
```

This is the exact pattern Loot Survivor uses for ERC-721 (`ERC721Metadata of IERC721Metadata`), adapted for ERC-1155.

## On-chain: AbilityToken v2 Contract

Rewritten file: `src/tokens/ability_token.cairo`.

### What stays from v1
- `IAbilityToken` trait (mint, burn, set_minter, set_burner, admin, minter, burner)
- Admin/minter/burner role storage + assertions
- Constructor zero-address admin guard
- `ERC1155Component` + `SRC5Component` as dependencies
- The trusted-burner NOTE comment

### What changes from v1
- **Remove** `#[abi(embed_v0)] impl ERC1155MixinImpl`
- **Add** selective embeds: `ERC1155Impl`, `ERC1155CamelImpl`, `SRC5Impl`
- **Remove** `set_base_uri` method and `base_uri` constructor parameter (no longer used — metadata is built on-chain per token)
- **Add** `set_ability_svg(ref self, ability_type: u8, svg: ByteArray)` admin method — stores SVG per ability type for testnet iteration
- **Add** storage: `ability_svgs: Map<u8, ByteArray>` for the 5 per-ability SVG strings
- **Add** custom `uri(token_id)` impl that builds a `data:application/json;base64,...` return value

### `uri(token_id)` implementation

```
uri(token_id) →
  1. Look up ability_type from token_id (for now: ability_type = token_id since ids are 1-5)
  2. Look up name, description, cost from hardcoded constants (match on ability_type)
  3. Read SVG bytes from storage: self.ability_svgs.entry(ability_type).read()
  4. Build JSON: { name, description, image: "data:image/svg+xml;base64,<base64(svg)>", attributes: [...] }
  5. Base64-encode the JSON
  6. Return "data:application/json;base64,<encoded_json>"
```

### Constructor change

v1: `constructor(admin, base_uri)` — stored base_uri for the component.
v2: `constructor(admin)` — no base_uri needed. Initializer still called with empty string (component requires it for internal state) but `uri()` never reads it.

### Interface change

v1 `IAbilityToken`:
```cairo
fn set_base_uri(ref self: T, new_uri: ByteArray);
```

v2 `IAbilityToken` — replaces `set_base_uri` with:
```cairo
fn set_ability_svg(ref self: T, ability_type: u8, svg: ByteArray);
```

Other methods unchanged.

## Supporting Modules

### `src/tokens/base64.cairo` (NEW)

Direct port of Loot Survivor's `encoding.cairo`. One public function:

```cairo
pub fn bytes_base64_encode(bytes: ByteArray) -> ByteArray
```

~70 lines, pure Cairo, zero dependencies. Encodes arbitrary ByteArray to base64 with `=` padding.

### `src/tokens/ability_metadata.cairo` (NEW)

JSON builder for ability metadata. Pattern: ByteArray concatenation using `.append(@"literal")` chunks plus `format!("{}", value)` for dynamic data. Escapes JSON special characters.

Public function:

```cairo
pub fn build_ability_data_uri(ability_type: u8, svg: ByteArray) -> ByteArray
```

Steps:
1. Match `ability_type` to hardcoded name/description/cost strings
2. Base64-encode the SVG → `image_data_uri = format!("data:image/svg+xml;base64,{}", base64_svg)`
3. Build JSON string with name, description, image, and attributes (Cost + Phase)
4. Base64-encode the JSON → `json_data_uri = format!("data:application/json;base64,{}", base64_json)`
5. Return `json_data_uri`

Hardcoded ability definitions (stays in sync with `crafting_1v1.cairo` recipes):

| ID | Name | Description | Cost String |
|----|------|-------------|-------------|
| 1 | Siege Sword | Max damage (10) to one gate for 1 round | 3 Iron + 2 Wood |
| 2 | Stone Cloak | Block all gate damage for 1 round | 3 Stone + 2 Linen |
| 3 | Ember Blast | Deal 5 direct damage bypassing gates | 3 Ember + 2 Seeds |
| 4 | Hex | Opponent budget reduced by 7 for 1 round | 2 Iron + 2 Stone + 1 Ember |
| 5 | Fortify | Double defense on all gates for 1 round | 2 Stone + 2 Linen + 1 Wood |

### Phase 3 stub: `get_ability_svg` signature

The function signature accepts `(ability_type: u8, color_seed: felt252)` even though Phase 2A.6 ignores the seed (always reads from admin-settable storage). When Phase 3 arrives, the seed drives HSL color rotation applied to the SVG palette. The signature is in place now so Phase 3 doesn't need to refactor the caller.

## SVG Placeholder Art

5 simple medieval line-art icons, ~30-50 lines of SVG each, using the siege-dojo war-room palette:
- Gold/brown: `#c8a44e`, `#7a7060`, `#3d3428`, `#1a1714`
- Accent colors per ability: sword=red, cloak=blue, ember=orange, hex=purple, fortify=green

Icons:
1. **Siege Sword** — a vertical medieval sword with crossguard
2. **Stone Cloak** — a draped cloak/shield shape
3. **Ember Blast** — a fireball/flame burst
4. **Hex** — a skull or cursed rune
5. **Fortify** — a reinforced tower/battlements

Stored on-chain via 5 admin `set_ability_svg` calls after deploy. Can be replaced anytime with better art — one tx per ability.

## Frontend Changes

### Deleted
- `frontend/src/app/api/metadata/abilities/[id]/route.ts` — no longer needed
- `frontend/public/sprites/abilities/.gitkeep` — sprite folder not needed for on-chain metadata

### Unchanged
- `frontend/src/lib/abilityToken.ts` — `fetchAbilityBalances` reads balances via `balance_of_batch`, unaffected by how `uri()` works
- `frontend/src/app/craft/page.tsx` — reads from `abilityToken.ts`, unchanged
- `frontend/src/app/providers.tsx` — session policies unchanged

The wallet reads `uri()` directly from the contract. The frontend never calls `uri()` itself — it only reads balances.

## Deployment

1. Build and deploy AbilityToken v2 (new class hash → declare → deploy with `constructor(admin)`)
2. Call `v2.set_minter(crafting_1v1_address)` — one admin tx
3. Call `actions_1v1.set_ability_token(v2_address)` — one admin tx (reuses existing method)
4. Call `v2.set_ability_svg(1, "<svg>...</svg>")` through `v2.set_ability_svg(5, "<svg>...</svg>")` — 5 admin txs (or one multicall)
5. v1 AbilityToken at `0x6de8e6ad...` becomes orphaned (zero minted abilities, nothing lost)
6. Delete the frontend metadata route handler
7. Commit + update CLAUDE.md

## Testing

Update `src/tests/test_ability_token.cairo`:
- **Remove** `test_admin_can_update_base_uri` — `set_base_uri` no longer exists
- **Add** `test_admin_can_set_ability_svg` — admin sets SVG for ability 1, reads `uri(1)`, verifies it starts with `"data:application/json;base64,"`
- **Add** `test_uri_returns_empty_for_unset_svg` — `uri(1)` still returns a valid data URI even when SVG storage is empty (returns JSON with empty image field)
- **Add** `test_uri_for_invalid_id_returns_empty` — `uri(99)` returns empty or a default response
- Keep all existing auth/role tests (mint, burn, admin, minter, burner)

## Access Control Fix (from v1 review)

Apply the `set_ability_token` ACL guard that the v1 final reviewer flagged:

```cairo
fn set_ability_token(ref self: ContractState, ability_token: ContractAddress) {
    let world = self.world_default();
    assert(
        world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
        'Not world owner'
    );
    let mut config: ResourceConfig = world.read_model(0_u8);
    config.ability_token = ability_token;
    world.write_model(@config);
}
```

This was flagged as Important (not blocking) in the Phase 2A.5 final review but is worth fixing now since we're touching `actions_1v1` anyway for the v2 migration.

## Out of Scope

- **Phase 3 ERC-721 migration** — documented in project memory, not implemented here
- **Per-token color seed / prefix / suffix** — `get_ability_svg` signature accepts `color_seed` but doesn't use it yet
- **Phase 2B ability consumption** — separate spec, uses the burner slot
- **ERC721Enumerable** — Phase 3 concern
- **vRNG-driven rarity rolls** — Phase 3 concern
- **Production SVG art** — placeholder art ships now, user replaces via `set_ability_svg` txs
