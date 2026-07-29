// Gas canary + schema-subset guard for the map-sweep rework.
//
// The rest of the suite initializes a 10-parcel world, which hides the cost
// that actually matters: mainnet runs 96 parcels, and register_player's sweep
// scales with that. A 10-parcel measurement understates the sweep by ~10x and
// makes register_player's O(unclaimed x claimed) distance term nearly
// invisible. These tests exist to be READ AS GAS NUMBERS in `sozo test`
// output, not just to pass.

#[cfg(test)]
mod tests {
    use dojo::model::{Model, ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use starknet::SyscallResultTrait;
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };

    use siege_dojo::systems::world_system::{
        world_system, IWorldSystemDispatcher, IWorldSystemDispatcherTrait,
    };
    use siege_dojo::systems::actions_1v1::actions_1v1;
    use siege_dojo::systems::conquest::{
        conquest, IConquestDispatcher, IConquestDispatcherTrait,
    };
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::m_NodeState;
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::m_RoundModifiers1v1;
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::match_abilities_1v1::m_MatchAbilities1v1;
    use siege_dojo::models::match_stakes_1v1::{MatchStakes1v1, m_MatchStakes1v1};
    use siege_dojo::models::preset_defense::m_PresetDefense;
    use siege_dojo::models::resource_config::{ResourceConfig, m_ResourceConfig};
    use siege_dojo::models::player_reputation::m_PlayerReputation;
    use siege_dojo::models::match_record::m_MatchRecord;
    use siege_dojo::models::pillage_eligibility::m_PillageEligibility;
    use siege_dojo::models::conquest_cooldown::m_ConquestCooldown;
    use siege_dojo::models::faction_member::m_FactionMember;
    use siege_dojo::models::parcel::{Parcel, ParcelPlacement, m_Parcel};
    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};
    use siege_dojo::models::world_config::{WorldConfig, m_WorldConfig};
    use siege_dojo::models::player_cosmetics::m_PlayerCosmetics;
    use siege_dojo::models::events::{
        e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished,
        e_ConquestResolved,
    };

    // Mainnet grid as of the 2026-07-18 expansion.
    const MAINNET_COLS: u16 = 12;
    const MAINNET_ROWS: u16 = 8;

    fn base_resources() -> Array<TestResource> {
        array![
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchStakes1v1::TEST_CLASS_HASH),
                TestResource::Model(m_PresetDefense::TEST_CLASS_HASH),
                TestResource::Model(m_ResourceConfig::TEST_CLASS_HASH),
                TestResource::Model(m_Parcel::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH),
                TestResource::Model(m_WorldConfig::TEST_CLASS_HASH),
                TestResource::Model(m_PlayerCosmetics::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(world_system::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
        ]
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef { namespace: "siege_dojo", resources: base_resources().span() }
    }

    /// Resources the settle/conquest canaries need on top of the base set.
    /// Kept separate so registering them does not move the register canary's
    /// numbers, which are compared across commits.
    fn namespace_def_world_ops() -> NamespaceDef {
        let mut r = base_resources();
        r.append(TestResource::Model(m_PlayerReputation::TEST_CLASS_HASH));
        r.append(TestResource::Model(m_MatchRecord::TEST_CLASS_HASH));
        r.append(TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH));
        r.append(TestResource::Model(m_ConquestCooldown::TEST_CLASS_HASH));
        r.append(TestResource::Model(m_FactionMember::TEST_CLASS_HASH));
        r.append(TestResource::Event(e_ConquestResolved::TEST_CLASS_HASH));
        r.append(TestResource::Contract(conquest::TEST_CLASS_HASH));
        NamespaceDef { namespace: "siege_dojo", resources: r.span() }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ]
            .span()
    }

    fn contract_defs_world_ops() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"world_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"conquest")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ]
            .span()
    }

    fn setup() -> (dojo::world::WorldStorage, IWorldSystemDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (ws_addr, _) = world.dns(@"world_system").unwrap();
        (world, IWorldSystemDispatcher { contract_address: ws_addr })
    }

    fn setup_world_ops() -> (
        dojo::world::WorldStorage, IWorldSystemDispatcher, IConquestDispatcher,
    ) {
        let ndef = namespace_def_world_ops();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs_world_ops());
        let (ws_addr, _) = world.dns(@"world_system").unwrap();
        let (cq_addr, _) = world.dns(@"conquest").unwrap();
        (
            world,
            IWorldSystemDispatcher { contract_address: ws_addr },
            IConquestDispatcher { contract_address: cq_addr },
        )
    }

    /// Build the mainnet-sized 12x8 grid, row-major, exactly as
    /// scripts/init-hex-world.sh does.
    fn init_mainnet_grid(ws: IWorldSystemDispatcher) {
        let mut cols: Array<u16> = ArrayTrait::new();
        let mut rows: Array<u16> = ArrayTrait::new();
        let mut row: u16 = 0;
        while row < MAINNET_ROWS {
            let mut col: u16 = 0;
            while col < MAINNET_COLS {
                cols.append(col);
                rows.append(row);
                col += 1;
            };
            row += 1;
        };
        ws.initialize_world(cols, rows);
    }

    /// The subset struct addresses fields by name selector, so a renamed or
    /// misspelled field is NOT a compile error — it silently reads a slot that
    /// was never written and returns 0. Pin the mapping against the real model.
    #[test]
    fn test_parcel_placement_matches_parcel() {
        let (mut world, _ws) = setup();

        let owner: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
        let written = Parcel {
            parcel_id: 7, col: 3, row: 5, parcel_type: 1, owner, is_home: true,
        };
        world.write_model_test(@written);

        let placement: ParcelPlacement = world
            .read_schema(Model::<Parcel>::ptr_from_keys(7_u32));

        assert(placement.col == 3, 'placement col mismatch');
        assert(placement.row == 5, 'placement row mismatch');
        assert(placement.owner == owner, 'placement owner mismatch');

        // An unwritten parcel must read as zeroes, not as garbage — this is the
        // case the sweep relies on to detect unclaimed land.
        let empty: ParcelPlacement = world
            .read_schema(Model::<Parcel>::ptr_from_keys(8_u32));
        let zero_addr: starknet::ContractAddress = 0.try_into().unwrap();
        assert(empty.owner == zero_addr, 'empty owner should be zero');
    }

    /// Gas canary: registration at mainnet grid size. The number printed for
    /// this test is the one that matters — it is the sponsored onboarding
    /// transaction, and the paymaster starts refusing work around 100M L2 gas.
    #[test]
    fn test_register_player_at_mainnet_grid() {
        let (mut world, ws) = setup();
        init_mainnet_grid(ws);

        let config: WorldConfig = world.read_model(0_u8);
        assert(config.total_parcels == 96, 'grid should be 96 parcels');

        let player: starknet::ContractAddress = 0xA1.try_into().unwrap();
        starknet::testing::set_account_contract_address(player);
        starknet::testing::set_contract_address(player);
        ws.register_player(array![0, 1, 2]);

        let kingdom: PlayerKingdom = world.read_model(player);
        assert(kingdom.registered, 'should be registered');
        assert(kingdom.parcel_count == 3, 'should hold 3 parcels');

        // Homes must be distinct and typed as requested.
        assert(kingdom.home_0 != kingdom.home_1, 'homes 0/1 must differ');
        assert(kingdom.home_1 != kingdom.home_2, 'homes 1/2 must differ');
        assert(kingdom.home_0 != kingdom.home_2, 'homes 0/2 must differ');

        let h0: Parcel = world.read_model(kingdom.home_0);
        let h1: Parcel = world.read_model(kingdom.home_1);
        let h2: Parcel = world.read_model(kingdom.home_2);
        assert(h0.owner == player, 'home 0 owner wrong');
        assert(h1.owner == player, 'home 1 owner wrong');
        assert(h2.owner == player, 'home 2 owner wrong');
        assert(h0.is_home && h1.is_home && h2.is_home, 'homes must be flagged');
        assert(h0.parcel_type == 0, 'home 0 type wrong');
        assert(h1.parcel_type == 1, 'home 1 type wrong');
        assert(h2.parcel_type == 2, 'home 2 type wrong');
    }

    /// Second registration on a populated grid — this is the expensive case,
    /// because the anchor selection compares every unclaimed parcel against
    /// every claimed one.
    #[test]
    fn test_second_register_at_mainnet_grid() {
        let (mut world, ws) = setup();
        init_mainnet_grid(ws);

        let first: starknet::ContractAddress = 0xA1.try_into().unwrap();
        starknet::testing::set_account_contract_address(first);
        starknet::testing::set_contract_address(first);
        ws.register_player(array![0, 1, 2]);

        let second: starknet::ContractAddress = 0xA2.try_into().unwrap();
        starknet::testing::set_account_contract_address(second);
        starknet::testing::set_contract_address(second);
        ws.register_player(array![2, 1, 0]);

        let kingdom: PlayerKingdom = world.read_model(second);
        assert(kingdom.registered, 'second should be registered');
        assert(kingdom.parcel_count == 3, 'second should hold 3');

        // The two players must not share a home parcel.
        let first_kingdom: PlayerKingdom = world.read_model(first);
        assert(kingdom.home_0 != first_kingdom.home_0, 'home collision 0');
        assert(kingdom.home_0 != first_kingdom.home_1, 'home collision 1');
        assert(kingdom.home_0 != first_kingdom.home_2, 'home collision 2');
    }

    fn register_as(ws: IWorldSystemDispatcher, player: starknet::ContractAddress) {
        starknet::testing::set_account_contract_address(player);
        starknet::testing::set_contract_address(player);
        ws.register_player(array![0, 1, 2]);
    }

    /// Lowest-id unclaimed parcel. Used to hand a player an extra non-home
    /// parcel without depending on where the spatial algorithm put their homes.
    fn first_unclaimed(ref world: dojo::world::WorldStorage) -> u32 {
        let zero: starknet::ContractAddress = 0.try_into().unwrap();
        let mut id: u32 = 0;
        let mut found: u32 = 0;
        let mut ok = false;
        while id < 96 {
            if !ok {
                let p: Parcel = world.read_model(id);
                if p.owner == zero {
                    found = id;
                    ok = true;
                }
            }
            id += 1;
        };
        assert(ok, 'no unclaimed parcel');
        found
    }

    /// Lowest-id unclaimed parcel bordering any of the player's three homes.
    /// A single home can be boxed in — the spatial algorithm clusters the three
    /// homes, so a corner home's whole neighbourhood may already be claimed.
    fn unclaimed_neighbor_of_homes(
        ref world: dojo::world::WorldStorage, home_0: u32, home_1: u32, home_2: u32,
    ) -> u32 {
        let zero: starknet::ContractAddress = 0.try_into().unwrap();
        let h0: Parcel = world.read_model(home_0);
        let h1: Parcel = world.read_model(home_1);
        let h2: Parcel = world.read_model(home_2);

        let mut id: u32 = 0;
        let mut found: u32 = 0;
        let mut ok = false;
        while id < 96 {
            if !ok {
                let p: Parcel = world.read_model(id);
                let borders = siege_dojo::utils::hex::is_neighbor(p.col, p.row, h0.col, h0.row)
                    || siege_dojo::utils::hex::is_neighbor(p.col, p.row, h1.col, h1.row)
                    || siege_dojo::utils::hex::is_neighbor(p.col, p.row, h2.col, h2.row);
                if p.owner == zero && borders {
                    found = id;
                    ok = true;
                }
            }
            id += 1;
        };
        assert(ok, 'no unclaimed neighbor');
        found
    }

    /// Gas canary: settling a decided staked match at mainnet grid size. Settle
    /// sweeps the map for the loser's furthest non-home parcel and the winner's
    /// pillage adjacency, so its cost scales with the grid the same way
    /// registration's does. Stakes are empty so no ERC-1155 wiring is needed —
    /// the map sweep is what this measures.
    #[test]
    fn test_settle_match_at_mainnet_grid() {
        let (mut world, ws, _) = setup_world_ops();
        init_mainnet_grid(ws);

        let winner: starknet::ContractAddress = 0xA1.try_into().unwrap();
        let loser: starknet::ContractAddress = 0xA2.try_into().unwrap();
        register_as(ws, winner);
        register_as(ws, loser);

        // Give the loser a non-home parcel — that is what settle releases.
        let extra = first_unclaimed(ref world);
        let mut extra_parcel: Parcel = world.read_model(extra);
        extra_parcel.owner = loser;
        world.write_model_test(@extra_parcel);
        let mut loser_kingdom: PlayerKingdom = world.read_model(loser);
        loser_kingdom.parcel_count += 1;
        world.write_model_test(@loser_kingdom);

        // A finished staked match with no ability wager.
        world
            .write_model_test(
                @MatchState1v1 {
                    match_id: 1,
                    player_a: winner,
                    player_b: loser,
                    vault_a_hp: 30,
                    vault_b_hp: 0,
                    current_round: 5,
                    status: MatchStatus::Finished,
                },
            );
        world
            .write_model_test(
                @MatchStakes1v1 {
                    match_id: 1,
                    a_stake_1: 0, a_stake_2: 0, a_stake_3: 0,
                    b_stake_1: 0, b_stake_2: 0, b_stake_3: 0,
                    stake_count: 0,
                    settled: false,
                    staked: true,
                    parcel_claimed: false,
                },
            );

        starknet::testing::set_contract_address(winner);
        ws.settle_match(1);

        let released: Parcel = world.read_model(extra);
        let zero: starknet::ContractAddress = 0.try_into().unwrap();
        assert(released.owner == zero, 'non-home should be released');

        // The loser's homes must survive: settle excludes them by id now, not by
        // reading `is_home`, so this is the guard on that substitution.
        let after: PlayerKingdom = world.read_model(loser);
        assert(after.parcel_count == 3, 'loser should keep 3 homes');
        let h0: Parcel = world.read_model(after.home_0);
        let h1: Parcel = world.read_model(after.home_1);
        let h2: Parcel = world.read_model(after.home_2);
        assert(h0.owner == loser, 'loser home 0 released');
        assert(h1.owner == loser, 'loser home 1 released');
        assert(h2.owner == loser, 'loser home 2 released');

        let winner_kingdom: PlayerKingdom = world.read_model(winner);
        assert(winner_kingdom.total_wins == 1, 'winner should have 1 win');
    }

    /// Gas canary: a conquest attack at mainnet grid size. The attack sweeps the
    /// map once for attacker adjacency, the loss-forfeit candidate, and ally
    /// reinforcement discovery.
    #[test]
    fn test_conquest_at_mainnet_grid() {
        let (mut world, ws, conquest_sys) = setup_world_ops();
        init_mainnet_grid(ws);

        // Conquest consumes VRF unconditionally.
        let (vrf_addr, _) = starknet::syscalls::deploy_syscall(
            siege_dojo::tests::test_conquest::MockVrfProvider::TEST_CLASS_HASH
                .try_into()
                .unwrap(),
            0, array![].span(), false,
        )
            .unwrap_syscall();
        let mut rc: ResourceConfig = world.read_model(0_u8);
        rc.vrf_provider = vrf_addr;
        world.write_model_test(@rc);

        let attacker: starknet::ContractAddress = 0xA1.try_into().unwrap();
        let defender: starknet::ContractAddress = 0xA2.try_into().unwrap();
        register_as(ws, attacker);
        register_as(ws, defender);

        let atk_kingdom: PlayerKingdom = world.read_model(attacker);

        // Target: a non-home parcel of the defender's bordering an attacker home.
        let target_id = unclaimed_neighbor_of_homes(
            ref world, atk_kingdom.home_0, atk_kingdom.home_1, atk_kingdom.home_2,
        );
        let mut target: Parcel = world.read_model(target_id);
        target.owner = defender;
        world.write_model_test(@target);
        let mut def_kingdom: PlayerKingdom = world.read_model(defender);
        def_kingdom.parcel_count += 1;
        world.write_model_test(@def_kingdom);

        // The attacker's own non-home parcel — forfeited when the attack fails.
        let forfeit_id = first_unclaimed(ref world);
        let mut forfeit: Parcel = world.read_model(forfeit_id);
        forfeit.owner = attacker;
        world.write_model_test(@forfeit);
        let mut atk_kingdom_w: PlayerKingdom = world.read_model(attacker);
        atk_kingdom_w.parcel_count += 1;
        world.write_model_test(@atk_kingdom_w);

        // No presets, no faction: the defender fights with the default 2/2/2
        // garrison, which repels an attacker who brings no gate defense.
        starknet::testing::set_contract_address(attacker);
        conquest_sys.initiate_conquest(target_id, 3, 3, 4, 0, 0, 0, 0, 0);

        let held: Parcel = world.read_model(target_id);
        assert(held.owner == defender, 'default def should hold target');

        // The forfeited parcel must be the non-home one — the sweep now excludes
        // the attacker's homes by id instead of reading `is_home`.
        let lost: Parcel = world.read_model(forfeit_id);
        assert(lost.owner == defender, 'non-home should be forfeited');
        let h0: Parcel = world.read_model(atk_kingdom.home_0);
        let h1: Parcel = world.read_model(atk_kingdom.home_1);
        let h2: Parcel = world.read_model(atk_kingdom.home_2);
        assert(h0.owner == attacker, 'attacker home 0 forfeited');
        assert(h1.owner == attacker, 'attacker home 1 forfeited');
        assert(h2.owner == attacker, 'attacker home 2 forfeited');
    }
}
