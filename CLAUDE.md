# Siege — Agent Context

This file gives coding agents current working context for this repository. The source of truth is the code, manifests, and config in this checkout.

It is checked in as `CLAUDE.md`, with `AGENTS.md` as a symlink to it — edit either path, there is only one file.

## Current Product Shape

Siege is a Starknet / Dojo strategy game in the `siege_dojo` namespace.

Active systems:

- 1v1 commit-reveal battles: `actions_1v1`, `commit_reveal_1v1`, `resolution_1v1`, `matchmaking`.
- Ability crafting and tokens: `crafting_1v1`, `AbilityToken`, `ResourceToken`.
- The Marches world metagame: `world_system`, `conquest`.
- Frontend: Next app under `frontend/`.
- Active MCP server: `mcp-server-2/`.

The legacy 2v2 system (`actions`, `commit_reveal`, `resolution`) was removed from the source tree — it was never used. The deployed Sepolia v9 world still has those contracts registered from earlier migrations; ignore them.

`mcp-server/` is older and not the main MCP implementation.

## Terminology

Backend names stay unchanged. UI copy uses player-facing names:

| Backend                  | Player-facing label       |
| ------------------------ | ------------------------- |
| `World`, `/world`        | The Marches               |
| `PlayerKingdom`, kingdom | Hold                      |
| `register_player`        | Claim/establish your Hold |

Do not rename Cairo models or entrypoints to match UI copy.

## Known Current Mismatches

- T2 crafting calls `AbilityToken.burn`, so the live AbilityToken `burner` must be set to `crafting_1v1`. If T2 crafting reverts with `Not burner`, rerun `scripts/setup-ability-token.sh`.
- `frontend/src/bindings/typescript/*.gen.ts` are generated and still contain removed 2v2 types until the next codegen; don't hand-edit them.

## Toolchain

Versions live in `Scarb.toml`, `frontend/package.json`, and `mcp-server-2/package.json`.

Always run sozo through the Docker builder — the locally installed sozo is older than the project toolchain:

```bash
docker compose run --rm builder sozo build
docker compose run --rm builder sozo test
```

## Core Battle Rules

1v1 state lives in `MatchState1v1`. Vault HP starts at 50. Matches end when a vault hits 0 or after round 10. `create_match_1v1` requires the caller to have a registered Hold (spam guard); staked matches go through `world_system.create_staked_match`, which guards separately.

Each round:

1. Both players commit a Poseidon hash.
2. Both players reveal the exact allocation.
3. `resolution_1v1.resolve_round` applies modifiers, abilities, repair, damage, node contests, traps, resource mints, and next-round modifiers.

Commit and reveal deadlines are 300 seconds each (`commit_reveal_1v1.cairo`).

Reveal hash order:

```text
salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2, ability_id, ability_target
```

Budget is `10 + owned_resource_nodes + max(0, round - 6)` (endgame escalation, rounds 7-10). Trap cost is 2 each. Repair costs 2 budget per HP and is uncapped during resolution.

Matchmaking (paid + staked): `matchmaking.queue_for_match(token, abilities)`
requires a 1-3 ability wager (tier-capped; ownership + matchmaking
ERC-1155 operator approval checked at queue time) and runs three
single-slot sub-queues keyed by wager size — players only pair with the
same count, so stakes never trim. Entries have a fixed 600 s validity
window, NO heartbeat (every poke is a sponsored tx); clients poll Torii
and re-queue after expiry. Pairing (`create_match_1v1_delegated`, waiting
player = player_a) escrows the entry buy-ins at matchmaking (`MatchPot`)
and both ability wagers at world_system, writing `MatchStakes1v1` +
`MatchAbilities1v1` — queue matches are full staked matches (settle_match,
parcel release, reputation). Entry buy-ins come from the owner-managed
`EntryToken` allowlist (STRK/ETH/LORDS mainnet; reprice via
`scripts/init-entry-config.sh`); permissionless `claim_winnings(match_id)`
pays the winner `winner_bps` (6500) of each side's buy-in per-token,
treasury the rest, draws refund in full. Clients always send the
`[vrf request_random, queue_for_match]` multicall (contract consumes
unconditionally); `leave_queue`/`claim_winnings` are bare; ERC-20 and
ERC-1155 approvals are separate receipt-awaited txs (VRF wrap forbids
calls between request_random and the game call). Free practice matches
are removed from UI and paymaster (create_match_1v1 on-chain but
unsponsored). Session-policy approve caps are deliberately small
(~20 games) because the consent screen displays them.

Node contests resolve before gate damage: owning node `i` grants +1 defense at gate `i` the same round it is captured or held, plus +1 budget next round.

Stone Cloak T1 halves gate damage; T2 halves gate damage and negates the opponent's repair that round (full gate immunity was removed in the balance pass).

Gate modifier codes:

- `0`: Normal.
- `1`: Narrow Pass, cap attack and defense at 3.
- `2`: Mirror, swap attack and defense at that gate.
- `3`: Deadlock, no damage.
- `4`: Reflection, split overflow to other non-deadlock gates and reduce by unused defense.

Abilities are token IDs 1-10. Use:

```text
ability_type(id) = ((id - 1) % 5) + 1
ability_tier(id) = ((id - 1) / 5) + 1
```

Ability IDs:

- 1/6 Siege Sword.
- 2/7 Stone Cloak.
- 3/8 Ember Blast.
- 4/9 Hex.
- 5/10 Fortify.

### Stale-match recovery

`force_timeout` is participant-only and drives a stalled match to Finished
in stages, each gated on a 300 s deadline: it fills a missing commit and
arms the reveal deadline, then forces reveals and resolves, then (round
with zero commits) arms and trips the zero-commit abandon path, ending the
match as a draw with equalized vaults. `settle_match` then refunds ability
stakes and `claim_winnings` refunds the entry pot. If BOTH players abandon,
nobody can finish the match and escrow is stranded — there is no
permissionless timeout.

## The Marches

The Marches is an offset hex grid (`col`/`row` per parcel, `utils/hex.cairo` distance metric). There is no fold mechanic, no zones, and no sectors — older docs describing a tile graph with folds are obsolete.

Grid size is per-world and can be grown after deploy with `expand_world`, so read `WorldConfig.total_parcels` rather than assuming:

| World | Grid | Parcels |
| ----- | ---- | ------- |
| **mainnet (live)** | 12 cols x 8 rows | **96** (expanded 2026-07-18; deployed at 32) |
| sepolia v9 | 8 cols x 4 rows | 32 (`scripts/init-hex-world.sh`) |

Important models:

- `Parcel`: `parcel_id`, `col`, `row`, `parcel_type` (0=Forge, 1=Quarry, 2=Grove; 255=untyped at init), `owner`, `is_home`.
- `WorldConfig`: `total_parcels`, `next_parcel_id`, `initialized`.
- `PlayerKingdom`: three home ids, `parcel_count`, `registered`, `free_craft_used`, `last_drip_time`, `tier`, `total_wins`, `faction_reinforcement_enabled`.

Registration claims three home parcels: the first maximizes distance to already-claimed parcels, the other two cluster near it. The caller selects home parcel types, not positions. Registration mints starter abilities.

`claim_drip` mints for the player's three homes once per hour (`DRIP_INTERVAL = 3600`), skipping actively pillaged homes. There is no zone multiplier.

`settle_match` handles ability transfer/refund, win stats, reputation, match records, loser's non-home release, and pillage eligibility in a single map scan — it does not mint resources (removed to keep the tx sponsorable; players use `claim_drip`).

`claim_parcel` claims one unclaimed adjacent parcel after a settled staked-match win and assigns its parcel type.

Conquest attacks adjacent non-home parcels in one transaction. Attacker budget is 10, defender preset budget is 12, attacker HP is 10, defender HP is 15, and ties go to the defender. Ally reinforcement slots are deduplicated per ally player — an ally with several parcels adjacent to the target fills only one of the 3 slots. Pillage window is 24 hours (`PILLAGE_WINDOW = 86400`). Defenders with no presets (and no ally reinforcement) defend with the fixed default 2/2/2 assault + 2/2/2 gate defense, so every Hold is always attackable.

## Tiers

Tier thresholds, ability slots, preset counts, and upgrade costs live in the
tier functions in `world_system.cairo`, mirrored in `frontend/src/lib/tiers.ts`.

`MatchStakes1v1` stores at most 3 stake slots per player, so tier 3 caps at 3
ability slots everywhere (Cairo, frontend, MCP) even though it grants a 4th
defense preset.

## Mainnet (active)

Production network. Siege is deployed to Starknet mainnet and the Vercel
frontend points here. Same world seed as sepolia (`siege_dojo_v9`) so the world
address matches, but system/token addresses differ — **always read contract and
token addresses from `manifest_mainnet.json`**, never from a copy in docs.

- Seed: `siege_dojo_v9`
- World: `0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73` (deployed at block `11948230`)
- Profile: `sozo -P mainnet` via the Docker builder; config in `dojo_mainnet.toml`.
- RPC (sozo): a Lava `v0_9` endpoint set in `dojo_mainnet.toml` — Cartridge's mainnet RPC serves spec `0.10.2`, which sozo v1.8 cannot consume.
- Cartridge VRF provider: `0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f` (same address as sepolia; verified live).

Torii: `https://siege-torii-mainnet-production.up.railway.app` (Railway service
`siege-torii-mainnet` in project `siege-katana`, source `infra/torii-mainnet/`,
image `ghcr.io/dojoengine/torii:v1.8.16` — torii ships its own image now; the
`dojo:v1.8.X` bundle stopped at torii 1.8.3). Its RPC is the Alchemy public
demo `v0_9` endpoint: torii <= 1.8.15 hard-refused Cartridge's spec 0.10.2, and
1.8.16 merely downgrades that to a warning while still implementing only 0.9
semantics, so Cartridge RPC is testable but unvalidated — swap to a dedicated
Alchemy key if indexing lags. Redeploy: `railway up ./infra/torii-mainnet
--path-as-root --service siege-torii-mainnet`.
Torii dropping events is a real failure mode (it has stranded matches mid-resolve);
a restart does NOT backfill — reindex by pointing `--db-dir` at a fresh path.

Deploy runbook: see the `deploy-mainnet` skill.

## Self-hosted Katana (dev environment + Practice tier)

Fee-less appchain, used for integration testing and as the player-facing
**Practice** tier. RPC `https://siege-katana-production.up.railway.app`, chain id
short-string `SIEGE` (`0x5349454745`), Torii
`https://siege-torii-katana-production.up.railway.app`. Same world address as
mainnet (same seed); system addresses differ — read `manifest_katana.json`.

Entry buy-ins are the six ResourceTokens at 1 whole unit (0 decimals), so a
player funds themselves via `claim_drip` rather than an operator top-up;
`scripts/fund-katana-tester.ts` mints directly when the hourly drip is too slow.

Re-provision with `bun x tsx scripts/init-katana-world.ts` — idempotent, safe to
re-run after every migrate. Setup, the mandatory Cartridge-VRF wiring, and the
dev-account gotchas: see the `dev-katana` skill.

## Networks and the switcher

Each network is its own Vercel project off the same branch, differing only in
env: `www.siegedojo.world` (mainnet) and `siege-dev.vercel.app` (katana). Both
ship the switcher — the hostname only sets the default. Resolution and the rules
that keep it safe live in `frontend/src/lib/network.ts`; read that file before
touching anything network-dependent. Two invariants:

- Commit salts are namespaced per network (`crypto.ts`). Every network shares one
  world address and match ids are sequential, so ids collide 1:1 across chains.
- Nothing merges state across networks. No leaderboard, win count, or achievement
  view may read more than one Torii — that separation is what stops the free
  Practice tier cannibalising mainnet.

Endpoints must come from `lib/network`, never `process.env` directly, or they
keep pointing at the build's own network after a switch.

## Sepolia (parked — sponsorship outage)

Parked since Cartridge's sepolia AVNU sponsorship broke 2026-07-14 (session
approvals fail with "Transaction failed"). Same world address and seed as
mainnet; read `manifest_sepolia.json` for addresses. Runbook: see the
`deploy-sepolia` skill.

Never pass `slot: "siege-dojo"` to ControllerConnector — its torii was deleted
and the dead endpoint breaks keychain session approval.

## Frontend Notes

See `frontend/CLAUDE.md`.

## MCP Notes

Use `mcp-server-2/`; see `mcp-server-2/CLAUDE.md`.

## Tests

Contract tests must go through the Docker builder:

```bash
docker compose run --rm builder sozo test
```

Frontend (`frontend/`), docs site (`site/`): standard `bun run lint` / `test` /
`build`; see each package's `package.json`.

## Version audit

`scripts/check-versions.ts` compares every pinned version in the repo against
upstream: the four npm manifests (`frontend/`, `mcp-server-2/`, `site/`,
`scripts/` — `mcp-server/` is excluded as superseded), the Cairo toolchain in
`Scarb.toml`, the scarb/sozo binaries curled in `Dockerfile.build`, and the
container images and embedded binaries in `infra/*/Dockerfile`. It also reports
cross-manifest drift, where the same package is on different versions in
different packages.

```bash
bun x tsx scripts/check-versions.ts              # console
bun x tsx scripts/check-versions.ts --markdown   # issue body
bun x tsx scripts/check-versions.ts --json       # machine-readable
bun x tsx scripts/check-versions.ts --strict     # exit 1 if anything is behind
```

Read-only and non-blocking by design. It reports bump **size**, not blast
radius — semver understates risk here (torii 1.8.3 -> 1.8.4 was a "patch" that
changed KeysClause from vacuous-match to actually filtering). Adding a new
pinned version anywhere means adding it to the `PINNED` array; each entry reads
its value out of the real file by regex, so the report cannot drift from what
is deployed.

`.github/workflows/version-check.yml` runs weekly in two stages:

1. The script rewrites one sticky issue (label `toolchain-versions`) in place.
2. A gated agent assesses blast radius — it reads the release notes and greps
   this repo for the surface that changed, returning
   `no-op` / `mechanical` / `needs-migration` per item with `file:line`
   evidence, posted as an issue comment.

The gate is what keeps stage 2 cheap: it fires only for majors and infra pins
whose upstream version moved since the last report. The baseline lives in a
`<!-- version-baseline:{…} -->` comment at the end of the issue body, so no
commit and no `contents: write` are needed. Force a re-run of the analysis via
workflow_dispatch with `force_analysis`.

Stage 2 pins its model (`--model claude-opus-5` in `claude_args`) so verdict
quality cannot drift with the CLI default. Tokens bill against the Claude
subscription behind `CLAUDE_CODE_OAUTH_TOKEN`, not API credits. Both workflows
run on GitHub-hosted `ubuntu-latest`; the repo is public, so runner minutes are
free and every report, comment, and log is world-readable.

Neither workflow opens bump PRs: the infra pins carry runbooks a bot would skip
— a torii bump can need a reindex against a fresh `--db-dir`, a katana bump
wipes dev-chain state, and the katana version is the binary *inside*
`ghcr.io/dojoengine/dojo`, which the image tag does not name.

For the Cairo toolchain, changelogs are sparse and breakage surfaces as compile
errors, so the real check is a build.
`.github/workflows/cairo-canary.yml` (workflow_dispatch) rebuilds
`Dockerfile.build` at candidate scarb/sozo versions, patches candidate
cairo/dojo/openzeppelin versions into `Scarb.toml`, and runs `sozo build` +
`sozo test` against them, committing nothing. Blank inputs keep the current
pin, so components can be moved one at a time to isolate a break. Results are
posted to the same sticky issue.

`Dockerfile.build` takes `SCARB_VERSION` / `SOZO_VERSION` build args for this;
their defaults are the repo's real pins, so `docker compose run --rm builder`
still reproduces the shipped toolchain with no arguments.

## Torii gRPC

Torii serves SQL and gRPC-web on the **same** base URL — there is no `/grpc`
path and no separate port. `TORII_URL` feeds both:

| Transport | Path |
| --------- | ---- |
| SQL reads | `{TORII_URL}/sql?query=…` |
| gRPC-web  | `{TORII_URL}/world.World/<Method>` |

Native gRPC is not reachable at all: torii's `--grpc.addr` defaults to
`127.0.0.1` and `--grpc.port` to `50051`, neither of which the Dockerfiles set
or expose — only the HTTP port 8080 is published, and that is what serves
gRPC-web. So `grpcurl` and server reflection cannot work against these
deployments regardless of the edge proxy. To see what a deployment serves:

```bash
bun x tsx scripts/torii-conformance.ts                        # mainnet
bun x tsx scripts/torii-conformance.ts <toriiUrl>             # any deployment
bun x tsx scripts/torii-conformance.ts <url> --proto ./world.proto   # offline
```

It reads the RPC list from `world.proto` in `dojoengine/torii`, probes each
method with an empty gRPC-web frame, and classifies by response header:
`grpc-status: 12` = not served, any other status = served (validated and
rejected), no status header = served (status deferred to trailers). Exits 2 if
the endpoint is unreachable, 0 otherwise.

As of torii 1.8.16 (deployed 2026-07-26 on both networks), mainnet and katana
serve all 38/38 declared methods — `Search` was `UNIMPLEMENTED` on 1.8.3 and
is served since the FTS5 work in 1.8.7/1.8.8. Two methods worth knowing about
that no client here calls: `ExecuteSql` (SQL over gRPC, an alternative to the
HTTP endpoint) and `Worlds` (enumerate indexed worlds — Torii is multi-world
since 1.8, hence `world_addresses` in `Query`).

The 1.8.3 → 1.8.16 upgrade also changed query semantics the frontend depends
on: the gRPC KeysClause was vacuous (matched everything) through 1.8.3 and
filters correctly from 1.8.4 — details and the resulting rules live in
`frontend/CLAUDE.md` under "Reads". `[sql] historical` is active on both
deployments; katana was reindexed from genesis on upgrade (old 1.8.3 database
parked at the volume root, `--db-dir` now `/data/torii-v1816`), mainnet was
migrated in place so its historical rows start at the upgrade.

Note that the published Torii gRPC docs are behind the 1.8.2 client: they show
flat `limit`/`offset`, `entity_models`, and `dont_include_hashed_keys`, whereas
the installed types declare `pagination` (cursor-based), `models`,
`no_hashed_keys`, `world_addresses`, and `historical`. Trust
`@dojoengine/torii-wasm`'s `dojo_wasm.d.ts` over the docs.

## Historical Docs

`docs/superpowers/specs` and `docs/superpowers/plans` are dated records. They are useful for intent but should not override current Cairo, TypeScript, manifests, or config.
