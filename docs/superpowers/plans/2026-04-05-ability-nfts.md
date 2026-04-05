# Ability NFTs (Phase 2A.5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `PlayerAbilities` Dojo model with an ERC-1155 `AbilityToken` contract so crafted abilities show up in the Cartridge Controller wallet with name and art. Crafting mints tokens instead of writing to a custom model; frontend reads balances from `balance_of_batch`; metadata served from a Next.js route handler.

**Architecture:** Pure Starknet ERC-1155 contract in `src/tokens/ability_token.cairo` (matches existing `ResourceToken` pattern). Token IDs 1–5 map directly to ability IDs. `crafting_1v1` Dojo contract reads the token address from `ResourceConfig` (extended with a new `ability_token` field) and calls `mint` on it. `PlayerAbilities` model is deleted. Frontend swaps Torii GraphQL query for a `balance_of_batch` contract call. Metadata route handler at `/api/metadata/abilities/[id]` reads the shared `ABILITIES` constant and returns OpenSea-format JSON.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0, `openzeppelin_token` v3.0.0, new dep `openzeppelin_introspection` v3.0.0 (for SRC5Component required by ERC1155MixinImpl), Next.js 16 App Router, Starknet.js v8.

**Spec:** `docs/superpowers/specs/2026-04-05-ability-nfts-design.md`

**Reference patterns in the repo:**
- Existing ERC-20 token: `src/tokens/resource_token.cairo`
- Existing token deploy script: `scripts/deploy-tokens.ts`
- Existing Dojo contract that calls ERC-20 dispatchers: `src/systems/crafting_1v1.cairo`
- Existing Sepolia manifest parsing: `manifest_sepolia.json` + the Python snippet used in the Phase 2A plan (Task 3, Step 3)

**Pre-existing test failures (NOT caused by this work):** 12 `_1v1` tests (`test_actions_1v1`, `test_commit_reveal_1v1`, `test_resolution_1v1`) fail with `CONTRACT_NOT_DEPLOYED` because `create_match_1v1` calls a hardcoded VRF provider that isn't in the test world. Ignore these failures — they were there before this plan started. Verify by running tests at commit `7a14415` if in doubt. New tests in this plan are pure Starknet tests that do not spawn a Dojo world, so they sidestep the VRF issue entirely.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `Scarb.toml` | Add `openzeppelin_introspection` dep for SRC5Component |
| Create | `src/tokens/ability_token.cairo` | ERC-1155 contract with admin/minter/burner roles + mutable base URI |
| Modify | `src/tokens.cairo` | Register `ability_token` module |
| Create | `src/tests/test_ability_token.cairo` | Unit tests for mint/burn auth, admin rotation, URI update |
| Modify | `src/lib.cairo` | Register test module; unregister `player_abilities` model |
| Modify | `src/models/resource_config.cairo` | Add `ability_token: ContractAddress` field |
| Modify | `src/systems/actions_1v1.cairo` | Add `set_ability_token` method; update `set_resource_config` to preserve existing `ability_token` field |
| Modify | `src/systems/crafting_1v1.cairo` | Drop `PlayerAbilities` reads/writes; call `AbilityToken.mint` instead |
| Delete | `src/models/player_abilities.cairo` | Replaced by ERC-1155 balances |
| Create | `scripts/deploy-ability-token.ts` | Declare + deploy AbilityToken instance on Sepolia |
| Modify | `manifest_sepolia.json` | Updated by `sozo migrate` |
| Create | `frontend/src/lib/abilityToken.ts` | Token address constant + `fetchAbilityBalances` helper |
| Modify | `frontend/.env.local` | Add `NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS` |
| Create | `frontend/src/app/api/metadata/abilities/[id]/route.ts` | GET handler returning OpenSea-format JSON |
| Create | `frontend/public/sprites/abilities/.gitkeep` | Sprite folder (PNGs dropped in later) |
| Modify | `frontend/src/app/craft/page.tsx` | Replace Torii GraphQL query with `fetchAbilityBalances` |
| Modify | `CLAUDE.md` | Update abilities section with NFT migration |

---

## Task 1: AbilityToken Contract

**Files:**
- Modify: `Scarb.toml`
- Create: `src/tokens/ability_token.cairo`
- Modify: `src/tokens.cairo`

- [ ] **Step 1: Add `openzeppelin_introspection` dependency to `Scarb.toml`**

`ERC1155Component::ERC1155MixinImpl` embeds `supports_interface`, which requires `SRC5Component`. SRC5 lives in a separate OZ package that we don't have as a direct dep yet.

Find the `[dependencies]` block in `Scarb.toml`:

```toml
[dependencies]
starknet = "2.13.1"
dojo = { git = "https://github.com/dojoengine/dojo.git", tag = "v1.8.0" }
openzeppelin_token = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
```

Add the new line:

```toml
[dependencies]
starknet = "2.13.1"
dojo = { git = "https://github.com/dojoengine/dojo.git", tag = "v1.8.0" }
openzeppelin_token = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
openzeppelin_introspection = { git = "https://github.com/OpenZeppelin/cairo-contracts.git", tag = "v3.0.0" }
```

- [ ] **Step 2: Create `src/tokens/ability_token.cairo`**

```cairo
// AbilityToken — ERC-1155 for crafted gameplay abilities.
//
// Token ID = ability ID (1=Siege Sword, 2=Stone Cloak, 3=Ember Blast, 4=Hex, 5=Fortify).
// Three roles:
//   - admin: can rotate minter/burner/base_uri (set at constructor, immutable)
//   - minter: can call mint (set by admin post-deploy — usually crafting_1v1)
//   - burner: can call burn (set by admin when Phase 2B ships — starts at 0x0)
//
// Standard ERC-1155 read/transfer methods (balance_of, balance_of_batch,
// safe_transfer_from, uri, etc.) come from ERC1155MixinImpl.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IAbilityToken<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
    fn burn(ref self: T, from: ContractAddress, token_id: u256, amount: u256);
    fn set_minter(ref self: T, new_minter: ContractAddress);
    fn set_burner(ref self: T, new_burner: ContractAddress);
    fn set_base_uri(ref self: T, new_uri: ByteArray);
    fn admin(self: @T) -> ContractAddress;
    fn minter(self: @T) -> ContractAddress;
    fn burner(self: @T) -> ContractAddress;
}

#[starknet::contract]
pub mod AbilityToken {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_token::erc1155::{ERC1155Component, ERC1155HooksEmptyImpl};

    component!(path: ERC1155Component, storage: erc1155, event: ERC1155Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    // ERC-1155 mixin provides balance_of, balance_of_batch, safe_transfer_from, uri, etc.
    #[abi(embed_v0)]
    impl ERC1155MixinImpl = ERC1155Component::ERC1155MixinImpl<ContractState>;
    impl ERC1155InternalImpl = ERC1155Component::InternalImpl<ContractState>;

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
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        base_uri: ByteArray,
    ) {
        self.erc1155.initializer(base_uri);
        self.admin_address.write(admin);
        // minter_address and burner_address default to 0x0.
        // Until set_minter is called, no mints will succeed.
        // Until set_burner is called, no burns will succeed (correct for Phase 2A.5).
    }

    #[abi(embed_v0)]
    impl AbilityTokenImpl of super::IAbilityToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, token_id: u256, amount: u256) {
            assert(get_caller_address() == self.minter_address.read(), 'Not minter');
            self.erc1155.mint_with_acceptance_check(to, token_id, amount, array![].span());
        }

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

        fn set_base_uri(ref self: ContractState, new_uri: ByteArray) {
            assert(get_caller_address() == self.admin_address.read(), 'Not admin');
            self.erc1155._set_base_uri(new_uri);
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

- [ ] **Step 3: Register the module in `src/tokens.cairo`**

Current content:

```cairo
pub mod resource_token;
```

Change to:

```cairo
pub mod resource_token;
pub mod ability_token;
```

- [ ] **Step 4: Build to verify everything compiles**

Run: `/tmp/sozo build`

Expected: `Finished 'dev' profile target(s) in <N> seconds` with no errors. If you see import errors for `openzeppelin_introspection`, the Scarb.toml change in Step 1 wasn't applied correctly.

- [ ] **Step 5: Commit**

```bash
git add Scarb.toml Scarb.lock src/tokens.cairo src/tokens/ability_token.cairo
git commit -m "feat: add AbilityToken ERC-1155 contract"
```

---

## Task 2: AbilityToken Unit Tests

**Files:**
- Create: `src/tests/test_ability_token.cairo`
- Modify: `src/lib.cairo`

These are pure Starknet tests — they do NOT use `spawn_test_world` or any Dojo test utilities. They deploy the `AbilityToken` contract directly via `deploy_syscall` and exercise the external methods. This sidesteps the pre-existing VRF test-infra issue that breaks the 12 `_1v1` tests.

- [ ] **Step 1: Create `src/tests/test_ability_token.cairo`**

```cairo
#[cfg(test)]
mod tests {
    use starknet::{ContractAddress, contract_address_const};
    use starknet::syscalls::deploy_syscall;
    use starknet::SyscallResultTrait;
    use core::result::ResultTrait;
    use core::serde::Serde;
    use siege_dojo::tokens::ability_token::{
        AbilityToken,
        IAbilityTokenDispatcher,
        IAbilityTokenDispatcherTrait,
    };
    use openzeppelin_token::erc1155::interface::{
        IERC1155Dispatcher,
        IERC1155DispatcherTrait,
    };

    const ADMIN: felt252 = 0xADAD;
    const MINTER: felt252 = 0xB0B;
    const BURNER: felt252 = 0xC0DE;
    const USER: felt252 = 0x1234;

    fn deploy_token() -> (IAbilityTokenDispatcher, IERC1155Dispatcher) {
        let admin: ContractAddress = ADMIN.try_into().unwrap();
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let base_uri: ByteArray = "https://example.test/{id}";
        base_uri.serialize(ref calldata);

        let (addr, _) = deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(),
            0,
            calldata.span(),
            false,
        )
            .unwrap_syscall();

        (
            IAbilityTokenDispatcher { contract_address: addr },
            IERC1155Dispatcher { contract_address: addr },
        )
    }

    fn set_caller(addr: felt252) {
        starknet::testing::set_contract_address(addr.try_into().unwrap());
    }

    #[test]
    fn test_admin_is_set_at_deploy() {
        let (token, _) = deploy_token();
        let admin: ContractAddress = ADMIN.try_into().unwrap();
        assert(token.admin() == admin, 'Admin mismatch');
    }

    #[test]
    fn test_minter_and_burner_default_to_zero() {
        let (token, _) = deploy_token();
        let zero: ContractAddress = 0.try_into().unwrap();
        assert(token.minter() == zero, 'Minter should be zero');
        assert(token.burner() == zero, 'Burner should be zero');
    }

    #[test]
    fn test_admin_can_set_minter() {
        let (token, _) = deploy_token();
        set_caller(ADMIN);
        let new_minter: ContractAddress = MINTER.try_into().unwrap();
        token.set_minter(new_minter);
        assert(token.minter() == new_minter, 'Minter not updated');
    }

    #[test]
    #[should_panic(expected: ('Not admin',))]
    fn test_non_admin_cannot_set_minter() {
        let (token, _) = deploy_token();
        set_caller(USER); // USER is not admin
        let new_minter: ContractAddress = MINTER.try_into().unwrap();
        token.set_minter(new_minter);
    }

    #[test]
    fn test_authorized_minter_can_mint() {
        let (token, erc1155) = deploy_token();
        set_caller(ADMIN);
        token.set_minter(MINTER.try_into().unwrap());

        set_caller(MINTER);
        let user: ContractAddress = USER.try_into().unwrap();
        token.mint(user, 1_u256, 1_u256);

        assert(erc1155.balance_of(user, 1_u256) == 1_u256, 'Balance mismatch');
    }

    #[test]
    #[should_panic(expected: ('Not minter',))]
    fn test_unauthorized_minter_cannot_mint() {
        let (token, _) = deploy_token();
        // No set_minter call — minter is still 0x0
        set_caller(MINTER);
        let user: ContractAddress = USER.try_into().unwrap();
        token.mint(user, 1_u256, 1_u256);
    }

    #[test]
    fn test_token_ids_isolated() {
        let (token, erc1155) = deploy_token();
        set_caller(ADMIN);
        token.set_minter(MINTER.try_into().unwrap());

        set_caller(MINTER);
        let user: ContractAddress = USER.try_into().unwrap();
        token.mint(user, 1_u256, 3_u256);
        token.mint(user, 2_u256, 5_u256);

        assert(erc1155.balance_of(user, 1_u256) == 3_u256, 'ID 1 balance wrong');
        assert(erc1155.balance_of(user, 2_u256) == 5_u256, 'ID 2 balance wrong');
        assert(erc1155.balance_of(user, 3_u256) == 0_u256, 'ID 3 should be 0');
    }

    #[test]
    #[should_panic(expected: ('Not burner',))]
    fn test_burn_blocked_when_burner_unset() {
        let (token, _) = deploy_token();
        set_caller(ADMIN);
        token.set_minter(MINTER.try_into().unwrap());

        set_caller(MINTER);
        let user: ContractAddress = USER.try_into().unwrap();
        token.mint(user, 1_u256, 1_u256);

        // Burner is still 0x0, nobody can burn
        set_caller(BURNER);
        token.burn(user, 1_u256, 1_u256);
    }

    #[test]
    fn test_authorized_burner_can_burn() {
        let (token, erc1155) = deploy_token();
        set_caller(ADMIN);
        token.set_minter(MINTER.try_into().unwrap());
        token.set_burner(BURNER.try_into().unwrap());

        set_caller(MINTER);
        let user: ContractAddress = USER.try_into().unwrap();
        token.mint(user, 1_u256, 2_u256);

        set_caller(BURNER);
        token.burn(user, 1_u256, 1_u256);

        assert(erc1155.balance_of(user, 1_u256) == 1_u256, 'Burn didn''t decrement');
    }

    #[test]
    fn test_admin_can_update_base_uri() {
        let (token, erc1155) = deploy_token();
        set_caller(ADMIN);
        let new_uri: ByteArray = "https://other.test/{id}";
        token.set_base_uri(new_uri);
        // uri(1) should now return the new base URI string verbatim.
        let returned = erc1155.uri(1_u256);
        assert(returned == "https://other.test/{id}", 'URI not updated');
    }
}
```

- [ ] **Step 2: Register test module in `src/lib.cairo`**

Current test block:

```cairo
#[cfg(test)]
pub mod tests {
    pub mod test_actions;
    pub mod test_actions_1v1;
    pub mod test_commit_reveal;
    pub mod test_commit_reveal_1v1;
    pub mod test_resolution;
    pub mod test_resolution_1v1;
    pub mod test_modifiers_1v1;
    pub mod test_traps_1v1;
    pub mod test_events;
}
```

Add the new line:

```cairo
#[cfg(test)]
pub mod tests {
    pub mod test_actions;
    pub mod test_actions_1v1;
    pub mod test_commit_reveal;
    pub mod test_commit_reveal_1v1;
    pub mod test_resolution;
    pub mod test_resolution_1v1;
    pub mod test_modifiers_1v1;
    pub mod test_traps_1v1;
    pub mod test_events;
    pub mod test_ability_token;
}
```

- [ ] **Step 3: Run the new tests**

Run: `/tmp/sozo test 2>&1 | grep -E "(test_ability_token|ability_token)"`

Expected: all 9 new tests in `test_ability_token` show `ok`. The 12 pre-existing `_1v1` failures will still be there in the broader output — ignore them, they are not yours to fix in this plan.

If any `test_ability_token` test fails, debug before continuing. Common issues:
- `AbilityToken::TEST_CLASS_HASH` missing → the contract module declaration might be wrong
- `IAbilityTokenDispatcher` not found → re-check the `use` path matches `src/tokens/ability_token.cairo`'s interface location
- `'Not admin'` panics where not expected → check that `set_caller` is called before every method

- [ ] **Step 4: Commit**

```bash
git add src/tests/test_ability_token.cairo src/lib.cairo
git commit -m "test: AbilityToken unit tests (mint/burn auth, URI update)"
```

---

## Task 3: Extend ResourceConfig + actions_1v1

**Files:**
- Modify: `src/models/resource_config.cairo`
- Modify: `src/systems/actions_1v1.cairo`

The crafting contract needs to know the AbilityToken address. Storing it on the existing `ResourceConfig` model keeps all token addresses in one place.

- [ ] **Step 1: Add `ability_token` field to `ResourceConfig`**

Current content of `src/models/resource_config.cairo`:

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct ResourceConfig {
    #[key]
    pub id: u8, // always 0
    pub iron: ContractAddress,
    pub linen: ContractAddress,
    pub stone: ContractAddress,
    pub wood: ContractAddress,
    pub ember: ContractAddress,
    pub seeds: ContractAddress,
}
```

Replace with:

```cairo
use starknet::ContractAddress;

#[dojo::model]
#[derive(Drop, Serde)]
pub struct ResourceConfig {
    #[key]
    pub id: u8, // always 0
    pub iron: ContractAddress,
    pub linen: ContractAddress,
    pub stone: ContractAddress,
    pub wood: ContractAddress,
    pub ember: ContractAddress,
    pub seeds: ContractAddress,
    pub ability_token: ContractAddress,
}
```

- [ ] **Step 2: Add `set_ability_token` method to `actions_1v1`**

Open `src/systems/actions_1v1.cairo`. Find the `IActions1v1` trait block near the top of the file. Add a new method to the trait:

```cairo
#[starknet::interface]
pub trait IActions1v1<T> {
    fn create_match_1v1(
        ref self: T,
        player_a: ContractAddress,
        player_b: ContractAddress,
    ) -> u64;
    fn get_budget_1v1(self: @T, match_id: u64, is_player_a: bool) -> u8;
    fn set_resource_config(
        ref self: T,
        iron: ContractAddress, linen: ContractAddress,
        stone: ContractAddress, wood: ContractAddress,
        ember: ContractAddress, seeds: ContractAddress,
    );
    fn set_ability_token(ref self: T, ability_token: ContractAddress);
}
```

Now find the existing `set_resource_config` implementation inside the `#[abi(embed_v0)] impl Actions1v1Impl` block. You need to:

1. Update `set_resource_config` to preserve the existing `ability_token` value when rewriting the config (so calling it doesn't wipe a previously-set ability_token)
2. Add a new `set_ability_token` method that reads the existing config and updates just the one field

The existing `set_resource_config` likely looks like this (verify by reading the file):

```cairo
fn set_resource_config(
    ref self: ContractState,
    iron: ContractAddress, linen: ContractAddress,
    stone: ContractAddress, wood: ContractAddress,
    ember: ContractAddress, seeds: ContractAddress,
) {
    let mut world = self.world_default();
    world.write_model(@ResourceConfig {
        id: 0,
        iron, linen, stone, wood, ember, seeds,
    });
}
```

Replace it with:

```cairo
fn set_resource_config(
    ref self: ContractState,
    iron: ContractAddress, linen: ContractAddress,
    stone: ContractAddress, wood: ContractAddress,
    ember: ContractAddress, seeds: ContractAddress,
) {
    let mut world = self.world_default();
    // Preserve an already-set ability_token so this method stays single-purpose
    let existing: ResourceConfig = world.read_model(0_u8);
    world.write_model(@ResourceConfig {
        id: 0,
        iron, linen, stone, wood, ember, seeds,
        ability_token: existing.ability_token,
    });
}

fn set_ability_token(ref self: ContractState, ability_token: ContractAddress) {
    let mut world = self.world_default();
    let mut config: ResourceConfig = world.read_model(0_u8);
    config.ability_token = ability_token;
    world.write_model(@config);
}
```

- [ ] **Step 3: Build to verify**

Run: `/tmp/sozo build`

Expected: clean build. If the `ResourceConfig` struct literal in `set_resource_config` doesn't include `ability_token`, you'll see a missing-field compile error — re-check Step 2.

- [ ] **Step 4: Commit**

```bash
git add src/models/resource_config.cairo src/systems/actions_1v1.cairo
git commit -m "feat: extend ResourceConfig with ability_token + add set_ability_token"
```

---

## Task 4: Rewire crafting_1v1 + Drop PlayerAbilities

**Files:**
- Modify: `src/systems/crafting_1v1.cairo`
- Delete: `src/models/player_abilities.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Replace the full contents of `src/systems/crafting_1v1.cairo`**

```cairo
use starknet::ContractAddress;

#[starknet::interface]
pub trait ICrafting1v1<T> {
    fn craft_ability(ref self: T, ability_id: u8);
}

#[starknet::interface]
pub trait IERC20Transfer<T> {
    fn transfer_from(
        ref self: T,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
}

#[starknet::interface]
pub trait IAbilityTokenMint<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
}

#[dojo::contract]
pub mod crafting_1v1 {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use siege_dojo::models::resource_config::ResourceConfig;
    use super::{IERC20TransferDispatcher, IERC20TransferDispatcherTrait};
    use super::{IAbilityTokenMintDispatcher, IAbilityTokenMintDispatcherTrait};

    // Burn sink for ERC-20 resource tokens — tokens sent here are effectively burned.
    const BURN_ADDRESS: felt252 = 0x1;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn burn_tokens(token_addr: ContractAddress, from: ContractAddress, amount: u256) {
        let mut token = IERC20TransferDispatcher { contract_address: token_addr };
        let balance = token.balance_of(from);
        assert(balance >= amount, 'Insufficient balance');
        let burn_addr: ContractAddress = BURN_ADDRESS.try_into().unwrap();
        token.transfer_from(from, burn_addr, amount);
    }

    #[abi(embed_v0)]
    impl Crafting1v1Impl of super::ICrafting1v1<ContractState> {
        fn craft_ability(ref self: ContractState, ability_id: u8) {
            let world = self.world_default();
            let caller = get_caller_address();

            // Read resource config for token addresses (single row keyed by id=0)
            let config: ResourceConfig = world.read_model(0_u8);

            // Burn resources based on ability recipe
            if ability_id == 1 {
                // Siege Sword: 3 Iron + 2 Wood
                burn_tokens(config.iron, caller, 3);
                burn_tokens(config.wood, caller, 2);
            } else if ability_id == 2 {
                // Stone Cloak: 3 Stone + 2 Linen
                burn_tokens(config.stone, caller, 3);
                burn_tokens(config.linen, caller, 2);
            } else if ability_id == 3 {
                // Ember Blast: 3 Ember + 2 Seeds
                burn_tokens(config.ember, caller, 3);
                burn_tokens(config.seeds, caller, 2);
            } else if ability_id == 4 {
                // Hex: 2 Iron + 2 Stone + 1 Ember
                burn_tokens(config.iron, caller, 2);
                burn_tokens(config.stone, caller, 2);
                burn_tokens(config.ember, caller, 1);
            } else if ability_id == 5 {
                // Fortify: 2 Stone + 2 Linen + 1 Wood
                burn_tokens(config.stone, caller, 2);
                burn_tokens(config.linen, caller, 2);
                burn_tokens(config.wood, caller, 1);
            } else {
                panic!("Invalid ability ID");
            }

            // Mint the ERC-1155 ability token (token_id == ability_id)
            let ability_token = IAbilityTokenMintDispatcher {
                contract_address: config.ability_token,
            };
            ability_token.mint(caller, ability_id.into(), 1_u256);
        }
    }
}
```

Note: `world` is now declared with `let world` (not `let mut world`) because we no longer write to the Dojo model — we only read the config. Don't forget that change.

- [ ] **Step 2: Delete `src/models/player_abilities.cairo`**

Run: `rm src/models/player_abilities.cairo`

- [ ] **Step 3: Remove `player_abilities` from `src/lib.cairo`**

Find in `src/lib.cairo`:

```cairo
    pub mod events;
    pub mod resource_config;
    pub mod player_abilities;
}
```

Change to:

```cairo
    pub mod events;
    pub mod resource_config;
}
```

- [ ] **Step 4: Build to verify**

Run: `/tmp/sozo build`

Expected: clean build. If you see errors about `PlayerAbilities` still being referenced, search for it:

```bash
grep -r "PlayerAbilities\|player_abilities" src/
```

Should return zero matches after this task.

- [ ] **Step 5: Commit**

```bash
git add src/systems/crafting_1v1.cairo src/lib.cairo
git rm src/models/player_abilities.cairo
git commit -m "refactor: crafting_1v1 mints ERC-1155; drop PlayerAbilities model"
```

---

## Task 5: Deploy AbilityToken to Sepolia

**Files:**
- Create: `scripts/deploy-ability-token.ts`

This task involves real Sepolia gas spend. The deployer account credentials should already be available as env vars from the Phase 2A deployment:

```bash
export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="<provided by user at runtime>"
```

- [ ] **Step 1: Create `scripts/deploy-ability-token.ts`**

Adapted from the existing `scripts/deploy-tokens.ts` (which does ERC-20 tokens). This version declares the class, deploys a single instance with `(admin=deployer, base_uri="")`, and prints the address. The minter and base URI will be wired in Task 6.

```typescript
// Deploy AbilityToken ERC-1155 contract to Sepolia
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... npx tsx scripts/deploy-ability-token.ts
//
// Prerequisites: Run `/tmp/sozo build -P sepolia` first

import { Account, RpcProvider, CallData, hash, json, byteArray } from "starknet";
import { readFileSync } from "fs";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";

const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  console.error("Set DOJO_ACCOUNT_ADDRESS and DOJO_PRIVATE_KEY");
  process.exit(1);
}

console.log("Step 1: Connecting to RPC...");
console.log("  RPC:", RPC);
console.log("  Account:", ACCOUNT_ADDRESS);
const provider = new RpcProvider({ nodeUrl: RPC });
const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });
console.log("  Connected.");

console.log("Step 2: Reading contract artifact...");
const raw = readFileSync("target/sepolia/siege_dojo_AbilityToken.contract_class.json", "utf-8");
console.log("  File read, size:", raw.length, "bytes");
const contractArtifact = json.parse(raw);
console.log("  Parsed.");

console.log("Step 3: Computing class hash...");
const classHash = hash.computeSierraContractClassHash(contractArtifact);
console.log("  Class hash:", classHash);

async function main() {
  console.log("\nChecking if class is declared...");
  let declared = false;
  try {
    await provider.getClassByHash(classHash);
    declared = true;
    console.log("  Class already declared on-chain.");
  } catch {
    console.log("  Class NOT declared — declaring now...");
  }

  if (!declared) {
    // Read the CASM artifact for declare (needed for compiled_class_hash)
    const casmRaw = readFileSync(
      "target/sepolia/siege_dojo_AbilityToken.compiled_contract_class.json",
      "utf-8",
    );
    const casmArtifact = json.parse(casmRaw);
    const compiledClassHash = hash.computeCompiledClassHash(casmArtifact);
    console.log("  Compiled class hash:", compiledClassHash);

    const declareTx = await account.declare({
      contract: contractArtifact,
      compiledClassHash,
    });
    console.log("  Declare tx:", declareTx.transaction_hash);
    await provider.waitForTransaction(declareTx.transaction_hash);
    console.log("  Declared.");
  }

  console.log("\nDeploying AbilityToken instance...");
  // Constructor: (admin: ContractAddress, base_uri: ByteArray)
  const constructorCalldata = [
    ACCOUNT_ADDRESS, // admin = deployer
    ...CallData.compile(byteArray.byteArrayFromString("")), // base_uri starts empty
  ];

  const deployResult = await account.deploy({
    classHash,
    constructorCalldata,
    salt: hash.computePoseidonHash(classHash, "0x" + Buffer.from("AbilityToken").toString("hex")),
  });

  console.log("  Deploy tx:", deployResult.transaction_hash);
  await provider.waitForTransaction(deployResult.transaction_hash);

  const addr = Array.isArray(deployResult.contract_address)
    ? deployResult.contract_address[0]
    : deployResult.contract_address;
  console.log(`\n=== AbilityToken deployed ===`);
  console.log(`  Address: ${addr}`);
  console.log("\nNext steps (Task 6):");
  console.log("  1. Run sozo migrate to pick up rewired crafting_1v1");
  console.log("  2. Call actions_1v1.set_ability_token(" + addr + ")");
  console.log("  3. Call ability_token.set_minter(<crafting_1v1_address>)");
  console.log("  4. Call ability_token.set_base_uri('https://<YOUR_HOST>/api/metadata/abilities/{id}')");
}

main().catch((e) => {
  console.error("\nDeployment failed:", e.message || e);
  process.exit(1);
});
```

- [ ] **Step 2: Build for sepolia profile**

```bash
export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="<user-provided>"
/tmp/sozo build -P sepolia
```

Expected: clean build. Produces `target/sepolia/siege_dojo_AbilityToken.contract_class.json` (and the `.compiled_contract_class.json` sibling) alongside the existing `siege_dojo_ResourceToken.*` artifacts.

- [ ] **Step 3: Run the deploy script**

```bash
npx tsx scripts/deploy-ability-token.ts
```

Expected output ends with `=== AbilityToken deployed === Address: 0x...`. **Record that address.** You will need it in Task 6 and in Task 7 as the frontend env var.

If declare fails with `ClassHashAlreadyDeclared`, the script handles that gracefully — the deploy phase will still run.

- [ ] **Step 4: Run sozo migrate to pick up the rewired crafting_1v1 and extended ResourceConfig**

```bash
/tmp/sozo -P sepolia migrate
```

Expected output: `Migration successful with world at address 0x07ba32eaaa2a25145ea713e17ad1f42dc7f9f08355a2fd058a9a875e609fa8c0`.

The migrate will:
- Upgrade the `ResourceConfig` model (new `ability_token` field)
- Upgrade the `crafting_1v1` contract (mints ERC-1155 instead of writing to `PlayerAbilities`)
- Orphan the `PlayerAbilities` model (it's no longer in `lib.cairo` but still exists on-chain from the Phase 2A deploy — harmless, never queried again)
- Upgrade `actions_1v1` (new `set_ability_token` method)

- [ ] **Step 5: Grant writer permission to crafting_1v1 (if the resource hash changed)**

```bash
/tmp/sozo -P sepolia auth grant writer "siege_dojo,siege_dojo-crafting_1v1" --rpc-url https://api.cartridge.gg/x/starknet/sepolia
```

Expected: `Transaction hash: 0x...`. If you get a "permission already granted" message, that's also fine.

- [ ] **Step 6: Commit the updated manifest**

```bash
git add manifest_sepolia.json scripts/deploy-ability-token.ts
git commit -m "deploy: AbilityToken ERC-1155 to Sepolia + crafting_1v1 rewire"
```

---

## Task 6: Wire on Sepolia

**Files:** None. This task is a series of one-shot admin transactions.

Substitute `<ABILITY_TOKEN_ADDRESS>` with the address from Task 5, Step 3.

You will also need the `crafting_1v1` contract address from the updated `manifest_sepolia.json`. Extract it:

```bash
python3 -c "
import json
with open('manifest_sepolia.json') as f:
    data = json.load(f)
for c in data.get('contracts', []):
    if 'crafting' in c.get('tag', ''):
        print(f\"{c['tag']}: {c['address']}\")
"
```

Record that as `<CRAFTING_1V1_ADDRESS>`.

- [ ] **Step 1: Wire the token into the world**

Call `actions_1v1.set_ability_token(<ABILITY_TOKEN_ADDRESS>)`:

```bash
export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="<user-provided>"

/tmp/sozo -P sepolia execute siege_dojo-actions_1v1 set_ability_token -c <ABILITY_TOKEN_ADDRESS>
```

Expected: `Transaction hash: 0x...` followed by inclusion.

- [ ] **Step 2: Authorize crafting_1v1 as the ability token minter**

The `AbilityToken` is NOT a Dojo contract, so `sozo execute` doesn't work directly. Use `starkli` or a small ad-hoc script. The simplest path is a one-line starknet.js call — create `scripts/wire-ability-token.ts`:

```typescript
// One-shot wire script: set_minter + set_base_uri on AbilityToken
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... \
//   ABILITY_TOKEN=0x... CRAFTING_1V1=0x... BASE_URI=https://... \
//   npx tsx scripts/wire-ability-token.ts

import { Account, RpcProvider, CallData, byteArray } from "starknet";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;
const ABILITY_TOKEN = process.env.ABILITY_TOKEN!;
const CRAFTING_1V1 = process.env.CRAFTING_1V1!;
const BASE_URI = process.env.BASE_URI!;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY || !ABILITY_TOKEN || !CRAFTING_1V1 || !BASE_URI) {
  console.error("Missing required env vars: DOJO_ACCOUNT_ADDRESS, DOJO_PRIVATE_KEY, ABILITY_TOKEN, CRAFTING_1V1, BASE_URI");
  process.exit(1);
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  console.log("Setting minter on AbilityToken...");
  const setMinterTx = await account.execute({
    contractAddress: ABILITY_TOKEN,
    entrypoint: "set_minter",
    calldata: [CRAFTING_1V1],
  });
  console.log("  tx:", setMinterTx.transaction_hash);
  await provider.waitForTransaction(setMinterTx.transaction_hash);
  console.log("  Done.");

  console.log("Setting base URI on AbilityToken...");
  const setUriTx = await account.execute({
    contractAddress: ABILITY_TOKEN,
    entrypoint: "set_base_uri",
    calldata: CallData.compile(byteArray.byteArrayFromString(BASE_URI)),
  });
  console.log("  tx:", setUriTx.transaction_hash);
  await provider.waitForTransaction(setUriTx.transaction_hash);
  console.log("  Done.");

  console.log("\nWired successfully.");
  console.log("  Minter:", CRAFTING_1V1);
  console.log("  Base URI:", BASE_URI);
}

main().catch((e) => {
  console.error("Wiring failed:", e.message || e);
  process.exit(1);
});
```

Then run:

```bash
ABILITY_TOKEN=<ABILITY_TOKEN_ADDRESS> \
CRAFTING_1V1=<CRAFTING_1V1_ADDRESS> \
BASE_URI="https://<YOUR_HOST>/api/metadata/abilities/{id}" \
npx tsx scripts/wire-ability-token.ts
```

Substitute `<YOUR_HOST>` with the actual production frontend URL (e.g. `siege-dojo.vercel.app` or whatever your deployed host is). If you don't have a production URL yet, use `http://localhost:3000` temporarily — it won't work for the Cartridge wallet indexer but crafting/reading balances will work end-to-end.

Expected: two transaction hashes printed, both landing successfully.

- [ ] **Step 3: Verify wiring via a read call**

```bash
starkli call <ABILITY_TOKEN_ADDRESS> minter --rpc https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8
```

Expected: returns `<CRAFTING_1V1_ADDRESS>` (with zero-padding). If it returns `0x0`, the `set_minter` transaction didn't take effect.

```bash
starkli call <ABILITY_TOKEN_ADDRESS> uri u256:1 --rpc https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_8
```

Expected: returns a ByteArray encoding your base URI string.

- [ ] **Step 4: Commit the new wire script**

```bash
git add scripts/wire-ability-token.ts
git commit -m "chore: add wire-ability-token script for minter + base URI"
```

---

## Task 7: Frontend — AbilityToken Helper

**Files:**
- Create: `frontend/src/lib/abilityToken.ts`
- Modify: `frontend/.env.local` (gitignored)

- [ ] **Step 1: Create `frontend/src/lib/abilityToken.ts`**

```typescript
// abilityToken.ts — wrappers for reading ERC-1155 ability balances
import type { RpcProvider } from "starknet";

// Deployed ability token address — override via NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS
export const ABILITY_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS ||
  "0xTODO_AFTER_DEPLOY"; // replace with the Task 5 Step 3 address after deployment

export type AbilityInventory = {
  siege_sword: number;
  stone_cloak: number;
  ember_blast: number;
  hex: number;
  fortify: number;
};

export const EMPTY_ABILITY_INVENTORY: AbilityInventory = {
  siege_sword: 0,
  stone_cloak: 0,
  ember_blast: 0,
  hex: 0,
  fortify: 0,
};

// Token ID → inventory field name. Order matches ability IDs 1..5.
const ABILITY_FIELD_BY_ID: (keyof AbilityInventory)[] = [
  "siege_sword", // id 1
  "stone_cloak", // id 2
  "ember_blast", // id 3
  "hex",         // id 4
  "fortify",     // id 5
];

/**
 * Fetch all 5 ability balances for a player via balance_of_batch.
 *
 * Calldata layout for `balance_of_batch(accounts: Array<ContractAddress>, token_ids: Array<u256>)`:
 *   [accounts_len, ...accounts, token_ids_len, ...token_ids_flat_u256]
 * where each u256 is two felts (low, high).
 */
export async function fetchAbilityBalances(
  provider: RpcProvider,
  playerAddress: string,
): Promise<AbilityInventory> {
  try {
    // Build calldata: 5 accounts (all the same player), 5 token ids (1..5)
    const accountsLen = "5";
    const accountRepeats = [playerAddress, playerAddress, playerAddress, playerAddress, playerAddress];
    const tokenIdsLen = "5";
    // Each u256 is two felts: (low, high). All IDs fit in low.
    const tokenIds = ["1", "0", "2", "0", "3", "0", "4", "0", "5", "0"];

    const result = await provider.callContract({
      contractAddress: ABILITY_TOKEN_ADDRESS,
      entrypoint: "balance_of_batch",
      calldata: [accountsLen, ...accountRepeats, tokenIdsLen, ...tokenIds],
    });

    // Result layout: [array_len, balance1_low, balance1_high, balance2_low, balance2_high, ...]
    // We expect array_len == 5
    if (result.length < 11) {
      return EMPTY_ABILITY_INVENTORY;
    }

    const inventory: AbilityInventory = { ...EMPTY_ABILITY_INVENTORY };
    for (let i = 0; i < 5; i++) {
      const lowFelt = result[1 + i * 2];
      // values are small — just use the low felt
      const count = Number(BigInt(lowFelt || 0));
      const field = ABILITY_FIELD_BY_ID[i];
      inventory[field] = count;
    }
    return inventory;
  } catch {
    return EMPTY_ABILITY_INVENTORY;
  }
}
```

- [ ] **Step 2: Add env var to `frontend/.env.local`**

This file is gitignored. Append one line:

```
NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS=<ABILITY_TOKEN_ADDRESS from Task 5 Step 3>
```

Also, after Task 5 is complete, update the default fallback in `frontend/src/lib/abilityToken.ts`:

```typescript
export const ABILITY_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_ABILITY_TOKEN_ADDRESS ||
  "0x<actual_deployed_address>";
```

This matches the pattern used by `CRAFTING_1V1_ADDRESS` in `craftingContracts.ts` — hardcoded default for when the env var is missing (e.g. in CI).

- [ ] **Step 3: Typecheck**

```bash
cd /Users/modeofo/Apps/siege-dojo/frontend && npx tsc --noEmit
```

Expected: exit 0 with no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/modeofo/Apps/siege-dojo
git add frontend/src/lib/abilityToken.ts
git commit -m "feat: add abilityToken.ts helper for balance_of_batch"
```

---

## Task 8: Frontend — Metadata Route Handler

**Files:**
- Create: `frontend/src/app/api/metadata/abilities/[id]/route.ts`
- Create: `frontend/public/sprites/abilities/.gitkeep`

- [ ] **Step 1: Create the sprite directory with a `.gitkeep`**

Run:

```bash
mkdir -p frontend/public/sprites/abilities && touch frontend/public/sprites/abilities/.gitkeep
```

The `.gitkeep` ensures the empty folder is committed. Actual sprite PNGs (`1.png` through `5.png`) will be dropped here later as you make them — no code change needed when they land.

- [ ] **Step 2: Create `frontend/src/app/api/metadata/abilities/[id]/route.ts`**

```typescript
// Metadata route handler for ERC-1155 ability tokens.
//
// Called by the Cartridge wallet when it fetches `uri(token_id)` from the AbilityToken
// contract and substitutes {id} with the actual token ID. Returns OpenSea-format JSON
// with name, description, image, and attributes.
//
// The route parses the ID as either decimal or hex (wallets vary). It reads the
// shared ABILITIES constant from craftingContracts.ts so this file never drifts
// from the on-chain ability list.
//
// Images live at /sprites/abilities/<id>.png. If the PNG doesn't exist yet, the
// wallet renders a broken image icon — acceptable for testnet.

import { NextResponse } from "next/server";
import { ABILITIES } from "@/lib/craftingContracts";

// Parse an ID that may come in as "1", "0x1", "0x0…01" (64-char padded), etc.
function parseTokenId(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  try {
    const asBigInt = cleaned.startsWith("0x") ? BigInt(cleaned) : BigInt(cleaned);
    // ERC-1155 IDs can technically be up to 2^256, but ours are 1..5
    if (asBigInt < 0n || asBigInt > 2147483647n) return null;
    return Number(asBigInt);
  } catch {
    return null;
  }
}

function costToString(cost: Record<string, number>): string {
  return Object.entries(cost)
    .map(([resource, amount]) => `${amount} ${resource.charAt(0).toUpperCase() + resource.slice(1)}`)
    .join(" + ");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = parseTokenId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid token id" }, { status: 400 });
  }

  const ability = ABILITIES.find((a) => a.id === id);
  if (!ability) {
    return NextResponse.json({ error: "Unknown ability" }, { status: 404 });
  }

  // Derive host from the request URL so the route works in dev and prod
  // without hardcoded hostnames.
  const { origin } = new URL(request.url);

  const metadata = {
    name: ability.name,
    description: ability.effect,
    image: `${origin}/sprites/abilities/${id}.png`,
    attributes: [
      { trait_type: "Cost", value: costToString(ability.cost as Record<string, number>) },
      { trait_type: "Phase", value: "2B" },
    ],
  };

  return NextResponse.json(metadata, {
    headers: {
      // Short cache so art/description updates propagate reasonably fast
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/modeofo/Apps/siege-dojo/frontend && npx tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 4: Test the route manually in dev**

Start the dev server (if not already running):

```bash
cd /Users/modeofo/Apps/siege-dojo/frontend && npm run dev
```

In another shell:

```bash
curl http://localhost:3000/api/metadata/abilities/1 | python3 -m json.tool
curl http://localhost:3000/api/metadata/abilities/5 | python3 -m json.tool
curl -i http://localhost:3000/api/metadata/abilities/99
```

Expected:
- ID 1 returns `{ "name": "Siege Sword", "description": "Max damage (10) to one gate for 1 round", "image": "http://localhost:3000/sprites/abilities/1.png", "attributes": [...] }`
- ID 5 returns Fortify JSON
- ID 99 returns HTTP 404 with `{ "error": "Unknown ability" }`

- [ ] **Step 5: Commit**

```bash
cd /Users/modeofo/Apps/siege-dojo
git add frontend/src/app/api/metadata/abilities/[id]/route.ts frontend/public/sprites/abilities/.gitkeep
git commit -m "feat: add ability metadata route handler"
```

---

## Task 9: Frontend — Rewire /craft Page

**Files:**
- Modify: `frontend/src/app/craft/page.tsx`

The craft page currently reads ability inventory via a Torii GraphQL query on the `PlayerAbilities` model. That model is gone. Replace the query with a `balance_of_batch` call through the helper from Task 7.

- [ ] **Step 1: Replace the inventory-fetching code in `frontend/src/app/craft/page.tsx`**

Open the file. Find the imports block near the top. Add this import alongside the others:

```typescript
import { fetchAbilityBalances, EMPTY_ABILITY_INVENTORY, type AbilityInventory } from "@/lib/abilityToken";
```

Find and DELETE this block (the old Torii-backed inventory fetch):

```typescript
type AbilityInventory = {
  siege_sword: number;
  stone_cloak: number;
  ember_blast: number;
  hex: number;
  fortify: number;
};

const EMPTY_INVENTORY: AbilityInventory = {
  siege_sword: 0,
  stone_cloak: 0,
  ember_blast: 0,
  hex: 0,
  fortify: 0,
};
```

(The type and empty constant are now imported from `@/lib/abilityToken`.)

Also DELETE the old `fetchAbilities` function:

```typescript
async function fetchAbilities(playerAddr: string): Promise<AbilityInventory> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      ...
    });
    ...
  } catch {
    return EMPTY_INVENTORY;
  }
}
```

Delete the `TORII_URL` constant at the top of the file — it's no longer needed on this page.

Update all references to `EMPTY_INVENTORY` in the file to use the imported `EMPTY_ABILITY_INVENTORY`. The `useState` call should become:

```typescript
const [inventory, setInventory] = useState<AbilityInventory>(EMPTY_ABILITY_INVENTORY);
```

Find the `useEffect` that loads the inventory:

```typescript
useEffect(() => {
  if (!address) {
    setInventory(EMPTY_INVENTORY);
    return;
  }
  let cancelled = false;
  fetchAbilities(address).then((inv) => {
    if (!cancelled) setInventory(inv);
  });
  return () => {
    cancelled = true;
  };
}, [address]);
```

Replace with:

```typescript
useEffect(() => {
  if (!address) {
    setInventory(EMPTY_ABILITY_INVENTORY);
    return;
  }
  let cancelled = false;
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  fetchAbilityBalances(provider, address).then((inv) => {
    if (!cancelled) setInventory(inv);
  });
  return () => {
    cancelled = true;
  };
}, [address]);
```

Also find the refresh-after-craft block inside `handleCraft`:

```typescript
if (address) {
  const inv = await fetchAbilities(address);
  setInventory(inv);
}
```

Replace with:

```typescript
if (address) {
  const inv = await fetchAbilityBalances(provider, address);
  setInventory(inv);
}
```

(The `provider` variable is already constructed earlier in `handleCraft` for `waitForTransaction`. If it isn't, add `const provider = new RpcProvider({ nodeUrl: RPC_URL });` at the start of the try block.)

- [ ] **Step 2: Typecheck**

```bash
cd /Users/modeofo/Apps/siege-dojo/frontend && npx tsc --noEmit
```

Expected: exit 0 with no errors. Common issues:
- `EMPTY_INVENTORY` still referenced somewhere → grep and replace with `EMPTY_ABILITY_INVENTORY`
- `fetchAbilities` still referenced → it was deleted, so any remaining reference is a bug
- Duplicate `AbilityInventory` type declaration → the local one should be deleted, only the import remains

- [ ] **Step 3: Run vitest**

```bash
cd /Users/modeofo/Apps/siege-dojo/frontend && bun run test
```

Expected: all 39 pre-existing tests pass (there are no frontend tests for the craft page itself, so the rewire is only covered by typecheck + manual smoke test).

- [ ] **Step 4: Manual smoke test**

1. Start the dev server: `cd frontend && npm run dev`
2. Open `http://localhost:3000/craft` in a browser
3. Connect wallet (Cartridge Controller)
4. Verify the resource bar shows your current balances
5. Craft an affordable ability (Stone Cloak if you have 3 Stone + 2 Linen; otherwise pick one you can afford)
6. Approve the Cartridge signing prompt
7. Verify:
   - Transaction completes
   - Resource balances decrease
   - "Owned: 1" badge appears on the ability card
   - Cartridge Controller wallet UI shows the new ERC-1155 token (it may take 30–60s for the indexer to pick it up)
   - Metadata route returns valid JSON when you hit `http://localhost:3000/api/metadata/abilities/1` directly

If the wallet doesn't show the token at all, the `base_uri` on-chain might not match the production host. In that case, re-run `scripts/wire-ability-token.ts` with the correct `BASE_URI`.

- [ ] **Step 5: Commit**

```bash
cd /Users/modeofo/Apps/siege-dojo
git add frontend/src/app/craft/page.tsx
git commit -m "refactor: /craft reads ability inventory from ERC-1155 balance_of_batch"
```

---

## Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the Abilities section**

Find this existing block in `CLAUDE.md`:

```markdown
### Abilities

5 craftable abilities, burned from ERC-20 resources and stored in the `PlayerAbilities` model (persists across matches):

| Ability | Cost | Effect (Phase 2B) |
|---------|------|-------------------|
| Siege Sword | 3 Iron + 2 Wood | Max damage (10) to one gate |
| Stone Cloak | 3 Stone + 2 Linen | Block all gate damage |
| Ember Blast | 3 Ember + 2 Seeds | 5 direct damage bypassing gates |
| Hex | 2 Iron + 2 Stone + 1 Ember | Opponent budget -7 |
| Fortify | 2 Stone + 2 Linen + 1 Wood | Double all defense |

Crafting page at `/craft`. Players multicall `approve` on each required ERC-20 then `craft_ability(id)` on the `crafting_1v1` contract, which `transfer_from`s tokens to a burn address (`0x1`) and increments the ability counter. Effects are applied in Phase 2B (resolution integration).

Sepolia `crafting_1v1`: `0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235`
```

Replace with:

```markdown
### Abilities

5 craftable abilities stored as ERC-1155 tokens on the `AbilityToken` contract (token IDs 1–5). Tradeable, transferable, visible in the Cartridge wallet.

| ID | Ability | Cost | Effect (Phase 2B) |
|----|---------|------|-------------------|
| 1 | Siege Sword | 3 Iron + 2 Wood | Max damage (10) to one gate |
| 2 | Stone Cloak | 3 Stone + 2 Linen | Block all gate damage |
| 3 | Ember Blast | 3 Ember + 2 Seeds | 5 direct damage bypassing gates |
| 4 | Hex | 2 Iron + 2 Stone + 1 Ember | Opponent budget -7 |
| 5 | Fortify | 2 Stone + 2 Linen + 1 Wood | Double all defense |

**Crafting flow:** frontend multicalls `approve` on each required ERC-20 then `craft_ability(id)` on `crafting_1v1`. The Dojo contract burns resources (`transfer_from` to `0x1`) and calls `AbilityToken.mint(caller, id, 1)`. Token IDs match ability IDs 1:1.

**AbilityToken contract:** pure Starknet ERC-1155 (not a Dojo contract) in `src/tokens/ability_token.cairo`. Three roles:
- `admin` — rotates minter/burner/base_uri (set at deploy to deployer address)
- `minter` — only `crafting_1v1` can mint
- `burner` — set when Phase 2B ships; starts at `0x0` (abilities are immortal until then)

**Metadata:** served from `frontend/src/app/api/metadata/abilities/[id]/route.ts`. Contract's `uri()` returns `https://<host>/api/metadata/abilities/{id}`, wallet substitutes `{id}`, route returns OpenSea-format JSON with name/description/image/attributes. Ability sprites at `frontend/public/sprites/abilities/<id>.png`. Updating art or descriptions does NOT require a contract redeploy — only redeploy the Next.js app.

**Sepolia addresses:**
- `crafting_1v1`: `0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235`
- `AbilityToken`: `0x<address from Task 5 Step 3>`

**Historical note:** Phase 2A used a `PlayerAbilities` Dojo model with u8 counters. Phase 2A.5 dropped it in favor of ERC-1155 so abilities would show in the wallet. The old model is still orphaned on-chain but not read by any live code.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for ability NFT migration"
```

---

## Self-Review Notes (for the agent executing this plan)

Before claiming the plan is complete, verify:

1. **Spec coverage:**
   - AbilityToken contract exists with admin/minter/burner/base_uri slots ✓ (Task 1)
   - `crafting_1v1` mints ERC-1155 instead of writing `PlayerAbilities` ✓ (Task 4)
   - `PlayerAbilities` model deleted ✓ (Task 4)
   - Metadata flow documented end-to-end in spec ✓ (Metadata Flow section in spec)
   - Metadata route handler reads shared `ABILITIES` constant ✓ (Task 8)
   - Burner slot stays `0x0` at deploy ✓ (Task 5, constructor path)
   - Frontend rewired to `balance_of_batch` ✓ (Tasks 7 + 9)
   - Token IDs match ability IDs 1..5 ✓ (Task 1 contract + Task 7 helper)
   - ERC-1155 transfers remain enabled (no soul-bound restriction) ✓ (inherited from ERC1155MixinImpl, not overridden)

2. **Placeholders:** The only placeholders in this plan are the two that legitimately need runtime values: `<ABILITY_TOKEN_ADDRESS>` (from Task 5 Step 3) and `<YOUR_HOST>` (the production frontend URL). Every code block shows the exact code to write.

3. **Type consistency:** The `AbilityInventory` type is defined ONCE in `frontend/src/lib/abilityToken.ts` and imported everywhere else. The field names `siege_sword`, `stone_cloak`, `ember_blast`, `hex`, `fortify` are identical across the helper, the craft page, and the metadata route's lookup. Token IDs in all locations are `1, 2, 3, 4, 5`.

4. **Scope:** This is a single-plan scope. No subsystems need further decomposition.

---

## Execution Notes

- **Feature branch vs main:** We executed the prior crafting plan on `main` with explicit user consent. If the user hasn't given consent for this plan, ask before touching code.
- **Real Sepolia gas:** Task 5 and Task 6 spend real STRK. The user has provided deployer credentials in a prior message; ask again if they've been lost from context.
- **Sprite art:** Ability sprites are intentionally out of scope for this plan. The metadata route will return broken image URLs until PNGs land in `frontend/public/sprites/abilities/`. Dropping the PNGs later does NOT require any code change or transaction.
- **Frontend URL:** The `BASE_URI` in Task 6 Step 2 needs the actual production host. If the user hasn't deployed the frontend anywhere yet, use `http://localhost:3000` as a temporary value — crafting will still work, but the Cartridge wallet won't render metadata until the host is publicly reachable.
