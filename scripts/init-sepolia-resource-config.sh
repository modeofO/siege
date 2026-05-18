#!/usr/bin/env bash
# Populate ResourceConfig (id=0) on the live Sepolia world.
#
# When the world is freshly redeployed, ResourceConfig has no rows and every
# field reads as zero. create_staked_match asserts rc.ability_token is
# non-zero and reverts with 'Ability token not set'; mint_parcel_resources
# short-circuits when rc.iron.is_non_zero() is false. This script wires both.
#
# Both entrypoints are is_owner-gated on the world namespace. Run as the
# deployer account.
#
# Prereqs: DOJO_ACCOUNT_ADDRESS + DOJO_PRIVATE_KEY exported, sozo >= 1.8.1.

set -euo pipefail

: "${DOJO_ACCOUNT_ADDRESS:?set DOJO_ACCOUNT_ADDRESS before running}"
: "${DOJO_PRIVATE_KEY:?set DOJO_PRIVATE_KEY before running}"

ABILITY_TOKEN="0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05"

# Resource ERC-20s — order must match set_resource_config(iron, linen, stone, wood, ember, seeds).
IRON="0x773f033bcbeb2e6362491d45680d7f7c788222c4a7deba580d7c89ab1251838"
LINEN="0x3602775d72b9fbb0cbc70fa27f15a8466779a5b5b224de5024378d6f7f0f91"
STONE="0x555c070dcd35bfe65c12c1ba89c76136df3af1b9bb9e765fc0a3f711cddeb29"
WOOD="0x777850aaa4cd27f40550464e9528d2a159836f722dd362e9fe1f3f4591fcb30"
EMBER="0x3d539cd317ecf470532a281922722826fadfa13eb5cc45f448ad714ef80cba1"
SEEDS="0x25372cc987ebff79ca4a781aadb02ef8853d43b496ee381f382c59f7deafb35"

export DOJO_ACCOUNT_ADDRESS
export DOJO_PRIVATE_KEY

echo "→ Setting AbilityToken address on ResourceConfig..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute siege_dojo-actions_1v1 set_ability_token "$ABILITY_TOKEN"

echo "→ Setting resource ERC-20 addresses on ResourceConfig..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute siege_dojo-actions_1v1 set_resource_config \
  "$IRON" "$LINEN" "$STONE" "$WOOD" "$EMBER" "$SEEDS"

echo "✓ ResourceConfig initialized."
