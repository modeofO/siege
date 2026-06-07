#!/usr/bin/env bash
# Initialize a freshly-migrated Sepolia hex world.
#
# Run AFTER `sozo -P sepolia migrate` and the writer grants, and BEFORE players
# register. Idempotent guards live in the contracts (initialize_world reverts
# with 'Already initialized').
#
# Steps:
#   1. initialize_world(cols, rows) — lays out the offset hex grid (all parcels
#      start untyped, parcel_type = 255).
#   2. Authorize the systems that mint/burn resource ERC-20s
#      (world_system, resolution_1v1, crafting_1v1) as operators on each token.
#
# AbilityToken minter/minter2/burner are set by scripts/setup-ability-token.sh.
# ResourceConfig (id=0) is set by scripts/init-sepolia-resource-config.sh.
#
# Prereqs: DOJO_ACCOUNT_ADDRESS + DOJO_PRIVATE_KEY exported (must be the world
# owner / resource-token minter).

set -euo pipefail

: "${DOJO_ACCOUNT_ADDRESS:?set DOJO_ACCOUNT_ADDRESS before running}"
: "${DOJO_PRIVATE_KEY:?set DOJO_PRIVATE_KEY before running}"
export DOJO_ACCOUNT_ADDRESS DOJO_PRIVATE_KEY

# Grid: 8 columns x 4 rows = 32 parcels, even-row offset. Edit GRID_W/GRID_H to resize.
GRID_W=8
GRID_H=4

COLS=$(GRID_W=$GRID_W GRID_H=$GRID_H node -e 'const W=+process.env.GRID_W,H=+process.env.GRID_H,a=[];for(let r=0;r<H;r++)for(let c=0;c<W;c++)a.push(c);console.log(a.join(","))')
ROWS=$(GRID_W=$GRID_W GRID_H=$GRID_H node -e 'const W=+process.env.GRID_W,H=+process.env.GRID_H,a=[];for(let r=0;r<H;r++)for(let c=0;c<W;c++)a.push(r);console.log(a.join(","))')

echo "→ initialize_world (${GRID_W}x${GRID_H} = $((GRID_W*GRID_H)) parcels)..."
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P sepolia execute siege_dojo-world_system initialize_world "arr:$COLS" "arr:$ROWS"

# Resource ERC-20s (same order as torii_sepolia.toml / init-sepolia-resource-config.sh).
RESOURCE_TOKENS=(
  "0x773f033bcbeb2e6362491d45680d7f7c788222c4a7deba580d7c89ab1251838" # IRON
  "0x3602775d72b9fbb0cbc70fa27f15a8466779a5b5b224de5024378d6f7f0f91"  # LINEN
  "0x555c070dcd35bfe65c12c1ba89c76136df3af1b9bb9e765fc0a3f711cddeb29" # STONE
  "0x777850aaa4cd27f40550464e9528d2a159836f722dd362e9fe1f3f4591fcb30" # WOOD
  "0x3d539cd317ecf470532a281922722826fadfa13eb5cc45f448ad714ef80cba1" # EMBER
  "0x25372cc987ebff79ca4a781aadb02ef8853d43b496ee381f382c59f7deafb35" # SEEDS
)

# System contracts that mint/burn resources. Update these to the current
# manifest_sepolia.json addresses after each migrate.
WORLD_SYS="0x1c35fca268af0253265c3ef881ec3f7d7d0afa94626a8a2ddc5bb133e8be401"
RESOLUTION_1V1="0x227d85f88211383106235553ee51e96dfa795ca4dcff86a734e63e9bb20f39e"
CRAFTING_1V1="0x1f8085720ec1c5b153c273b522878365c2c19d55a22141c70e907e27df19ad3"

for TOKEN in "${RESOURCE_TOKENS[@]}"; do
  echo "→ authorizing resource operators on $TOKEN..."
  docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
    sozo -P sepolia execute \
    "$TOKEN" set_authorized_operator "$WORLD_SYS" 1 / \
    "$TOKEN" set_authorized_operator "$RESOLUTION_1V1" 1 / \
    "$TOKEN" set_authorized_operator "$CRAFTING_1V1" 1
done

echo "✓ Hex world initialized and resource operators authorized."
