# Siege

Siege is a Starknet / Dojo strategy game in the `siege_dojo` namespace, live on
Starknet mainnet at [www.siegedojo.world](https://www.siegedojo.world). It has
three layers:

- **1v1 battles**: commit-reveal siege rounds with gate modifiers, resource
  nodes, traps, repair, and single-use ability tokens.
- **The Marches**: a persistent hex-grid world where players establish Holds,
  claim parcels, collect resource drip, stake abilities on matches, pillage
  neighbors, form factions, and fight asynchronous conquests. ("The Marches"
  and "Hold" are player-facing names; the backend models remain `World` and
  `PlayerKingdom`.)
- **Two hosted networks**: Starknet mainnet (real stakes) and a self-hosted
  Katana appchain (the free **Practice** tier). One frontend serves both via an
  in-app network switcher.

The source of truth is the code, manifests, and config in this checkout —
including for this file. `CLAUDE.md` (symlinked as `AGENTS.md`) carries the
deeper working context for coding agents and is actively maintained.

## Networks

| Network | Status | Profile / manifest |
| ------- | ------ | ------------------ |
| Mainnet | **Live** — the production game | `dojo_mainnet.toml`, `manifest_mainnet.json` |
| Katana (Practice) | Live — fee-less self-hosted appchain on Railway, also the dev environment | `dojo_katana.toml`, `manifest_katana.json` |
| Sepolia | Parked — Cartridge sponsorship outage | `dojo_sepolia.toml`, `manifest_sepolia.json` |

All networks share one world seed (`siege_dojo_v9`), so the world address is
the same everywhere:
`0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73`. System
and token addresses differ per network — **always read them from the manifest
files**, never from copies in docs (they drift — this README contains no
others).

Each network has its own Torii indexer (mainnet and katana run on Railway from
`infra/torii-mainnet/` and `infra/torii-katana/`). Nothing merges state across
networks — that separation is what keeps the free Practice tier from
cannibalizing mainnet.

Deployment runbooks live in the repo's skills: `deploy-mainnet`, `dev-katana`,
and `deploy-sepolia`.

## Gameplay

### 1v1 battles

Two players, two 50 HP vaults, up to 10 rounds. A match ends when a vault hits
0 or after round 10. Each round: both players commit a Poseidon hash, both
reveal the exact allocation, then `resolution_1v1.resolve_round` applies
everything. Commit and reveal deadlines are 300 seconds each.

Each player spends a budget of `10 + owned_resource_nodes + max(0, round - 6)`
(endgame escalation, rounds 7-10) across:

- `attack` / `defense`: 3 gate pressure and garrison values.
- `repair`: heals the vault at 2 budget per HP, uncapped (vault max 50).
- `nodes`: 3 resource-node contest values.
- `traps`: 3 hidden node traps, 2 budget each.
- `ability_id` / `ability_target`: optional single-use staked ability.

Reveal hash order:

```text
salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, ability_id, ability_target
```

Gate modifiers for the next round are rolled with Cartridge VRF at resolve
time:

| Code | Name        | Effect                                                             |
| ---- | ----------- | ------------------------------------------------------------------ |
| 0    | Normal      | Standard `max(attack - defense, 0)` damage.                        |
| 1    | Narrow Pass | Allocated attack and defense capped at 3 (abilities apply after).  |
| 2    | Mirror      | Attack and defense swap at that gate.                              |
| 3    | Deadlock    | No damage at that gate.                                            |
| 4    | Reflection  | Overflow splits to other non-deadlock gates, reduced by unused defense. |

Owning node `i` grants +1 defense at gate `i` the same round and +1 budget next
round. Resource nodes mint paired ERC-20 resources after resolution: Forge →
IRON + LINEN, Quarry → STONE + WOOD, Grove → EMBER + SEEDS.

### Abilities

Abilities are ERC-1155 tokens (`src/tokens/ability_token.cairo`), IDs 1-5 for
tier 1 and 6-10 for tier 2, crafted from resources in `crafting_1v1`:

| ID     | Ability     | T1 effect                        | T2 effect                                          |
| ------ | ----------- | -------------------------------- | -------------------------------------------------- |
| 1 / 6  | Siege Sword | Set target gate attack to 5.     | Set target gate attack to 10.                      |
| 2 / 7  | Stone Cloak | Halve gate damage taken.         | Halve gate damage AND negate the opponent's repair that round. |
| 3 / 8  | Ember Blast | 2 direct vault damage.           | 6 direct vault damage.                             |
| 4 / 9  | Hex         | Reduce opponent total damage by 3. | Reduce opponent total damage by 8.               |
| 5 / 10 | Fortify     | +1 defense at every gate.        | Double defense at every gate.                      |

Registration mints starter abilities 1, 2, and 3. Craft costs live in the
crafting system and the MCP/frontend mirrors — not here.

### Matchmaking and staked matches

`matchmaking.queue_for_match(token, abilities)` takes an entry buy-in from an
owner-managed `EntryToken` allowlist plus a 1-3 ability wager, and runs three
sub-queues keyed by wager size — players only pair with equal wagers, so stakes
never trim. Entries expire after 600
seconds (no heartbeat — clients poll Torii and re-queue). Pairing escrows both
buy-ins and both wagers; queue matches are full staked matches. Permissionless
`claim_winnings(match_id)` pays the winner the configured `winner_bps` share of
each side's buy-in (treasury takes the rest; draws refund in full). Clients
always send the `[vrf request_random, queue_for_match]` multicall.

Direct staked matches go through `world_system.create_staked_match` /
`join_staked_match` with the same 1-3 ability escrow. After a match finishes,
`settle_match` transfers or refunds staked abilities, updates wins, reputation,
and match records, releases the loser's furthest-from-home non-home parcel, and
may grant pillage eligibility — it does **not** mint resources (players use
`claim_drip`). `claim_parcel` then lets the winner claim one unclaimed adjacent
parcel.

If a match stalls, participant-only `force_timeout` drives it to Finished in
stages, each gated on a 300 s deadline, ending a fully abandoned round as a
draw.

### The Marches

The world is an offset hex grid — `col`/`row` per `Parcel`, distance metric in
`src/utils/hex.cairo`. Grid size is per-world and growable via `expand_world`,
so read `WorldConfig.total_parcels` rather than assuming (mainnet is currently
12x8 = 96 parcels; katana/sepolia 8x4 = 32).

Registering a Hold claims three home parcels: the first maximizes distance to
already-claimed parcels, the other two cluster near it; the caller picks the
parcel types, not the positions. `claim_drip` mints resources for the three
homes once per hour, skipping actively pillaged homes — drip is uniform, no
zone multipliers.

Pillage eligibility (earned from staked-match wins) lasts 24 hours and lets the
winner siphon an adjacent loser home's drip.

Conquest attacks an adjacent non-home parcel in one transaction: attacker
budget 10 and HP 10 versus defender preset budget 12 and HP 15; ties go to the
defender. Up to three adjacent faction allies can reinforce (deduplicated per
ally player). Defenders with no presets defend with a fixed default, so every
Hold is always attackable.

Factions, cosmetics, reputation, and tier progression all live in
`world_system.cairo`. Tier thresholds and ability slots are mirrored in
`frontend/src/lib/tiers.ts`; match ability stakes cap at 3 slots at every tier.

## Project layout

```text
src/
  systems/
    actions_1v1.cairo        1v1 match creation and budget config
    commit_reveal_1v1.cairo  1v1 commit, reveal, force_timeout
    resolution_1v1.cairo     1v1 damage, nodes, traps, abilities
    crafting_1v1.cairo       ability crafting
    matchmaking.cairo        paid/staked queue, entry pot, claim_winnings
    world_system.cairo       Holds, staking, settlement, drip, pillage, factions, tiers
    conquest.cairo           async parcel conquest
  models/                    Dojo ECS models
  tokens/                    AbilityToken, ResourceToken, metadata, dev-only VRF/account
  utils/hex.cairo            hex-grid distance
  tests/                     Cairo tests (docker builder only)

frontend/                    Next.js app (battles, The Marches, craft, forge)
mcp-server-2/                active MCP server (45 tools); mcp-server/ is superseded
scripts/                     deploy, token, world-init, audit, and bot scripts
scripts/siege-cli/           CLI for 1v1 matches
infra/                       Railway Dockerfiles: katana + torii deployments
site/                        Vocs player documentation site
docs/superpowers/            historical specs and plans — not current truth
```

## Toolchain

Versions are pinned in the real config files — `Scarb.toml` (Cairo/Dojo),
`frontend/package.json`, `mcp-server-2/package.json`, `site/package.json`,
`Dockerfile.build` (scarb/sozo), and `infra/*/Dockerfile` (katana/torii). Don't
trust version numbers in docs; `scripts/check-versions.ts` audits every pin
against upstream, and weekly GitHub workflows (`version-check.yml`,
`cairo-canary.yml`) keep a sticky issue current.

The locally installed sozo is older than the project toolchain — **always run
sozo through the Docker builder**:

```bash
docker compose run --rm builder sozo build
docker compose run --rm builder sozo test
```

## Development

Frontend (bun):

```bash
cd frontend
bun install
bun run dev      # also: lint, test, build
```

The `predev` / `prebuild` / `pretest` hooks copy all four root
`manifest_*.json` files into `frontend/src/manifests/`.

MCP server (pnpm):

```bash
cd mcp-server-2
pnpm install
pnpm run build   # also: test
```

Local chain: `./scripts/local-dev.sh` boots katana + torii and migrates. Caveat:
the contract-address env vars it writes into `frontend/.env.local` are legacy
names the app no longer reads — harmless, devnet addresses fall back to
`manifest_dev.json` (see `frontend/README.md`).

For the hosted katana dev world, `bun x tsx scripts/init-katana-world.ts` is
idempotent and safe to re-run after every migrate — see the `dev-katana` skill.

## Torii

Torii serves SQL and gRPC-web on the same base URL — no `/grpc` path, no
separate port: `{TORII_URL}/sql?query=…` and `{TORII_URL}/world.World/<Method>`.
Native gRPC is not exposed, so `grpcurl` and server reflection do not work. To
check what a deployment actually serves:

```bash
bun x tsx scripts/torii-conformance.ts              # mainnet
bun x tsx scripts/torii-conformance.ts <toriiUrl>   # any deployment
```

Details, query-semantics gotchas, and the current deployment state live in
`CLAUDE.md` and `frontend/CLAUDE.md`.

## Known current mismatches

- T2 crafting calls `AbilityToken.burn`, so the live AbilityToken `burner` must
  be set to `crafting_1v1`. If T2 crafting reverts with `Not burner`, rerun
  `scripts/setup-ability-token.sh`.
- `frontend/src/bindings/typescript/*.gen.ts` are generated and still contain
  removed 2v2 types until the next codegen; don't hand-edit them.

## Documentation

- `CLAUDE.md` (symlinked as `AGENTS.md`): working context for coding agents —
  the most current prose in the repo.
- `frontend/README.md` and `frontend/CLAUDE.md`: frontend architecture, routes,
  network switching, read patterns.
- `mcp-server-2/README.md`: MCP setup, session approval, tool list.
- `site/docs/pages/`: player-facing docs site.
- `docs/superpowers/`: dated historical specs and plans. Useful for intent;
  never override current code with them.

## License

MIT
