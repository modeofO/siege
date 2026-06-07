#!/bin/bash
set -e

: "${DOJO_ACCOUNT_ADDRESS:?Set DOJO_ACCOUNT_ADDRESS}"
: "${DOJO_PRIVATE_KEY:?Set DOJO_PRIVATE_KEY}"
export DOJO_ACCOUNT_ADDRESS
export DOJO_PRIVATE_KEY

ABILITY_TOKEN="0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05"
NEW_CRAFTING="0x1f8085720ec1c5b153c273b522878365c2c19d55a22141c70e907e27df19ad3"
NEW_WORLD_SYS="0x1c35fca268af0253265c3ef881ec3f7d7d0afa94626a8a2ddc5bb133e8be401"

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
