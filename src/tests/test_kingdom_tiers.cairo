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
    use super::MockAccount;

    // ERC-20 approve interface for granting allowance to world_system
    #[starknet::interface]
    trait IERC20Approve<T> {
        fn approve(ref self: T, spender: starknet::ContractAddress, amount: u256) -> bool;
    }

    // ERC-1155 interface for ability token approval and balance checks
    #[starknet::interface]
    trait IERC1155Like<T> {
        fn balance_of(self: @T, account: starknet::ContractAddress, token_id: u256) -> u256;
        fn set_approval_for_all(ref self: T, operator: starknet::ContractAddress, approved: bool);
    }

    // Mock VRF
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

    fn deploy_mock_vrf() -> starknet::ContractAddress {
        let (addr, _) = starknet::syscalls::deploy_syscall(
            MockVrfProvider::TEST_CLASS_HASH.try_into().unwrap(), 0, array![].span(), false,
        ).unwrap_syscall();
        addr
    }

    fn deploy_ability_token(admin: starknet::ContractAddress) -> (IAbilityTokenDispatcher, starknet::ContractAddress) {
        let mut calldata: Array<felt252> = array![];
        admin.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            AbilityToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        (IAbilityTokenDispatcher { contract_address: addr }, addr)
    }

    fn deploy_resource_token(
        name: ByteArray,
        symbol: ByteArray,
        minter: starknet::ContractAddress,
    ) -> (IResourceTokenDispatcher, IERC20ApproveDispatcher, starknet::ContractAddress) {
        let mut calldata: Array<felt252> = array![];
        name.serialize(ref calldata);
        symbol.serialize(ref calldata);
        minter.serialize(ref calldata);
        let (addr, _) = starknet::syscalls::deploy_syscall(
            ResourceToken::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false,
        ).unwrap_syscall();
        (
            IResourceTokenDispatcher { contract_address: addr },
            IERC20ApproveDispatcher { contract_address: addr },
            addr,
        )
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
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
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
                TestResource::Model(m_PlayerReputation::TEST_CLASS_HASH),
                TestResource::Model(m_MatchRecord::TEST_CLASS_HASH),
                TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH),
                TestResource::Model(m_Pillage::TEST_CLASS_HASH),
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

    // Deploy all 6 resource tokens and wire them into ResourceConfig.
    // Returns (world_sys, player, iron_token, approve_dispatchers)
    fn setup_with_resources() -> (
        dojo::world::WorldStorage,
        IWorldSystemDispatcher,
        starknet::ContractAddress, // player address
        IResourceTokenDispatcher,  // iron
        IResourceTokenDispatcher,  // stone
        IResourceTokenDispatcher,  // wood
        IResourceTokenDispatcher,  // ember
        IResourceTokenDispatcher,  // seeds
        IERC20ApproveDispatcher,   // iron approve
        IERC20ApproveDispatcher,   // stone approve
        IERC20ApproveDispatcher,   // wood approve
        IERC20ApproveDispatcher,   // ember approve
        IERC20ApproveDispatcher,   // seeds approve
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
        IActions1v1Dispatcher { contract_address: actions_addr }.set_vrf_provider(mock_vrf_addr);

        // AbilityToken
        let admin = contract_address_const::<0xADAD>();
        let (ability_token, ability_token_addr) = deploy_ability_token(admin);
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(world_sys_addr);

        // Resource tokens: minter is world_sys_addr so world_system can mint via settle
        // But for upgrade tests we need the test to mint directly to player.
        // So we'll use world_sys_addr as minter and also set minter2 to a test admin.
        let test_minter = contract_address_const::<0xBEEF>();
        starknet::testing::set_contract_address(test_minter);

        let (iron_tok, iron_approve, iron_addr) = deploy_resource_token("Iron", "IRON", test_minter);
        let (stone_tok, stone_approve, stone_addr) = deploy_resource_token("Stone", "STONE", test_minter);
        let (linen_tok, _linen_approve, linen_addr) = deploy_resource_token("Linen", "LINEN", test_minter);
        let (wood_tok, wood_approve, wood_addr) = deploy_resource_token("Wood", "WOOD", test_minter);
        let (ember_tok, ember_approve, ember_addr) = deploy_resource_token("Ember", "EMBER", test_minter);
        let (seeds_tok, seeds_approve, seeds_addr) = deploy_resource_token("Seeds", "SEEDS", test_minter);

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
        let types: Array<u8> = array![0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
        world_sys.initialize_world(cols, rows, types);

        // Register a player
        let player = deploy_user();
        starknet::testing::set_contract_address(player);
        world_sys.register_player(array![0, 1, 2]);

        (
            world,
            world_sys,
            player,
            iron_tok,
            stone_tok,
            wood_tok,
            ember_tok,
            seeds_tok,
            iron_approve,
            stone_approve,
            wood_approve,
            ember_approve,
            seeds_approve,
            world_sys_addr,
        )
    }

    // ── Pure helper tests ────────────────────────────────────────────────────

    #[test]
    fn test_player_kingdom_has_tier_and_wins() {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [NamespaceDef {
            namespace: "siege_dojo",
            resources: [TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH)].span(),
        }].span());

        let player = contract_address_const::<0xCAFE>();

        let kingdom = PlayerKingdom {
            player,
            home_0: 1,
            home_1: 2,
            home_2: 3,
            parcel_count: 3,
            registered: true,
            free_craft_used: false,
            last_drip_time: 0,
            tier: 2,
            total_wins: 7,
        };
        world.write_model_test(@kingdom);

        let read_back: PlayerKingdom = world.read_model(player);
        assert(read_back.tier == 2, 'tier should be 2');
        assert(read_back.total_wins == 7, 'total_wins should be 7');
        assert(read_back.registered, 'registered should be true');
    }

    #[test]
    fn test_player_kingdom_tier_defaults_to_zero() {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [NamespaceDef {
            namespace: "siege_dojo",
            resources: [TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH)].span(),
        }].span());

        let player = contract_address_const::<0xBEEF>();

        let kingdom = PlayerKingdom {
            player,
            home_0: 0,
            home_1: 0,
            home_2: 0,
            parcel_count: 0,
            registered: false,
            free_craft_used: false,
            last_drip_time: 0,
            tier: 0,
            total_wins: 0,
        };
        world.write_model_test(@kingdom);

        let read_back: PlayerKingdom = world.read_model(player);
        assert(read_back.tier == 0, 'default tier should be 0');
        assert(read_back.total_wins == 0, 'default wins should be 0');
    }

    #[test]
    fn test_tier_ability_slots() {
        assert(siege_dojo::systems::world_system::tier_ability_slots(0) == 1, 'polis: 1 slot');
        assert(siege_dojo::systems::world_system::tier_ability_slots(1) == 2, 'strategos: 2 slots');
        assert(siege_dojo::systems::world_system::tier_ability_slots(2) == 3, 'hegemonia: 3 slots');
        assert(siege_dojo::systems::world_system::tier_ability_slots(3) == 4, 'basileia: 4 slots');
    }

    #[test]
    fn test_tier_parcel_cap() {
        assert(siege_dojo::systems::world_system::tier_parcel_cap(0) == 2, 'polis: 2 parcels');
        assert(siege_dojo::systems::world_system::tier_parcel_cap(1) == 5, 'strategos: 5 parcels');
        assert(siege_dojo::systems::world_system::tier_parcel_cap(2) == 8, 'hegemonia: 8 parcels');
        assert(siege_dojo::systems::world_system::tier_parcel_cap(3) == 12, 'basileia: 12 parcels');
    }

    // Full setup with two players and ability token for staking tests.
    fn full_setup_for_staking() -> (
        dojo::world::WorldStorage,
        IWorldSystemDispatcher,
        starknet::ContractAddress, // player_a
        starknet::ContractAddress, // player_b
        IERC1155LikeDispatcher,    // erc1155 reader/approver
    ) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (world_sys_addr, _) = world.dns(@"world_system").unwrap();
        let world_sys = IWorldSystemDispatcher { contract_address: world_sys_addr };

        // VRF
        let mock_vrf_addr = deploy_mock_vrf();
        let (actions_addr, _) = world.dns(@"actions_1v1").unwrap();
        IActions1v1Dispatcher { contract_address: actions_addr }.set_vrf_provider(mock_vrf_addr);

        // AbilityToken
        let admin = contract_address_const::<0xADAD>();
        let (ability_token, ability_token_addr) = deploy_ability_token(admin);
        starknet::testing::set_contract_address(admin);
        ability_token.set_minter(world_sys_addr);

        let erc1155 = IERC1155LikeDispatcher { contract_address: ability_token_addr };

        // Wire resource config
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.ability_token = ability_token_addr;
        world.write_model_test(@rc);

        // Init world with 10 parcels
        starknet::testing::set_contract_address(contract_address_const::<0>());
        let cols: Array<u16> = array![0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
        let rows: Array<u16> = array![0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
        let types: Array<u8> = array![0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
        world_sys.initialize_world(cols, rows, types);

        // Register player A (tier 0 by default)
        let player_a = deploy_user();
        starknet::testing::set_contract_address(player_a);
        world_sys.register_player(array![0, 1, 2]);
        erc1155.set_approval_for_all(world_sys_addr, true);

        // Register player B (tier 0 by default)
        let player_b = deploy_user();
        starknet::testing::set_contract_address(player_b);
        world_sys.register_player(array![0, 1, 2]);
        erc1155.set_approval_for_all(world_sys_addr, true);

        (world, world_sys, player_a, player_b, erc1155)
    }

    // ── upgrade_kingdom tests ─────────────────────────────────────────────────

    #[test]
    fn test_upgrade_to_strategos() {
        let (
            mut world,
            world_sys,
            player,
            iron_tok,
            stone_tok,
            wood_tok,
            _ember_tok,
            _seeds_tok,
            iron_approve,
            stone_approve,
            wood_approve,
            _ember_approve,
            _seeds_approve,
            world_sys_addr,
        ) = setup_with_resources();

        // Give player 10 wins
        let mut kingdom: PlayerKingdom = world.read_model(player);
        kingdom.total_wins = 10;
        world.write_model_test(@kingdom);

        // Mint required resources to player (Strategos: 20 Iron + 20 Stone + 10 Wood)
        let test_minter = contract_address_const::<0xBEEF>();
        starknet::testing::set_contract_address(test_minter);
        iron_tok.mint(player, 20_u256);
        stone_tok.mint(player, 20_u256);
        wood_tok.mint(player, 10_u256);

        // Player approves world_system to spend resources
        starknet::testing::set_contract_address(player);
        iron_approve.approve(world_sys_addr, 20_u256);
        stone_approve.approve(world_sys_addr, 20_u256);
        wood_approve.approve(world_sys_addr, 10_u256);

        // Upgrade
        world_sys.upgrade_kingdom();

        // Verify tier upgraded
        let kingdom_after: PlayerKingdom = world.read_model(player);
        assert(kingdom_after.tier == 1, 'should be tier 1 (Strategos)');
    }

    #[test]
    #[should_panic(expected: ('Not enough wins', 'ENTRYPOINT_FAILED'))]
    fn test_upgrade_fails_insufficient_wins() {
        let (
            mut world,
            world_sys,
            player,
            iron_tok,
            stone_tok,
            wood_tok,
            _ember_tok,
            _seeds_tok,
            iron_approve,
            stone_approve,
            wood_approve,
            _ember_approve,
            _seeds_approve,
            world_sys_addr,
        ) = setup_with_resources();

        // Only 5 wins (need 10)
        let mut kingdom: PlayerKingdom = world.read_model(player);
        kingdom.total_wins = 5;
        world.write_model_test(@kingdom);

        // Mint and approve resources anyway
        let test_minter = contract_address_const::<0xBEEF>();
        starknet::testing::set_contract_address(test_minter);
        iron_tok.mint(player, 20_u256);
        stone_tok.mint(player, 20_u256);
        wood_tok.mint(player, 10_u256);

        starknet::testing::set_contract_address(player);
        iron_approve.approve(world_sys_addr, 20_u256);
        stone_approve.approve(world_sys_addr, 20_u256);
        wood_approve.approve(world_sys_addr, 10_u256);

        // Should panic
        world_sys.upgrade_kingdom();
    }

    #[test]
    #[should_panic(expected: ('Already max tier', 'ENTRYPOINT_FAILED'))]
    fn test_upgrade_fails_max_tier() {
        let (
            mut world,
            world_sys,
            player,
            _iron_tok,
            _stone_tok,
            _wood_tok,
            _ember_tok,
            _seeds_tok,
            _iron_approve,
            _stone_approve,
            _wood_approve,
            _ember_approve,
            _seeds_approve,
            _world_sys_addr,
        ) = setup_with_resources();

        // Set player to max tier 3
        let mut kingdom: PlayerKingdom = world.read_model(player);
        kingdom.tier = 3;
        kingdom.total_wins = 100;
        world.write_model_test(@kingdom);

        // Should panic: already max tier
        starknet::testing::set_contract_address(player);
        world_sys.upgrade_kingdom();
    }

    // ── Tier enforcement tests ─────────────────────────────────────────────────

    #[test]
    #[should_panic(expected: ('Too many abilities for tier', 'ENTRYPOINT_FAILED'))]
    fn test_outpost_cannot_stake_2_abilities() {
        let (_world, world_sys, player_a, player_b, _erc1155) = full_setup_for_staking();

        // player_a is tier 0 (Polis) — can only stake 1 ability
        starknet::testing::set_contract_address(player_a);
        // Staking 2 abilities should panic
        world_sys.create_staked_match(player_b, array![1, 2]);
    }

    #[test]
    fn test_settle_increments_winner_wins() {
        use siege_dojo::models::match_state_1v1::MatchState1v1;
        use siege_dojo::models::match_state::MatchStatus;

        let (mut world, world_sys, player_a, player_b, _erc1155) = full_setup_for_staking();

        // Both players are tier 0, can only stake 1 ability
        starknet::testing::set_contract_address(player_a);
        let match_id = world_sys.create_staked_match(player_b, array![1]);

        starknet::testing::set_contract_address(player_b);
        world_sys.join_staked_match(match_id, array![2]);

        // Simulate player A winning
        world.write_model_test(@MatchState1v1 {
            match_id,
            player_a,
            player_b,
            vault_a_hp: 30,
            vault_b_hp: 0,
            current_round: 5,
            status: MatchStatus::Finished,
        });

        world_sys.settle_match(match_id);

        // Player A's total_wins should be 1
        let kingdom_a: PlayerKingdom = world.read_model(player_a);
        assert(kingdom_a.total_wins == 1, 'winner should have 1 win');

        // Player B's total_wins should still be 0
        let kingdom_b: PlayerKingdom = world.read_model(player_b);
        assert(kingdom_b.total_wins == 0, 'loser should have 0 wins');
    }
}
