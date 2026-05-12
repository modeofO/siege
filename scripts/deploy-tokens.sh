#!/usr/bin/env bash
# Deploy resource tokens with the TypeScript deployer so operator grants and
# ResourceConfig wiring stay in one path.
set -euo pipefail

: "${DOJO_ACCOUNT_ADDRESS:?Set DOJO_ACCOUNT_ADDRESS}"
: "${DOJO_PRIVATE_KEY:?Set DOJO_PRIVATE_KEY}"

npx tsx scripts/deploy-tokens.ts
