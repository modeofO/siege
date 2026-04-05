// Builds on-chain metadata data URIs for ability tokens.
//
// Entry point: build_ability_data_uri(ability_type, svg) -> ByteArray
// Returns: "data:application/json;base64,<base64-encoded JSON>"
//
// The JSON contains name, description, image (SVG data URI), and attributes.
// Ability definitions are hardcoded — must stay in sync with crafting_1v1 recipes.

use super::base64::bytes_base64_encode;

/// Build a complete `data:application/json;base64,...` URI for the given ability.
/// `svg` is the raw SVG string (read from contract storage by the caller).
/// Returns an empty ByteArray if `ability_type` is not 1-5.
pub fn build_ability_data_uri(ability_type: u8, svg: ByteArray) -> ByteArray {
    let name = get_ability_name(ability_type);
    let description = get_ability_description(ability_type);
    let cost = get_ability_cost_string(ability_type);

    if name.len() == 0 {
        return ""; // unknown ability type
    }

    // Build the image data URI: data:image/svg+xml;base64,<encoded svg>
    let image = if svg.len() > 0 {
        let encoded_svg = bytes_base64_encode(svg);
        let mut img: ByteArray = "data:image/svg+xml;base64,";
        img.append(@encoded_svg);
        img
    } else {
        "" // no SVG set yet
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
    json.append(@"{\"trait_type\":\"Phase\",\"value\":\"2B\"}");
    json.append(@"]");

    json.append(@"}");

    // Base64-encode the whole JSON and wrap in data URI
    let encoded_json = bytes_base64_encode(json);
    let mut result: ByteArray = "data:application/json;base64,";
    result.append(@encoded_json);
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

fn get_ability_description(ability_type: u8) -> ByteArray {
    if ability_type == 1 { "Max damage (10) to one gate for 1 round" }
    else if ability_type == 2 { "Block all gate damage for 1 round" }
    else if ability_type == 3 { "Deal 5 direct damage bypassing gates" }
    else if ability_type == 4 { "Opponent budget reduced by 7 for 1 round" }
    else if ability_type == 5 { "Double defense on all gates for 1 round" }
    else { "" }
}

fn get_ability_cost_string(ability_type: u8) -> ByteArray {
    if ability_type == 1 { "3 Iron + 2 Wood" }
    else if ability_type == 2 { "3 Stone + 2 Linen" }
    else if ability_type == 3 { "3 Ember + 2 Seeds" }
    else if ability_type == 4 { "2 Iron + 2 Stone + 1 Ember" }
    else if ability_type == 5 { "2 Stone + 2 Linen + 1 Wood" }
    else { "" }
}
