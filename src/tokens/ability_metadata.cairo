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

/// Wrap an SVG with a gold border overlay.
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
