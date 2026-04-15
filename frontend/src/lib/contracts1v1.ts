import type { AccountInterface, UniversalDetails } from "starknet";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

export const VRF_PROVIDER_ADDRESS = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

export const CONTRACTS_1V1 = {
  ACTIONS: process.env.NEXT_PUBLIC_ACTIONS_1V1_ADDRESS || "0x520bdcaa5ca4d04bd1aee77362eca6a284ba2bbf0690f5696b87e13007c8603",
  COMMIT_REVEAL: process.env.NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS || "0x31ff951f7405f24e69f42dc3009ff20702fca8079d6551733fc39da90ab1e81",
  RESOLUTION: process.env.NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS || "0x27e7a9c43ef49f90987943358b3a5d5aadc74c5c8ba79bd3eadea9514decf97",
};

const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const TX_OPTS = IS_DEVNET ? DEVNET_TX_OPTS : undefined;

// request_random(caller, source): caller = contract that will consume_random,
// source must match what consume_random uses: Source::Nonce(contract_address)
export function vrfRequestRandomCall(callerContract: string) {
  return {
    contractAddress: VRF_PROVIDER_ADDRESS,
    entrypoint: "request_random",
    calldata: [callerContract, "0", callerContract],  // caller, Source::Nonce(0), nonce_address = caller
  };
}

export async function createMatch1v1(
  account: AccountInterface,
  playerA: string,
  playerB: string,
) {
  return account.execute(
    [
      vrfRequestRandomCall(CONTRACTS_1V1.ACTIONS),
      {
        contractAddress: CONTRACTS_1V1.ACTIONS,
        entrypoint: "create_match_1v1",
        calldata: [playerA, playerB],
      },
    ],
    TX_OPTS,
  );
}

export async function commitMove1v1(
  account: AccountInterface,
  matchId: string,
  commitment: string,
) {
  return account.execute(
    {
      contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
      entrypoint: "commit",
      calldata: [matchId, commitment],
    },
    TX_OPTS,
  );
}

export async function revealMove1v1(
  account: AccountInterface,
  matchId: string,
  salt: string,
  p0: string, p1: string, p2: string,
  g0: string, g1: string, g2: string,
  repair: string,
  nc0: string, nc1: string, nc2: string,
  trap0: string, trap1: string, trap2: string,
  abilityId: string, abilityTarget: string,
  includeVrf: boolean,
) {
  // VRF gating is racy but necessary: the 1st reveal must NOT include
  // request_random (Cartridge VRF rejects a 2nd request before the 1st is
  // consumed, with "VrfProvider: not consumed"), and the 2nd reveal MUST
  // include it (resolve_round fires and calls consume_random, needing a
  // pending random). Who's "1st" vs "2nd" can flip between submit and
  // inclusion — the caller handles that revert with a retry. Issue #16
  // tracks the Cairo-side fix that eliminates this race.
  const revealCall = {
    contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
    entrypoint: "reveal",
    calldata: [matchId, salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, abilityId, abilityTarget],
  };

  const calls = includeVrf
    ? [vrfRequestRandomCall(CONTRACTS_1V1.RESOLUTION), revealCall]
    : [revealCall];

  const tx = await account.execute(calls, TX_OPTS);

  // account.execute resolves once the sequencer ACCEPTS the tx, not after it
  // executes. A tx can be accepted and then revert silently (e.g. a reveal
  // that races another reveal — the later one triggers resolution without
  // vRF and reverts). Wait for the receipt so we can surface reverts as
  // thrown errors that the reveal retry path can handle.
  try {
    const receipt = await account.waitForTransaction(tx.transaction_hash, {
      retryInterval: 2000,
    });
    const anyReceipt = receipt as { execution_status?: string; revert_reason?: string };
    if (anyReceipt.execution_status === "REVERTED") {
      throw new Error(`Reveal reverted: ${anyReceipt.revert_reason || "unknown revert"}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Reveal reverted:")) throw e;
    throw new Error(
      `Reveal receipt wait failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return tx;
}

export const CONTRACTS_WORLD = {
  WORLD_SYSTEM: process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "",
};

export async function upgradeKingdom(account: AccountInterface) {
  return account.execute(
    {
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "upgrade_kingdom",
      calldata: [],
    },
    TX_OPTS,
  );
}
