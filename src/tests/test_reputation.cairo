#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource};

    use starknet::contract_address_const;

    use siege_dojo::models::player_reputation::{PlayerReputation, m_PlayerReputation};
    use siege_dojo::models::match_record::{MatchRecord, m_MatchRecord};
    use siege_dojo::systems::world_system::calculate_bracket;

    #[test]
    fn test_player_reputation_model() {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [NamespaceDef {
            namespace: "siege_dojo",
            resources: [TestResource::Model(m_PlayerReputation::TEST_CLASS_HASH)].span(),
        }].span());

        let player = contract_address_const::<0xCAFE>();

        let rep = PlayerReputation {
            player,
            total_losses: 5,
            current_streak: 3,
            best_streak: 7,
            bracket: 2,
        };
        world.write_model_test(@rep);

        let read_back: PlayerReputation = world.read_model(player);
        assert(read_back.total_losses == 5, 'total_losses should be 5');
        assert(read_back.current_streak == 3, 'current_streak should be 3');
        assert(read_back.best_streak == 7, 'best_streak should be 7');
        assert(read_back.bracket == 2, 'bracket should be 2');
    }

    #[test]
    fn test_match_record_model() {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [NamespaceDef {
            namespace: "siege_dojo",
            resources: [TestResource::Model(m_MatchRecord::TEST_CLASS_HASH)].span(),
        }].span());

        let player = contract_address_const::<0x1111>();
        let opponent = contract_address_const::<0x2222>();

        let record = MatchRecord {
            player,
            opponent,
            wins: 4,
            losses: 2,
            last_match_id: 99,
        };
        world.write_model_test(@record);

        let read_back: MatchRecord = world.read_model((player, opponent));
        assert(read_back.wins == 4, 'wins should be 4');
        assert(read_back.losses == 2, 'losses should be 2');
        assert(read_back.last_match_id == 99, 'last_match_id should be 99');
    }

    #[test]
    fn test_bracket_newcomer() {
        assert(calculate_bracket(3, 2) == 0, '5 matches: newcomer');
        assert(calculate_bracket(0, 0) == 0, '0 matches: newcomer');
        assert(calculate_bracket(5, 4) == 0, '9 matches: newcomer');
    }

    #[test]
    fn test_bracket_developing() {
        assert(calculate_bracket(5, 5) == 1, '10 matches 50%: developing');
        assert(calculate_bracket(2, 8) == 1, '10 matches 20%: developing');
    }

    #[test]
    fn test_bracket_experienced() {
        assert(calculate_bracket(15, 15) == 2, '30 matches 50%: experienced');
        assert(calculate_bracket(13, 17) == 2, '30 matches 43%: experienced');
        assert(calculate_bracket(12, 18) == 1, '30 matches 40%: developing');
    }

    #[test]
    fn test_bracket_veteran() {
        assert(calculate_bracket(35, 25) == 3, '60 matches 58%: veteran');
        assert(calculate_bracket(30, 30) == 2, '60 matches 50%: experienced');
    }

    #[test]
    fn test_bracket_elite() {
        assert(calculate_bracket(60, 40) == 4, '100 matches 60%: elite');
        assert(calculate_bracket(56, 44) == 4, '100 matches 56%: elite');
        assert(calculate_bracket(55, 45) == 3, '100 matches 55%: veteran');
        assert(calculate_bracket(40, 60) == 1, '100 matches 40%: developing');
    }

    #[test]
    fn test_bracket_drop() {
        assert(calculate_bracket(90, 110) == 2, '200 matches 45%: experienced');
        assert(calculate_bracket(60, 140) == 1, '200 matches 30%: developing');
    }
}
