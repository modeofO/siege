/// Compute hex distance between two cells using offset coordinates (even-row).
/// Converts to cube coordinates internally.
pub fn hex_distance(col1: u16, row1: u16, col2: u16, row2: u16) -> u16 {
    let c1: i64 = col1.into();
    let r1: i64 = row1.into();
    let c2: i64 = col2.into();
    let r2: i64 = row2.into();

    // even-row offset: parity via modulo on the original u16 row
    let r1_parity: i64 = (row1 % 2).into();
    let r2_parity: i64 = (row2 % 2).into();

    let x1: i64 = c1 - (r1 - r1_parity) / 2;
    let z1: i64 = r1;
    let y1: i64 = -x1 - z1;

    let x2: i64 = c2 - (r2 - r2_parity) / 2;
    let z2: i64 = r2;
    let y2: i64 = -x2 - z2;

    let dx = abs_i64(x1 - x2);
    let dy = abs_i64(y1 - y2);
    let dz = abs_i64(z1 - z2);

    let max_val = max_i64(dx, max_i64(dy, dz));
    max_val.try_into().unwrap()
}

fn abs_i64(v: i64) -> i64 {
    if v < 0 { -v } else { v }
}

fn max_i64(a: i64, b: i64) -> i64 {
    if a > b { a } else { b }
}

/// Return all valid hex neighbors for a cell at (col, row) using even-row offset.
/// Filters out neighbors that would underflow (negative coordinates).
pub fn get_hex_neighbors(col: u16, row: u16) -> Array<(u16, u16)> {
    let mut neighbors: Array<(u16, u16)> = ArrayTrait::new();
    let is_even_row = (row % 2) == 0;

    if is_even_row {
        if col > 0 && row > 0 { neighbors.append((col - 1, row - 1)); }
        if row > 0 { neighbors.append((col, row - 1)); }
        if col > 0 { neighbors.append((col - 1, row)); }
        neighbors.append((col + 1, row));
        if col > 0 { neighbors.append((col - 1, row + 1)); }
        neighbors.append((col, row + 1));
    } else {
        if row > 0 { neighbors.append((col, row - 1)); }
        if row > 0 { neighbors.append((col + 1, row - 1)); }
        if col > 0 { neighbors.append((col - 1, row)); }
        neighbors.append((col + 1, row));
        neighbors.append((col, row + 1));
        neighbors.append((col + 1, row + 1));
    }

    neighbors
}

/// Check if two cells are hex neighbors.
pub fn is_neighbor(col1: u16, row1: u16, col2: u16, row2: u16) -> bool {
    hex_distance(col1, row1, col2, row2) == 1
}
