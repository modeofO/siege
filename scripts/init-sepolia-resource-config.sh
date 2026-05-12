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
IRON="0x04443a152ebfe64b834cf7aa904b56ee6a97b9fcf7ee6f4e9ad272596e3d7a73"
LINEN="0x01b57dd0b9b246bf39185e23cd7c794d2bf6ad7088c8a3325f91809f6c4588c0"
STONE="0x051769e3c9a978e30d7cacdb2491e057c233fbd99ca36a8bb3c544894b3b3cc2"
WOOD="0x05dc381b9755ae512fad38462887e2587d17661b833bbd22a32130db8fb20a9b"
EMBER="0x043415cab3dbd5d07c05da8aa135c92a1e0fd008c7eb0e09cef8be0e5065887d"
SEEDS="0x077ee09267cf3ded08f68c0c3eb74e2e5e01eae82d7691b48fb586768ea16f47"

echo "→ Setting AbilityToken address on ResourceConfig..."
sozo -P sepolia execute siege_dojo-actions_1v1 set_ability_token "$ABILITY_TOKEN"

echo "→ Setting resource ERC-20 addresses on ResourceConfig..."
sozo -P sepolia execute siege_dojo-actions_1v1 set_resource_config \
  "$IRON" "$LINEN" "$STONE" "$WOOD" "$EMBER" "$SEEDS"

echo "✓ ResourceConfig initialized."
