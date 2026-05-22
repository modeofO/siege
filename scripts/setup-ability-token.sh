#!/bin/bash
set -e

: "${DOJO_ACCOUNT_ADDRESS:?Set DOJO_ACCOUNT_ADDRESS}"
: "${DOJO_PRIVATE_KEY:?Set DOJO_PRIVATE_KEY}"
export DOJO_ACCOUNT_ADDRESS
export DOJO_PRIVATE_KEY

ABILITY_TOKEN="0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05"
NEW_CRAFTING="0x4d14cd36d9ab960de7b88da7421e87e16d028c1ab4b973d4b5892d1d193e130"
NEW_WORLD_SYS="0x4d52c26bd2b9ff241807fd94d7a2cf53e97e126e560bbd987864099be742cea"

echo "Setting minter (crafting_1v1) on AbilityToken..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute "$ABILITY_TOKEN" set_minter "$NEW_CRAFTING"

echo "Setting minter2 (world_system) on AbilityToken..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute "$ABILITY_TOKEN" set_minter2 "$NEW_WORLD_SYS"

echo "Setting burner (crafting_1v1) on AbilityToken..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute "$ABILITY_TOKEN" set_burner "$NEW_CRAFTING"

echo "Done."
