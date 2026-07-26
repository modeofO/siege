#!/usr/bin/env bash
# Configure paid-queue entry pricing on mainnet matchmaking.
# Idempotent — set_entry_config / set_entry_token overwrite prior values, so
# re-run with new amounts to re-price (owner key required).
#
#   source deploy.mainnet.env && bash scripts/init-entry-config.sh
#
# Buy-in targets ~$0.70/player. Amounts are base units (18 decimals).
# VERIFY SPOT PRICES before running and re-price as markets drift.
set -euo pipefail

PROFILE="${PROFILE:-mainnet}"
TREASURY="${TREASURY:-0x0351d9177810f624efa1ee1eba0648dab27ed38f74c45ab23aa762dbbf6c9f78}" # deployer
WINNER_BPS="${WINNER_BPS:-6500}"

STRK=0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
ETH=0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7
LORDS=0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49

# ~\$0.70 equivalents (adjust to spot): 6 STRK / 0.0002 ETH / 35 LORDS
STRK_AMOUNT="${STRK_AMOUNT:-6000000000000000000}"
ETH_AMOUNT="${ETH_AMOUNT:-200000000000000}"
LORDS_AMOUNT="${LORDS_AMOUNT:-35000000000000000000}"

run() {
  docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY \
    builder sozo -P "$PROFILE" execute siege_dojo-matchmaking "$@"
}

echo "== set_entry_config winner_bps=$WINNER_BPS treasury=$TREASURY"
run set_entry_config "$WINNER_BPS" "$TREASURY"

# set_entry_token calldata: token, amount (u256), enabled
echo "== enable STRK @ $STRK_AMOUNT"
run set_entry_token "$STRK" "u256:$STRK_AMOUNT" 1

echo "== enable ETH @ $ETH_AMOUNT"
run set_entry_token "$ETH" "u256:$ETH_AMOUNT" 1

echo "== enable LORDS @ $LORDS_AMOUNT"
run set_entry_token "$LORDS" "u256:$LORDS_AMOUNT" 1

echo "Done."
