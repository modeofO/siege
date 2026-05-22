> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Ability Tiers (T2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add T2 tier to all 5 ability types with consume-to-upgrade crafting, token IDs 6-10, weaker T1 effects, and gold-border T2 metadata.

**Architecture:** Token IDs 1-5 stay T1 (existing), IDs 6-10 become T2. `resolution_1v1` reads token ID, derives type and tier, applies tier-specific effects. `crafting_1v1` gets a new `craft_ability_tier2` function that burns T1 + 5x resources and mints T2. `ability_metadata` wraps T2 SVGs with a gold border at read time.

**Tech Stack:** Cairo 2.13.1, Dojo v1.8.0, Next.js, React 19

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/tokens/ability_metadata.cairo` | Support token IDs 1-10, tier-aware names/descriptions, gold border for T2 |
| Modify | `src/tokens/ability_token.cairo` | Expand `uri()` cap from 5 to 10 |
| Modify | `src/systems/crafting_1v1.cairo` | Add `craft_ability_tier2` function |
| Modify | `src/systems/commit_reveal_1v1.cairo` | Update validation from `<= 5` to `<= 10` |
| Modify | `src/systems/resolution_1v1.cairo` | Tier-aware effect values, weaker T1 |
| Modify | `src/systems/world_system.cairo` | Update staking validation `<= 10` |
| Create | `src/tests/test_ability_tiers.cairo` | Crafting + resolution tests for T2 |
| Modify | `src/tests/test_abilities_1v1.cairo` | Update T1 effect tests (now weaker) |
| Modify | `src/lib.cairo` | Register new test module |
| Modify | `frontend/src/lib/craftingContracts.ts` | 10 ABILITIES entries + helpers + `craftAbilityTier2` |
| Modify | `frontend/src/components/AbilitySelector.tsx` | Tier badge + gold accent for T2 |

---

### Task 1: Expand Metadata to Support 10 Token IDs

**Files:**
- Modify: `src/tokens/ability_metadata.cairo`
- Modify: `src/tokens/ability_token.cairo`

- [ ] **Step 1: Update ability_metadata.cairo to accept token IDs 1-10**

Replace the contents of `src/tokens/ability_metadata.cairo` with:

```cairo
// Builds on-chain metadata data URIs for ability tokens.
//
// Entry point: build_ability_data_uri(token_id, svg) -> ByteArray
// Returns: "data:application/json;base64,<base64-encoded JSON>"
//
// Token IDs 1-5 are T1 abilities, 6-10 are T2. Each tier gets a
// different name suffix and description. T2 wraps the SVG with a gold border.

use super::base64::bytes_base64_encode;

/// Derive ability type (1-5) from token ID (1-10).
fn ability_type_from_token(token_id: u8) -> u8 {
    ((token_id - 1) % 5) + 1
}

/// Derive tier (1 or 2) from token ID (1-10).
fn ability_tier_from_token(token_id: u8) -> u8 {
    ((token_id - 1) / 5) + 1
}

/// Build a complete `data:application/json;base64,...` URI for the given token.
/// `svg` is the raw SVG string for the ability type (tier does not affect which SVG).
/// Returns an empty ByteArray if `token_id` is not 1-10.
pub fn build_ability_data_uri(token_id: u8, svg: ByteArray) -> ByteArray {
    if token_id == 0 || token_id > 10 {
        return "";
    }

    let ability_type = ability_type_from_token(token_id);
    let tier = ability_tier_from_token(token_id);

    let base_name = get_ability_name(ability_type);
    let description = get_ability_description(ability_type, tier);
    let cost = get_ability_cost_string(ability_type, tier);

    if base_name.len() == 0 {
        return "";
    }

    // Build full name with tier suffix
    let mut name: ByteArray = "";
    name.append(@base_name);
    if tier == 2 {
        name.append(@" (T2)");
    }

    // Build the image data URI, wrapping with gold border if T2
    let image = if svg.len() > 0 {
        let wrapped_svg = if tier == 2 {
            wrap_svg_with_gold_border(svg)
        } else {
            svg
        };
        let encoded_svg = bytes_base64_encode(wrapped_svg);
        let mut img: ByteArray = "data:image/svg+xml;base64,";
        img.append(@encoded_svg);
        img
    } else {
        ""
    };

    // Build JSON
    let mut json: ByteArray = "";
    json.append(@"{");

    json.append(@"\"name\":\"");
    json.append(@name);
    json.append(@"\",");

    json.append(@"\"description\":\"");
    json.append(@description);
    json.append(@"\",");

    json.append(@"\"image\":\"");
    json.append(@image);
    json.append(@"\",");

    json.append(@"\"attributes\":[");
    json.append(@"{\"trait_type\":\"Cost\",\"value\":\"");
    json.append(@cost);
    json.append(@"\"},");
    json.append(@"{\"trait_type\":\"Tier\",\"value\":\"T");
    if tier == 1 {
        json.append(@"1");
    } else {
        json.append(@"2");
    }
    json.append(@"\"}");
    json.append(@"]");

    json.append(@"}");

    let encoded_json = bytes_base64_encode(json);
    let mut result: ByteArray = "data:application/json;base64,";
    result.append(@encoded_json);
    result
}

/// Wrap an SVG with a gold border overlay. The wrapper uses a 200x200 viewBox
/// and places the original SVG inside plus a gold stroke rectangle on top.
fn wrap_svg_with_gold_border(inner: ByteArray) -> ByteArray {
    let mut result: ByteArray = "";
    result.append(@"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" width=\"200\" height=\"200\">");
    result.append(@inner);
    result.append(@"<rect x=\"4\" y=\"4\" width=\"192\" height=\"192\" fill=\"none\" stroke=\"#daa520\" stroke-width=\"6\" rx=\"8\" ry=\"8\"/>");
    result.append(@"</svg>");
    result
}

fn get_ability_name(ability_type: u8) -> ByteArray {
    if ability_type == 1 { "Siege Sword" }
    else if ability_type == 2 { "Stone Cloak" }
    else if ability_type == 3 { "Ember Blast" }
    else if ability_type == 4 { "Hex" }
    else if ability_type == 5 { "Fortify" }
    else { "" }
}

fn get_ability_description(ability_type: u8, tier: u8) -> ByteArray {
    if ability_type == 1 {
        if tier == 1 { "Set attack on target gate to 5" }
        else { "Set attack on target gate to 10" }
    } else if ability_type == 2 {
        if tier == 1 { "Halve all gate damage taken this round" }
        else { "Zero all gate damage taken this round" }
    } else if ability_type == 3 {
        if tier == 1 { "Deal 2 direct damage bypassing gates" }
        else { "Deal 6 direct damage bypassing gates" }
    } else if ability_type == 4 {
        if tier == 1 { "Reduce opponent total damage by 3" }
        else { "Reduce opponent total damage by 8" }
    } else if ability_type == 5 {
        if tier == 1 { "Add 1 to defense at all gates" }
        else { "Double defense at all gates" }
    } else { "" }
}

fn get_ability_cost_string(ability_type: u8, tier: u8) -> ByteArray {
    if tier == 1 {
        if ability_type == 1 { "3 Iron + 2 Wood" }
        else if ability_type == 2 { "3 Stone + 2 Linen" }
        else if ability_type == 3 { "3 Ember + 2 Seeds" }
        else if ability_type == 4 { "2 Iron + 2 Stone + 1 Ember" }
        else if ability_type == 5 { "2 Stone + 2 Linen + 1 Wood" }
        else { "" }
    } else {
        if ability_type == 1 { "T1 + 30 Iron + 20 Wood + 10 Ember" }
        else if ability_type == 2 { "T1 + 30 Stone + 20 Linen + 10 Seeds" }
        else if ability_type == 3 { "T1 + 30 Ember + 20 Seeds + 10 Iron" }
        else if ability_type == 4 { "T1 + 20 Iron + 20 Stone + 10 Ember + 10 Wood" }
        else if ability_type == 5 { "T1 + 20 Stone + 20 Linen + 10 Wood" }
        else { "" }
    }
}
```

- [ ] **Step 2: Expand ability_token.cairo uri() cap**

In `src/tokens/ability_token.cairo`, find this block (around lines 91-99):

```cairo
fn uri(self: @ContractState, token_id: u256) -> ByteArray {
    // Token IDs are 1-5. Anything outside that range returns empty.
    if token_id.high != 0 || token_id.low == 0 || token_id.low > 5 {
        return "";
    }
    let ability_type: u8 = token_id.low.try_into().unwrap();
    let svg = self.ability_svgs.entry(ability_type).read();
    ability_metadata::build_ability_data_uri(ability_type, svg)
}
```

Replace with:

```cairo
fn uri(self: @ContractState, token_id: u256) -> ByteArray {
    // Token IDs 1-10: IDs 1-5 are T1, 6-10 are T2. Anything outside returns empty.
    if token_id.high != 0 || token_id.low == 0 || token_id.low > 10 {
        return "";
    }
    let tid: u8 = token_id.low.try_into().unwrap();
    // SVG is keyed by ability type (1-5), shared across tiers
    let ability_type: u8 = ((tid - 1) % 5) + 1;
    let svg = self.ability_svgs.entry(ability_type).read();
    ability_metadata::build_ability_data_uri(tid, svg)
}
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `sozo test`
Expected: All 113 tests still pass. The metadata changes are backward-compatible — T1 calls still produce valid output, and no existing test relies on the exact metadata string format.

- [ ] **Step 4: Commit**

```bash
git add src/tokens/ability_metadata.cairo src/tokens/ability_token.cairo
git commit -m "feat: expand ability token metadata to support T1/T2 tiers"
```

---

### Task 2: Update commit_reveal and staking validation

**Files:**
- Modify: `src/systems/commit_reveal_1v1.cairo`
- Modify: `src/systems/world_system.cairo`

- [ ] **Step 1: Update commit_reveal_1v1 ability validation**

In `src/systems/commit_reveal_1v1.cairo`, find this line:

```cairo
assert(ability_id <= 5, 'Invalid ability ID');
```

Replace with:

```cairo
assert(ability_id <= 10, 'Invalid ability ID');
```

- [ ] **Step 2: Update world_system staking validation**

In `src/systems/world_system.cairo`, find both occurrences of this pattern (there are two — one in `create_staked_match`, one in `join_staked_match`):

```cairo
assert(ability_id >= 1 && ability_id <= 5, 'Invalid ability ID');
```

Replace both with:

```cairo
assert(ability_id >= 1 && ability_id <= 10, 'Invalid ability ID');
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `sozo test`
Expected: All 113 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/commit_reveal_1v1.cairo src/systems/world_system.cairo
git commit -m "feat: expand ability ID validation to support T2 (1-10)"
```

---

### Task 3: Update Resolution Contract — Tier-Aware Effects

**Files:**
- Modify: `src/systems/resolution_1v1.cairo`

This task is the trickiest because it changes game balance. The current code uses token ID directly as "ability_id" for effect dispatch. We need to derive ability type and tier from the token ID, then apply tier-specific values.

- [ ] **Step 1: Add ability helper functions inside resolution_1v1.cairo**

In `src/systems/resolution_1v1.cairo`, add these helper functions inside the `impl InternalImpl` block or as standalone module functions. Place them after the existing `min_u8` function:

```cairo
fn ability_type_from_token(token_id: u8) -> u8 {
    if token_id == 0 { 0 } else { ((token_id - 1) % 5) + 1 }
}

fn ability_tier_from_token(token_id: u8) -> u8 {
    if token_id == 0 { 0 } else { ((token_id - 1) / 5) + 1 }
}
```

- [ ] **Step 2: Update Fortify block (Siege Sword and other gate-loop effects)**

In `src/systems/resolution_1v1.cairo`, find the gate loop section. Replace the ability checks inside the gate loop.

Find this block:

```cairo
// --- ABILITY: Fortify (ID 5) — double defense after modifiers ---
if a_ability == 5 {
    ad = ad * 2;
}
if b_ability == 5 {
    bd = bd * 2;
}

// --- ABILITY: Siege Sword (ID 1) — override attack on target gate ---
if a_ability == 1 && g == a_target.into() {
    aa = 10;
}
if b_ability == 1 && g == b_target.into() {
    ba = 10;
}
```

Replace with:

```cairo
// --- ABILITY: Fortify — tier-aware defense boost ---
let a_type = ability_type_from_token(a_ability);
let a_tier = ability_tier_from_token(a_ability);
let b_type = ability_type_from_token(b_ability);
let b_tier = ability_tier_from_token(b_ability);

if a_type == 5 {
    if a_tier == 1 {
        ad = ad + 1;
    } else {
        ad = ad * 2;
    }
}
if b_type == 5 {
    if b_tier == 1 {
        bd = bd + 1;
    } else {
        bd = bd * 2;
    }
}

// --- ABILITY: Siege Sword — tier-aware attack override ---
if a_type == 1 && g == a_target.into() {
    if a_tier == 1 {
        aa = 5;
    } else {
        aa = 10;
    }
}
if b_type == 1 && g == b_target.into() {
    if b_tier == 1 {
        ba = 5;
    } else {
        ba = 10;
    }
}
```

- [ ] **Step 3: Update Stone Cloak block (halve vs zero)**

Find this block:

```cairo
// --- ABILITY: Stone Cloak (ID 2) — zero all gate/overflow damage to this player ---
if a_ability == 2 {
    damage_to_a = [0, 0, 0];
    overflow_to_a = [0, 0, 0];
}
if b_ability == 2 {
    damage_to_b = [0, 0, 0];
    overflow_to_b = [0, 0, 0];
}
```

Replace with:

```cairo
// --- ABILITY: Stone Cloak — tier-aware gate damage reduction ---
let a_type_cloak = ability_type_from_token(a_ability);
let a_tier_cloak = ability_tier_from_token(a_ability);
let b_type_cloak = ability_type_from_token(b_ability);
let b_tier_cloak = ability_tier_from_token(b_ability);

if a_type_cloak == 2 {
    if a_tier_cloak == 1 {
        // T1: halve (integer division, floor)
        damage_to_a = [
            *damage_to_a.span()[0] / 2,
            *damage_to_a.span()[1] / 2,
            *damage_to_a.span()[2] / 2,
        ];
        overflow_to_a = [
            *overflow_to_a.span()[0] / 2,
            *overflow_to_a.span()[1] / 2,
            *overflow_to_a.span()[2] / 2,
        ];
    } else {
        // T2: zero
        damage_to_a = [0, 0, 0];
        overflow_to_a = [0, 0, 0];
    }
}
if b_type_cloak == 2 {
    if b_tier_cloak == 1 {
        damage_to_b = [
            *damage_to_b.span()[0] / 2,
            *damage_to_b.span()[1] / 2,
            *damage_to_b.span()[2] / 2,
        ];
        overflow_to_b = [
            *overflow_to_b.span()[0] / 2,
            *overflow_to_b.span()[1] / 2,
            *overflow_to_b.span()[2] / 2,
        ];
    } else {
        damage_to_b = [0, 0, 0];
        overflow_to_b = [0, 0, 0];
    }
}
```

- [ ] **Step 4: Update Hex block (reduce total damage)**

Find this block:

```cairo
// --- ABILITY: Hex (ID 4) — reduce opponent's total damage by 7 ---
if a_ability == 4 {
    // Player A uses Hex → reduce damage dealt TO A (by B)
    if total_dmg_to_a > 7 { total_dmg_to_a = total_dmg_to_a - 7; } else { total_dmg_to_a = 0; }
}
if b_ability == 4 {
    // Player B uses Hex → reduce damage dealt TO B (by A)
    if total_dmg_to_b > 7 { total_dmg_to_b = total_dmg_to_b - 7; } else { total_dmg_to_b = 0; }
}
```

Replace with:

```cairo
// --- ABILITY: Hex — tier-aware total damage reduction ---
let a_type_hex = ability_type_from_token(a_ability);
let a_tier_hex = ability_tier_from_token(a_ability);
let b_type_hex = ability_type_from_token(b_ability);
let b_tier_hex = ability_tier_from_token(b_ability);

if a_type_hex == 4 {
    let reduction: u8 = if a_tier_hex == 1 { 3 } else { 8 };
    if total_dmg_to_a > reduction {
        total_dmg_to_a = total_dmg_to_a - reduction;
    } else {
        total_dmg_to_a = 0;
    }
}
if b_type_hex == 4 {
    let reduction: u8 = if b_tier_hex == 1 { 3 } else { 8 };
    if total_dmg_to_b > reduction {
        total_dmg_to_b = total_dmg_to_b - reduction;
    } else {
        total_dmg_to_b = 0;
    }
}
```

- [ ] **Step 5: Update Ember Blast block (direct vault damage)**

Find this block:

```cairo
// --- ABILITY: Ember Blast (ID 3) — 5 direct vault damage, post-repair ---
if a_ability == 3 {
    if hp_b > 5 { hp_b = hp_b - 5; } else { hp_b = 0; }
}
if b_ability == 3 {
    if hp_a > 5 { hp_a = hp_a - 5; } else { hp_a = 0; }
}
```

Replace with:

```cairo
// --- ABILITY: Ember Blast — tier-aware direct vault damage ---
let a_type_ember = ability_type_from_token(a_ability);
let a_tier_ember = ability_tier_from_token(a_ability);
let b_type_ember = ability_type_from_token(b_ability);
let b_tier_ember = ability_tier_from_token(b_ability);

if a_type_ember == 3 {
    let dmg: u8 = if a_tier_ember == 1 { 2 } else { 6 };
    if hp_b > dmg { hp_b = hp_b - dmg; } else { hp_b = 0; }
}
if b_type_ember == 3 {
    let dmg: u8 = if b_tier_ember == 1 { 2 } else { 6 };
    if hp_a > dmg { hp_a = hp_a - dmg; } else { hp_a = 0; }
}
```

- [ ] **Step 6: Run tests to see what breaks**

Run: `sozo test`
Expected: Tests in `test_abilities_1v1.cairo` will FAIL because they assert the old T1 values which match the OLD effect strengths. The new T1 values are weaker, so HP values won't match.

Example: `test_siege_sword_overrides_attack` currently expects B HP = 45 after Siege Sword attack because the old code made attack = 10, not 5.

This is expected. Task 4 fixes those tests.

- [ ] **Step 7: Commit**

```bash
git add src/systems/resolution_1v1.cairo
git commit -m "feat: apply tier-aware ability effects in resolution"
```

---

### Task 4: Update test_abilities_1v1.cairo for new T1 values

**Files:**
- Modify: `src/tests/test_abilities_1v1.cairo`

The existing tests in `test_abilities_1v1.cairo` use ability IDs 1-5 which now map to T1. The expected HP outcomes need to match the weaker T1 values.

- [ ] **Step 1: Update test_siege_sword_overrides_attack**

In `src/tests/test_abilities_1v1.cairo`, find `test_siege_sword_overrides_attack`. The current setup:

```cairo
// A: atk [1,0,0], def [0,0,0], repair 0, nodes [0,0,0], ability=1 target=0, budget=1
// B: atk [0,0,0], def [5,5,0], repair 0, nodes [0,0,0], budget=10
// Siege Sword overrides A's p0 from 1 to 10
// Damage to B: max(0, 10-5) + 0 + 0 = 5
// B HP: 50 - 5 = 45, A HP: 50
```

With T1 Siege Sword setting attack to 5 instead of 10, and B defending with 5 at gate 0, damage becomes `max(0, 5-5) = 0`. B HP stays at 50.

But that's a boring test because it proves nothing. Change B's defense to 2 at gate 0 so T1 Siege Sword (5 attack) produces 3 damage:

Replace the test with:

```cairo
#[test]
fn test_siege_sword_t1_overrides_attack() {
    // Player A has T1 Siege Sword (ID 1), targets gate 0
    // A allocations: atk [1,0,0], def [0,0,0], repair 0, nodes [0,0,0], ability=1 target=0, budget=1
    // B allocations: atk [0,0,0], def [2,5,0], repair 0, nodes [0,0,0], budget=7
    // T1 Siege Sword overrides A's p0 from 1 to 5
    // Damage to B: max(0, 5-2) + 0 + 0 = 3
    // B HP: 50 - 3 = 47, A HP: 50
    let (mut world, match_id) = setup(
        (1, 0, 0), // A has T1 Siege Sword
        (0, 0, 0),
        (1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0),
        (0, 0, 0, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    );

    let state: MatchState1v1 = world.read_model(match_id);
    assert(state.vault_b_hp == 47, 'T1 siege: B should be 47');
    assert(state.vault_a_hp == 50, 'T1 siege: A should be 50');
}
```

- [ ] **Step 2: Update test_stone_cloak_blocks_gate_damage**

Find `test_stone_cloak_blocks_gate_damage`. T1 Stone Cloak halves damage instead of zeroing it. A deals 10 damage (5+3+2). T1 halves to `2+1+1 = 4` (5/2=2, 3/2=1, 2/2=1). B HP = 50 - 4 = 46.

Replace with:

```cairo
#[test]
fn test_stone_cloak_t1_halves_damage() {
    // Player B has T1 Stone Cloak (ID 2)
    // A: atk [5,3,2], def [0,0,0], budget=10
    // B: atk [0,0,0], def [0,0,0], Stone Cloak, budget=0
    // T1 cloak halves: damage 5→2, 3→1, 2→1. Total = 4.
    // B HP: 50 - 4 = 46
    let (mut world, match_id) = setup(
        (0, 0, 0),
        (2, 0, 0), // B has T1 Stone Cloak
        (5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0),
    );

    let state: MatchState1v1 = world.read_model(match_id);
    assert(state.vault_b_hp == 46, 'T1 cloak: B should be 46');
    assert(state.vault_a_hp == 50, 'T1 cloak: A should be 50');
}
```

- [ ] **Step 3: Update test_ember_blast_bypasses_gates**

Find `test_ember_blast_bypasses_gates`. T1 Ember Blast deals 2 direct damage instead of 5. B's Stone Cloak is also T1 now — but Stone Cloak doesn't block Ember Blast regardless of tier.

Replace with:

```cairo
#[test]
fn test_ember_blast_t1_bypasses_gates() {
    // Player A has T1 Ember Blast (ID 3), Player B has T1 Stone Cloak (ID 2)
    // A: all zeros except ability=3
    // B: def [5,5,0] + ability=2
    // T1 cloak halves gate damage but does NOT block Ember Blast
    // T1 Ember Blast deals 2 direct damage -> B HP = 48
    let (mut world, match_id) = setup(
        (3, 0, 0), // A has T1 Ember Blast
        (2, 0, 0), // B has T1 Stone Cloak
        (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0),
        (0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0),
    );

    let state: MatchState1v1 = world.read_model(match_id);
    assert(state.vault_b_hp == 48, 'T1 ember: B should be 48');
    assert(state.vault_a_hp == 50, 'T1 ember: A should be 50');
}
```

- [ ] **Step 4: Update test_hex_reduces_damage**

Find `test_hex_reduces_damage`. T1 Hex reduces by 3 instead of 7. A deals 10 damage, T1 Hex reduces to 7. B HP = 43.

Replace with:

```cairo
#[test]
fn test_hex_t1_reduces_damage() {
    // Player B has T1 Hex (ID 4)
    // A: atk [5,3,2], def [0,0,0], budget=10
    // B: atk [0,0,0], def [0,0,0], Hex, budget=0
    // Without Hex: B takes 10 damage. With T1 Hex (-3): 10 - 3 = 7
    // B HP: 43
    let (mut world, match_id) = setup(
        (0, 0, 0),
        (4, 0, 0), // B has T1 Hex
        (5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0),
    );

    let state: MatchState1v1 = world.read_model(match_id);
    assert(state.vault_b_hp == 43, 'T1 hex: B should be 43');
    assert(state.vault_a_hp == 50, 'T1 hex: A should be 50');
}
```

- [ ] **Step 5: Update test_fortify_doubles_defense**

Find `test_fortify_doubles_defense`. T1 Fortify adds 1 to each gate instead of doubling. A attacks [4,3,3], B defends [3,3,4]. Without Fortify: 4-3=1, 3-3=0, 3-4=0. Total = 1. T1 Fortify adds 1: B defends [4,4,5]. Damage: 4-4=0, 3-4=0, 3-5=0. Total = 0.

Replace with:

```cairo
#[test]
fn test_fortify_t1_adds_one_defense() {
    // Player B has T1 Fortify (ID 5)
    // A: atk [4,3,3], def [0,0,0], budget=10
    // B: atk [0,0,0], def [3,3,4], Fortify, budget=10
    // T1 Fortify adds 1 to B's defense: [4,4,5]
    // Damage to B: max(0,4-4)+max(0,3-4)+max(0,3-5) = 0
    // B HP: 50
    let (mut world, match_id) = setup(
        (0, 0, 0),
        (5, 0, 0), // B has T1 Fortify
        (4, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        (0, 0, 0, 3, 3, 4, 0, 0, 0, 0, 0, 0, 0, 5, 0),
    );

    let state: MatchState1v1 = world.read_model(match_id);
    assert(state.vault_b_hp == 50, 'T1 fortify: B should be 50');
    assert(state.vault_a_hp == 50, 'T1 fortify: A should be 50');
}
```

- [ ] **Step 6: Run the updated tests**

Run: `sozo test -f test_siege_sword_t1_overrides_attack`
Run: `sozo test -f test_stone_cloak_t1_halves_damage`
Run: `sozo test -f test_ember_blast_t1_bypasses_gates`
Run: `sozo test -f test_hex_t1_reduces_damage`
Run: `sozo test -f test_fortify_t1_adds_one_defense`
Expected: All PASS

- [ ] **Step 7: Run ALL tests**

Run: `sozo test`
Expected: All tests pass. Any non-abilities test that previously used an ability ID should still work because the validation just expanded from `<= 5` to `<= 10`.

- [ ] **Step 8: Commit**

```bash
git add src/tests/test_abilities_1v1.cairo
git commit -m "test: update T1 ability tests for new weaker effect values"
```

---

### Task 5: Add T2 Effect Tests

**Files:**
- Create: `src/tests/test_ability_tiers.cairo`
- Modify: `src/lib.cairo`

- [ ] **Step 1: Create the test file**

Create `src/tests/test_ability_tiers.cairo`. It mirrors the structure of `test_abilities_1v1.cairo` but tests T2 ability effects (token IDs 6-10).

```cairo
// src/tests/test_ability_tiers.cairo
#[cfg(test)]
mod tests {
    use core::poseidon::PoseidonTrait;
    use core::hash::HashStateTrait;
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef, WorldStorageTestTrait};

    use starknet::{contract_address_const, testing};

    use siege_dojo::systems::actions_1v1::actions_1v1;
    use siege_dojo::systems::commit_reveal_1v1::{commit_reveal_1v1, ICommitReveal1v1Dispatcher, ICommitReveal1v1DispatcherTrait};
    use siege_dojo::systems::resolution_1v1::resolution_1v1;
    use siege_dojo::models::match_state::MatchStatus;
    use siege_dojo::models::match_state_1v1::{MatchState1v1, m_MatchState1v1};
    use siege_dojo::models::node_state::{NodeState, m_NodeState, NodeOwner};
    use siege_dojo::models::commitment::m_Commitment;
    use siege_dojo::models::round_moves_1v1::m_RoundMoves1v1;
    use siege_dojo::models::round_modifiers_1v1::{RoundModifiers1v1, m_RoundModifiers1v1};
    use siege_dojo::models::round_traps_1v1::m_RoundTraps1v1;
    use siege_dojo::models::match_counter::m_MatchCounter;
    use siege_dojo::models::match_abilities_1v1::{MatchAbilities1v1, m_MatchAbilities1v1};
    use siege_dojo::models::events::{e_MatchCreated1v1, e_MoveCommitted, e_MoveRevealed, e_RoundResolved, e_MatchFinished};

    fn hash_move(
        salt: felt252,
        p0: u8, p1: u8, p2: u8,
        g0: u8, g1: u8, g2: u8,
        repair: u8,
        nc0: u8, nc1: u8, nc2: u8,
        trap0: u8, trap1: u8, trap2: u8,
        ability_id: u8, ability_target: u8,
    ) -> felt252 {
        let mut h = PoseidonTrait::new();
        h = h.update(salt);
        h = h.update(p0.into()); h = h.update(p1.into()); h = h.update(p2.into());
        h = h.update(g0.into()); h = h.update(g1.into()); h = h.update(g2.into());
        h = h.update(repair.into());
        h = h.update(nc0.into()); h = h.update(nc1.into()); h = h.update(nc2.into());
        h = h.update(trap0.into()); h = h.update(trap1.into()); h = h.update(trap2.into());
        h = h.update(ability_id.into()); h = h.update(ability_target.into());
        h.finalize()
    }

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "siege_dojo",
            resources: [
                TestResource::Model(m_MatchState1v1::TEST_CLASS_HASH),
                TestResource::Model(m_NodeState::TEST_CLASS_HASH),
                TestResource::Model(m_Commitment::TEST_CLASS_HASH),
                TestResource::Model(m_RoundMoves1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundModifiers1v1::TEST_CLASS_HASH),
                TestResource::Model(m_RoundTraps1v1::TEST_CLASS_HASH),
                TestResource::Model(m_MatchCounter::TEST_CLASS_HASH),
                TestResource::Model(m_MatchAbilities1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MatchCreated1v1::TEST_CLASS_HASH),
                TestResource::Event(e_MoveCommitted::TEST_CLASS_HASH),
                TestResource::Event(e_MoveRevealed::TEST_CLASS_HASH),
                TestResource::Event(e_RoundResolved::TEST_CLASS_HASH),
                TestResource::Event(e_MatchFinished::TEST_CLASS_HASH),
                TestResource::Contract(actions_1v1::TEST_CLASS_HASH),
                TestResource::Contract(commit_reveal_1v1::TEST_CLASS_HASH),
                TestResource::Contract(resolution_1v1::TEST_CLASS_HASH),
            ].span()
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"siege_dojo", @"actions_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"commit_reveal_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
            ContractDefTrait::new(@"siege_dojo", @"resolution_1v1")
                .with_writer_of([dojo::utils::bytearray_hash(@"siege_dojo")].span()),
        ].span()
    }

    /// Setup: create world + match at round 10, seed abilities, play one round.
    fn setup(
        a_abilities: (u8, u8, u8),
        b_abilities: (u8, u8, u8),
        a_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
        b_move: (u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8, u8),
    ) -> (dojo::world::WorldStorage, u64) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (cr_addr, _) = world.dns(@"commit_reveal_1v1").unwrap();
        let cr_sys = ICommitReveal1v1Dispatcher { contract_address: cr_addr };

        let pa = contract_address_const::<0x1>();
        let pb = contract_address_const::<0x2>();

        let match_id: u64 = 1;

        world.write_model_test(@siege_dojo::models::match_counter::MatchCounter { id: 0, count: 1 });
        world.write_model_test(@MatchState1v1 {
            match_id, player_a: pa, player_b: pb,
            vault_a_hp: 50, vault_b_hp: 50,
            current_round: 10, status: MatchStatus::Active,
        });

        let mut i: u8 = 0;
        while i < 3 {
            world.write_model_test(@NodeState { match_id, node_index: i, owner: NodeOwner::None });
            i += 1;
        };

        world.write_model_test(@RoundModifiers1v1 {
            match_id, round: 10,
            gate_0: 0, gate_1: 0, gate_2: 0,
        });

        let (aa1, aa2, aa3) = a_abilities;
        let (ba1, ba2, ba3) = b_abilities;
        world.write_model_test(@MatchAbilities1v1 {
            match_id,
            a_ability_1: aa1, a_ability_2: aa2, a_ability_3: aa3,
            b_ability_1: ba1, b_ability_2: ba2, b_ability_3: ba3,
            a_used_1: false, a_used_2: false, a_used_3: false,
            b_used_1: false, b_used_2: false, b_used_3: false,
        });

        let salt: felt252 = 42;
        let (ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2, aab, aabt) = a_move;
        let (bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2, bab, babt) = b_move;

        let h_a = hash_move(salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2, aab, aabt);
        let h_b = hash_move(salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2, bab, babt);

        testing::set_contract_address(pa);
        cr_sys.commit(match_id, h_a);
        testing::set_contract_address(pb);
        cr_sys.commit(match_id, h_b);

        testing::set_contract_address(pa);
        cr_sys.reveal(match_id, salt, ap0, ap1, ap2, ag0, ag1, ag2, ar, anc0, anc1, anc2, at0, at1, at2, aab, aabt);
        testing::set_contract_address(pb);
        cr_sys.reveal(match_id, salt, bp0, bp1, bp2, bg0, bg1, bg2, br, bnc0, bnc1, bnc2, bt0, bt1, bt2, bab, babt);

        (world, match_id)
    }

    #[test]
    fn test_t2_siege_sword_attack_10() {
        // Player A has T2 Siege Sword (token ID 6), targets gate 0
        // A: atk [1,0,0], ability=6 target=0, budget=1
        // B: def [5,5,0], budget=10
        // T2 Siege Sword overrides to 10. Damage: 10-5 = 5
        // B HP: 45
        let (mut world, match_id) = setup(
            (6, 0, 0),
            (0, 0, 0),
            (1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0),
            (0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 45, 'T2 siege: B should be 45');
    }

    #[test]
    fn test_t2_stone_cloak_zeros_damage() {
        // Player B has T2 Stone Cloak (token ID 7)
        // A: atk [5,3,2], budget=10
        // B: ability=7, budget=0
        // T2 cloak zeros all gate damage. B HP: 50
        let (mut world, match_id) = setup(
            (0, 0, 0),
            (7, 0, 0),
            (5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'T2 cloak: B should be 50');
    }

    #[test]
    fn test_t2_ember_blast_6_damage() {
        // Player A has T2 Ember Blast (token ID 8)
        // A: ability=8, budget=0
        // B: def [0,0,0], budget=0
        // T2 Ember Blast deals 6 direct damage. B HP: 44
        let (mut world, match_id) = setup(
            (8, 0, 0),
            (0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 44, 'T2 ember: B should be 44');
    }

    #[test]
    fn test_t2_hex_reduces_by_8() {
        // Player B has T2 Hex (token ID 9)
        // A: atk [5,3,2], budget=10
        // B: ability=9, budget=0
        // Without Hex: B takes 10 damage. With T2 Hex (-8): 10 - 8 = 2
        // B HP: 48
        let (mut world, match_id) = setup(
            (0, 0, 0),
            (9, 0, 0),
            (5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 48, 'T2 hex: B should be 48');
    }

    #[test]
    fn test_t2_fortify_doubles_defense() {
        // Player B has T2 Fortify (token ID 10)
        // A: atk [4,3,3], budget=10
        // B: def [3,3,4], ability=10, budget=10
        // T2 Fortify doubles: [6,6,8]
        // Damage: max(0,4-6) + max(0,3-6) + max(0,3-8) = 0
        // B HP: 50
        let (mut world, match_id) = setup(
            (0, 0, 0),
            (10, 0, 0),
            (4, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            (0, 0, 0, 3, 3, 4, 0, 0, 0, 0, 0, 0, 0, 10, 0),
        );
        let state: MatchState1v1 = world.read_model(match_id);
        assert(state.vault_b_hp == 50, 'T2 fortify: B should be 50');
    }
}
```

- [ ] **Step 2: Register the test module in lib.cairo**

Add to `src/lib.cairo` under the `#[cfg(test)]` block:

```cairo
pub mod test_ability_tiers;
```

- [ ] **Step 3: Run the new tests**

Run: `sozo test -f test_t2_siege_sword_attack_10`
Run: `sozo test -f test_t2_stone_cloak_zeros_damage`
Run: `sozo test -f test_t2_ember_blast_6_damage`
Run: `sozo test -f test_t2_hex_reduces_by_8`
Run: `sozo test -f test_t2_fortify_doubles_defense`
Expected: All PASS

- [ ] **Step 4: Run ALL tests**

Run: `sozo test`
Expected: All tests pass (113 existing + 5 new = 118)

- [ ] **Step 5: Commit**

```bash
git add src/tests/test_ability_tiers.cairo src/lib.cairo
git commit -m "test: add T2 ability effect tests"
```

---

### Task 6: Add craft_ability_tier2 to crafting_1v1

**Files:**
- Modify: `src/systems/crafting_1v1.cairo`

- [ ] **Step 1: Add burn interface and update IAbilityTokenMint trait**

In `src/systems/crafting_1v1.cairo`, find this interface near the top:

```cairo
#[starknet::interface]
pub trait IAbilityTokenMint<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
}
```

Replace with:

```cairo
#[starknet::interface]
pub trait IAbilityTokenMint<T> {
    fn mint(ref self: T, to: ContractAddress, token_id: u256, amount: u256);
    fn burn(ref self: T, from: ContractAddress, token_id: u256, amount: u256);
}
```

- [ ] **Step 2: Add craft_ability_tier2 to the ICrafting1v1 interface**

Find the trait definition:

```cairo
#[starknet::interface]
pub trait ICrafting1v1<T> {
    fn craft_ability(ref self: T, ability_id: u8);
}
```

Replace with:

```cairo
#[starknet::interface]
pub trait ICrafting1v1<T> {
    fn craft_ability(ref self: T, ability_id: u8);
    fn craft_ability_tier2(ref self: T, ability_type: u8);
}
```

- [ ] **Step 3: Implement craft_ability_tier2**

In the `Crafting1v1Impl` impl block in `src/systems/crafting_1v1.cairo`, add this function after the existing `craft_ability` function:

```cairo
fn craft_ability_tier2(ref self: ContractState, ability_type: u8) {
    let mut world = self.world_default();
    let caller = get_caller_address();
    assert(ability_type >= 1 && ability_type <= 5, 'Invalid ability type');

    let config: ResourceConfig = world.read_model(0_u8);

    // Burn T2 recipe resources (the T1 ability is burned separately below)
    if ability_type == 1 {
        // T2 Siege Sword: 30 Iron + 20 Wood + 10 Ember
        burn_tokens(config.iron, caller, 30);
        burn_tokens(config.wood, caller, 20);
        burn_tokens(config.ember, caller, 10);
    } else if ability_type == 2 {
        // T2 Stone Cloak: 30 Stone + 20 Linen + 10 Seeds
        burn_tokens(config.stone, caller, 30);
        burn_tokens(config.linen, caller, 20);
        burn_tokens(config.seeds, caller, 10);
    } else if ability_type == 3 {
        // T2 Ember Blast: 30 Ember + 20 Seeds + 10 Iron
        burn_tokens(config.ember, caller, 30);
        burn_tokens(config.seeds, caller, 20);
        burn_tokens(config.iron, caller, 10);
    } else if ability_type == 4 {
        // T2 Hex: 20 Iron + 20 Stone + 10 Ember + 10 Wood
        burn_tokens(config.iron, caller, 20);
        burn_tokens(config.stone, caller, 20);
        burn_tokens(config.ember, caller, 10);
        burn_tokens(config.wood, caller, 10);
    } else {
        // T2 Fortify: 20 Stone + 20 Linen + 10 Wood
        burn_tokens(config.stone, caller, 20);
        burn_tokens(config.linen, caller, 20);
        burn_tokens(config.wood, caller, 10);
    }

    // Burn the T1 ability token (token ID == ability_type) and mint the T2 token
    // (T2 token ID == ability_type + 5)
    let ability_token = IAbilityTokenMintDispatcher {
        contract_address: config.ability_token,
    };
    ability_token.burn(caller, ability_type.into(), 1_u256);
    ability_token.mint(caller, (ability_type + 5).into(), 1_u256);
}
```

- [ ] **Step 4: Run tests to verify compilation**

Run: `sozo test`
Expected: All existing tests still pass (we've only added functionality).

- [ ] **Step 5: Commit**

```bash
git add src/systems/crafting_1v1.cairo
git commit -m "feat: add craft_ability_tier2 function to crafting contract"
```

---

### Task 7: Frontend — Extend ABILITIES and Add T2 Crafting

**Files:**
- Modify: `frontend/src/lib/craftingContracts.ts`
- Modify: `frontend/src/components/AbilitySelector.tsx`

- [ ] **Step 1: Extend ABILITIES and add helpers**

Replace the contents of `frontend/src/lib/craftingContracts.ts` with:

```typescript
// craftingContracts.ts — wrappers for the crafting_1v1 Dojo system
import type { AccountInterface, Call } from "starknet";
import { RESOURCE_TOKENS } from "./useResourceBalances";

// Crafting contract address — set via NEXT_PUBLIC_CRAFTING_1V1_ADDRESS in .env.local
export const CRAFTING_1V1_ADDRESS =
  process.env.NEXT_PUBLIC_CRAFTING_1V1_ADDRESS ||
  "0x66ec68d64ee749f1c5ba5339788d585d6f4aea75ee38b48932115811a185235";

export type AbilityCost = Record<string, number>;

export interface AbilityDef {
  id: number;
  type: number; // 1-5
  tier: number; // 1 or 2
  name: string;
  effect: string;
  cost: AbilityCost;
  requiresT1?: boolean;
}

// 10 abilities: IDs 1-5 are T1, 6-10 are T2
export const ABILITIES: readonly AbilityDef[] = [
  // T1
  { id: 1, type: 1, tier: 1, name: "Siege Sword", effect: "Set attack on target gate to 5",
    cost: { iron: 3, wood: 2 } },
  { id: 2, type: 2, tier: 1, name: "Stone Cloak", effect: "Halve all gate damage taken",
    cost: { stone: 3, linen: 2 } },
  { id: 3, type: 3, tier: 1, name: "Ember Blast", effect: "Deal 2 direct damage bypassing gates",
    cost: { ember: 3, seeds: 2 } },
  { id: 4, type: 4, tier: 1, name: "Hex", effect: "Reduce opponent total damage by 3",
    cost: { iron: 2, stone: 2, ember: 1 } },
  { id: 5, type: 5, tier: 1, name: "Fortify", effect: "Add 1 to defense at all gates",
    cost: { stone: 2, linen: 2, wood: 1 } },
  // T2
  { id: 6, type: 1, tier: 2, name: "Siege Sword (T2)", effect: "Set attack on target gate to 10",
    cost: { iron: 30, wood: 20, ember: 10 }, requiresT1: true },
  { id: 7, type: 2, tier: 2, name: "Stone Cloak (T2)", effect: "Zero all gate damage taken",
    cost: { stone: 30, linen: 20, seeds: 10 }, requiresT1: true },
  { id: 8, type: 3, tier: 2, name: "Ember Blast (T2)", effect: "Deal 6 direct damage bypassing gates",
    cost: { ember: 30, seeds: 20, iron: 10 }, requiresT1: true },
  { id: 9, type: 4, tier: 2, name: "Hex (T2)", effect: "Reduce opponent total damage by 8",
    cost: { iron: 20, stone: 20, ember: 10, wood: 10 }, requiresT1: true },
  { id: 10, type: 5, tier: 2, name: "Fortify (T2)", effect: "Double defense at all gates",
    cost: { stone: 20, linen: 20, wood: 10 }, requiresT1: true },
] as const;

// Helpers matching the Cairo versions
export function abilityType(id: number): number {
  return ((id - 1) % 5) + 1;
}

export function abilityTier(id: number): number {
  return Math.floor((id - 1) / 5) + 1;
}

export function tokenIdFrom(type: number, tier: number): number {
  return (tier - 1) * 5 + type;
}

export function canAfford(cost: AbilityCost, balances: Record<string, number>): boolean {
  return Object.entries(cost).every(
    ([resource, amount]) => (balances[resource] || 0) >= amount,
  );
}

// Approve required tokens then craft a T1 ability in one multicall.
export async function craftAbility(
  account: AccountInterface,
  abilityId: number,
  cost: AbilityCost,
): Promise<string> {
  const calls: Call[] = [];

  for (const [resource, amount] of Object.entries(cost)) {
    const tokenAddr = RESOURCE_TOKENS[resource as keyof typeof RESOURCE_TOKENS];
    if (!tokenAddr) continue;
    calls.push({
      contractAddress: tokenAddr,
      entrypoint: "approve",
      calldata: [CRAFTING_1V1_ADDRESS, amount.toString(), "0"],
    });
  }

  calls.push({
    contractAddress: CRAFTING_1V1_ADDRESS,
    entrypoint: "craft_ability",
    calldata: [abilityId.toString()],
  });

  const result = await account.execute(calls);
  return result.transaction_hash;
}

// Approve required tokens then craft a T2 ability (burns T1 + resources).
export async function craftAbilityTier2(
  account: AccountInterface,
  abilityTypeId: number,
  cost: AbilityCost,
): Promise<string> {
  const calls: Call[] = [];

  for (const [resource, amount] of Object.entries(cost)) {
    const tokenAddr = RESOURCE_TOKENS[resource as keyof typeof RESOURCE_TOKENS];
    if (!tokenAddr) continue;
    calls.push({
      contractAddress: tokenAddr,
      entrypoint: "approve",
      calldata: [CRAFTING_1V1_ADDRESS, amount.toString(), "0"],
    });
  }

  calls.push({
    contractAddress: CRAFTING_1V1_ADDRESS,
    entrypoint: "craft_ability_tier2",
    calldata: [abilityTypeId.toString()],
  });

  const result = await account.execute(calls);
  return result.transaction_hash;
}
```

- [ ] **Step 2: Update AbilitySelector to show tier badge**

In `frontend/src/components/AbilitySelector.tsx`, find the button rendering block around lines 48-80. The ability display currently shows `ability.name` and `ability.effect`. Add a tier badge after the name:

Find this block:

```tsx
<div className="text-xs font-bold text-[#d4cfc6] font-serif">{ability.name}</div>
<div className="text-[9px] text-[#7a7060] mt-0.5 leading-tight">{ability.effect}</div>
```

Replace with:

```tsx
<div className="flex items-center gap-1">
  <div className="text-xs font-bold text-[#d4cfc6] font-serif">{ability.name}</div>
  {ability.tier === 2 && (
    <span className="text-[8px] px-1 py-0.5 rounded border border-[#daa520] text-[#daa520] font-bold tracking-wider">
      T2
    </span>
  )}
</div>
<div className="text-[9px] text-[#7a7060] mt-0.5 leading-tight">{ability.effect}</div>
```

Also update the button border color when T2 is selected — find this className expression:

```tsx
isSelected
  ? "border-[#daa520] bg-[#daa520]/10 shadow-[0_0_8px_rgba(218,165,32,0.3)]"
  : "border-[#3d3428] bg-[#252019] hover:border-[#7a7060]"
```

Add a T2-specific unselected state so T2 abilities always have a subtle gold tint:

```tsx
isSelected
  ? "border-[#daa520] bg-[#daa520]/10 shadow-[0_0_8px_rgba(218,165,32,0.3)]"
  : ability.tier === 2
    ? "border-[#8a6a1f] bg-[#252019] hover:border-[#daa520]"
    : "border-[#3d3428] bg-[#252019] hover:border-[#7a7060]"
```

Note: the `ability` object comes from `ABILITIES.find((a) => a.id === abilityId)`, so after Task 7 Step 1 it has the `tier` field available.

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All 39 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/craftingContracts.ts frontend/src/components/AbilitySelector.tsx
git commit -m "feat: add T2 abilities to frontend — ABILITIES table, craftAbilityTier2, tier badge"
```

---

### Task 8: Final Integration

- [ ] **Step 1: Run all Cairo tests**

Run: `sozo test`
Expected: All pass (should be 118: 113 existing + 5 new T2 tests)

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && bun run test`
Expected: All 39 pass

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: integration fixes for ability tiers"
```
