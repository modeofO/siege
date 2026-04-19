// Mock account for test deploys.
#[starknet::contract]
pub mod MockAccount {
    const ISRC6_ID: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;

    #[storage]
    struct Storage {}

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == ISRC6_ID
        }
    }
}

// Mock VRF provider
#[starknet::contract]
pub mod MockVrfProvider {
    use starknet::ContractAddress;

    #[derive(Drop, Copy, Clone, Serde)]
    pub enum Source {
        Nonce: ContractAddress,
        Salt: felt252,
    }

    #[storage]
    struct Storage {}

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(per_item)]
    #[generate_trait]
    impl External of ExternalTrait {
        #[external(v0)]
        fn consume_random(ref self: ContractState, source: Source) -> felt252 {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };
    use starknet::contract_address_const;
    use starknet::SyscallResultTrait;

    use siege_dojo::models::faction::{Faction, FactionCounter, m_Faction, m_FactionCounter};
    use siege_dojo::models::faction_member::{FactionMember, m_FactionMember};
    use siege_dojo::models::faction_invite::{FactionInvite, m_FactionInvite};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::parcel::{Parcel, m_Parcel};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::match_stakes_1v1::m_MatchStakes1v1;
    use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
    use siege_dojo::models::preset_defense::m_PresetDefense;
    use siege_dojo::models::match_state_1v1::m_MatchState1v1;
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::player_reputation::m_PlayerReputation;
    use siege_dojo::models::match_record::m_MatchRecord;
    use siege_dojo::models::pillage_eligibility::m_PillageEligibility;
    use siege_dojo::models::pillage::m_Pillage;
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
    };
    use siege_dojo::systems::world_system::{
        world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait,
    };
    use siege_dojo::systems::actions_1v1::{actions_1v1, IActions1v1Dispatcher, IActions1v1DispatcherTrait};
    use siege_dojo::systems::commit_reveal_1v1::commit_reveal_1v1;
    use siege_dojo::systems::resolution_1v1::resolution_1v1;
    use siege_dojo::tokens::ability_token::{AbilityToken, IAbilityTokenDispatcher, IAbilityTokenDispatcherTrait};
    use siege_dojo::tokens::resource_token::{ResourceToken, IResourceTokenDispatcher, IResourceTokenDispatcherTrait};
    use super::{MockAccount, MockVrfProvider};

    // ERC-1155 read interface
    #[starknet::interface]
    trait IERC1155Like<T> {
        fn balance_of(self: @T, account: starknet::ContractAddress, token_id: u256) -> u256;
        fn set_approval_for_all(ref self: T, operator: starknet::ContractAddress, approved: bool);
    }

    // ERC-20 approve interface
    #[starknet::interface]
    trait IERC20Approve<T> {
        fn approve(ref self: T, spender: starknet::ContractAddress, amount: u256) -> bool;
    }

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn deploy_ability_token(admin: starknet::ContractAddress) -> (IAbilityTokenDispatcher, IERC1155LikeDispatcher, starknet::ContractAddress) {
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        (
            IAbilityTokenDispatcher { contract_address: addr },
            IERC1155LikeDispatcher { contract_address: addr },
            addr,
        )
    }

    fn deploy_resource_token(
        name: ByteArray,
        symbol: ByteArray,
        minter: starknet::ContractAddress,
    ) -> (IResourceTokenDispatcher, starknet::ContractAddress) {
        let mut calldata: Array<felt252> = array![];
        name.serialize(ref calldata);
        symbol.serialize(ref calldata);
        minter.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            ResourceToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        (IResourceTokenDispatcher { contract_address: addr }, addr)
    }

    fn deploy_user() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockAccount::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerReputation::TEST_CLASS_HASH),
                TestResource::Model(m_MatchRecord::TEST_CLASS_HASH),
                TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH),
                TestResource::Model(m_Pillage::TEST_CLASS_HASH),
                TestResource::Model(m_Faction::TEST_CLASS_HASH),
                TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
                TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
                TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(commit_reveal_1v1::TEST_CLASS_HASH),
                TestResource::Contract(resolution_1v1::TEST_CLASS_HASH),
            ].span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"commit_reveal_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"resolution_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    // Full setup for faction tests:
    // - Deploys world, resource tokens, ability token
    // - Initializes world with 2x5 hex grid
    // - Registers 2 players at tier 1 (Strategos)
    // - Mints 50 iron/stone/wood to each player
    // - Approves world_system to burn resources via transfer_from
    // Returns (world, world_sys, player_a, player_b, erc1155, iron_addr, stone_addr, wood_addr, world_sys_addr)
    fn faction_setup() -> (
        dojo::world::WorldStorage,
        IWorldSystemDispatcher,
        starknet::ContractAddress, // player_a
        starknet::ContractAddress, // player_b
        IERC1155LikeDispatcher,    // erc1155 reader
        starknet::ContractAddress, // iron_addr
        starknet::ContractAddress, // stone_addr
        starknet::ContractAddress, // wood_addr
        starknet::ContractAddress, // world_sys_addr
    ) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        let world_sys = IWorldSystemDispatcher { contract_address: world_sys_addr };

        // VRF
        let mock_vrf_addr = deploy_mock_vrf();
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        let actions_sys = IActions1v1Dispatcher { contract_address: actions_addr };
        actions_sys.set_vrf_provider(mock_vrf_addr);

        // AbilityToken
        let admin = contract_address_const::<0xADAD>();
        let (ability_token, erc1155, ability_token_addr) = deploy_ability_token(admin);
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(world_sys_addr);

        // Resource tokens — minter is test_minter so we can mint directly in tests
        let test_minter = contract_address_const::<0xBEEF>();
        starknet::testing::set_contract_address(test_minter);

        let (iron_tok, iron_addr) = deploy_resource_token("Iron", "IRON", test_minter);
        let (stone_tok, stone_addr) = deploy_resource_token("Stone", "STONE", test_minter);
        let (_linen_tok, linen_addr) = deploy_resource_token("Linen", "LINEN", test_minter);
        let (wood_tok, wood_addr) = deploy_resource_token("Wood", "WOOD", test_minter);
        let (_ember_tok, ember_addr) = deploy_resource_token("Ember", "EMBER", test_minter);
        let (_seeds_tok, seeds_addr) = deploy_resource_token("Seeds", "SEEDS", test_minter);

        // Wire resource config
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token_addr;
        rc.iron = iron_addr;
        rc.linen = linen_addr;
        rc.stone = stone_addr;
        rc.wood = wood_addr;
        rc.ember = ember_addr;
        rc.seeds = seeds_addr;
        world.write_model_test(@rc);

        // Init world with 10 parcels (2 rows of 5)
        starknet::testing::set_contract_address(contract_address_const::<0>());
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        world_sys.initialize_world(cols, rows);

        // Register player A
        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        world_sys.register_player(array![0, 1, 2]);
        let mut ka: PlayerKingdom = world.read_model(player_a);
        ka.tier = 1;
        world.write_model_test(@ka);
        erc1155.set_approval_for_all(world_sys_addr, true);

        // Register player B
        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        world_sys.register_player(array![0, 1, 2]);
        let mut kb: PlayerKingdom = world.read_model(player_b);
        kb.tier = 1;
        world.write_model_test(@kb);
        erc1155.set_approval_for_all(world_sys_addr, true);

        // Mint resources to both players
        starknet::testing::set_contract_address(test_minter);
        iron_tok.mint(player_a, 50);
        stone_tok.mint(player_a, 50);
        wood_tok.mint(player_a, 50);
        iron_tok.mint(player_b, 50);
        stone_tok.mint(player_b, 50);
        wood_tok.mint(player_b, 50);

        // Approve world_system to burn (transfer_from) resources for player_a
        starknet::testing::set_contract_address(player_a);
        IERC20ApproveDispatcher { contract_address: iron_addr }.approve(world_sys_addr, 1000);
        IERC20ApproveDispatcher { contract_address: stone_addr }.approve(world_sys_addr, 1000);
        IERC20ApproveDispatcher { contract_address: wood_addr }.approve(world_sys_addr, 1000);

        // Approve world_system to burn resources for player_b
        starknet::testing::set_contract_address(player_b);
        IERC20ApproveDispatcher { contract_address: iron_addr }.approve(world_sys_addr, 1000);
        IERC20ApproveDispatcher { contract_address: stone_addr }.approve(world_sys_addr, 1000);
        IERC20ApproveDispatcher { contract_address: wood_addr }.approve(world_sys_addr, 1000);

        (world, world_sys, player_a, player_b, erc1155, iron_addr, stone_addr, wood_addr, world_sys_addr)
    }

    // ── Original model-only tests (preserved) ────────────────────────────────

    #[test]
    fn test_faction_model() {
        let ndef = NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Faction::TEST_CLASS_HASH),
                TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
                TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
                TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
            ].span()
        };
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let leader = contract_address_const::<0x1>();
        world.write_model_test(@Faction {
            faction_id: 1,
            leader,
            name: 'TestClan',
            tag: 'TC',
            member_count: 1,
            created_at: 100,
            dissolved: false,
        });

        let f: Faction = world.read_model(1_u32);
        assert(f.leader == leader, 'leader should match');
        assert(f.name == 'TestClan', 'name should match');
        assert(!f.dissolved, 'should not be dissolved');
    }

    #[test]
    fn test_faction_member_model() {
        let ndef = NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Faction::TEST_CLASS_HASH),
                TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
                TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
                TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
            ].span()
        };
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let player = contract_address_const::<0x1>();
        world.write_model_test(@FactionMember {
            player,
            faction_id: 42,
            joined_at: 100,
            last_leave_time: 0,
        });

        let m: FactionMember = world.read_model(player);
        assert(m.faction_id == 42, 'faction_id should match');
    }

    #[test]
    fn test_faction_invite_model() {
        let ndef = NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Faction::TEST_CLASS_HASH),
                TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
                TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
                TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
            ].span()
        };
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let target = contract_address_const::<0x1>();
        let inviter = contract_address_const::<0x2>();
        world.write_model_test(@FactionInvite {
            target,
            faction_id: 7,
            invited_by: inviter,
            invited_at: 100,
            used: false,
        });

        let inv: FactionInvite = world.read_model((target, 7_u32));
        assert(inv.invited_by == inviter, 'inviter should match');
        assert(!inv.used, 'should not be used');
    }

    // ── Task 3: create_faction tests ─────────────────────────────────────────

    #[test]
    fn test_create_faction_happy_path() {
        let (mut world, world_sys, player_a, _player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        starknet::testing::set_contract_address(player_a);
        let faction_id = world_sys.create_faction('TestClan', 'TC');

        assert(faction_id == 1, 'first faction id should be 1');

        let faction: siege_dojo::models::faction::Faction = world.read_model(faction_id);
        assert(faction.leader == player_a, 'leader should be player_a');
        assert(faction.name == 'TestClan', 'name should match');
        assert(faction.member_count == 1, 'member_count should be 1');
        assert(!faction.dissolved, 'should not be dissolved');

        let member: siege_dojo::models::faction_member::FactionMember = world.read_model(player_a);
        assert(member.faction_id == faction_id, 'membership should be set');
    }

    #[test]
    #[should_panic(expected: ('Strategos tier required', 'ENTRYPOINT_FAILED'))]
    fn test_create_faction_rejects_polis() {
        let (mut world, world_sys, player_a, _player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        let mut ka: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
        ka.tier = 0;
        world.write_model_test(@ka);

        starknet::testing::set_contract_address(player_a);
        world_sys.create_faction('TestClan', 'TC');
    }

    #[test]
    #[should_panic(expected: ('Already in a faction', 'ENTRYPOINT_FAILED'))]
    fn test_create_faction_rejects_existing_member() {
        let (mut world, world_sys, player_a, _player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        world.write_model_test(@siege_dojo::models::faction_member::FactionMember {
            player: player_a,
            faction_id: 42,
            joined_at: 100,
            last_leave_time: 0,
        });

        starknet::testing::set_contract_address(player_a);
        world_sys.create_faction('TestClan', 'TC');
    }

    // ── Task 4: invite_member + accept_invite tests ──────────────────────────

    #[test]
    fn test_invite_and_accept() {
        let (mut world, world_sys, player_a, player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        starknet::testing::set_contract_address(player_a);
        let faction_id = world_sys.create_faction('TestClan', 'TC');
        world_sys.invite_member(player_b);

        starknet::testing::set_contract_address(player_b);
        world_sys.accept_invite(faction_id);

        let member_b: siege_dojo::models::faction_member::FactionMember = world.read_model(player_b);
        assert(member_b.faction_id == faction_id, 'b should be in faction');

        let faction: siege_dojo::models::faction::Faction = world.read_model(faction_id);
        assert(faction.member_count == 2, 'should have 2 members');
    }

    #[test]
    #[should_panic(expected: ('No invite', 'ENTRYPOINT_FAILED'))]
    fn test_accept_invite_without_invite_fails() {
        let (_world, world_sys, _player_a, player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        starknet::testing::set_contract_address(player_b);
        world_sys.accept_invite(1);
    }

    #[test]
    #[should_panic(expected: ('Leave cooldown active', 'ENTRYPOINT_FAILED'))]
    fn test_accept_invite_during_cooldown_fails() {
        let (mut world, world_sys, player_a, player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        starknet::testing::set_contract_address(player_a);
        let faction_id = world_sys.create_faction('TestClan', 'TC');
        world_sys.invite_member(player_b);

        starknet::testing::set_block_timestamp(1000);

        let mut mb: siege_dojo::models::faction_member::FactionMember = world.read_model(player_b);
        mb.last_leave_time = 1000;
        world.write_model_test(@mb);

        starknet::testing::set_contract_address(player_b);
        world_sys.accept_invite(faction_id);
    }

    // ── Task 5: leave_faction + kick_member tests ────────────────────────────

    #[test]
    fn test_leave_faction() {
        let (mut world, world_sys, player_a, player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        starknet::testing::set_contract_address(player_a);
        let faction_id = world_sys.create_faction('TestClan', 'TC');
        world_sys.invite_member(player_b);

        starknet::testing::set_contract_address(player_b);
        world_sys.accept_invite(faction_id);
        starknet::testing::set_block_timestamp(500);
        world_sys.leave_faction();

        let member_b: siege_dojo::models::faction_member::FactionMember = world.read_model(player_b);
        assert(member_b.faction_id == 0, 'b should be out');
        assert(member_b.last_leave_time > 0, 'cooldown set');

        let faction: siege_dojo::models::faction::Faction = world.read_model(faction_id);
        assert(faction.member_count == 1, 'should have 1 member');
        assert(!faction.dissolved, 'not dissolved');
    }

    #[test]
    fn test_leader_leave_dissolves_faction() {
        let (mut world, world_sys, player_a, _player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        starknet::testing::set_contract_address(player_a);
        let faction_id = world_sys.create_faction('TestClan', 'TC');
        world_sys.leave_faction();

        let faction: siege_dojo::models::faction::Faction = world.read_model(faction_id);
        assert(faction.dissolved, 'should be dissolved');
    }

    #[test]
    fn test_kick_member_sets_cooldown() {
        let (mut world, world_sys, player_a, player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        starknet::testing::set_contract_address(player_a);
        let faction_id = world_sys.create_faction('TestClan', 'TC');
        world_sys.invite_member(player_b);

        starknet::testing::set_contract_address(player_b);
        world_sys.accept_invite(faction_id);

        starknet::testing::set_block_timestamp(1000);
        starknet::testing::set_contract_address(player_a);
        world_sys.kick_member(player_b);

        let member_b: siege_dojo::models::faction_member::FactionMember = world.read_model(player_b);
        assert(member_b.faction_id == 0, 'b should be kicked');
        assert(member_b.last_leave_time == 1000, 'cooldown set');
    }

    #[test]
    #[should_panic(expected: ('Not the leader', 'ENTRYPOINT_FAILED'))]
    fn test_non_leader_cannot_kick() {
        let (_world, world_sys, player_a, player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        starknet::testing::set_contract_address(player_a);
        let faction_id = world_sys.create_faction('TestClan', 'TC');
        world_sys.invite_member(player_b);

        starknet::testing::set_contract_address(player_b);
        world_sys.accept_invite(faction_id);

        world_sys.kick_member(player_a);
    }

    // ── Task 6: set_faction_reinforcement test ───────────────────────────────

    #[test]
    fn test_set_faction_reinforcement() {
        let (mut world, world_sys, player_a, _player_b, _erc1155, _iron_addr, _stone_addr, _wood_addr, _world_sys_addr) = faction_setup();

        let k_before: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
        assert(!k_before.faction_reinforcement_enabled, 'default false');

        starknet::testing::set_contract_address(player_a);
        world_sys.set_faction_reinforcement(true);

        let k_after: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
        assert(k_after.faction_reinforcement_enabled, 'should be true');

        world_sys.set_faction_reinforcement(false);
        let k_final: siege_dojo::models::player_kingdom::PlayerKingdom = world.read_model(player_a);
        assert(!k_final.faction_reinforcement_enabled, 'should be false');
    }
}
