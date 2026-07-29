#[cfg(test)]
mod tests {
    use siege_dojo::utils::hex;

    #[test]
    fn test_hex_distance_same_cell() {
        assert(hex::hex_distance(3, 3, 3, 3) == 0, 'same cell should be 0');
    }

    #[test]
    fn test_hex_distance_adjacent() {
        assert(hex::hex_distance(1, 0, 2, 0) == 1, 'adjacent should be 1');
    }

    #[test]
    fn test_hex_distance_two_away() {
        assert(hex::hex_distance(0, 0, 2, 0) == 2, 'two apart should be 2');
    }

    #[test]
    fn test_hex_distance_diagonal() {
        assert(hex::hex_distance(0, 0, 0, 2) == 2, 'diagonal should be 2');
    }

    #[test]
    fn test_neighbors_even_row_center() {
        let n = hex::get_hex_neighbors(2, 2);
        assert(n.len() == 6, 'center should have 6 neighbors');
    }

    #[test]
    fn test_neighbors_even_row_corner() {
        let n = hex::get_hex_neighbors(0, 0);
        assert(n.len() == 2, 'corner should have 2 neighbors');
    }

    #[test]
    fn test_neighbors_odd_row() {
        let n = hex::get_hex_neighbors(1, 1);
        assert(n.len() == 6, 'odd row center should have 6');
    }

    #[test]
    fn test_is_neighbor_true() {
        assert(hex::is_neighbor(1, 0, 2, 0), 'should be neighbors');
    }

    #[test]
    fn test_is_neighbor_false() {
        assert(!hex::is_neighbor(0, 0, 3, 3), 'should not be neighbors');
    }

    // The map sweeps in world_system and conquest hoist offset_to_cube out of
    // their inner loops and call cube_distance directly, so that pair has to
    // stay exactly equal to hex_distance or selection results drift. Sweeps
    // every (col, row) pair over a 6x6 block, which covers all four
    // even/odd row-parity combinations.
    #[test]
    fn test_cube_matches_hex_distance_over_grid() {
        let mut c1: u16 = 0;
        while c1 < 6 {
            let mut r1: u16 = 0;
            while r1 < 6 {
                let a = hex::offset_to_cube(c1, r1);
                let mut c2: u16 = 0;
                while c2 < 6 {
                    let mut r2: u16 = 0;
                    while r2 < 6 {
                        let b = hex::offset_to_cube(c2, r2);
                        assert(
                            hex::cube_distance(a, b) == hex::hex_distance(c1, r1, c2, r2),
                            'cube != hex distance',
                        );
                        r2 += 1;
                    };
                    c2 += 1;
                };
                r1 += 1;
            };
            c1 += 1;
        };
    }

    // x + y + z == 0 is the cube-coordinate invariant; if a conversion ever
    // breaks it, cube_distance silently returns garbage.
    #[test]
    fn test_offset_to_cube_invariant() {
        let mut col: u16 = 0;
        while col < 6 {
            let mut row: u16 = 0;
            while row < 6 {
                let c = hex::offset_to_cube(col, row);
                assert(c.x + c.y + c.z == 0, 'cube coords must sum to 0');
                assert(c.z == row.into(), 'cube z must be the row');
                row += 1;
            };
            col += 1;
        };
    }
}
