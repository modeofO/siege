import type { AccountInterface, UniversalDetails } from "starknet";
import { MATCHMAKING_ADDRESS } from "@/lib/contractAddresses";
import { vrfRequestRandomCall, waitForReceiptOrThrow } from "@/lib/contracts1v1";
import { resilientExecute } from "@/lib/controllerSession";
import { toriiSql, sqlAddr, toNum } from "@/lib/toriiSql";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const TX_OPTS = IS_DEVNET ? DEVNET_TX_OPTS : undefined;

// QueueStatus.state codes (matchmaking.cairo)
export const QUEUE_IDLE = 0;
export const QUEUE_QUEUED = 1;
export const QUEUE_MATCHED = 2;

// Contract queue entries live for a fixed 600s window (no heartbeat — every
// poke would be a sponsored tx). Stop searching a touch early so the UI never
// shows "searching" for an entry the contract already considers dead.
export const QUEUE_WINDOW_MS = 600_000;
export const SEARCH_EXPIRY_MS = QUEUE_WINDOW_MS - 15_000;
export const POLL_INTERVAL_MS = 3_000;

export interface QueueStatusRow {
  state: number;
  queuedAt: number;
  matchedMatchId: number;
}

// Joins the queue, pokes the heartbeat, or — when someone is waiting —
// creates the match in this tx. The contract consumes the VRF request
// unconditionally, so the wrap is always valid.
export async function queueForMatch(account: AccountInterface) {
  const tx = await resilientExecute(
    account,
    [
      vrfRequestRandomCall(MATCHMAKING_ADDRESS),
      { contractAddress: MATCHMAKING_ADDRESS, entrypoint: "queue_for_match", calldata: [] },
    ],
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Queue for match");
  return tx;
}

// Bare call — leave_queue never consumes randomness, so a VRF wrap would
// revert on the unconsumed request.
export async function leaveQueue(account: AccountInterface) {
  const tx = await resilientExecute(
    account,
    { contractAddress: MATCHMAKING_ADDRESS, entrypoint: "leave_queue", calldata: [] },
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Leave queue");
  return tx;
}

export async function fetchQueueStatus(address: string): Promise<QueueStatusRow | null> {
  const rows = await toriiSql<{ state: unknown; queued_at: unknown; matched_match_id: unknown }>(
    `SELECT state, queued_at, matched_match_id FROM "siege_dojo-QueueStatus" WHERE player = ${sqlAddr(address)} LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    state: toNum(row.state),
    queuedAt: toNum(row.queued_at),
    matchedMatchId: toNum(row.matched_match_id),
  };
}
