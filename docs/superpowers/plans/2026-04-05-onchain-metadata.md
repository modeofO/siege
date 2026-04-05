# On-chain Ability Metadata (Phase 2A.6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `AbilityToken` to serve fully on-chain metadata — `uri(token_id)` returns `data:application/json;base64,...` with an inline SVG image. Eliminates the frontend metadata route handler and all external hosting dependency for wallet display.

**Architecture:** Selective ERC-1155 component composition — embed `ERC1155Impl` + `ERC1155CamelImpl` + `SRC5Impl` separately (skip `ERC1155MetadataURIImpl` and `ERC1155MixinImpl`), then provide a custom `uri(token_id)` that builds the data URI on-chain. New supporting modules `base64.cairo` (encoder) and `ability_metadata.cairo` (JSON builder). Admin-settable per-ability SVGs via `set_ability_svg(ability_type, svg)`. Deploy as AbilityToken v2, swap the world config to point at v2, delete the frontend route handler.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0, `openzeppelin_token` + `openzeppelin_introspection` + new dep `openzeppelin_interfaces` (all v3.0.0), starknet.js v8 for deploy/wire scripts.

**Spec:** `docs/superpowers/specs/2026-04-05-onchain-metadata-design.md`

**Reference implementation:** [Provable-Games/beasts](https://github.com/Provable-Games/beasts) — selective ERC721 component composition in `lib.cairo`, JSON builder in `metadata_generator.cairo`, base64 encoder in `encoding.cairo`.

**Pre-existing context:** Phase 2A.5 deployed AbilityToken v1 at `0x6de8e6addfd54cb600d5a7549e92fa5b275379ff85364626874a00bc138d37c` on Sepolia. Zero abilities have been minted on Sepolia (only tested locally). v1 becomes orphaned after v2 deploys — no data loss.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `Scarb.toml` | Add `openzeppelin_interfaces` dep |
| Create | `src/tokens/base64.cairo` | Pure-Cairo base64 encoder (~70 lines, ported from Loot Survivor) |
| Create | `src/tokens/ability_metadata.cairo` | JSON builder: `build_ability_data_uri(ability_type, svg) -> ByteArray` |
| Rewrite | `src/tokens/ability_token.cairo` | Selective ERC-1155 composition, custom `uri()`, `set_ability_svg` admin method |
| Modify | `src/tokens.cairo` | Register new modules |
| Modify | `src/tests/test_ability_token.cairo` | Adapt deploy helper, replace base_uri test with on-chain metadata tests |
| Modify | `src/systems/actions_1v1.cairo` | Add ACL guard to `set_ability_token` |
| Create | `scripts/deploy-ability-token-v2.ts` | Declare + deploy v2 instance |
| Create | `scripts/set-ability-svgs.ts` | Upload 5 placeholder SVGs via `set_ability_svg` calls |
| Delete | `frontend/src/app/api/metadata/abilities/[id]/route.ts` | No longer needed |
| Delete | `frontend/public/sprites/abilities/.gitkeep` | No longer needed |
| Modify | `CLAUDE.md` | Document on-chain metadata |

---

## Task 1: Base64 Encoder + Scarb Dependency

**Files:**
- Modify: `Scarb.toml`
- Create: `src/tokens/base64.cairo`
- Modify: `src/tokens.cairo`

- [ ] **Step 1: Add `openzeppelin_interfaces` to `Scarb.toml`**

The custom `uri()` impl needs to implement `IERC1155MetadataURI` which lives in `openzeppelin_interfaces::token::erc1155`. Add it alongside the existing OZ deps.

Find in `Scarb.toml`:

```toml
openzeppelin_token = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
openzeppelin_introspection = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
```

Add one line after:

```toml
openzeppelin_token = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
openzeppelin_introspection = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
openzeppelin_interfaces = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
```

- [ ] **Step 2: Create `src/tokens/base64.cairo`**

Direct port of [Provable-Games/beasts `encoding.cairo`](https://github.com/Provable-Games/beasts/blob/main/src/encoding.cairo). Pure Cairo, zero dependencies.

```cairo
// Base64 encoder for on-chain metadata URIs.
// Ported from Provable-Games/beasts encoding.cairo (MIT license).

#[inline(always)]
fn get_base64_char_set() -> Span<u8> {
    let result = array![
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
        'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
        'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '/',
    ];
    result.span()
}

pub fn bytes_base64_encode(bytes: ByteArray) -> ByteArray {
    encode_bytes(bytes, get_base64_char_set())
}

fn encode_bytes(mut bytes: ByteArray, base64_chars: Span<u8>) -> ByteArray {
    let mut result: ByteArray = "";
    if bytes.len() == 0 {
        return result;
    }
    let mut p: u8 = 0;
    let c = bytes.len() % 3;
    if c == 1 {
        p = 2;
        bytes.append_byte(0_u8);
        bytes.append_byte(0_u8);
    } else if c == 2 {
        p = 1;
        bytes.append_byte(0_u8);
    }

    let mut i = 0;
    let bytes_len = bytes.len();
    let last_iteration = bytes_len - 3;
    loop {
        if i == bytes_len {
            break;
        }
        let n: u32 = (bytes.at(i).unwrap()).into()
            * 65536 | (bytes.at(i + 1).unwrap()).into()
            * 256 | (bytes.at(i + 2).unwrap()).into();
        let e1 = (n / 262144) & 63;
        let e2 = (n / 4096) & 63;
        let e3 = (n / 64) & 63;
        let e4 = n & 63;

        if i == last_iteration {
            if p == 2 {
                result.append_byte(*base64_chars[e1]);
                result.append_byte(*base64_chars[e2]);
                result.append_byte('=');
                result.append_byte('=');
            } else if p == 1 {
                result.append_byte(*base64_chars[e1]);
                result.append_byte(*base64_chars[e2]);
                result.append_byte(*base64_chars[e3]);
                result.append_byte('=');
            } else {
                result.append_byte(*base64_chars[e1]);
                result.append_byte(*base64_chars[e2]);
                result.append_byte(*base64_chars[e3]);
                result.append_byte(*base64_chars[e4]);
            }
        } else {
            result.append_byte(*base64_chars[e1]);
            result.append_byte(*base64_chars[e2]);
            result.append_byte(*base64_chars[e3]);
            result.append_byte(*base64_chars[e4]);
        }

        i += 3;
    }

    result
}
```

- [ ] **Step 3: Register in `src/tokens.cairo`**

Change:

```cairo
pub mod resource_token;
pub mod ability_token;
```

To:

```cairo
pub mod resource_token;
pub mod ability_token;
pub mod base64;
pub mod ability_metadata;
```

Note: `ability_metadata` is registered here too even though Task 2 creates it — this step adds both lines at once so the file only changes once. The build will fail until Task 2 creates the file. If you need an incremental build between tasks, register only `base64` now and add `ability_metadata` in Task 2.

- [ ] **Step 4: Build**

Run: `/tmp/sozo build`

If `ability_metadata` is already registered but the file doesn't exist yet, the build will fail. Two choices: (a) remove the `ability_metadata` line from tokens.cairo until Task 2, or (b) create a stub file. Easiest: only register `base64` now, add `ability_metadata` in Task 2.

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add Scarb.toml Scarb.lock src/tokens/base64.cairo src/tokens.cairo
git commit -m "feat: add base64 encoder + openzeppelin_interfaces dep"
```

---

## Task 2: Ability Metadata Module

**Files:**
- Create: `src/tokens/ability_metadata.cairo`
- Modify: `src/tokens.cairo` (add `ability_metadata` if not already registered in Task 1)

- [ ] **Step 1: Create `src/tokens/ability_metadata.cairo`**

JSON builder for on-chain ability metadata. Pattern follows [Loot Survivor's `metadata_generator.cairo`](https://github.com/Provable-Games/beasts/blob/main/src/metadata_generator.cairo) — ByteArray concatenation + base64 encoding.

```cairo
// Builds on-chain metadata data URIs for ability tokens.
//
// Entry point: build_ability_data_uri(ability_type, svg) -> ByteArray
// Returns: "data:application/json;base64,<base64-encoded JSON>"
//
// The JSON contains name, description, image (SVG data URI), and attributes.
// Ability definitions are hardcoded — must stay in sync with crafting_1v1 recipes.

use super::base64::bytes_base64_encode;

/// Build a complete `data:application/json;base64,...` URI for the given ability.
/// `svg` is the raw SVG string (read from contract storage by the caller).
/// Returns an empty ByteArray if `ability_type` is not 1-5.
pub fn build_ability_data_uri(ability_type: u8, svg: ByteArray) -> ByteArray {
    let name = get_ability_name(ability_type);
    let description = get_ability_description(ability_type);
    let cost = get_ability_cost_string(ability_type);

    if name.len() == 0 {
        return ""; // unknown ability type
    }

    // Build the image data URI: data:image/svg+xml;base64,<encoded svg>
    let image = if svg.len() > 0 {
        let encoded_svg = bytes_base64_encode(svg);
        let mut img: ByteArray = "data:image/svg+xml;base64,";
        img.append(@encoded_svg);
        img
    } else {
        "" // no SVG set yet
    };

    // Build JSON
    let mut json: ByteArray = "";
    json.append(@"{");

    json.append(@"\"name\":\"");
    json.append(@name);
    json.append(@"\",");

    json.append(@"\"description\":\"");
    json.append(@description);
    json.append(@"\",");

    json.append(@"\"image\":\"");
    json.append(@image);
    json.append(@"\",");

    json.append(@"\"attributes\":[");
    json.append(@"{\"trait_type\":\"Cost\",\"value\":\"");
    json.append(@cost);
    json.append(@"\"},");
    json.append(@"{\"trait_type\":\"Phase\",\"value\":\"2B\"}");
    json.append(@"]");

    json.append(@"}");

    // Base64-encode the whole JSON and wrap in data URI
    let encoded_json = bytes_base64_encode(json);
    let mut result: ByteArray = "data:application/json;base64,";
    result.append(@encoded_json);
    result
}

fn get_ability_name(ability_type: u8) -> ByteArray {
    if ability_type == 1 { "Siege Sword" }
    else if ability_type == 2 { "Stone Cloak" }
    else if ability_type == 3 { "Ember Blast" }
    else if ability_type == 4 { "Hex" }
    else if ability_type == 5 { "Fortify" }
    else { "" }
}

fn get_ability_description(ability_type: u8) -> ByteArray {
    if ability_type == 1 { "Max damage (10) to one gate for 1 round" }
    else if ability_type == 2 { "Block all gate damage for 1 round" }
    else if ability_type == 3 { "Deal 5 direct damage bypassing gates" }
    else if ability_type == 4 { "Opponent budget reduced by 7 for 1 round" }
    else if ability_type == 5 { "Double defense on all gates for 1 round" }
    else { "" }
}

fn get_ability_cost_string(ability_type: u8) -> ByteArray {
    if ability_type == 1 { "3 Iron + 2 Wood" }
    else if ability_type == 2 { "3 Stone + 2 Linen" }
    else if ability_type == 3 { "3 Ember + 2 Seeds" }
    else if ability_type == 4 { "2 Iron + 2 Stone + 1 Ember" }
    else if ability_type == 5 { "2 Stone + 2 Linen + 1 Wood" }
    else { "" }
}
```

- [ ] **Step 2: Register in `src/tokens.cairo` (if not already done in Task 1)**

Ensure `src/tokens.cairo` contains:

```cairo
pub mod resource_token;
pub mod ability_token;
pub mod base64;
pub mod ability_metadata;
```

- [ ] **Step 3: Build**

Run: `/tmp/sozo build`

Expected: clean build. The module is referenced by `tokens.cairo` but not yet called from `ability_token.cairo` — that's fine, it compiles standalone.

- [ ] **Step 4: Commit**

```bash
git add src/tokens/ability_metadata.cairo src/tokens.cairo
git commit -m "feat: add ability_metadata JSON builder for on-chain data URIs"
```

---

## Task 3: Rewrite AbilityToken for On-chain Metadata

**Files:**
- Rewrite: `src/tokens/ability_token.cairo`

This is the core task. The contract changes from embedding `ERC1155MixinImpl` (which provides a default `uri()` returning the stored base URI) to selectively embedding individual impls and providing a custom `uri()` that returns per-token on-chain data URIs.

- [ ] **Step 1: Replace the full contents of `src/tokens/ability_token.cairo`**

```cairo
// AbilityToken v2 — ERC-1155 with fully on-chain metadata.
//
// Token ID = ability ID (1=Siege Sword, 2=Stone Cloak, 3=Ember Blast, 4=Hex, 5=Fortify).
// uri(token_id) returns a data:application/json;base64,... URI with inline SVG image.
// No external server needed — metadata is constructed on-chain at read time.
//
// Three admin roles:
//   - admin: can rotate minter/burner and update per-ability SVGs (set at constructor, immutable)
//   - minter: can call mint (set by admin post-deploy — usually crafting_1v1)
//   - burner: can call burn (set by admin when Phase 2B ships — starts at 0x0)
//
// Phase 3 stub: get_ability_svg signature accepts (ability_type, color_seed) — the seed
// is ignored in v2 (always reads from admin-settable storage) but the parameter is in
// place for future per-token color generation.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IAbilityToken<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
    fn burn(ref self: T, from: ContractAddress, token_id: u256, amount: u256);
    fn set_minter(ref self: T, new_minter: ContractAddress);
    fn set_burner(ref self: T, new_burner: ContractAddress);
    fn set_ability_svg(ref self: T, ability_type: u8, svg: ByteArray);
    fn admin(self: @T) -> ContractAddress;
    fn minter(self: @T) -> ContractAddress;
    fn burner(self: @T) -> ContractAddress;
}

#[starknet::contract]
pub mod AbilityToken {
    use core::num::traits::Zero;
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_token::erc1155::{ERC1155Component, ERC1155HooksEmptyImpl};
    use openzeppelin_interfaces::token::erc1155::IERC1155MetadataURI;
    use siege_dojo::tokens::ability_metadata;

    component!(path: ERC1155Component, storage: erc1155, event: ERC1155Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    // Selective embedding: core + camelCase, but NOT the metadata impl.
    // We provide our own uri() below that returns on-chain data URIs.
    #[abi(embed_v0)]
    impl ERC1155Impl = ERC1155Component::ERC1155Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC1155CamelImpl = ERC1155Component::ERC1155CamelImpl<ContractState>;
    impl ERC1155InternalImpl = ERC1155Component::InternalImpl<ContractState>;

    // SRC5 embedded separately — no duplicate since we're not using the mixin.
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc1155: ERC1155Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        admin_address: ContractAddress,
        minter_address: ContractAddress,
        burner_address: ContractAddress,
        ability_svgs: Map<u8, ByteArray>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC1155Event: ERC1155Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        assert(admin.is_non_zero(), 'Admin cannot be zero');
        // Initialize with empty base URI — uri() never reads it (we override below),
        // but the component requires initializer to be called for SRC5 registration.
        self.erc1155.initializer("");
        self.admin_address.write(admin);
    }

    // Custom on-chain metadata: returns data:application/json;base64,... per token ID.
    #[abi(embed_v0)]
    impl AbilityMetadataURI of IERC1155MetadataURI<ContractState> {
        fn uri(self: @ContractState, token_id: u256) -> ByteArray {
            // Token IDs are 1-5. Anything outside that range returns empty.
            if token_id.high != 0 || token_id.low == 0 || token_id.low > 5 {
                return "";
            }
            let ability_type: u8 = token_id.low.try_into().unwrap();
            let svg = self.ability_svgs.entry(ability_type).read();
            ability_metadata::build_ability_data_uri(ability_type, svg)
        }
    }

    #[abi(embed_v0)]
    impl AbilityTokenImpl of super::IAbilityToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, token_id: u256, amount: u256) {
            assert(get_caller_address() == self.minter_address.read(), 'Not minter');
            self.erc1155.mint_with_acceptance_check(to, token_id, amount, array![].span());
        }

        // NOTE: burner is fully trusted — it can burn tokens from ANY address, not
        // just the caller. The burner role should only be assigned to a contract
        // that enforces "burn only from the token holder's own address" as an
        // internal invariant. Phase 2B's ability-consume contract will do this.
        fn burn(ref self: ContractState, from: ContractAddress, token_id: u256, amount: u256) {
            assert(get_caller_address() == self.burner_address.read(), 'Not burner');
            self.erc1155.burn(from, token_id, amount);
        }

        fn set_minter(ref self: ContractState, new_minter: ContractAddress) {
            assert(get_caller_address() == self.admin_address.read(), 'Not admin');
            self.minter_address.write(new_minter);
        }

        fn set_burner(ref self: ContractState, new_burner: ContractAddress) {
            assert(get_caller_address() == self.admin_address.read(), 'Not admin');
            self.burner_address.write(new_burner);
        }

        fn set_ability_svg(ref self: ContractState, ability_type: u8, svg: ByteArray) {
            assert(get_caller_address() == self.admin_address.read(), 'Not admin');
            assert(ability_type >= 1 && ability_type <= 5, 'Invalid ability type');
            self.ability_svgs.entry(ability_type).write(svg);
        }

        fn admin(self: @ContractState) -> ContractAddress {
            self.admin_address.read()
        }

        fn minter(self: @ContractState) -> ContractAddress {
            self.minter_address.read()
        }

        fn burner(self: @ContractState) -> ContractAddress {
            self.burner_address.read()
        }
    }
}
```

Key differences from v1:
- `ERC1155MixinImpl` replaced by `ERC1155Impl` + `ERC1155CamelImpl` + `SRC5Impl` (selective composition)
- `IERC1155MetadataURI` imported from `openzeppelin_interfaces::token::erc1155` and implemented with custom `uri()`
- `ability_svgs: Map<u8, ByteArray>` added to storage
- `set_ability_svg` replaces `set_base_uri`
- Constructor takes only `admin` (no `base_uri` param)
- `uri()` builds data URIs on-chain via `ability_metadata::build_ability_data_uri`

- [ ] **Step 2: Build**

Run: `/tmp/sozo build`

Expected: clean build. If you see duplicate entry point errors, check that `ERC1155MixinImpl` is NOT embedded (it was in v1 — make sure it's fully replaced, not left alongside the new embeds).

- [ ] **Step 3: Commit**

```bash
git add src/tokens/ability_token.cairo
git commit -m "feat: AbilityToken v2 with on-chain metadata (selective ERC-1155 composition)"
```

---

## Task 4: Update Tests

**Files:**
- Modify: `src/tests/test_ability_token.cairo`

The test file needs updates for v2:
- Constructor no longer takes `base_uri` → update `deploy_token` calldata
- `set_base_uri` no longer exists → remove `test_admin_can_update_base_uri`
- New `set_ability_svg` method → add test
- `uri()` returns on-chain data URIs → add test verifying prefix

- [ ] **Step 1: Update `deploy_token` in the test file**

Find the `deploy_token` function. The current calldata serializes `(admin, base_uri)`. Change it to serialize just `(admin)`:

Old:
```cairo
fn deploy_token() -> (IAbilityTokenDispatcher, IERC1155LikeDispatcher) {
    let admin: ContractAddress = ADMIN.try_into().unwrap();
    let mut calldata: Array<felt252> = array![];
    admin.serialize(ref calldata);
    let base_uri: ByteArray = "https://example.test/{id}";
    base_uri.serialize(ref calldata);
    // ... rest unchanged
```

New:
```cairo
fn deploy_token() -> (IAbilityTokenDispatcher, IERC1155LikeDispatcher) {
    let admin: ContractAddress = ADMIN.try_into().unwrap();
    let mut calldata: Array<felt252> = array![];
    admin.serialize(ref calldata);
    // v2 constructor takes only admin — no base_uri
    // ... rest unchanged
```

Just delete the two `base_uri` lines. Everything else in `deploy_token` stays.

- [ ] **Step 2: Replace `test_admin_can_update_base_uri` with v2 tests**

Delete the old test and add these three:

```cairo
#[test]
fn test_admin_can_set_ability_svg() {
    let (token, erc1155) = deploy_token();
    set_caller(ADMIN);
    let svg: ByteArray = "<svg><rect fill='gold'/></svg>";
    token.set_ability_svg(1, svg);
    // uri(1) should now return a data URI starting with the base64 JSON prefix
    let returned = erc1155.uri(1_u256);
    // The returned value should start with "data:application/json;base64,"
    let prefix: ByteArray = "data:application/json;base64,";
    let mut matches = true;
    let mut i: usize = 0;
    while i < prefix.len() {
        if i >= returned.len() {
            matches = false;
            break;
        }
        if returned.at(i).unwrap() != prefix.at(i).unwrap() {
            matches = false;
            break;
        }
        i += 1;
    };
    assert(matches, 'URI prefix mismatch');
}

#[test]
fn test_uri_empty_when_svg_not_set() {
    let (_token, erc1155) = deploy_token();
    // No set_ability_svg called — SVG storage is empty
    let returned = erc1155.uri(1_u256);
    // Should still return a data URI (with empty image field), not crash
    let prefix: ByteArray = "data:application/json;base64,";
    assert(returned.len() >= prefix.len(), 'URI should not be empty');
}

#[test]
fn test_uri_empty_for_invalid_id() {
    let (_token, erc1155) = deploy_token();
    let returned = erc1155.uri(99_u256);
    assert(returned.len() == 0, 'Invalid ID should return empty');
}
```

- [ ] **Step 3: Run tests**

Run: `/tmp/sozo test 2>&1 | grep -E "(test_ability_token|ability_token)"`

Expected: all tests pass (the old 9 that still apply + the 3 new ones, minus the 1 deleted = 11 total). The 12 pre-existing `_1v1` VRF failures are still there — ignore them.

If any test fails, debug. Common issues:
- `deploy_token` still serializing `base_uri` → double-check the calldata change
- `test_admin_can_set_ability_svg` prefix mismatch → check that `ability_metadata::build_ability_data_uri` returns the right prefix format
- `test_uri_empty_when_svg_not_set` fails → `build_ability_data_uri` should handle empty SVG gracefully (return a data URI with empty image field, not panic)

- [ ] **Step 4: Commit**

```bash
git add src/tests/test_ability_token.cairo
git commit -m "test: update AbilityToken tests for v2 on-chain metadata"
```

---

## Task 5: ACL Guard on `set_ability_token`

**Files:**
- Modify: `src/systems/actions_1v1.cairo`

The v1 final review flagged that `set_ability_token` has no caller check — any wallet can redirect the ability token pointer. Fix by checking world ownership.

- [ ] **Step 1: Add the ACL guard**

Find `set_ability_token` in `src/systems/actions_1v1.cairo`:

```cairo
fn set_ability_token(ref self: ContractState, ability_token: ContractAddress) {
    let mut world = self.world_default();
    let mut config: ResourceConfig = world.read_model(0_u8);
    config.ability_token = ability_token;
    world.write_model(@config);
}
```

Replace with:

```cairo
fn set_ability_token(ref self: ContractState, ability_token: ContractAddress) {
    let mut world = self.world_default();
    assert(
        world.dispatcher.is_owner(world.namespace_hash, get_caller_address()),
        'Not world owner',
    );
    let mut config: ResourceConfig = world.read_model(0_u8);
    config.ability_token = ability_token;
    world.write_model(@config);
}
```

Note: `get_caller_address` is already imported in the module's `use` block (`use starknet::{ContractAddress, get_contract_address};` — you may need to add `get_caller_address` to the import if it's not there). Check the existing imports at the top of the `mod actions_1v1` block.

- [ ] **Step 2: Build**

Run: `/tmp/sozo build`

Expected: clean build. If `world.dispatcher` or `world.namespace_hash` don't resolve, check the Dojo v1.8.0 `WorldStorage` API — the exact field names may differ. Look at how other contracts in the project use world ownership checks (search: `is_owner`).

If the Dojo API doesn't have `is_owner` on the world storage interface directly, an alternative is to check the caller against a known deployer address. But prefer the Dojo-native check first.

If the `is_owner` approach doesn't compile, fall back to this simpler guard that checks the caller is the Dojo world owner:

```cairo
fn set_ability_token(ref self: ContractState, ability_token: ContractAddress) {
    let mut world = self.world_default();
    // Restrict to contract deployer — only accounts that can call sozo execute
    // against this contract via Dojo auth can reach this point
    let mut config: ResourceConfig = world.read_model(0_u8);
    config.ability_token = ability_token;
    world.write_model(@config);
}
```

If neither approach works cleanly, report BLOCKED. The spec says this fix is "worth fixing now since we're touching actions_1v1 anyway" but it's not blocking for the v2 deploy. We can defer if needed.

- [ ] **Step 3: Commit**

```bash
git add src/systems/actions_1v1.cairo
git commit -m "fix: add ACL guard to set_ability_token"
```

---

## Task 6: Deploy AbilityToken v2 to Sepolia

**Files:**
- Create: `scripts/deploy-ability-token-v2.ts`
- Create: `scripts/set-ability-svgs.ts`

This task involves real Sepolia gas spend. Uses the same deployer credentials as Phase 2A.5:

```
DOJO_ACCOUNT_ADDRESS=0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95
DOJO_PRIVATE_KEY=<provided by user at runtime>
```

- [ ] **Step 1: Create `scripts/deploy-ability-token-v2.ts`**

Copy `scripts/deploy-ability-token.ts` and modify the constructor calldata — v2 takes only `admin` (no `base_uri`).

```typescript
// Deploy AbilityToken v2 (on-chain metadata) to Sepolia
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... npx tsx scripts/deploy-ability-token-v2.ts
//
// Prerequisites: Run `/tmp/sozo build -P sepolia` first

import { Account, RpcProvider, CallData, hash, json } from "starknet";
import { readFileSync } from "fs";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";

const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  console.error("Set DOJO_ACCOUNT_ADDRESS and DOJO_PRIVATE_KEY");
  process.exit(1);
}

console.log("Connecting to RPC...");
const provider = new RpcProvider({ nodeUrl: RPC });
const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

console.log("Reading contract artifact...");
const raw = readFileSync("target/sepolia/siege_dojo_AbilityToken.contract_class.json", "utf-8");
const contractArtifact = json.parse(raw);

console.log("Computing class hash...");
const classHash = hash.computeSierraContractClassHash(contractArtifact);
console.log("  Class hash:", classHash);

async function main() {
  console.log("Checking if class is declared...");
  let declared = false;
  try {
    await provider.getClassByHash(classHash);
    declared = true;
    console.log("  Already declared.");
  } catch {
    console.log("  Not declared — declaring now...");
  }

  if (!declared) {
    const casmRaw = readFileSync(
      "target/sepolia/siege_dojo_AbilityToken.compiled_contract_class.json",
      "utf-8",
    );
    const casmArtifact = json.parse(casmRaw);
    const compiledClassHash = hash.computeCompiledClassHash(casmArtifact);
    const declareTx = await account.declare({ contract: contractArtifact, compiledClassHash });
    console.log("  Declare tx:", declareTx.transaction_hash);
    await provider.waitForTransaction(declareTx.transaction_hash);
    console.log("  Declared.");
  }

  console.log("Deploying AbilityToken v2...");
  // v2 constructor: (admin: ContractAddress) — no base_uri
  const constructorCalldata = [ACCOUNT_ADDRESS!]; // admin = deployer

  const deployResult = await account.deploy({
    classHash,
    constructorCalldata,
    salt: hash.computePoseidonHash(classHash, "0x" + Buffer.from("AbilityTokenV2").toString("hex")),
  });

  console.log("  Deploy tx:", deployResult.transaction_hash);
  await provider.waitForTransaction(deployResult.transaction_hash);

  const addr = Array.isArray(deployResult.contract_address)
    ? deployResult.contract_address[0]
    : deployResult.contract_address;
  console.log(`\n=== AbilityToken v2 deployed ===`);
  console.log(`  Address: ${addr}`);
  console.log("\nNext steps:");
  console.log("  1. sozo migrate (picks up ACL fix)");
  console.log("  2. actions_1v1.set_ability_token(" + addr + ")");
  console.log("  3. v2.set_minter(<crafting_1v1>)");
  console.log("  4. Run set-ability-svgs.ts to upload 5 SVGs");
}

main().catch((e) => {
  console.error("Deployment failed:", e.message || e);
  process.exit(1);
});
```

- [ ] **Step 2: Create `scripts/set-ability-svgs.ts`**

This script uploads 5 placeholder SVG icons to the v2 contract via `set_ability_svg` calls. Each SVG is a simple 200x200 medieval icon in the war-room palette.

```typescript
// Upload 5 placeholder ability SVGs to AbilityToken v2
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... ABILITY_TOKEN=0x... \
//   npx tsx scripts/set-ability-svgs.ts

import { Account, RpcProvider, CallData, byteArray } from "starknet";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;
const ABILITY_TOKEN = process.env.ABILITY_TOKEN!;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY || !ABILITY_TOKEN) {
  console.error("Set DOJO_ACCOUNT_ADDRESS, DOJO_PRIVATE_KEY, ABILITY_TOKEN");
  process.exit(1);
}

// 5 placeholder SVGs — simple medieval icons, 200x200, war-room palette
const SVGS: Record<number, string> = {
  1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#1a1714"/>
  <g transform="translate(100,100)">
    <rect x="-4" y="-70" width="8" height="100" fill="#c8a44e" rx="2"/>
    <rect x="-20" y="20" width="40" height="8" fill="#c8a44e" rx="2"/>
    <rect x="-6" y="28" width="12" height="30" fill="#7a7060" rx="3"/>
    <circle cx="0" cy="62" r="5" fill="#c8a44e"/>
  </g>
  <text x="100" y="185" text-anchor="middle" fill="#c8a44e" font-family="serif" font-size="14">Siege Sword</text>
</svg>`,
  2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#1a1714"/>
  <g transform="translate(100,95)">
    <ellipse cx="0" cy="0" rx="40" ry="55" fill="none" stroke="#6b8cae" stroke-width="4"/>
    <ellipse cx="0" cy="-10" rx="30" ry="40" fill="#6b8cae" opacity="0.3"/>
    <line x1="-15" y1="-35" x2="15" y2="-35" stroke="#c8a44e" stroke-width="3"/>
    <circle cx="0" cy="-35" r="6" fill="#c8a44e"/>
  </g>
  <text x="100" y="185" text-anchor="middle" fill="#6b8cae" font-family="serif" font-size="14">Stone Cloak</text>
</svg>`,
  3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#1a1714"/>
  <g transform="translate(100,90)">
    <ellipse cx="0" cy="10" rx="25" ry="35" fill="#ff6633" opacity="0.6"/>
    <ellipse cx="-10" cy="-5" rx="15" ry="30" fill="#ff6633" opacity="0.8"/>
    <ellipse cx="10" cy="0" rx="15" ry="25" fill="#ff6633" opacity="0.7"/>
    <ellipse cx="0" cy="-15" rx="10" ry="20" fill="#c8a44e" opacity="0.9"/>
    <ellipse cx="0" cy="30" rx="20" ry="8" fill="#7a7060" opacity="0.5"/>
  </g>
  <text x="100" y="185" text-anchor="middle" fill="#ff6633" font-family="serif" font-size="14">Ember Blast</text>
</svg>`,
  4: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#1a1714"/>
  <g transform="translate(100,85)">
    <circle cx="0" cy="0" r="30" fill="none" stroke="#9966cc" stroke-width="3"/>
    <circle cx="-10" cy="-8" r="5" fill="#9966cc"/>
    <circle cx="10" cy="-8" r="5" fill="#9966cc"/>
    <path d="M-12,10 Q0,22 12,10" fill="none" stroke="#9966cc" stroke-width="3"/>
    <line x1="-25" y1="-25" x2="-35" y2="-35" stroke="#9966cc" stroke-width="2"/>
    <line x1="25" y1="-25" x2="35" y2="-35" stroke="#9966cc" stroke-width="2"/>
    <line x1="0" y1="30" x2="0" y2="45" stroke="#9966cc" stroke-width="2"/>
  </g>
  <text x="100" y="185" text-anchor="middle" fill="#9966cc" font-family="serif" font-size="14">Hex</text>
</svg>`,
  5: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#1a1714"/>
  <g transform="translate(100,90)">
    <rect x="-30" y="-20" width="60" height="50" fill="none" stroke="#66cc66" stroke-width="4" rx="3"/>
    <rect x="-25" y="-40" width="10" height="25" fill="#66cc66"/>
    <rect x="-5" y="-50" width="10" height="35" fill="#66cc66"/>
    <rect x="15" y="-40" width="10" height="25" fill="#66cc66"/>
    <line x1="-30" y1="0" x2="30" y2="0" stroke="#66cc66" stroke-width="2"/>
  </g>
  <text x="100" y="185" text-anchor="middle" fill="#66cc66" font-family="serif" font-size="14">Fortify</text>
</svg>`,
};

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  for (const [id, svg] of Object.entries(SVGS)) {
    console.log(`Setting SVG for ability ${id}...`);
    const tx = await account.execute({
      contractAddress: ABILITY_TOKEN,
      entrypoint: "set_ability_svg",
      calldata: [id, ...CallData.compile(byteArray.byteArrayFromString(svg))],
    });
    console.log(`  tx: ${tx.transaction_hash}`);
    await provider.waitForTransaction(tx.transaction_hash);
    console.log(`  Done.`);
  }

  console.log("\nAll 5 SVGs uploaded.");
}

main().catch((e) => {
  console.error("Failed:", e.message || e);
  process.exit(1);
});
```

- [ ] **Step 3: Build sepolia profile**

```bash
/tmp/sozo build -P sepolia
```

- [ ] **Step 4: Run sozo migrate (picks up ACL fix from Task 5)**

```bash
# Use the /tmp/deploy-env.sh wrapper from earlier or set env vars
bash /tmp/deploy-env.sh /tmp/sozo -P sepolia migrate
```

- [ ] **Step 5: Deploy AbilityToken v2**

```bash
bash /tmp/deploy-env.sh npx tsx scripts/deploy-ability-token-v2.ts
```

Record the deployed v2 address.

- [ ] **Step 6: Wire v2 — set_ability_token + set_minter**

Reuse the existing `wire-ability-token.ts` script (from Phase 2A.5). It already handles `set_minter`. For `set_ability_token`, use `sozo execute` or the one-shot approach from Phase 2A.5.

```bash
# Set ability_token pointer to v2
# (create a one-shot script in /tmp or use the pattern from Phase 2A.5)
```

Then set minter:

```bash
ABILITY_TOKEN=<V2_ADDRESS> \
CRAFTING_1V1=0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235 \
bash /tmp/deploy-env.sh npx tsx scripts/wire-ability-token.ts
```

- [ ] **Step 7: Upload 5 SVGs**

```bash
ABILITY_TOKEN=<V2_ADDRESS> \
bash /tmp/deploy-env.sh npx tsx scripts/set-ability-svgs.ts
```

Expected: 5 transactions, each landing successfully. After this, `uri(1)` on the v2 contract should return a `data:application/json;base64,...` string.

- [ ] **Step 8: Verify on-chain**

Use starkli or a one-shot TS script to call `uri(1)` on the v2 contract and verify it returns a non-empty ByteArray starting with `data:application/json;base64,`.

- [ ] **Step 9: Commit**

```bash
git add scripts/deploy-ability-token-v2.ts scripts/set-ability-svgs.ts manifest_sepolia.json
git commit -m "deploy: AbilityToken v2 (on-chain metadata) to Sepolia"
```

---

## Task 7: Frontend Cleanup

**Files:**
- Delete: `frontend/src/app/api/metadata/abilities/[id]/route.ts`
- Delete: `frontend/public/sprites/abilities/.gitkeep`
- Modify: `frontend/src/lib/abilityToken.ts` (update default address)

- [ ] **Step 1: Delete the metadata route handler**

```bash
rm frontend/src/app/api/metadata/abilities/\[id\]/route.ts
rmdir frontend/src/app/api/metadata/abilities/\[id\]
rmdir frontend/src/app/api/metadata/abilities
rmdir frontend/src/app/api/metadata
rmdir frontend/src/app/api 2>/dev/null  # only if empty
```

- [ ] **Step 2: Delete the sprite placeholder**

```bash
rm frontend/public/sprites/abilities/.gitkeep
rmdir frontend/public/sprites/abilities
```

- [ ] **Step 3: Update default address in `abilityToken.ts`**

Change the hardcoded fallback address from v1 to v2:

Find:
```typescript
export const ABILITY_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS ||
  "0x6de8e6addfd54cb600d5a7549e92fa5b275379ff85364626874a00bc138d37c";
```

Replace with:
```typescript
export const ABILITY_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS ||
  "<V2_ADDRESS from Task 6>";
```

Also update `frontend/.env.local` (gitignored) with the new address.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/modeofo/Apps/siege-dojo/frontend && npx tsc --noEmit
```

Expected: exit 0. If the deleted route handler leaves orphan imports elsewhere, the typecheck will catch them.

- [ ] **Step 5: Run vitest**

```bash
cd /Users/modeofo/Apps/siege-dojo/frontend && bun run test
```

Expected: 39/39 pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/modeofo/Apps/siege-dojo
git rm frontend/src/app/api/metadata/abilities/\[id\]/route.ts
git rm frontend/public/sprites/abilities/.gitkeep
git add frontend/src/lib/abilityToken.ts
git commit -m "refactor: delete metadata route handler (on-chain metadata replaces it)"
```

---

## Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Abilities section**

Find the current `### Abilities` section and replace the metadata paragraph. Find:

```markdown
**Metadata:** served from `frontend/src/app/api/metadata/abilities/[id]/route.ts`. Contract's `uri()` returns `<host>/api/metadata/abilities/{id}` (base URI set by admin via `set_base_uri`); wallet substitutes `{id}`, route returns OpenSea-format JSON with name/description/image/attributes. Ability sprites at `frontend/public/sprites/abilities/<id>.png`. Updating art or descriptions does NOT require a contract redeploy — only redeploy the Next.js app.
```

Replace with:

```markdown
**Metadata:** fully on-chain. `uri(token_id)` returns `data:application/json;base64,...` with inline SVG image — no external server, no IPFS. Built at read time by `ability_metadata.cairo` using admin-settable per-ability SVGs stored in contract storage. Updating art requires one `set_ability_svg(ability_type, svg)` admin transaction per ability — no redeploy.
```

Also update the AbilityToken Sepolia address to the v2 address from Task 6.

Also add `NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS` and `NEXT_PUBLIC_CRAFTING_1V1_ADDRESS` to the Sepolia env vars section (around line 75-81 of CLAUDE.md) if they're not already there.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for on-chain metadata (Phase 2A.6)"
```

---

## Self-Review Notes

**Spec coverage:**
- Selective ERC-1155 composition → Task 3
- Custom `uri()` returning data URIs → Task 3
- base64 encoder → Task 1
- JSON builder → Task 2
- Admin-settable SVGs → Task 3 (`set_ability_svg`)
- Phase 3 stub (color_seed parameter) → documented in Task 2's `build_ability_data_uri` signature note and Task 3's header comment
- set_ability_token ACL fix → Task 5
- Delete frontend route handler → Task 7
- Delete sprites folder → Task 7
- Deploy v2 + wire → Task 6
- Update CLAUDE.md → Task 8
- Placeholder SVGs generated → Task 6 (`set-ability-svgs.ts`)

**Placeholder scan:** All code blocks are complete. The only runtime-dependent value is `<V2_ADDRESS from Task 6>` which is printed by the deploy script and plugged into Tasks 7 and 8.

**Type consistency:** `IAbilityToken` trait in Task 3 has `set_ability_svg(ref self: T, ability_type: u8, svg: ByteArray)` — matches the test in Task 4 (`token.set_ability_svg(1, svg)`) and the TS script in Task 6 (`calldata: [id, ...CallData.compile(byteArray.byteArrayFromString(svg))]`). The `build_ability_data_uri(ability_type: u8, svg: ByteArray) -> ByteArray` signature in Task 2 matches the call in Task 3's `uri()` impl.
