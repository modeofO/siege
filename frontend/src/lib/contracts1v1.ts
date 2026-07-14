import type { AccountInterface, UniversalDetails } from "starknet";
import {
  ACTIONS_1V1_ADDRESS,
  COMMIT_REVEAL_1V1_ADDRESS,
  RESOLUTION_1V1_ADDRESS,
  WORLD_SYSTEM_ADDRESS,
  VRF_PROVIDER_ADDRESS,
} from "@/lib/contractAddresses";
import { resilientExecute } from "@/lib/controllerSession";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

// Re-exported for back-compat — the canonical definition now lives in
// contractAddresses.ts to avoid a sessionPolicies/controllerSession import cycle.
export { VRF_PROVIDER_ADDRESS };

export const CONTRACTS_1V1 = {
  ACTIONS: ACTIONS_1V1_ADDRESS,
  COMMIT_REVEAL: COMMIT_REVEAL_1V1_ADDRESS,
  RESOLUTION: RESOLUTION_1V1_ADDRESS,
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

// Cartridge surfaces reverts as {code, message, data: {execution_error}} — dig
// the execution_error out so the UI shows the Cairo assert string, not JSON.
export function extractErrorMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    const execErr = (obj.data as Record<string, unknown>)?.execution_error;
    if (typeof execErr === "string") return execErr;
    if (typeof obj.message === "string") return obj.message;
  }
  return String(e);
}

// account.execute resolves on sequencer ACCEPT, not on-chain success. Wait for
// the receipt and throw on REVERTED so callers can surface the real error
// instead of mistaking a revert for a sync delay.
export async function waitForReceiptOrThrow(account: AccountInterface, txHash: string, context: string): Promise<void> {
  try {
    const receipt = await account.waitForTransaction(txHash, { retryInterval: 2000 });
    const anyReceipt = receipt as { execution_status?: string; revert_reason?: string };
    if (anyReceipt.execution_status === "REVERTED") {
      throw new Error(`${context} reverted: ${anyReceipt.revert_reason || "unknown revert"}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith(`${context} reverted:`)) throw e;
    throw new Error(`${context} receipt wait failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// request_random(caller, source): caller = contract that will consume_random,
// source must match what consume_random uses: Source::Nonce(contract_address)
export function vrfRequestRandomCall(callerContract: string) {
  return {
    contractAddress: VRF_PROVIDER_ADDRESS,
    entrypoint: "request_random",
    calldata: [callerContract, "0", callerContract], // caller, Source::Nonce(0), nonce_address = caller
  };
}

export async function createMatch1v1(account: AccountInterface, playerA: string, playerB: string) {
  return resilientExecute(
    account,
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

export async function commitMove1v1(account: AccountInterface, matchId: string, commitment: string) {
  return resilientExecute(
    account,
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
  p0: string,
  p1: string,
  p2: string,
  g0: string,
  g1: string,
  g2: string,
  repair: string,
  nc0: string,
  nc1: string,
  nc2: string,
  trap0: string,
  trap1: string,
  trap2: string,
  abilityId: string,
  abilityTarget: string,
) {
  const tx = await resilientExecute(
    account,
    {
      contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
      entrypoint: "reveal",
      calldata: [
        matchId,
        salt,
        p0,
        p1,
        p2,
        g0,
        g1,
        g2,
        repair,
        nc0,
        nc1,
        nc2,
        trap0,
        trap1,
        trap2,
        abilityId,
        abilityTarget,
      ],
    },
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Reveal");
  return tx;
}

export async function resolveRound1v1(account: AccountInterface, matchId: string) {
  // Try without VRF first — succeeds on the final round where the contract
  // skips consume_random (match ends, no next-round modifiers needed).
  let firstError: unknown;
  try {
    const tx = await resilientExecute(
      account,
      {
        contractAddress: CONTRACTS_1V1.RESOLUTION,
        entrypoint: "resolve_round",
        calldata: [matchId],
      },
      TX_OPTS,
    );
    await waitForReceiptOrThrow(account, tx.transaction_hash, "Resolve round");
    return tx;
  } catch (e) {
    firstError = e;
    console.warn("[resolveRound1v1] without-VRF attempt failed, retrying with VRF wrap:", extractErrorMsg(e));
  }
  // Fall back to VRF-wrapped multicall — needed on non-final rounds where
  // the contract calls consume_random to generate next-round gate modifiers.
  try {
    const tx = await resilientExecute(
      account,
      [
        vrfRequestRandomCall(CONTRACTS_1V1.RESOLUTION),
        {
          contractAddress: CONTRACTS_1V1.RESOLUTION,
          entrypoint: "resolve_round",
          calldata: [matchId],
        },
      ],
      TX_OPTS,
    );
    await waitForReceiptOrThrow(account, tx.transaction_hash, "Resolve round");
    return tx;
  } catch (e2) {
    console.error("[resolveRound1v1] with-VRF also failed:", extractErrorMsg(e2));
    throw firstError;
  }
}

export const CONTRACTS_WORLD = {
  WORLD_SYSTEM: WORLD_SYSTEM_ADDRESS,
};

export async function upgradeKingdom(account: AccountInterface) {
  return resilientExecute(
    account,
    {
      contractAddress: CONTRACTS_WORLD.WORLD_SYSTEM,
      entrypoint: "upgrade_kingdom",
      calldata: [],
    },
    TX_OPTS,
  );
}
