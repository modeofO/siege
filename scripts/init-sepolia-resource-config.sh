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

ABILITY_TOKEN="0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb"

# Resource ERC-20s — order must match set_resource_config(iron, linen, stone, wood, ember, seeds).
IRON="0x2154b81255def0de319c2310b38eb54484794e64b54a7a9adce583e4079a77b"
LINEN="0x511a65b969eb95a9e510b7809dff5e9c53ac325002423dea0e35ce0a1880f2b"
STONE="0x28f46611d132cab82fb0afb6614d95f13dbd20dca76d5d4601fc58acb71552d"
WOOD="0x1014ccf9475d916d5164b44edc0480a2f0cd4e67b5bef6acd22a40c01e83c27"
EMBER="0x7e6b21bc243e02e8afac07822d58ec3f8b1c97dedead6849fd96d3026589b4e"
SEEDS="0x704234ef94400154669e56ac5a490796b7bf2a277092ea2be46e99eedd03a50"

echo "→ Setting AbilityToken address on ResourceConfig..."
sozo -P sepolia execute siege_dojo-actions_1v1 set_ability_token "$ABILITY_TOKEN"

echo "→ Setting resource ERC-20 addresses on ResourceConfig..."
sozo -P sepolia execute siege_dojo-actions_1v1 set_resource_config \
  "$IRON" "$LINEN" "$STONE" "$WOOD" "$EMBER" "$SEEDS"

echo "✓ ResourceConfig initialized."
