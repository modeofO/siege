import type { AccountInterface, UniversalDetails } from "starknet";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

// Contract addresses — set via env vars, fallback to devnet defaults
export const CONTRACTS = {
  ACTIONS: process.env.NEXT_PUBLIC_ACTIONS_ADDRESS || "0x0",
  COMMIT_REVEAL: process.env.NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS || "0x0",
};

// Skip fee estimation on Katana devnet (no-fee mode)
const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const TX_OPTS = IS_DEVNET ? DEVNET_TX_OPTS : undefined;

export async function createMatch(
  account: AccountInterface,
  teamAAttacker: string,
  teamADefender: string,
  teamBAttacker: string,
  teamBDefender: string,
) {
  return account.execute(
    {
      contractAddress: CONTRACTS.ACTIONS,
      entrypoint: "create_match",
      calldata: [teamAAttacker, teamADefender, teamBAttacker, teamBDefender],
    },
    TX_OPTS,
  );
}

export async function commitMove(account: AccountInterface, matchId: string, commitment: string) {
  return account.execute(
    {
      contractAddress: CONTRACTS.COMMIT_REVEAL,
      entrypoint: "commit",
      calldata: [matchId, commitment],
    },
    TX_OPTS,
  );
}

export async function revealAttacker(
  account: AccountInterface,
  matchId: string,
  salt: string,
  pressurePoints: [string, string, string],
  nodeContests: [string, string, string],
) {
  return account.execute(
    {
      contractAddress: CONTRACTS.COMMIT_REVEAL,
      entrypoint: "reveal_attacker",
      calldata: [matchId, salt, ...pressurePoints, ...nodeContests],
    },
    TX_OPTS,
  );
}

export async function revealDefender(
  account: AccountInterface,
  matchId: string,
  salt: string,
  pressurePoints: [string, string, string],
  repair: string,
  nodeContests: [string, string, string],
) {
  return account.execute(
    {
      contractAddress: CONTRACTS.COMMIT_REVEAL,
      entrypoint: "reveal_defender",
      calldata: [matchId, salt, ...pressurePoints, repair, ...nodeContests],
    },
    TX_OPTS,
  );
}
