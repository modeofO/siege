#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::world;
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource};

    use starknet::contract_address_const;

    use siege_dojo::models::player_kingdom::{PlayerKingdom, m_PlayerKingdom};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [TestResource::Model(m_PlayerKingdom::TEST_CLASS_HASH)].span(),
        }
    }

    #[test]
    fn test_player_kingdom_has_tier_and_wins() {
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());

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
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());

        let player = contract_address_const::<0xBEEF>();

        // Write a kingdom with tier 0 (Polis, default)
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
}
