#!/bin/bash
set -e

: "${DOJO_ACCOUNT_ADDRESS:?Set DOJO_ACCOUNT_ADDRESS}"
: "${DOJO_PRIVATE_KEY:?Set DOJO_PRIVATE_KEY}"
export DOJO_ACCOUNT_ADDRESS
export DOJO_PRIVATE_KEY

ABILITY_TOKEN="0x5be2347827f78d20b484352e2f219b82a3817cc84fc34c6f3fc7a0670473e05"
NEW_CRAFTING="0x18700cba1d48b91aa99f2a7542a8739576fec35e4938d8c5dd11879688fe7b2"
NEW_WORLD_SYS="0x6d2455b76185900ffc6fb0fed0f91f4c61c7f4ac5e57a92d0fe8edc620b66f2"

echo "Setting minter (crafting_1v1) on AbilityToken..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute "$ABILITY_TOKEN" set_minter "$NEW_CRAFTING"

echo "Setting minter2 (world_system) on AbilityToken..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute "$ABILITY_TOKEN" set_minter2 "$NEW_WORLD_SYS"

echo "Done."
