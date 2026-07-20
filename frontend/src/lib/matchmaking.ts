import type { AccountInterface, UniversalDetails } from "starknet";
import { MATCHMAKING_ADDRESS } from "@/lib/contractAddresses";
import { ABILITY_TOKEN_ADDRESS } from "@/lib/abilityToken";
import { vrfRequestRandomCall, waitForReceiptOrThrow } from "@/lib/contracts1v1";
import { resilientExecute } from "@/lib/controllerSession";
import { toriiSql, sqlAddr, sqlU64, toNum } from "@/lib/toriiSql";

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

// Known entry tokens for symbol/decimals display. Keys are BigInt-normalized
// lowercase hex. Unknown tokens still work — they render as a short address.
export const ENTRY_TOKEN_INFO: Record<string, { symbol: string; decimals: number }> = {
  "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": { symbol: "STRK", decimals: 18 },
  "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": { symbol: "ETH", decimals: 18 },
  "0x124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49": { symbol: "LORDS", decimals: 18 },
};

export function normalizeToken(addr: string): string {
  return "0x" + BigInt(addr).toString(16);
}

export function tokenSymbol(addr: string): string {
  const info = ENTRY_TOKEN_INFO[normalizeToken(addr)];
  if (info) return info.symbol;
  const n = normalizeToken(addr);
  return `${n.slice(0, 8)}…`;
}

export function formatTokenAmount(amount: bigint, addr: string): string {
  const decimals = ENTRY_TOKEN_INFO[normalizeToken(addr)]?.decimals ?? 18;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export interface QueueStatusRow {
  state: number;
  queuedAt: number;
  matchedMatchId: number;
}

export interface EntryTokenRow {
  token: string; // normalized hex
  amount: bigint;
}

export interface MatchPotRow {
  playerA: string;
  tokenA: string;
  amountA: bigint;
  playerB: string;
  tokenB: string;
  amountB: bigint;
  claimed: boolean;
}

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string" && v.length > 0) return BigInt(v);
  return BigInt(0);
}

function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

// Joins the queue (or re-queues) with a 1-3 ability wager, or — when someone
// with the same wager size is waiting — creates the staked match and escrows
// both sides' buy-ins and abilities in this tx. The contract consumes the
// VRF request unconditionally, so the wrap is always valid.
export async function queueForMatch(account: AccountInterface, token: string, abilities: number[]) {
  const tx = await resilientExecute(
    account,
    [
      vrfRequestRandomCall(MATCHMAKING_ADDRESS),
      {
        contractAddress: MATCHMAKING_ADDRESS,
        entrypoint: "queue_for_match",
        calldata: [token, String(abilities.length), ...abilities.map(String)],
      },
    ],
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Queue for match");
  return tx;
}

// Matchmaking pulls the wagered abilities in the PAIRING tx, so it must be an
// approved ERC-1155 operator before queueing. Separate receipt-awaited tx —
// same VRF-wrap constraint as the ERC-20 approval.
export async function ensureAbilityOperator(account: AccountInterface): Promise<void> {
  const res = await account.callContract({
    contractAddress: ABILITY_TOKEN_ADDRESS,
    entrypoint: "is_approved_for_all",
    calldata: [account.address, MATCHMAKING_ADDRESS],
  });
  if (BigInt(res[0] ?? "0x0") !== BigInt(0)) return;
  const tx = await resilientExecute(
    account,
    {
      contractAddress: ABILITY_TOKEN_ADDRESS,
      entrypoint: "set_approval_for_all",
      calldata: [MATCHMAKING_ADDRESS, "1"],
    },
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Approve ability operator");
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

export async function claimWinnings(account: AccountInterface, matchId: string) {
  const tx = await resilientExecute(
    account,
    { contractAddress: MATCHMAKING_ADDRESS, entrypoint: "claim_winnings", calldata: [matchId] },
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Claim winnings");
  return tx;
}

// Ensure the matchmaking contract can pull the buy-in. Approval must be a
// separate receipt-awaited tx: the paymaster VRF wrapping requires
// request_random as call[0] and the game call as call[1] with nothing
// between (same constraint as createStakedMatch).
export async function ensureEntryAllowance(
  account: AccountInterface,
  token: string,
  amount: bigint,
): Promise<void> {
  if (amount === BigInt(0)) return;
  const res = await account.callContract({
    contractAddress: token,
    entrypoint: "allowance",
    calldata: [account.address, MATCHMAKING_ADDRESS],
  });
  const low = BigInt(res[0] ?? "0x0");
  const high = BigInt(res[1] ?? "0x0");
  const allowance = (high << BigInt(128)) + low;
  if (allowance >= amount) return;

  // Approve ~10 games worth so players sign one approve tx per ten queues,
  // not one per queue. Stays under the session-policy cap (~20 games).
  const grant = amount * BigInt(10);
  const tx = await resilientExecute(
    account,
    {
      contractAddress: token,
      entrypoint: "approve",
      calldata: [
        MATCHMAKING_ADDRESS,
        "0x" + (grant & ((BigInt(1) << BigInt(128)) - BigInt(1))).toString(16),
        "0x" + (grant >> BigInt(128)).toString(16),
      ],
    },
    TX_OPTS,
  );
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Approve entry token");
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

export async function fetchEntryTokens(): Promise<EntryTokenRow[]> {
  const rows = await toriiSql<{ token: string; amount: unknown; enabled: unknown }>(
    `SELECT token, amount, enabled FROM "siege_dojo-EntryToken"`,
  );
  return rows
    .filter((r) => toBool(r.enabled))
    .map((r) => ({ token: normalizeToken(r.token), amount: toBigInt(r.amount) }));
}

export async function fetchMatchPot(matchId: string): Promise<MatchPotRow | null> {
  const rows = await toriiSql<Record<string, unknown>>(
    `SELECT player_a, token_a, amount_a, player_b, token_b, amount_b, claimed FROM "siege_dojo-MatchPot" WHERE match_id = ${sqlU64(matchId)} LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    playerA: String(row.player_a),
    tokenA: String(row.token_a),
    amountA: toBigInt(row.amount_a),
    playerB: String(row.player_b),
    tokenB: String(row.token_b),
    amountB: toBigInt(row.amount_b),
    claimed: toBool(row.claimed),
  };
}
