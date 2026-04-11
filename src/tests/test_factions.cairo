#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::world;
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, WorldStorageTestTrait};
    use starknet::contract_address_const;
    use siege_dojo::models::faction::{Faction, FactionCounter, m_Faction, m_FactionCounter};
    use siege_dojo::models::faction_member::{FactionMember, m_FactionMember};
    use siege_dojo::models::faction_invite::{FactionInvite, m_FactionInvite};

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_Faction::TEST_CLASS_HASH),
                TestResource::Model(m_FactionCounter::TEST_CLASS_HASH),
                TestResource::Model(m_FactionMember::TEST_CLASS_HASH),
                TestResource::Model(m_FactionInvite::TEST_CLASS_HASH),
            ].span()
        }
    }

    #[test]
    fn test_faction_model() {
        let ndef = namespace_def();
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
        let ndef = namespace_def();
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
        let ndef = namespace_def();
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
}
