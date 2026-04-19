#[starknet::interface]
pub trait ICommitReveal1v1<T> {
    fn commit(ref self: T, match_id: u64, commitment: felt252);
    fn reveal(
        ref self: T,
        match_id: u64,
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
        trap0: u8, trap1: u8, trap2: u8,
        ability_id: u8, ability_target: u8,
    );
    fn force_timeout(ref self: T, match_id: u64);
}

#[dojo::contract]
pub mod commit_reveal_1v1 {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::world::WorldStorageTrait;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::MatchState1v1;
    use siege_dojo::models::node_state::{NodeState, NodeOwner};
    use siege_dojo::models::commitment::Commitment;
    use siege_dojo::models::round_moves_1v1::RoundMoves1v1;
    use siege_dojo::models::round_traps_1v1::RoundTraps1v1;
    use siege_dojo::models::match_abilities_1v1::MatchAbilities1v1;
    use siege_dojo::systems::resolution_1v1::{IResolution1v1Dispatcher, IResolution1v1DispatcherTrait};
    use siege_dojo::models::events::{MoveCommitted, MoveRevealed};
    use dojo::event::EventStorage;

    const COMMIT_TIMEOUT: u64 = 300;
    const REVEAL_TIMEOUT: u64 = 300;

    const ROLE_A: u8 = 0;
    const ROLE_B: u8 = 1;

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"siege_dojo")
        }
    }

    fn get_player_role(state: @MatchState1v1, caller: ContractAddress) -> u8 {
        if caller == *state.player_a {
            ROLE_A
        } else if caller == *state.player_b {
            ROLE_B
        } else {
            panic!("Not a player in this match")
        }
    }

    fn calc_budget(world: @dojo::world::WorldStorage, match_id: u64, is_player_a: bool) -> u8 {
        let target = if is_player_a { NodeOwner::TeamA } else { NodeOwner::TeamB };
        let mut bonus: u8 = 0;
        let mut i: u8 = 0;
        while i < 3 {
            let node: NodeState = world.read_model((match_id, i));
            if node.owner == target {
                bonus += 1;
            }
            i += 1;
        };
        10 + bonus
    }

    #[abi(embed_v0)]
    impl CommitReveal1v1Impl of super::ICommitReveal1v1<ContractState> {
        fn commit(ref self: ContractState, match_id: u64, commitment: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Active, 'Match not active');

            let role = get_player_role(@state, caller);
            let round = state.current_round;

            let existing: Commitment = world.read_model((match_id, round, role));
            assert(!existing.committed, 'Already committed');

            world.write_model(@Commitment {
                match_id, round, role,
                hash: commitment,
                committed: true,
                revealed: false,
            });

            let mut rm: RoundMoves1v1 = world.read_model((match_id, round));
            rm.commit_count += 1;

            if rm.commit_count == 1 {
                rm.commit_deadline = get_block_timestamp() + COMMIT_TIMEOUT;
            }
            if rm.commit_count == 2 {
                rm.reveal_deadline = get_block_timestamp() + REVEAL_TIMEOUT;
            }

            world.write_model(@rm);

            world.emit_event(@MoveCommitted { match_id, round, role });
        }

        fn reveal(
            ref self: ContractState,
            match_id: u64,
            salt: felt252,
            p0: u8, p1: u8, p2: u8,
            g0: u8, g1: u8, g2: u8,
            repair: u8,
            nc0: u8, nc1: u8, nc2: u8,
            trap0: u8, trap1: u8, trap2: u8,
            ability_id: u8, ability_target: u8,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Active, 'Match not active');

            let role = get_player_role(@state, caller);
            let round = state.current_round;

            let rm: RoundMoves1v1 = world.read_model((match_id, round));
            assert(rm.commit_count == 2, 'Not all committed');

            let mut c: Commitment = world.read_model((match_id, round, role));
            assert(c.committed, 'Not committed');
            assert(!c.revealed, 'Already revealed');

            // Verify hash: H(salt, p0..p2, g0..g2, repair, nc0..nc2, trap0..trap2)
            let mut h = PoseidonTrait::new();
            h = h.update(salt);
            h = h.update(p0.into());
            h = h.update(p1.into());
            h = h.update(p2.into());
            h = h.update(g0.into());
            h = h.update(g1.into());
            h = h.update(g2.into());
            h = h.update(repair.into());
            h = h.update(nc0.into());
            h = h.update(nc1.into());
            h = h.update(nc2.into());
            h = h.update(trap0.into());
            h = h.update(trap1.into());
            h = h.update(trap2.into());
            h = h.update(ability_id.into());
            h = h.update(ability_target.into());
            let computed = h.finalize();
            assert(computed == c.hash, 'Invalid reveal');

            // Budget check: allocations + trap costs <= budget
            let is_player_a = role == ROLE_A;
            let budget = calc_budget(@world, match_id, is_player_a);
            let trap_cost: u16 = (trap0.into() + trap1.into() + trap2.into()) * 2;
            let total: u16 = p0.into() + p1.into() + p2.into()
                + g0.into() + g1.into() + g2.into()
                + repair.into()
                + nc0.into() + nc1.into() + nc2.into()
                + trap_cost;
            assert(total <= budget.into(), 'Over budget');

            // Trap validation: can only trap nodes you own, trap must be 0 or 1
            assert(trap0 <= 1 && trap1 <= 1 && trap2 <= 1, 'Invalid trap value');
            let owner_team = if is_player_a { NodeOwner::TeamA } else { NodeOwner::TeamB };
            if trap0 == 1 {
                let n: NodeState = world.read_model((match_id, 0_u8));
                assert(n.owner == owner_team, 'Cannot trap unowned node');
            }
            if trap1 == 1 {
                let n: NodeState = world.read_model((match_id, 1_u8));
                assert(n.owner == owner_team, 'Cannot trap unowned node');
            }
            if trap2 == 1 {
                let n: NodeState = world.read_model((match_id, 2_u8));
                assert(n.owner == owner_team, 'Cannot trap unowned node');
            }

            // Ability validation
            if ability_id > 0 {
                assert(ability_id <= 10, 'Invalid ability ID');
                assert(ability_target <= 2, 'Invalid ability target');

                let mut abilities: MatchAbilities1v1 = world.read_model(match_id);

                if is_player_a {
                    let mut found = false;
                    if abilities.a_ability_1 == ability_id && !abilities.a_used_1 {
                        abilities.a_used_1 = true;
                        found = true;
                    } else if abilities.a_ability_2 == ability_id && !abilities.a_used_2 {
                        abilities.a_used_2 = true;
                        found = true;
                    } else if abilities.a_ability_3 == ability_id && !abilities.a_used_3 {
                        abilities.a_used_3 = true;
                        found = true;
                    }
                    assert(found, 'Ability not available');
                } else {
                    let mut found = false;
                    if abilities.b_ability_1 == ability_id && !abilities.b_used_1 {
                        abilities.b_used_1 = true;
                        found = true;
                    } else if abilities.b_ability_2 == ability_id && !abilities.b_used_2 {
                        abilities.b_used_2 = true;
                        found = true;
                    } else if abilities.b_ability_3 == ability_id && !abilities.b_used_3 {
                        abilities.b_used_3 = true;
                        found = true;
                    }
                    assert(found, 'Ability not available');
                }

                world.write_model(@abilities);
            }

            c.revealed = true;
            world.write_model(@c);

            let mut rm: RoundMoves1v1 = world.read_model((match_id, round));
            rm.reveal_count += 1;

            if role == ROLE_A {
                rm.a_p0 = p0; rm.a_p1 = p1; rm.a_p2 = p2;
                rm.a_g0 = g0; rm.a_g1 = g1; rm.a_g2 = g2;
                rm.a_repair = repair;
                rm.a_nc0 = nc0; rm.a_nc1 = nc1; rm.a_nc2 = nc2;
                rm.a_ability_id = ability_id;
                rm.a_ability_target = ability_target;
            } else {
                rm.b_p0 = p0; rm.b_p1 = p1; rm.b_p2 = p2;
                rm.b_g0 = g0; rm.b_g1 = g1; rm.b_g2 = g2;
                rm.b_repair = repair;
                rm.b_nc0 = nc0; rm.b_nc1 = nc1; rm.b_nc2 = nc2;
                rm.b_ability_id = ability_id;
                rm.b_ability_target = ability_target;
            }

            world.write_model(@rm);

            // Write traps to separate model (RoundTraps1v1)
            let mut traps: RoundTraps1v1 = world.read_model((match_id, round));
            if role == ROLE_A {
                traps.a_trap0 = trap0; traps.a_trap1 = trap1; traps.a_trap2 = trap2;
            } else {
                traps.b_trap0 = trap0; traps.b_trap1 = trap1; traps.b_trap2 = trap2;
            }
            world.write_model(@traps);

            world.emit_event(@MoveRevealed { match_id, round, role });
        }

        fn force_timeout(ref self: ContractState, match_id: u64) {
            let mut world = self.world_default();
            let state: MatchState1v1 = world.read_model(match_id);
            assert(state.status == MatchStatus::Active, 'Match not active');

            let round = state.current_round;
            let now = get_block_timestamp();
            let mut rm: RoundMoves1v1 = world.read_model((match_id, round));

            if rm.commit_count < 2 && rm.commit_count > 0 {
                assert(now >= rm.commit_deadline, 'Commit deadline not reached');
                let mut r: u8 = 0;
                while r < 2 {
                    let c: Commitment = world.read_model((match_id, round, r));
                    if !c.committed {
                        world.write_model(@Commitment {
                            match_id, round, role: r,
                            hash: 0,
                            committed: true,
                            revealed: false,
                        });
                    }
                    r += 1;
                };
                rm.commit_count = 2;
                rm.reveal_deadline = now + REVEAL_TIMEOUT;
                world.write_model(@rm);
            }

            if rm.commit_count == 2 && rm.reveal_count < 2 {
                assert(now >= rm.reveal_deadline, 'Reveal deadline not reached');
                let mut r: u8 = 0;
                while r < 2 {
                    let c: Commitment = world.read_model((match_id, round, r));
                    if !c.revealed {
                        world.write_model(@Commitment {
                            match_id, round, role: r,
                            hash: c.hash,
                            committed: true,
                            revealed: true,
                        });
                        rm.reveal_count += 1;
                    }
                    r += 1;
                };
                world.write_model(@rm);

                let (res_addr, _) = world.dns(@"resolution_1v1").unwrap();
                let res = IResolution1v1Dispatcher { contract_address: res_addr };
                res.resolve_round(match_id);
            }
        }
    }
}
