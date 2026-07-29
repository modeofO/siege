/// Cube coordinates for a hex cell. Always satisfies x + y + z == 0.
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct Cube {
    pub x: i64,
    pub y: i64,
    pub z: i64,
}

/// Convert an even-row offset cell to cube coordinates.
///
/// Callers sweeping the map should hoist this out of their inner loop: the
/// widening, parity modulo and signed division here are the bulk of what a
/// distance costs, and a fixed endpoint only needs converting once.
pub fn offset_to_cube(col: u16, row: u16) -> Cube {
    let c: i64 = col.into();
    let r: i64 = row.into();
    // even-row offset: parity via modulo on the original u16 row
    let parity: i64 = (row % 2).into();

    let x: i64 = c - (r - parity) / 2;
    let z: i64 = r;
    let y: i64 = -x - z;

    Cube { x, y, z }
}

/// Hex distance between two cells already in cube coordinates.
pub fn cube_distance(a: Cube, b: Cube) -> u16 {
    let dx = abs_i64(a.x - b.x);
    let dy = abs_i64(a.y - b.y);
    let dz = abs_i64(a.z - b.z);

    let max_val = max_i64(dx, max_i64(dy, dz));
    max_val.try_into().unwrap()
}

/// Compute hex distance between two cells using offset coordinates (even-row).
/// Converts to cube coordinates internally.
pub fn hex_distance(col1: u16, row1: u16, col2: u16, row2: u16) -> u16 {
    cube_distance(offset_to_cube(col1, row1), offset_to_cube(col2, row2))
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
