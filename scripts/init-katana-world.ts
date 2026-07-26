// Idempotent bootstrap for the self-hosted Railway katana (SIEGE chain).
//
// Run AFTER `sozo -P katana migrate` + writer grants. Declares and deploys the
// non-Dojo contracts (AbilityToken, 6 ResourceTokens, DevVrfProvider), lays out
// the hex grid, and wires every config the sepolia init scripts handled:
//   initialize_world, set_authorized_operator x3 per token,
//   AbilityToken set_minter/set_minter2/set_burner,
//   actions_1v1 set_ability_token / set_resource_config / set_vrf_provider,
//   matchmaking set_entry_config / set_entry_token (paid queue).
//
// SAFE TO RE-RUN. Every step either checks on-chain state first or tolerates
// the contract's own "already done" revert, so this can be the single command
// that re-provisions katana after a migrate rather than a one-shot ritual.
// That matters: katana drifted 9 days behind main because re-provisioning was
// manual and nothing made it cheap to repeat.
//
// Usage:
//   bun x tsx scripts/init-katana-world.ts
//
// Deployer defaults to katana dev account 0 (public dev key, test chain only).
// Prints a JSON address block at the end — paste into torii_katana.toml and
// frontend/src/lib/useResourceBalances.ts (katana branch).

import { Account, CallData, RpcProvider, byteArray, cairo, hash, json, legacyDeployer } from "starknet";
import { readFileSync, writeFileSync } from "node:fs";

const RPC = process.env.KATANA_RPC_URL ?? "https://siege-katana-production.up.railway.app";
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_katana.json";
const TARGET_DIR = process.env.TARGET_DIR ?? "target/katana";
const ADDRESSES_PATH = process.env.KATANA_ADDRESSES_PATH ?? "katana-addresses.json";

const ACCOUNT_ADDRESS =
  process.env.DOJO_ACCOUNT_ADDRESS ??
  "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec";
const PRIVATE_KEY =
  process.env.DOJO_PRIVATE_KEY ??
  "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912";

const GRID_W = 12;
const GRID_H = 8;

const TOKENS = [
  { name: "Iron", symbol: "IRON" },
  { name: "Linen", symbol: "LINEN" },
  { name: "Stone", symbol: "STONE" },
  { name: "Wood", symbol: "WOOD" },
  { name: "Ember", symbol: "EMBER" },
  { name: "Seeds", symbol: "SEEDS" },
];

// Entry buy-in for the paid queue, in whole tokens. ResourceToken has 0
// decimals (resource_token.cairo) and claim_drip mints `intervals` units — one
// per hour per home parcel pair — so this is deliberately a single unit, not a
// mainnet-style 1e18 amount. A tester registers a Hold, waits one drip, and can
// queue; no operator has to fund anyone. Use scripts/fund-katana-tester.ts to
// skip the wait.
// Katana predeploys a Cartridge VRF provider at genesis (from
// --cartridge.paymaster). ResourceConfig.vrf_provider MUST point at it rather
// than the DevVrfProvider: transactions sent through the paymaster arrive as
// outside-executions, and the paymaster appends assert_consumed against this
// provider. Consuming from anything else reverts the whole call with
// 'VrfProvider: not consumed'.
const KATANA_CARTRIDGE_VRF = "0x015f542e25a4ce31481f986888c179b6e57412be340b8095f72f75a328fbb27b";

const ENTRY_AMOUNT = 1n;
const WINNER_BPS = 6500; // mirrors mainnet's split so settlement math is exercised

type Manifest = { contracts: { address: string; tag: string }[] };

function tagAddress(manifest: Manifest, tag: string): string {
  const entry = manifest.contracts.find((c) => c.tag === tag);
  if (!entry) throw new Error(`Missing ${tag} in ${MANIFEST_PATH}`);
  return entry.address;
}

function optionalTagAddress(manifest: Manifest, tag: string): string | null {
  return manifest.contracts.find((c) => c.tag === tag)?.address ?? null;
}

async function declareIfNeeded(
  provider: RpcProvider,
  account: Account,
  artifactBase: string,
): Promise<string> {
  const sierra = json.parse(readFileSync(`${TARGET_DIR}/${artifactBase}.contract_class.json`, "utf-8"));
  const casm = json.parse(
    readFileSync(`${TARGET_DIR}/${artifactBase}.compiled_contract_class.json`, "utf-8"),
  );
  const classHash = hash.computeSierraContractClassHash(sierra);
  try {
    await provider.getClassByHash(classHash);
    console.log(`  ${artifactBase}: already declared (${classHash})`);
  } catch {
    console.log(`  declaring ${artifactBase}...`);
    const declared = await account.declare({ contract: sierra, casm });
    await provider.waitForTransaction(declared.transaction_hash);
    console.log(`  ${artifactBase}: declared (${declared.class_hash})`);
  }
  return classHash;
}

// Deploys are salted deterministically from the label, so re-running would hit
// the same address and revert. Predict that address with starknet.js's own
// deployer (rather than re-deriving the UDC formula here, which would silently
// diverge if the library changes `unique` handling) and skip if code exists.
async function deployIfNeeded(
  provider: RpcProvider,
  account: Account,
  classHash: string,
  constructorCalldata: string[],
  saltLabel: string,
): Promise<string> {
  const salt = hash.computePoseidonHash(
    classHash,
    `0x${Buffer.from(`siege-katana:${saltLabel}`).toString("hex")}`,
  );
  const payload = { classHash, constructorCalldata, salt };
  const { addresses } = legacyDeployer.buildDeployerCall(payload, account.address);
  const predicted = addresses[0];

  try {
    await provider.getClassHashAt(predicted);
    console.log(`  ${saltLabel}: already deployed (${predicted})`);
    return predicted;
  } catch {
    // No contract at the address yet — deploy it.
  }

  const result = await account.deploy(payload);
  await provider.waitForTransaction(result.transaction_hash);
  const address = Array.isArray(result.contract_address)
    ? result.contract_address[0]
    : result.contract_address;
  if (!address) throw new Error(`No address for ${saltLabel}`);
  if (BigInt(address) !== BigInt(predicted)) {
    // Would mean the prediction is wrong, so re-runs would deploy duplicates
    // instead of skipping. Fail loudly rather than quietly drifting.
    throw new Error(
      `${saltLabel}: deployed to ${address} but predicted ${predicted} — address prediction is broken`,
    );
  }
  return address;
}

async function exec(
  provider: RpcProvider,
  account: Account,
  calls: { contractAddress: string; entrypoint: string; calldata: ReturnType<typeof CallData.compile> }[],
  label: string,
  // Contract-side guards that mean "this step already ran". Matched against the
  // revert text so a re-run reports the step as done instead of aborting.
  tolerate: string[] = [],
) {
  console.log(`→ ${label}`);
  try {
    const tx = await account.execute(calls);
    await provider.waitForTransaction(tx.transaction_hash);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const matched = tolerate.find((reason) => text.toLowerCase().includes(reason.toLowerCase()));
    if (!matched) throw error;
    console.log(`  (already applied — "${matched}")`);
  }
}

async function main() {
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const actions1v1 = tagAddress(manifest, "siege_dojo-actions_1v1");
  const worldSystem = tagAddress(manifest, "siege_dojo-world_system");
  const resolution1v1 = tagAddress(manifest, "siege_dojo-resolution_1v1");
  const crafting1v1 = tagAddress(manifest, "siege_dojo-crafting_1v1");

  const provider = new RpcProvider({ nodeUrl: RPC });
  // Katana predeploys only the legacy UDC; starknet.js v8 defaults to the new
  // deployer address, which does not exist on this chain.
  const account = new Account({
    provider,
    address: ACCOUNT_ADDRESS,
    signer: PRIVATE_KEY,
    deployer: legacyDeployer,
  });
  console.log("RPC:", RPC);
  console.log("Deployer:", ACCOUNT_ADDRESS);

  console.log("\nDeclaring classes...");
  const resourceClass = await declareIfNeeded(provider, account, "siege_dojo_ResourceToken");
  const abilityClass = await declareIfNeeded(provider, account, "siege_dojo_AbilityToken");
  const vrfClass = await declareIfNeeded(provider, account, "siege_dojo_DevVrfProvider");

  console.log("\nDeploying AbilityToken...");
  const abilityToken = await deployIfNeeded(provider, account, abilityClass, [ACCOUNT_ADDRESS], "ability");
  console.log("  AbilityToken:", abilityToken);

  console.log("\nDeploying DevVrfProvider...");
  const vrfProvider = await deployIfNeeded(provider, account, vrfClass, [], "vrf");
  console.log("  DevVrfProvider:", vrfProvider);

  console.log("\nDeploying resource tokens...");
  const resourceAddresses: string[] = [];
  for (const token of TOKENS) {
    const address = await deployIfNeeded(
      provider,
      account,
      resourceClass,
      [
        ...CallData.compile(byteArray.byteArrayFromString(token.name)),
        ...CallData.compile(byteArray.byteArrayFromString(token.symbol)),
        ACCOUNT_ADDRESS,
      ],
      `resource:${token.symbol}`,
    );
    console.log(`  ${token.symbol}: ${address}`);
    resourceAddresses.push(address);
  }

  const cols: number[] = [];
  const rows: number[] = [];
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      cols.push(c);
      rows.push(r);
    }
  }
  await exec(
    provider,
    account,
    [
      {
        contractAddress: worldSystem,
        entrypoint: "initialize_world",
        calldata: CallData.compile([cols, rows]),
      },
    ],
    `initialize_world (${GRID_W}x${GRID_H})`,
    ["Already initialized"], // world_system's own guard on a second run
  );

  for (const address of resourceAddresses) {
    await exec(
      provider,
      account,
      [resolution1v1, worldSystem, crafting1v1].map((operator) => ({
        contractAddress: address,
        entrypoint: "set_authorized_operator",
        calldata: CallData.compile([operator, 1]),
      })),
      `authorize operators on ${address}`,
    );
  }

  await exec(
    provider,
    account,
    [
      { contractAddress: abilityToken, entrypoint: "set_minter", calldata: CallData.compile([crafting1v1]) },
      { contractAddress: abilityToken, entrypoint: "set_minter2", calldata: CallData.compile([worldSystem]) },
      { contractAddress: abilityToken, entrypoint: "set_burner", calldata: CallData.compile([crafting1v1]) },
    ],
    "wire AbilityToken minter/minter2/burner",
  );

  await exec(
    provider,
    account,
    [
      { contractAddress: actions1v1, entrypoint: "set_ability_token", calldata: CallData.compile([abilityToken]) },
      { contractAddress: actions1v1, entrypoint: "set_resource_config", calldata: CallData.compile(resourceAddresses) },
      // Cartridge's predeployed provider, not vrfProvider — see KATANA_CARTRIDGE_VRF.
      { contractAddress: actions1v1, entrypoint: "set_vrf_provider", calldata: CallData.compile([KATANA_CARTRIDGE_VRF]) },
    ],
    "wire ResourceConfig (ability token, resources, vrf)",
  );

  // Paid-queue entry config. Uses the resource tokens as buy-ins so a tester
  // funds themselves through claim_drip instead of an operator topping them up,
  // and so the real escrow path (MatchPot, the winner_bps split, treasury
  // remainder, draw refunds) actually executes rather than moving zero.
  //
  // Skipped when the manifest predates matchmaking, so this script still works
  // against an older world instead of dying on a missing tag.
  const matchmaking = optionalTagAddress(manifest, "siege_dojo-matchmaking");
  if (!matchmaking) {
    console.log("\n! matchmaking absent from manifest — skipping entry config.");
    console.log("  Re-run `sozo -P katana migrate` from current main, then re-run this script.");
  } else {
    await exec(
      provider,
      account,
      [
        {
          contractAddress: matchmaking,
          entrypoint: "set_entry_config",
          calldata: CallData.compile([WINNER_BPS, ACCOUNT_ADDRESS]),
        },
      ],
      `set_entry_config (winner_bps=${WINNER_BPS}, treasury=deployer)`,
    );

    for (const [i, address] of resourceAddresses.entries()) {
      await exec(
        provider,
        account,
        [
          {
            contractAddress: matchmaking,
            entrypoint: "set_entry_token",
            calldata: CallData.compile([address, cairo.uint256(ENTRY_AMOUNT), 1]),
          },
        ],
        `enable ${TOKENS[i].symbol} as entry token @ ${ENTRY_AMOUNT}`,
      );
    }
  }

  const addresses = {
    abilityToken,
    // What ResourceConfig actually points at, and what clients must send
    // request_random to. The DevVrfProvider below is still deployed but is NOT
    // wired — the paymaster's assert_consumed forces Cartridge's provider.
    vrfProvider: KATANA_CARTRIDGE_VRF,
    unusedDevVrfProvider: vrfProvider,
    resources: Object.fromEntries(TOKENS.map((t, i) => [t.symbol, resourceAddresses[i]])),
  };

  // Written out as well as printed so other scripts (fund-katana-tester.ts) can
  // read these rather than depending on someone pasting them by hand. Addresses
  // are deterministic per class hash, so re-running reproduces the same file.
  writeFileSync(ADDRESSES_PATH, `${JSON.stringify(addresses, null, 2)}\n`);

  console.log("\n✓ Katana world initialized. Addresses:");
  console.log(JSON.stringify(addresses, null, 2));
  console.log(`\nWrote ${ADDRESSES_PATH}`);
}

main().catch((error) => {
  console.error("\nBootstrap failed:", error);
  process.exit(1);
});
