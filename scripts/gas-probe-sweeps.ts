// Measure the REAL L2 gas of the three map-sweep entrypoints —
// conquest.initiate_conquest, world_system.settle_match and
// world_system.initiate_pillage — against live katana state, using nothing but
// starknet_simulateTransactions.
//
// THIS SCRIPT NEVER BROADCASTS. There is no invoke, declare, deploy or transfer
// anywhere in it: every write is a simulated transaction, and every read is
// either a starknet_call or a Torii SQL query. Running it changes no chain
// state and costs nothing.
//
// Why it exists: `sozo test` prices gas with the cairo-test runner, not
// blockifier's versioned constants, and each test also carries ~60-80M of
// spawn_test_world setup. That is fine for deltas and useless for the question
// that actually matters — "will AVNU sponsor this transaction" — which turns on
// blockifier L2 gas against the ~100M sponsorship line. See
// scripts/gas-probe-register.ts for the same technique applied to
// register_player (95.2M live).
//
// TECHNIQUE — chained simulation. starknet_simulateTransactions takes an ARRAY
// of transactions and executes them sequentially on one forked state, so later
// transactions observe earlier ones' writes and nothing is committed. That is
// what makes settle_match and initiate_pillage reachable at all: both need a
// finished staked match, and creating one takes ~55 transactions. With
// SKIP_VALIDATE the sender's signature is never checked, so any deployed
// account can be simulated from without holding its key — only the nonce has to
// be right, which this script tracks per sender.
//
// TECHNIQUE — VRF rewire. conquest.initiate_conquest and
// world_system.create_staked_match consume randomness through a NON-safe
// dispatcher pointed at ResourceConfig.vrf_provider, which on katana is
// Cartridge's predeployed VRF. That provider reverts with
// 'VrfProvider: not fulfilled' unless the paymaster inserted a submit_random
// ahead of the call, which nothing does in a simulation. So the FIRST
// transaction of every chain rewires ResourceConfig.vrf_provider to the
// DevVrfProvider (deployed by scripts/init-katana-world.ts but deliberately
// left unwired), whose consume_random needs no fulfillment. Sender is katana
// dev account 0, which owns the world — set_vrf_provider asserts world
// ownership, and SKIP_VALIDATE does not skip that.
//
// The rewire is why no request_random call is prepended: DevVrfProvider's
// request_random is a no-op and consume_random succeeds unconditionally.
//
// resolution_1v1.resolve_round also consumes VRF, but through a SAFE dispatcher
// that falls back to all-Normal gate modifiers on revert — so it works either
// way. Under the rewire it draws real pseudo-random modifiers, which is why the
// scripted match below is built to finish on the round-10 timeout rather than on
// a vault hitting 0: damage per round is capped low enough that no modifier roll
// can end the match early, making the transaction count deterministic.
//
// FIXTURE ASSUMPTIONS (katana-specific, verified at startup):
//   - PLAYER_A owns home parcels 0/1/8; PLAYER_B owns non-home parcel 9.
//   - Parcel 9 (col 1,row 1) borders A's homes 1 (1,0) and 8 (0,1), so a B win
//     grants B pillage eligibility against A.
//   - Neither player is in a faction (a faction ally bordering the target home
//     would block the pillage).
//   - Both players already granted world_system ERC-1155 operator approval.
// All four are checked before simulating; a mismatch aborts with what changed.
//
// Usage:
//   bun x tsx scripts/gas-probe-sweeps.ts
//   RPC_URL=... MANIFEST_PATH=manifest_katana.json bun x tsx scripts/gas-probe-sweeps.ts

import { CallData, RpcProvider, hash, json } from "starknet";
import { readFileSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "https://siege-katana-production.up.railway.app";
const TORII =
  process.env.TORII_URL ?? "https://siege-torii-katana-production.up.railway.app";
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_katana.json";
const KATANA_ADDRESSES_PATH = process.env.KATANA_ADDRESSES_PATH ?? "katana-addresses.json";

// Fixture. Both are Cartridge Controller accounts with registered Holds; their
// on-chain nonces are 0 because every real transaction reached them through the
// paymaster as an outside-execution.
const PLAYER_A =
  process.env.PROBE_PLAYER_A ??
  "0x050260fba05efcdd9cd1d7eb3aeb413341f98403c5bade7e5feb4048354013a0";
const PLAYER_B =
  process.env.PROBE_PLAYER_B ??
  "0x06b525b0aaf7694a7e854f44ae0a4467c84c4e0111c15df7a6e2ab691bd77311";

// World owner — katana dev account 0 (public dev key, test chain only). Only
// its ADDRESS is used: SKIP_VALIDATE means no signature is required.
const WORLD_OWNER =
  process.env.DOJO_ACCOUNT_ADDRESS ??
  "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec";

const CONQUEST_TARGET = Number(process.env.PROBE_CONQUEST_TARGET ?? 9);
// One of A's home parcels that B's parcel 9 borders (0=(0,0) is distance 2, so
// not eligible; 1=(1,0) and 8=(0,1) are both distance 1). Parcel 8 already has a
// live Pillage on it from an earlier real match, so 1 is the default.
const PILLAGE_HOME = Number(process.env.PROBE_PILLAGE_HOME ?? 1);

// The AVNU sponsorship danger line.
const SPONSORSHIP_LIMIT = 100_000_000n;

// Generous enough that nothing runs out of gas; blockifier treats
// resource_bounds.l2_gas.max_amount as the execution limit even under
// SKIP_FEE_CHARGE, so it cannot just be zero.
const RESOURCE_BOUNDS = {
  l1_gas: { max_amount: "0x100000", max_price_per_unit: "0x1" },
  l2_gas: { max_amount: "0x77359400", max_price_per_unit: "0x1" }, // 2e9
  l1_data_gas: { max_amount: "0x100000", max_price_per_unit: "0x1" },
};

// Nested arrays are Cairo array args; CallData.compile length-prefixes them.
type CalldataValue = string | number | bigint | CalldataValue[];
type Call = { contractAddress: string; entrypoint: string; calldata: CalldataValue[] };
type ChainStep = { label: string; sender: string; calls: Call[] };

// ---------------------------------------------------------------- rpc plumbing

let rpcId = 0;
async function rpc<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = (await response.json()) as { result?: T; error?: unknown };
  if (body.error) {
    throw new Error(`${method} failed:\n${JSON.stringify(body.error, null, 2)}`);
  }
  return body.result as T;
}

async function toriiSql<T>(query: string): Promise<T[]> {
  const response = await fetch(`${TORII}/sql?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Torii SQL ${response.status}: ${await response.text()}`);
  return (await response.json()) as T[];
}

// Standard Cairo-1 __execute__ calldata: [n_calls, (to, selector, len, ...)xN].
// Hand-rolled rather than pulled from starknet.js so the encoding is visible
// next to the hand-built JSON-RPC request it feeds.
function executeCalldata(calls: Call[]): string[] {
  const out: string[] = [`0x${calls.length.toString(16)}`];
  for (const call of calls) {
    const data = CallData.compile(call.calldata as never);
    out.push(call.contractAddress);
    out.push(hash.getSelectorFromName(call.entrypoint));
    out.push(`0x${data.length.toString(16)}`);
    out.push(...data.map((v) => `0x${BigInt(v).toString(16)}`));
  }
  return out;
}

function invokeV3(sender: string, nonce: bigint, calls: Call[]) {
  return {
    type: "INVOKE",
    version: "0x3",
    sender_address: sender,
    calldata: executeCalldata(calls),
    // Never checked: SKIP_VALIDATE means __validate__ is not run.
    signature: [],
    nonce: `0x${nonce.toString(16)}`,
    resource_bounds: RESOURCE_BOUNDS,
    tip: "0x0",
    paymaster_data: [],
    account_deployment_data: [],
    nonce_data_availability_mode: "L1",
    fee_data_availability_mode: "L1",
  };
}

type Trace = {
  execution_resources?: { l1_gas?: number; l1_data_gas?: number; l2_gas?: number };
  execute_invocation?: { revert_reason?: string };
};
type SimResult = { transaction_trace: Trace; fee_estimation?: Record<string, unknown> };

async function simulateChain(steps: ChainStep[]): Promise<SimResult[]> {
  const nonces = new Map<string, bigint>();
  for (const step of steps) {
    if (!nonces.has(step.sender)) {
      const raw = await rpc<string>("starknet_getNonce", {
        block_id: "latest",
        contract_address: step.sender,
      });
      nonces.set(step.sender, BigInt(raw));
    }
  }

  const running = new Map(nonces);
  const transactions = steps.map((step) => {
    const nonce = running.get(step.sender)!;
    running.set(step.sender, nonce + 1n);
    return invokeV3(step.sender, nonce, step.calls);
  });

  return rpc<SimResult[]>("starknet_simulateTransactions", {
    block_id: "latest",
    transactions,
    // SKIP_VALIDATE: simulate from accounts we hold no key for.
    // SKIP_FEE_CHARGE: katana is fee-less, and nobody here holds a balance.
    simulation_flags: ["SKIP_VALIDATE", "SKIP_FEE_CHARGE"],
  });
}

// -------------------------------------------------------------- commit/reveal

type Move = {
  p0: number; p1: number; p2: number;
  g0: number; g1: number; g2: number;
  repair: number;
  nc0: number; nc1: number; nc2: number;
  trap0: number; trap1: number; trap2: number;
  ability_id: number; ability_target: number;
};

const ZERO_MOVE: Move = {
  p0: 0, p1: 0, p2: 0, g0: 0, g1: 0, g2: 0, repair: 0,
  nc0: 0, nc1: 0, nc2: 0, trap0: 0, trap1: 0, trap2: 0,
  ability_id: 0, ability_target: 0,
};

// B's attack. Deliberately weak: 5 damage a round against a defenceless A caps
// total damage at 45 after nine rounds, so A's vault (50) can never hit 0 early
// and the match always finishes on the round-10 rule — regardless of what gate
// modifiers the VRF rolls. That is what makes the transaction count fixed.
const ATTACK_MOVE: Move = { ...ZERO_MOVE, p0: 1, p1: 2, p2: 2 };

function moveFelts(m: Move): number[] {
  return [
    m.p0, m.p1, m.p2, m.g0, m.g1, m.g2, m.repair,
    m.nc0, m.nc1, m.nc2, m.trap0, m.trap1, m.trap2,
    m.ability_id, m.ability_target,
  ];
}

// Mirrors commit_reveal_1v1's PoseidonTrait::new() + update(...) + finalize(),
// which is byte-for-byte poseidon_hash_span over the same element order.
// Same construction as frontend/src/lib/crypto.ts computeCommitment1v1.
function commitment(salt: string, m: Move): string {
  return hash.computePoseidonHashOnElements([salt, ...moveFelts(m).map(String)]);
}

function saltFor(round: number, role: "a" | "b"): string {
  return `0x${(0x5e1_0000n + BigInt(round) * 2n + (role === "a" ? 0n : 1n)).toString(16)}`;
}

// -------------------------------------------------------------- fixture checks

type Manifest = { contracts: { address: string; tag: string }[] };

function tagAddress(manifest: Manifest, tag: string): string {
  const entry = manifest.contracts.find((c) => c.tag === tag);
  if (!entry) throw new Error(`Missing ${tag} in ${MANIFEST_PATH}`);
  return entry.address;
}

const same = (a: string, b: string) => BigInt(a) === BigInt(b);

async function verifyFixture(worldSystem: string, abilityToken: string) {
  const problems: string[] = [];

  const parcels = await toriiSql<{ parcel_id: number; col: number; row: number; owner: string; is_home: number }>(
    "SELECT parcel_id,col,row,owner,is_home FROM [siege_dojo-Parcel] " +
      `WHERE parcel_id IN (${[CONQUEST_TARGET, PILLAGE_HOME].join(",")})`,
  );
  const target = parcels.find((p) => p.parcel_id === CONQUEST_TARGET);
  const home = parcels.find((p) => p.parcel_id === PILLAGE_HOME);

  if (!target || !same(target.owner, PLAYER_B) || target.is_home) {
    problems.push(
      `conquest target parcel ${CONQUEST_TARGET} must be a non-home parcel owned by PLAYER_B ` +
        `(is: owner=${target?.owner ?? "none"}, is_home=${target?.is_home ?? "?"})`,
    );
  }
  if (!home || !same(home.owner, PLAYER_A) || !home.is_home) {
    problems.push(
      `pillage target parcel ${PILLAGE_HOME} must be a HOME parcel owned by PLAYER_A ` +
        `(is: owner=${home?.owner ?? "none"}, is_home=${home?.is_home ?? "?"})`,
    );
  }

  const factions = await toriiSql<{ player: string }>(
    "SELECT player FROM [siege_dojo-FactionMember] WHERE faction_id != 0",
  ).catch(() => [] as { player: string }[]); // missing table == nobody is in a faction
  for (const row of factions) {
    if (same(row.player, PLAYER_A) || same(row.player, PLAYER_B)) {
      problems.push(`${row.player} joined a faction — ally adjacency can block the pillage`);
    }
  }

  const provider = new RpcProvider({ nodeUrl: RPC });
  for (const [label, owner] of [["PLAYER_A", PLAYER_A], ["PLAYER_B", PLAYER_B]] as const) {
    const [approved] = await provider.callContract({
      contractAddress: abilityToken,
      entrypoint: "is_approved_for_all",
      calldata: CallData.compile([owner, worldSystem]),
    });
    if (BigInt(approved) !== 1n) {
      problems.push(
        `${label} has not approved world_system as ERC-1155 operator — ` +
          "add a set_approval_for_all step to the chain",
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Fixture no longer matches the chain:\n  - ${problems.join("\n  - ")}`);
  }
  console.log("Fixture verified: parcel ownership, no factions, operator approvals set.");
}

async function nextMatchId(): Promise<bigint> {
  // setup_match writes match_id = counter.count + 1, so the next match takes
  // the successor of whatever the counter holds now.
  const [row] = await toriiSql<{ count: string }>(
    "SELECT count FROM [siege_dojo-MatchCounter] WHERE id = 0",
  );
  if (!row) throw new Error("MatchCounter missing from Torii");
  return BigInt(row.count) + 1n;
}

// -------------------------------------------------------------------- reporting

const fmt = (n: bigint) => n.toLocaleString("en-US");

function l2Gas(result: SimResult): bigint {
  const value = result.transaction_trace?.execution_resources?.l2_gas;
  if (value === undefined) throw new Error("trace carried no execution_resources.l2_gas");
  return BigInt(value);
}

// Katana does NOT fail the simulate request when a transaction reverts: it
// returns a normal trace with a revert_reason and a perfectly plausible gas
// figure for the work done UP TO the panic. Reporting that number would be
// worse than useless — a reverted settle_match looks cheap precisely because it
// stopped early. Every step is checked, not just the probed ones, because a
// revert mid-chain silently invalidates everything after it.
function revertReason(result: SimResult): string | undefined {
  return result.transaction_trace?.execute_invocation?.revert_reason;
}

function assertNoReverts(title: string, steps: ChainStep[], results: SimResult[]) {
  const reverted = results
    .map((result, i) => ({ label: steps[i].label, reason: revertReason(result) }))
    .filter((r) => r.reason !== undefined);
  if (reverted.length === 0) return;
  throw new Error(
    `${title}: ${reverted.length} transaction(s) reverted — every figure after the first is meaningless:\n` +
      reverted.map((r) => `  ${r.label}\n    ${r.reason?.trim()}`).join("\n"),
  );
}

function printChain(title: string, steps: ChainStep[], results: SimResult[]) {
  console.log(`\n--- ${title} ---`);
  const width = Math.max(...steps.map((s) => s.label.length));
  results.forEach((result, i) => {
    const gas = l2Gas(result);
    const reason = revertReason(result);
    const suffix = reason ? `  REVERTED: ${reason.trim().split("\n").pop()}` : "";
    console.log(`  ${steps[i].label.padEnd(width)}  ${fmt(gas).padStart(13)}${suffix}`);
  });
  assertNoReverts(title, steps, results);
}

// ------------------------------------------------------------------------ main

async function main() {
  const manifest: Manifest = json.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const worldSystem = tagAddress(manifest, "siege_dojo-world_system");
  const conquest = tagAddress(manifest, "siege_dojo-conquest");
  const actions1v1 = tagAddress(manifest, "siege_dojo-actions_1v1");
  const commitReveal = tagAddress(manifest, "siege_dojo-commit_reveal_1v1");
  const resolution = tagAddress(manifest, "siege_dojo-resolution_1v1");

  const katanaAddresses = json.parse(readFileSync(KATANA_ADDRESSES_PATH, "utf-8"));
  const devVrf: string = katanaAddresses.unusedDevVrfProvider;
  const abilityToken: string = katanaAddresses.abilityToken;
  if (!devVrf) throw new Error(`No unusedDevVrfProvider in ${KATANA_ADDRESSES_PATH}`);

  console.log("rpc          :", RPC);
  console.log("manifest     :", MANIFEST_PATH);
  console.log("world_system :", worldSystem);
  console.log("conquest     :", conquest);
  console.log("DevVrf       :", devVrf, "(rewired into ResourceConfig for the simulation only)");
  console.log("player A     :", PLAYER_A);
  console.log("player B     :", PLAYER_B);
  console.log();

  await verifyFixture(worldSystem, abilityToken);
  const matchId = await nextMatchId();
  console.log(`Next match id: ${matchId}`);

  const rewireVrf: ChainStep = {
    label: "set_vrf_provider(DevVrf)",
    sender: WORLD_OWNER,
    calls: [{ contractAddress: actions1v1, entrypoint: "set_vrf_provider", calldata: [devVrf] }],
  };

  // ---- Probe 1: initiate_conquest ----------------------------------------
  // Attacker budget is 10 across attack + gate defense combined.
  const conquestChain: ChainStep[] = [
    rewireVrf,
    {
      label: `initiate_conquest(parcel ${CONQUEST_TARGET})`,
      sender: PLAYER_A,
      calls: [
        {
          contractAddress: conquest,
          entrypoint: "initiate_conquest",
          calldata: [CONQUEST_TARGET, 3, 2, 2, 1, 1, 1, 0, 0],
        },
      ],
    },
  ];

  console.log(`\nSimulating conquest chain (${conquestChain.length} txs)...`);
  const conquestResults = await simulateChain(conquestChain);
  printChain("chain 1: conquest", conquestChain, conquestResults);
  const conquestGas = l2Gas(conquestResults[1]);

  // ---- Probe 2: full staked match -> settle_match -> initiate_pillage ----
  // A creates and B joins so that B is player_b; B then wins, which is what
  // grants B pillage eligibility against A (settle only grants it to the
  // winner, and only when the winner borders one of the loser's homes).
  const matchChain: ChainStep[] = [
    rewireVrf,
    {
      label: "create_staked_match (A)",
      sender: PLAYER_A,
      calls: [
        {
          contractAddress: worldSystem,
          entrypoint: "create_staked_match",
          calldata: [PLAYER_B, [1]],
        },
      ],
    },
    {
      label: "join_staked_match (B)",
      sender: PLAYER_B,
      calls: [
        {
          contractAddress: worldSystem,
          entrypoint: "join_staked_match",
          calldata: [matchId, [1]],
        },
      ],
    },
  ];

  for (let round = 1; round <= 10; round++) {
    const moves: [string, "a" | "b", Move][] = [
      [PLAYER_A, "a", ZERO_MOVE],
      [PLAYER_B, "b", ATTACK_MOVE],
    ];
    for (const [sender, role, move] of moves) {
      matchChain.push({
        label: `r${round} commit ${role.toUpperCase()}`,
        sender,
        calls: [
          {
            contractAddress: commitReveal,
            entrypoint: "commit",
            calldata: [matchId, commitment(saltFor(round, role), move)],
          },
        ],
      });
    }
    for (const [sender, role, move] of moves) {
      matchChain.push({
        label: `r${round} reveal ${role.toUpperCase()}`,
        sender,
        calls: [
          {
            contractAddress: commitReveal,
            entrypoint: "reveal",
            calldata: [matchId, saltFor(round, role), ...moveFelts(move)],
          },
        ],
      });
    }
    matchChain.push({
      label: `r${round} resolve_round`,
      sender: PLAYER_A,
      calls: [
        { contractAddress: resolution, entrypoint: "resolve_round", calldata: [matchId] },
      ],
    });
  }

  matchChain.push({
    label: "settle_match (B)",
    sender: PLAYER_B,
    calls: [{ contractAddress: worldSystem, entrypoint: "settle_match", calldata: [matchId] }],
  });
  matchChain.push({
    label: `initiate_pillage(home ${PILLAGE_HOME})`,
    sender: PLAYER_B,
    calls: [
      {
        contractAddress: worldSystem,
        entrypoint: "initiate_pillage",
        calldata: [matchId, PILLAGE_HOME],
      },
    ],
  });

  console.log(`\nSimulating match chain (${matchChain.length} txs)...`);
  const matchResults = await simulateChain(matchChain);
  printChain("chain 2: staked match -> settle -> pillage", matchChain, matchResults);

  const settleGas = l2Gas(matchResults[matchChain.length - 2]);
  const pillageGas = l2Gas(matchResults[matchChain.length - 1]);

  // ------------------------------------------------------------- summary
  console.log("\n=== L2 gas vs the ~100M AVNU sponsorship line ===");
  const probes: [string, bigint][] = [
    ["conquest.initiate_conquest", conquestGas],
    ["world_system.settle_match", settleGas],
    ["world_system.initiate_pillage", pillageGas],
  ];
  const width = Math.max(...probes.map(([name]) => name.length));
  for (const [name, gas] of probes) {
    const pct = (Number(gas) / Number(SPONSORSHIP_LIMIT)) * 100;
    const verdict = gas > SPONSORSHIP_LIMIT ? "ABOVE the line" : "below the line";
    console.log(
      `  ${name.padEnd(width)}  ${fmt(gas).padStart(13)}  ${pct.toFixed(1).padStart(5)}% of 100M  ${verdict}`,
    );
  }
  console.log("\nNo transaction was broadcast: every figure above came from starknet_simulateTransactions.");
}

main().catch((error) => {
  console.error("\nProbe failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
