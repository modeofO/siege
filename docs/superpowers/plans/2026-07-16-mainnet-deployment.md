# Siege Mainnet Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the full Siege stack (Dojo world, tokens, torii, frontend, MCP) to Starknet mainnet, playable from a Vercel URL with gasless Cartridge sessions.

**Architecture:** Same world seed (`siege_dojo_v9`) as sepolia/katana → same world address. New `mainnet` profile/branches added beside existing `sepolia`/`katana` ones in every layer (dojo profile, torii infra, frontend network switch, MCP env). Real Cartridge VRF + paymaster replace the katana dev shims.

**Tech Stack:** Cairo 2.13.1 / Dojo v1.8.0 (Docker builder), starkli, starknet.js 8.x, Railway (torii), Vercel (Next 16 + bun), Cartridge Controller/paymaster/VRF.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-mainnet-deployment-design.md`
- World seed MUST stay `siege_dojo_v9`; namespace `siege_dojo`.
- All sozo commands run through the Docker builder (`docker compose run --rm builder …`) — local sozo is too old.
- Mainnet RPC: `https://api.cartridge.gg/x/starknet/mainnet` (Starkli: append `/rpc/v0_8`).
- Deployer credentials NEVER committed. Same `deploy.env` pattern as sepolia (memory: sepolia-deploy-credentials).
- Commits: author `ModeofO <modeofO@users.noreply.github.com>`, trailer `Co-authored-by: Claude <noreply@anthropic.com>`.
- HARD GATE: Task 1 must confirm mainnet paymaster works before Tasks 3–9 run. If dead → STOP, report to user, revisit gas model.
- Katana + sepolia configs/services stay untouched.
- Frontend uses bun; mcp-server-2 uses pnpm.
- Runtime money guard: every fee-paying script step prints estimated fee or balance before submitting.

---

### Task 1: Verify mainnet blockers (paymaster + VRF) — read-only, spends nothing

**Files:**
- No repo changes. Findings recorded in the task report.

**Interfaces:**
- Produces: GO/NO-GO decision; `VRF_MAINNET_ADDRESS` (expected `0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f`, must be verified).

- [ ] **Step 1: Read the paymaster outage memory for the probe pattern**

Read `/Users/modeofo/.claude/projects/-Users-modeofo-Apps-siege/memory/cartridge-sepolia-paymaster-outage.md`. It contains the curl probe used to diagnose the sepolia outage. Reuse it with `sepolia` → `mainnet` in the URL.

- [ ] **Step 2: Probe mainnet RPC + paymaster backend**

```bash
# RPC alive?
curl -s https://api.cartridge.gg/x/starknet/mainnet -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_chainId","params":[]}'
# Expected: {"jsonrpc":"2.0","id":1,"result":"0x534e5f4d41494e"}  (SN_MAIN)
```

Then run the memory file's paymaster probe against mainnet. Expected: HTTP 200 / JSON (NOT the 404 the sepolia probe returns). Cross-check with Cartridge docs via context7 (`slot-paymaster` skill / paymaster docs) that mainnet sponsorship is fee-token-funded and does not depend on discontinued slot deployments.

- [ ] **Step 3: Verify Cartridge VRF exists on mainnet**

```bash
curl -s https://api.cartridge.gg/x/starknet/mainnet -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_getClassHashAt","params":["latest","0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f"]}'
# Expected: {"result":"0x..."} — any class hash means deployed.
# {"error":{"code":20,...}} = CONTRACT_NOT_FOUND → find the real mainnet VRF
# address in Cartridge vRNG docs (slot-vrng skill) and re-verify.
```

- [ ] **Step 4: Report GO/NO-GO**

If the paymaster probe fails or docs show mainnet sponsorship unavailable: STOP the plan and report to the user (spec Phase 0 gate). Otherwise record the verified VRF address for Tasks 4/5/7/8.

---

### Task 2: Dependency hardening

**Files:**
- Modify: `frontend/package.json`, `frontend/bun.lock`
- Modify: `mcp-server-2/package.json`, `mcp-server-2/pnpm-lock.yaml`

**Interfaces:**
- Produces: green builds/tests on updated deps; protobufjs critical advisory gone.

- [ ] **Step 1: Update frontend deps (compatible ranges only)**

```bash
cd /Users/modeofo/Apps/siege/frontend && bun update
```

- [ ] **Step 2: Re-audit and verify the critical is gone**

```bash
bun audit 2>&1 | tail -3
# Expected: no "critical" in the count line. High-count should drop.
# protobufjs pin comes via @dojoengine/grpc; if it is still <=7.5.5 after
# update, add to frontend/package.json:
#   "overrides": { "protobufjs": "^7.5.6" }
# then bun install and re-audit.
```

- [ ] **Step 3: Frontend gates**

```bash
bun run lint && bun run test && bun run build
# Expected: all pass. If a dep bump breaks the build, pin the offender back
# and note it in the commit message rather than force-fixing unrelated code.
```

- [ ] **Step 4: Update MCP deps + gates**

```bash
cd /Users/modeofo/Apps/siege/mcp-server-2 && pnpm update && pnpm audit 2>&1 | tail -3
pnpm run build && pnpm run test
# Expected: build + tests pass; audit shows no high+ in runtime deps.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/modeofo/Apps/siege && git add frontend/package.json frontend/bun.lock mcp-server-2/package.json mcp-server-2/pnpm-lock.yaml
git commit -m "chore: bump deps to clear protobufjs critical + transitive advisories

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 3: Mainnet deployer account

**Files:**
- Create: `~/.siege-mainnet/deployer.key.json` (keystore, outside repo)
- Create: `~/.siege-mainnet/deployer.acct.json` (account descriptor, outside repo)
- Create: `/Users/modeofo/Apps/siege/deploy.mainnet.env` (git-ignored — verify `.gitignore` covers it; if not, add `deploy*.env` line)

**Interfaces:**
- Produces: funded, deployed account; `deploy.mainnet.env` exporting `DOJO_ACCOUNT_ADDRESS` + `DOJO_PRIVATE_KEY` for sozo/init scripts.

- [ ] **Step 1: Generate keystore + OZ account descriptor**

```bash
mkdir -p ~/.siege-mainnet
starkli signer keystore new ~/.siege-mainnet/deployer.key.json
starkli account oz init ~/.siege-mainnet/deployer.acct.json \
  --keystore ~/.siege-mainnet/deployer.key.json
# Prints the counterfactual account address. Record it.
```

- [ ] **Step 2: USER ACTION — fund the address**

Ask the user to send **~$30 of STRK on mainnet** to the printed address (exchange withdrawal to Starknet, or bridge). Wait for confirmation. Verify:

```bash
starkli balance <ADDRESS> --rpc https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_8
# Expected: non-zero STRK
```

- [ ] **Step 3: Deploy the account contract**

```bash
starkli account deploy ~/.siege-mainnet/deployer.acct.json \
  --keystore ~/.siege-mainnet/deployer.key.json \
  --rpc https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_8
# Prints estimated fee and asks to proceed — confirm. Expected: DEPLOYED.
```

- [ ] **Step 4: Write deploy.mainnet.env**

```bash
starkli signer keystore inspect-private ~/.siege-mainnet/deployer.key.json
# (prompts for keystore password, prints raw private key — sozo needs the raw key)
cat > /Users/modeofo/Apps/siege/deploy.mainnet.env <<'EOF'
export DOJO_ACCOUNT_ADDRESS="0x<deployed account address>"
export DOJO_PRIVATE_KEY="0x<raw private key>"
EOF
grep -q "deploy" /Users/modeofo/Apps/siege/.gitignore || echo "deploy*.env" >> /Users/modeofo/Apps/siege/.gitignore
git -C /Users/modeofo/Apps/siege status --porcelain | grep deploy.mainnet.env && echo "LEAK — fix .gitignore" || echo "ignored ok"
```

No commit (nothing in-repo except possibly the `.gitignore` line — commit that alone if added).

---

### Task 4: Dojo mainnet profile, migrate, auth

**Files:**
- Create: `/Users/modeofo/Apps/siege/dojo_mainnet.toml`
- Create: `/Users/modeofo/Apps/siege/manifest_mainnet.json` (migrate output)
- Create: `/Users/modeofo/Apps/siege/frontend/src/manifests/manifest_mainnet.json` (copy)

**Interfaces:**
- Consumes: `deploy.mainnet.env` (Task 3), VRF address (Task 1).
- Produces: migrated world + 6 granted systems; `manifest_mainnet.json` with tags `siege_dojo-actions_1v1`, `siege_dojo-commit_reveal_1v1`, `siege_dojo-resolution_1v1`, `siege_dojo-crafting_1v1`, `siege_dojo-world_system`, `siege_dojo-conquest`.

- [ ] **Step 1: Write dojo_mainnet.toml**

```toml
[world]
name = "siege_dojo"
seed = "siege_dojo_v9"

[namespace]
default = "siege_dojo"

[env]
rpc_url = "https://api.cartridge.gg/x/starknet/mainnet"
account_address = "$DOJO_ACCOUNT_ADDRESS"
private_key = "$DOJO_PRIVATE_KEY"
world_address = "0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73"
```

(Same seed → same world address; keep the address pinned so a wrong-seed build fails loudly instead of deploying a second world.)

- [ ] **Step 2: Build**

```bash
cd /Users/modeofo/Apps/siege && docker compose run --rm builder sozo build -P mainnet
# Expected: compiles clean into target/mainnet.
```

- [ ] **Step 3: Migrate (spends real STRK — confirm balance first)**

```bash
source deploy.mainnet.env
starkli balance $DOJO_ACCOUNT_ADDRESS --rpc https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_8
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder sozo -P mainnet migrate
# Expected: declares + world deploy + contract registrations; prints world at
# 0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73.
# Record the block number of the world deploy tx — torii start block (Task 6).
```

Known risk from sepolia deploys (memory: sepolia-deploy-credentials): fee-bounds errors → re-run; sozo resumes idempotently.

- [ ] **Step 4: Writer auth grants**

```bash
docker compose run --rm -e DOJO_ACCOUNT_ADDRESS -e DOJO_PRIVATE_KEY builder \
  sozo -P mainnet auth grant writer \
  siege_dojo,siege_dojo-actions_1v1 \
  siege_dojo,siege_dojo-commit_reveal_1v1 \
  siege_dojo,siege_dojo-resolution_1v1 \
  siege_dojo,siege_dojo-crafting_1v1 \
  siege_dojo,siege_dojo-world_system \
  siege_dojo,siege_dojo-conquest
# Expected: 6 grant txs confirmed.
```

- [ ] **Step 5: Verify on-chain + copy manifest**

```bash
# spot-check world_system registered (variant 0x2 = Contract):
sel=$(jq -r '.contracts[] | select(.tag=="siege_dojo-world_system") | .selector' manifest_mainnet.json)
curl -s https://api.cartridge.gg/x/starknet/mainnet -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"starknet_call\",\"params\":[{\"contract_address\":\"0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73\",\"entry_point_selector\":\"$(starkli selector resource)\",\"calldata\":[\"$sel\"]},\"latest\"]}"
# Expected: {"result":["0x2","0x<address>","0x<ns hash>"]}
cp manifest_mainnet.json frontend/src/manifests/manifest_mainnet.json
```

- [ ] **Step 6: Commit**

```bash
git add dojo_mainnet.toml manifest_mainnet.json frontend/src/manifests/manifest_mainnet.json
git commit -m "feat: mainnet profile + world migration (siege_dojo_v9)

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 5: Mainnet world bootstrap script + run

**Files:**
- Create: `/Users/modeofo/Apps/siege/scripts/init-mainnet-world.ts`

**Interfaces:**
- Consumes: `manifest_mainnet.json`, `target/mainnet` artifacts, `deploy.mainnet.env`, VRF address (Task 1).
- Produces: deployed AbilityToken + 6 resource ERC-20s, initialized 8x4 grid, wired operators/minters/ResourceConfig. Prints JSON address block consumed by Tasks 6/7/8.

- [ ] **Step 1: Write scripts/init-mainnet-world.ts**

Port of `scripts/init-katana-world.ts` with these exact differences (rest of the file identical — copy it and apply):

```ts
// header comment: mainnet variant — real fees, real Cartridge VRF.
const RPC = process.env.MAINNET_RPC_URL ?? "https://api.cartridge.gg/x/starknet/mainnet";
const MANIFEST_PATH = process.env.MANIFEST_PATH ?? "manifest_mainnet.json";
const TARGET_DIR = process.env.TARGET_DIR ?? "target/mainnet";

// NO dev-key fallbacks — hard-require env:
const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS!;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY!;
if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) throw new Error("source deploy.mainnet.env first");

// Cartridge VRF — verified in Task 1. NO DevVrfProvider declare/deploy on mainnet.
const VRF_PROVIDER = process.env.VRF_PROVIDER_ADDRESS ?? "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";
```

- Delete the `DevVrfProvider` declare + deploy block; use `VRF_PROVIDER` in the `set_vrf_provider` call.
- Salt label prefix `siege-mainnet:` instead of `siege-katana:`.
- Keep `deployer: legacyDeployer` — the classic UDC (`0x041a78…02bf`) is live on mainnet; the v8-default deployer address is not guaranteed there.
- Before the first declare, print the deployer STRK balance and `console.log("MAINNET — real fees from here")`.

- [ ] **Step 2: Typecheck the script**

```bash
cd /Users/modeofo/Apps/siege && bun x tsx --eval "import('./scripts/init-mainnet-world.ts').catch(e => { console.error(e.message); process.exit(String(e.message).includes('deploy.mainnet.env') ? 0 : 1); })"
# Expected: exits 0 with the "source deploy.mainnet.env first" error — proves
# the guard fires before any network call when env is missing.
```

- [ ] **Step 3: Run it (spends real STRK)**

```bash
source deploy.mainnet.env && bun x tsx scripts/init-mainnet-world.ts
# Expected: declares ResourceToken + AbilityToken, deploys 7 token contracts,
# initialize_world (8x4), operator wiring, minter/burner wiring, ResourceConfig
# wiring, then the JSON address block. SAVE THE BLOCK — Tasks 6/7/8 paste it.
```

- [ ] **Step 4: Verify world initialized**

```bash
curl -s "https://api.cartridge.gg/x/starknet/mainnet" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"starknet_call\",\"params\":[{\"contract_address\":\"$(jq -r '.contracts[] | select(.tag==\"siege_dojo-world_system\") | .address' manifest_mainnet.json)\",\"entry_point_selector\":\"$(starkli selector get_world_config)\",\"calldata\":[]},\"latest\"]}"
# Expected: total_parcels field = 0x20 (32). If world_system has no such view,
# skip — Task 6's torii will index WorldConfig; verify there instead.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/init-mainnet-world.ts
git commit -m "feat: mainnet world bootstrap script

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 6: Mainnet torii on Railway

**Files:**
- Create: `/Users/modeofo/Apps/siege/infra/torii-mainnet/Dockerfile`
- Create: `/Users/modeofo/Apps/siege/infra/torii-mainnet/torii_mainnet.toml`
- Create: `/Users/modeofo/Apps/siege/infra/torii-mainnet/railway.json` (copy of `infra/torii-katana/railway.json`)

**Interfaces:**
- Consumes: token addresses (Task 5 JSON block), world deploy block number (Task 4 Step 3).
- Produces: public torii URL (Railway domain) consumed by Tasks 7/8.

- [ ] **Step 1: Write torii_mainnet.toml**

Copy `infra/torii-katana/torii_katana.toml`, change:

```toml
rpc = "https://api.cartridge.gg/x/starknet/mainnet"
world_address = "0x031b19dadbea8c6f16b623de37f0085bb898a721f1ed0d52b3f2cdb1353dab73"
world_block = <world deploy block from Task 4>   # NOT 0 — mainnet history is huge

[indexing]
allowed_origins = ["*"]
index_pending = true
polling_interval = 1000
contracts = [
  "erc1155:<abilityToken from Task 5>",
  "erc20:<IRON>", "erc20:<LINEN>", "erc20:<STONE>",
  "erc20:<WOOD>", "erc20:<EMBER>", "erc20:<SEEDS>",
]

[events]
historical = ["siege_dojo-ConquestResolved"]
```

- [ ] **Step 2: Write Dockerfile**

Copy `infra/torii-katana/Dockerfile`, change the COPY line and comment:

```dockerfile
FROM ghcr.io/dojoengine/dojo:v1.8.0
COPY torii_mainnet.toml /torii.toml
EXPOSE 8080
ENTRYPOINT ["/opt/asdf/installs/torii/1.8.3/bin/torii", \
  "--config", "/torii.toml", \
  "--db-dir", "/data", \
  "--http.addr", "0.0.0.0", \
  "--http.cors_origins", "*"]
```

- [ ] **Step 3: Create Railway service + volume + deploy**

```bash
cd /Users/modeofo/Apps/siege
railway add --service siege-torii-mainnet
railway volume add --service siege-torii-mainnet --mount-path /data
railway up ./infra/torii-mainnet --path-as-root --service siege-torii-mainnet --detach
railway domain --service siege-torii-mainnet
# Expected: prints https://siege-torii-mainnet-production.up.railway.app (or similar).
```

- [ ] **Step 4: Verify indexing**

```bash
curl -s "https://<torii-domain>/sql?query=SELECT%20*%20FROM%20%22siege_dojo-WorldConfig%22"
# Expected (may take a minute to sync): one row, total_parcels=32, initialized=1.
```

- [ ] **Step 5: Commit**

```bash
git add infra/torii-mainnet/
git commit -m "feat: mainnet torii service (Railway)

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 7: Frontend mainnet mode

**Files:**
- Modify: `frontend/src/lib/contractAddresses.ts` (manifest pick + VRF already correct for non-katana)
- Modify: `frontend/src/app/providers.tsx:14-25,110-123,144-156`
- Modify: `frontend/src/lib/useResourceBalances.ts:9-30`
- Grep-and-update: any other `NEXT_PUBLIC_NETWORK === "katana"` / torii URL switches (`grep -rn 'IS_KATANA\|NEXT_PUBLIC_NETWORK\|NEXT_PUBLIC_TORII' frontend/src/`)

**Interfaces:**
- Consumes: `frontend/src/manifests/manifest_mainnet.json` (Task 4), resource addresses (Task 5), torii URL (Task 6).
- Produces: `NEXT_PUBLIC_NETWORK=mainnet` fully working; existing `devnet`/`katana`/`sepolia` behavior unchanged.

- [ ] **Step 1: contractAddresses.ts — add mainnet manifest branch**

```ts
import manifestMainnet from "../manifests/manifest_mainnet.json";
const IS_MAINNET = NETWORK === "mainnet";
const manifest = IS_DEVNET ? manifestDev : IS_KATANA ? manifestKatana : IS_MAINNET ? manifestMainnet : manifestSepolia;
```

`VRF_PROVIDER_ADDRESS` needs no change — the non-katana branch is already the Cartridge VRF address (confirm it matches Task 1's verified mainnet address; if Cartridge uses a different mainnet address, make the constant network-keyed).

- [ ] **Step 2: providers.tsx — mainnet chain + RPC**

```ts
import { sepolia, mainnet } from "@starknet-react/chains";
const IS_MAINNET = NETWORK === "mainnet";
const CONTROLLER_RPC_URL = IS_KATANA
  ? process.env.NEXT_PUBLIC_RPC_URL || "https://siege-katana-production.up.railway.app"
  : IS_MAINNET
    ? "https://api.cartridge.gg/x/starknet/mainnet"
    : "https://api.cartridge.gg/x/starknet/sepolia";
// defaultChainId in the connector:
//   IS_KATANA ? "0x5349454745" : "0x" + (IS_MAINNET ? mainnet : sepolia).id.toString(16)
// controllerChain: IS_KATANA ? siegeKatanaChain : IS_MAINNET ? mainnet : sepolia
```

Keep `feeSource: FeeSource.PAYMASTER` (Task 1 verified) and keep NO `slot` param.

- [ ] **Step 3: useResourceBalances.ts — mainnet token set**

```ts
const MAINNET_RESOURCE_TOKENS = {
  iron: "<from Task 5>", linen: "<from Task 5>", stone: "<from Task 5>",
  wood: "<from Task 5>", ember: "<from Task 5>", seeds: "<from Task 5>",
} as const;
const NET = process.env.NEXT_PUBLIC_NETWORK || "devnet";
export const RESOURCE_TOKENS =
  NET === "katana" ? KATANA_RESOURCE_TOKENS
  : NET === "mainnet" ? MAINNET_RESOURCE_TOKENS
  : SEPOLIA_RESOURCE_TOKENS;
```

- [ ] **Step 4: Sweep remaining network switches**

`grep -rn 'IS_KATANA\|NEXT_PUBLIC_NETWORK\|NEXT_PUBLIC_TORII\|toriiUrl' frontend/src/ | grep -v manifests` — every site that branches katana-vs-sepolia gets a mainnet branch (torii URL default → Task 6 domain). AbilityToken address module (`frontend/src/lib/abilityToken.ts`) gets the Task 5 address for mainnet.

- [ ] **Step 5: Gates (mainnet build)**

```bash
cd /Users/modeofo/Apps/siege/frontend
bun run lint && bun run test
NEXT_PUBLIC_NETWORK=mainnet bun run build
# Expected: all pass; build must not crash on prerender (ControllerConnector is
# browser-only constructed — mainnet path must keep the typeof window guard).
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: frontend mainnet network mode

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

### Task 8: MCP server mainnet env

**Files:**
- Create: `/Users/modeofo/Apps/siege/mcp-server-2/.env.mainnet` (template committed; real `.env` swap is a user action)

**Interfaces:**
- Consumes: `manifest_mainnet.json`, token addresses (Task 5), torii URL (Task 6), VRF address (Task 1).
- Produces: ready-to-swap env file; Cartridge session flow (NO raw agent key) on SN_MAIN.

- [ ] **Step 1: Write .env.mainnet**

```bash
# Mainnet — Cartridge headless session signing (agent acts AS the user's
# controller; AGENT_ACCOUNT_ADDRESS/AGENT_PRIVATE_KEY must stay unset).
TORII_URL=https://<torii domain from Task 6>
RPC_URL=https://api.cartridge.gg/x/starknet/mainnet
CHAIN_ID=SN_MAIN
MANIFEST_PATH=../manifest_mainnet.json
SESSION_DIR=.cartridge-mainnet
POLL_INTERVAL_MS=5000
VRF_PROVIDER_ADDRESS=<verified in Task 1>
ABILITY_TOKEN_ADDRESS=<from Task 5>
IRON_TOKEN_ADDRESS=<from Task 5>
LINEN_TOKEN_ADDRESS=<from Task 5>
STONE_TOKEN_ADDRESS=<from Task 5>
WOOD_TOKEN_ADDRESS=<from Task 5>
EMBER_TOKEN_ADDRESS=<from Task 5>
SEEDS_TOKEN_ADDRESS=<from Task 5>
```

(Check `mcp-server-2/src` for the exact env names of ember/seeds — `.env` shown in repo truncates; mirror whatever `session.ts`/config reads.)

- [ ] **Step 2: Build + tests**

```bash
cd /Users/modeofo/Apps/siege/mcp-server-2 && pnpm run build && pnpm run test
# Expected: pass (env file is inert until copied to .env).
```

- [ ] **Step 3: Commit**

```bash
git add mcp-server-2/.env.mainnet
git commit -m "feat: MCP mainnet env template (Cartridge session signing)

Co-authored-by: Claude <noreply@anthropic.com>"
```

Session auth reminder for the user (from CLAUDE.md): first write tool returns `not_ready` with an auth URL — `open` the FULL URL, never copy wrapped terminal text; 5-minute window from server launch.

---

### Task 9: Vercel deploy + end-to-end verification + docs

**Files:**
- Modify: `/Users/modeofo/Apps/siege/CLAUDE.md` (mainnet section: addresses, torii URL, deploy sequence)

**Interfaces:**
- Consumes: everything above.
- Produces: playable public URL; CLAUDE.md source of truth updated.

- [ ] **Step 1: USER ACTION — create Vercel project**

Hand the user this exact checklist:
- Import the GitHub repo in Vercel; **Root Directory: `frontend`**.
- Framework preset: Next.js (auto). No `vercel.json` needed. Bun auto-detected from `bun.lock`.
- Environment variables: `NEXT_PUBLIC_NETWORK=mainnet`, plus `NEXT_PUBLIC_TORII_URL=<Task 6 domain>` if the grep in Task 7 Step 4 showed the torii URL is env-sourced.
- Deploy.

- [ ] **Step 2: Verify deployed site**

```bash
curl -s -o /dev/null -w "%{http_code}" https://<vercel-domain>/
# Expected: 200
```

Then user (or headless browser) checks: The Marches grid renders 32 parcels from mainnet torii; Controller connect works; session approval sponsored (paymaster — no fee prompt).

- [ ] **Step 3: On-chain smoke test (user-driven, real world state)**

User connects controller on the Vercel site, runs `register_player` (Claim your Hold). Expected: sponsored tx confirms, Hold appears, `claim_drip` mints after the hour interval. If sponsorship fails at approval with "Transaction failed" — that is the sepolia-outage signature; capture the keychain network log and stop.

- [ ] **Step 4: Update CLAUDE.md + commit**

Add a `## Mainnet (active)` section mirroring the sepolia one: world address, 6 system addresses from `manifest_mainnet.json`, AbilityToken + resource token addresses, VRF address, torii URL, deploy sequence (`-P mainnet` variants), `init-mainnet-world.ts` bootstrap note. Mark katana as dev, sepolia parked.

```bash
git add CLAUDE.md
git commit -m "docs: mainnet deployment addresses + runbook

Co-authored-by: Claude <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: Phase 0 → Task 1/2; Phase 1 → Task 3; Phase 2 → Tasks 4–5; Phase 3 → Task 6; Phase 4 → Tasks 7 + 9; Phase 5 → Task 8. Risks: paymaster gate (Task 1 Step 4), fee guards (Tasks 3–5), same-seed collision handled by pinned world_address in dojo_mainnet.toml.
- `<from Task 5>` / `<torii domain>` values are runtime outputs of earlier tasks, not design placeholders — each references the exact producing step.
- Type consistency: token env names flagged for verification against `mcp-server-2/src` (Task 8 Step 1) since `.env` display was truncated.
