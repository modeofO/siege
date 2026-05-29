#!/bin/bash
set -e

: "${DOJO_ACCOUNT_ADDRESS:?Set DOJO_ACCOUNT_ADDRESS}"
: "${DOJO_PRIVATE_KEY:?Set DOJO_PRIVATE_KEY}"
export DOJO_ACCOUNT_ADDRESS
export DOJO_PRIVATE_KEY

ABILITY_TOKEN="0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05"
NEW_CRAFTING="0x19ea09d20d2575caf9472de37c62872fbc5d88c5390596cb48bbb9c8bb258b2"
NEW_WORLD_SYS="0x16bb80d4dae3f3b0468ec5d93368908e2b6a50a621b55dafeead99f38725ef6"

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
