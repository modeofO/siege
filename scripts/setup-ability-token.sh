#!/bin/bash
set -e

export DOJO_ACCOUNT_ADDRESS="0x040a26c15f86b70cc384d042ce0d87283e801bb459f369c4f588be3070c37f95"
export DOJO_PRIVATE_KEY="0x045665a95013a3060e87538a4271eeab7738e78fcf317e52f279f16c8cc6c483"

ABILITY_TOKEN="0x5a7805ccb625c53f877f1bdd92b002f22a55878a4959b91f9635d475f0efebb"
NEW_CRAFTING="0x5d46148c9a4ec5e3e06dfc7efb6d28f4148c684d2811543d7b787cf4de3843"
NEW_WORLD_SYS="0x727c57716a650660de0466efb0572ccab13dfebb1e5bf854a38acd36cda4681"

echo "Setting minter (crafting_1v1) on AbilityToken..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute "$ABILITY_TOKEN" set_minter "$NEW_CRAFTING"

echo "Setting minter2 (world_system) on AbilityToken..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute "$ABILITY_TOKEN" set_minter2 "$NEW_WORLD_SYS"

echo "Done."
