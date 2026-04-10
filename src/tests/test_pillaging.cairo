#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::world;
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, WorldStorageTestTrait};
    use starknet::contract_address_const;
    use siege_dojo::models::pillage_eligibility::{PillageEligibility, m_PillageEligibility};
    use siege_dojo::models::pillage::{Pillage, m_Pillage};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_PillageEligibility::TEST_CLASS_HASH),
                TestResource::Model(m_Pillage::TEST_CLASS_HASH),
            ].span()
        }
    }

    #[test]
    fn test_pillage_eligibility_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let winner = contract_address_const::<0x1>();
        let loser = contract_address_const::<0x2>();
        world.write_model_test(@PillageEligibility {
            winner,
            match_id: 42,
            loser,
            granted_at: 100,
            expires_at: 86500,
            used: false,
        });

        let e: PillageEligibility = world.read_model((winner, 42_u64));
        assert(e.loser == loser, 'loser should match');
        assert(e.granted_at == 100, 'granted_at should be 100');
        assert(!e.used, 'should not be used');
    }

    #[test]
    fn test_pillage_model() {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

        let pillager = contract_address_const::<0x1>();
        let target = contract_address_const::<0x2>();
        world.write_model_test(@Pillage {
            home_parcel_id: 7,
            pillager,
            target,
            start_time: 100,
            expires_at: 86500,
            last_claim_time: 100,
            active: true,
        });

        let p: Pillage = world.read_model(7_u32);
        assert(p.pillager == pillager, 'pillager should match');
        assert(p.active, 'should be active');
    }
}
