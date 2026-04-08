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
}
