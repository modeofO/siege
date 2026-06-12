/**
 * Siege tool registration.
 *
 * Uses the high-level {@link McpServer.registerTool} API: each tool's
 * `inputSchema` is a raw Zod object shape, the SDK derives JSON Schema
 * and parses incoming args automatically.
 *
 * Every write tool signs and submits via `ctx.signer` and returns
 * `{ tx_hash, ... }`. Read tools work as soon as Torii is reachable.
 */

import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalizeObjectSchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { validateToolName } from "@modelcontextprotocol/sdk/shared/toolNameValidation.js";
import {
  CallToolResultSchema,
  ToolSchema,
  type CallToolResult,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  ShapeOutput,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { addAddressPadding, CallData, shortString, type Call, type WalletAccount } from "starknet";
import { z } from "zod";

import type { Config } from "./config.js";
import type { StateClient } from "./state.js";
import { buildMoveCommitHash1v1, generateSalt, revealCalldata } from "./hash.js";
import { moveAllocationFromInput, moveShape, roundBudget, validateMove, type MoveInput } from "./move.js";
import { call, extractTxError, vrfRequestRandom } from "./tx.js";
import { buildCreateStakedMatchCalls, buildJoinStakedMatchCalls } from "./stakedCalls.js";

const ROLE_A = 0;
const ROLE_B = 1;

export interface ToolContext {
  config: Config;
  state: StateClient;
  watchMatch: (matchId: number) => void;
  /** null until the Cartridge session is approved. Read tools work without it. */
  signer: WalletAccount | null;
  /** Address of the authenticated agent. Empty string until session is ready. */
  agentAddress: string;
}

export interface NotReadyState {
  authUrl: string | null;
  bootstrapPhase: string;
  bootstrapError: string | null;
}

interface RegisterArgs {
  server: McpServer;
  getCtx: () => ToolContext;
  getNotReady: () => NotReadyState | null;
}

// ── helpers ──────────────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return `0x${BigInt(addr).toString(16)}`;
}

function sameAddress(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}

function roleFor(state: { player_a: string; player_b: string }, address: string): number | null {
  if (sameAddress(state.player_a, address)) return ROLE_A;
  if (sameAddress(state.player_b, address)) return ROLE_B;
  return null;
}

function roleName(role: number): string {
  if (role === ROLE_A) return "Player A";
  if (role === ROLE_B) return "Player B";
  return `Unknown(${role})`;
}

function nodeOwnersForDefense(nodes: { node_index: number; owner: string }[]): NodeDefenseOwner[] {
  return [0, 1, 2].map((i) => {
    const owner = nodes.find((n) => n.node_index === i)?.owner;
    if (owner === "TeamA") return "a";
    if (owner === "TeamB") return "b";
    return null;
  });
}

function budgetFor(nodes: { owner: string }[], role: number, round: number): number {
  const team = role === ROLE_A ? "TeamA" : "TeamB";
  return roundBudget(nodes.filter((n) => n.owner === team).length, round);
}

function phaseFor(
  state: { status: string },
  round?: { commit_count: number; reveal_count: number },
): string {
  if (state.status === "Finished") return "finished";
  if (!round || round.commit_count < 2) return "committing";
  if (round.reveal_count < 2) return "revealing";
  return "resolving";
}

const MODIFIER_INFO: Record<number, { name: string; effect: string }> = {
  0: { name: "Normal", effect: "No change. Damage = max(attacker_atk - defender_def, 0)." },
  1: { name: "NarrowPass", effect: "Both attack and defense at this gate are capped at 3." },
  2: {
    name: "Mirror",
    effect:
      "Attack and defense values swap at this gate for both sides — placing defense effectively becomes attack and vice versa.",
  },
  3: { name: "Deadlock", effect: "No damage at this gate, regardless of values. Reflection skips this gate too." },
  4: {
    name: "Reflection",
    effect:
      "Damage at this gate becomes overflow. Per-gate split = overflow/2 (integer division — odd values lose 1) is added to each other non-deadlock gate, reduced by the target's unused defense at that receiving gate. Defense at this gate still absorbs incoming attack normally.",
  },
};

function describeModifiers(gates: number[] | null | undefined): Array<{
  gate: number;
  code: number;
  name: string;
  effect: string;
}> | null {
  if (!gates || gates.length !== 3) return null;
  return gates.map((code, gate) => ({
    gate,
    code,
    name: MODIFIER_INFO[code]?.name ?? "Unknown",
    effect: MODIFIER_INFO[code]?.effect ?? "Unknown modifier code.",
  }));
}

import {
  effectiveMoves,
  postContestOwners,
  predictedDamage,
  MOD_NARROW_PASS,
  MOD_MIRROR,
  type DamageBreakdown,
  type NodeDefenseOwner,
} from "./damage.js";

const MAX_VAULT_HP = 50;
const MAX_ROUNDS = 10;
const DEFENDER_PRESET_BUDGET = 12;
const CONQUEST_ATTACK_BUDGET = 10;

const min3 = (n: number) => (n > 3 ? 3 : n);

const ABILITY_TYPES: Record<number, { name: string; t1: string; t2: string }> = {
  1: {
    name: "SiegeSword",
    t1: "set attack at target gate to 5",
    t2: "set attack at target gate to 10",
  },
  2: {
    name: "StoneCloak",
    t1: "halve all gate damage taken",
    t2: "halve all gate damage taken and negate the opponent's repair this round",
  },
  3: {
    name: "EmberBlast",
    t1: "+2 direct vault damage to opponent (bypasses defense)",
    t2: "+6 direct vault damage to opponent (bypasses defense)",
  },
  4: {
    name: "Hex",
    t1: "reduce opponent total damage by 3",
    t2: "reduce opponent total damage by 8",
  },
  5: {
    name: "Fortify",
    t1: "+1 defense at all gates",
    t2: "double defense at all gates",
  },
};

interface AbilityDetails {
  id: number;
  target: number;
  name: string;
  tier: number;
  effect: string;
}

function describeAbility(id: number, target: number): AbilityDetails {
  if (id === 0) return { id, target, name: "None", tier: 0, effect: "" };
  const type = ((id - 1) % 5) + 1;
  const tier = Math.floor((id - 1) / 5) + 1;
  const info = ABILITY_TYPES[type];
  return {
    id,
    target,
    name: info?.name ?? `Unknown(type ${type})`,
    tier,
    effect: tier === 1 ? info?.t1 ?? "" : info?.t2 ?? "",
  };
}

function statusReason(state: {
  status: string;
  vault_a_hp: number;
  vault_b_hp: number;
  current_round: number;
}): string | null {
  if (state.status !== "Finished") return null;
  const a = state.vault_a_hp;
  const b = state.vault_b_hp;
  if (a === 0 && b === 0) return "draw — both vaults reached 0 simultaneously";
  if (a === 0) return "Player B won by vault destruction";
  if (b === 0) return "Player A won by vault destruction";
  if (state.current_round >= MAX_ROUNDS) {
    if (a > b) return `Player A won by HP at round ${state.current_round} timeout (${a} vs ${b})`;
    if (b > a) return `Player B won by HP at round ${state.current_round} timeout (${a} vs ${b})`;
    return `draw — equal HP at round ${state.current_round} timeout`;
  }
  return null;
}

const u8Schema = z.number().int().min(0).max(255);
const parcelTypeSchema = z.number().int().min(0).max(2);
const abilityIdSchema = z.number().int().min(0).max(10);
const abilityStakeSchema = z.array(z.number().int().min(1).max(10)).min(1).max(3);

function feltArray(values: number[]): string[] {
  return [String(values.length), ...values.map(String)];
}

function validateAllocationBudget(values: number[], budget: number, label: string): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total > budget) {
    throw new Error(`${label} budget exceeded: ${total}/${budget}`);
  }
  return total;
}

function tierAbilitySlots(tier: number): number {
  if (tier === 0) return 1;
  if (tier === 1) return 2;
  if (tier >= 2) return 3;
  return 1;
}


function tierPresetCount(tier: number): number {
  if (tier === 0) return 1;
  if (tier === 1) return 2;
  if (tier === 2) return 3;
  if (tier === 3) return 4;
  return 1;
}

function tierWinsRequired(tier: number): number {
  if (tier === 1) return 10;
  if (tier === 2) return 30;
  if (tier === 3) return 60;
  return 0;
}

function shortTextFelt(value: string, label: string): string {
  if (value.length > 31) throw new Error(`${label} must be 31 characters or fewer`);
  return shortString.encodeShortString(value);
}

// Set once by registerSiegeTools so execute() can poll receipts without
// every callsite having to thread rpcUrl through.
let rpcUrlForReceipts: string | null = null;

async function pollReceipt(rpcUrl: string, txHash: string): Promise<void> {
  // Wait up to ~30s for the tx to leave pending and report a finality status.
  // If execution_status is REVERTED, throw with the revert_reason — this is
  // the on-chain revert that executeFromOutside silently swallows otherwise.
  const deadline = Date.now() + 30_000;
  let delay = 500;
  while (Date.now() < deadline) {
    const r = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "starknet_getTransactionReceipt",
        params: [txHash],
        id: 1,
      }),
    }).catch(() => null);
    const json = (await r?.json().catch(() => null)) as
      | { result?: { finality_status?: string; execution_status?: string; revert_reason?: string } }
      | null;
    const result = json?.result;
    if (result?.finality_status && result.finality_status !== "RECEIVED") {
      if (result.execution_status === "REVERTED") {
        const reason = result.revert_reason ?? "Transaction reverted on-chain";
        const err = new Error(reason) as Error & { data?: unknown };
        err.data = { execution_error: reason };
        throw err;
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 2000);
  }
  // Timed out waiting for receipt — don't fail the call; tx may still land.
}

async function execute(signer: WalletAccount, calls: Call[]): Promise<string> {
  process.stderr.write(`[exec-debug] signer.address: ${signer.address}\n`);
  const signerAny = signer as any;
  try {
    const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(signerAny) ?? {}).concat(Object.keys(signerAny));
    process.stderr.write(`[exec-debug] signer keys: ${keys.join(', ')}\n`);
  } catch {}
  if (signerAny.controller) {
    const ctrl = signerAny.controller;
    try {
      const ckeys = Object.getOwnPropertyNames(Object.getPrototypeOf(ctrl) ?? {}).concat(Object.keys(ctrl));
      process.stderr.write(`[exec-debug] controller keys: ${ckeys.join(', ')}\n`);
    } catch {}
    try {
      const addr = typeof ctrl.address === 'function' ? ctrl.address() : ctrl.address;
      process.stderr.write(`[exec-debug] controller.address: ${addr}\n`);
    } catch (e: any) { process.stderr.write(`[exec-debug] controller.address error: ${e.message}\n`); }
    try {
      const cAddr = typeof ctrl.cartridgeAccount === 'function' ? ctrl.cartridgeAccount() : ctrl.cartridgeAccount;
      process.stderr.write(`[exec-debug] controller.cartridgeAccount: ${JSON.stringify(cAddr)}\n`);
    } catch {}
    try {
      process.stderr.write(`[exec-debug] controller.constructor.name: ${ctrl.constructor?.name}\n`);
    } catch {}
  }
  const controller = (signer as unknown as { controller?: {
    executeFromOutside: (calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => Promise<{ transaction_hash: string }>;
  } }).controller;
  if (!controller?.executeFromOutside) {
    throw new Error("CartridgeSessionAccount unavailable on signer");
  }
  const normalized = calls.map((c) => ({
    entrypoint: c.entrypoint,
    contractAddress: addAddressPadding(c.contractAddress),
    calldata: CallData.toHex(c.calldata),
  }));
  // Intercept fetch to capture what address the WASM targets
  const origFetch = globalThis.fetch;
  const fetchLog: string[] = [];
  globalThis.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    let bodyStr = '';
    if (init?.body) {
      bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    } else if (typeof input === 'object' && input !== null) {
      try { bodyStr = await input.clone?.().text?.() ?? ''; } catch {}
    }
    // Also check for Request objects
    if (!bodyStr && input instanceof Request) {
      try { bodyStr = await input.clone().text(); } catch {}
    }
    const snippet = bodyStr.length > 2000 ? bodyStr.slice(0, 2000) : bodyStr;
    // Look for any hex strings that could be addresses (shorter pattern)
    const hexMatches = bodyStr.match(/0x[0-9a-fA-F]{10,}/g);
    fetchLog.push(`url=${url} bodyLen=${bodyStr.length} hexes=${JSON.stringify([...new Set(hexMatches ?? [])].slice(0, 8))} snippet=${snippet.slice(0, 500)}`);
    return origFetch(input, init);
  };
  let res: { transaction_hash: string };
  try {
    res = await controller.executeFromOutside(normalized);
  } catch (e: any) {
    globalThis.fetch = origFetch;
    const debugInfo = {
      signerAddress: signer.address,
      fetchLog,
    };
    e.message = `${e.message} [DEBUG: ${JSON.stringify(debugInfo)}]`;
    throw e;
  }
  globalThis.fetch = origFetch;
  if (rpcUrlForReceipts) await pollReceipt(rpcUrlForReceipts, res.transaction_hash);
  return res.transaction_hash;
}

function safeStringifyError(err: unknown): string {
  const seen = new WeakSet();
  const replacer = (_key: string, value: unknown) => {
    if (typeof value === "function") return `[fn ${(value as { name?: string }).name ?? ""}]`;
    if (typeof value === "object" && value !== null) {
      if (seen.has(value as object)) return "[circular]";
      seen.add(value as object);
    }
    if (typeof value === "bigint") return value.toString();
    return value;
  };
  try {
    const out: Record<string, unknown> = {};
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      out.name = e.constructor?.constructor === Function ? (e as { constructor: { name?: string } }).constructor.name : undefined;
      out.message = e.message;
      out.code = e.code;
      out.data = e.data;
      out.cause = e.cause;
      out.baseError = e.baseError;
      const full = JSON.stringify(err, replacer);
      out._raw = full.length > 4000 ? full.slice(0, 4000) + "..." : full;
    } else {
      out._raw = String(err);
    }
    return JSON.stringify(out, replacer);
  } catch {
    return String(err);
  }
}

function jsonResult(value: unknown): CallToolResult {
  return validateToolResult({
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(isStructuredObject(value) ? { structuredContent: value } : {}),
  });
}

function jsonError(value: object): CallToolResult {
  const structuredContent = { error: true, ...value };
  return validateToolResult({
    content: [{ type: "text", text: JSON.stringify({ error: true, ...value }, null, 2) }],
    structuredContent,
    isError: true,
  });
}

function isStructuredObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateToolResult(result: CallToolResult): CallToolResult {
  return CallToolResultSchema.parse(result);
}

function notReadyMessage(state: NotReadyState): string {
  if (state.bootstrapError) return `Server failed to start: ${state.bootstrapError}`;
  if (state.authUrl) {
    return `Cartridge session not approved yet. Open ${state.authUrl} in your browser to approve, then retry.`;
  }
  return `Server is ${state.bootstrapPhase}. Try again in a moment.`;
}

interface ToolOptions<S extends ZodRawShapeCompat> {
  description: string;
  /** Raw Zod shape. Use `{}` for tools that take no arguments. */
  inputSchema: S;
  annotations?: ToolAnnotations;
  /** When true, the tool blocks until the Cartridge session is approved. */
  requiresSigner?: boolean;
}

function validateToolDefinition<S extends ZodRawShapeCompat>(
  name: string,
  opts: ToolOptions<S>,
  annotations: ToolAnnotations,
): void {
  const nameValidation = validateToolName(name);
  if (!nameValidation.isValid) {
    throw new Error(`Invalid MCP tool name "${name}": ${nameValidation.warnings.join("; ")}`);
  }

  const inputObjectSchema = normalizeObjectSchema(opts.inputSchema);
  const inputSchema = inputObjectSchema
    ? toJsonSchemaCompat(inputObjectSchema, { strictUnions: true, pipeStrategy: "input" })
    : { type: "object", additionalProperties: false };

  ToolSchema.parse({
    name,
    description: opts.description,
    inputSchema,
    annotations,
  });
}

/**
 * Register a tool with shared not-ready / error-handling boilerplate.
 *
 * The handler receives the *parsed* args (Zod has already validated them)
 * and the live ToolContext. Any thrown error gets routed through
 * `extractTxError` so contract reverts surface as readable messages.
 *
 * Always pass `inputSchema` (even `{}`) — it pins `S` so the SDK's tool
 * callback overload picks `(args, extra) => Result` instead of `(extra) => Result`.
 */
function makeRegister(reg: RegisterArgs) {
  return function register<S extends ZodRawShapeCompat>(
    name: string,
    opts: ToolOptions<S>,
    handler: (args: ShapeOutput<S>, ctx: ToolContext) => Promise<unknown>,
  ): void {
    const annotations: ToolAnnotations = {
      ...(opts.requiresSigner
        ? { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
        : { readOnlyHint: true, openWorldHint: true }),
      ...opts.annotations,
    };
    validateToolDefinition(name, opts, annotations);

    // The callback's type uses the SDK's own ToolCallback<S> alias — this
    // tells TS exactly what shape the SDK expects, so the deep conditional
    // type in BaseToolCallback resolves cleanly across the generic boundary.
    const cb = (async (args: ShapeOutput<S>, _extra: unknown): Promise<CallToolResult> => {
      try {
        if (opts.requiresSigner) {
          const notReady = reg.getNotReady();
          if (notReady) {
            return jsonError({ status: "not_ready", message: notReadyMessage(notReady) });
          }
        }
        const result = await handler(args, reg.getCtx());
        return jsonResult(result);
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          const detail = err.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ");
          return jsonError({ message: `Invalid arguments: ${detail}` });
        }
        const message = extractTxError(err);
        const debug = message === "Transaction execution error" || message.length < 30
          ? safeStringifyError(err)
          : undefined;
        return jsonError(debug ? { message, _debug: debug } : { message });
      }
    }) as ToolCallback<S>;

    reg.server.registerTool(
      name,
      { description: opts.description, inputSchema: opts.inputSchema, annotations },
      cb,
    );
  };
}

// ── tools ────────────────────────────────────────────────────────────

export function registerSiegeTools(reg: RegisterArgs): void {
  rpcUrlForReceipts = reg.getCtx().config.rpcUrl;
  const register = makeRegister(reg);

  // ----- meta -----

  register(
    "siege_whoami",
    {
      description: "Return the authenticated agent's Starknet address.",
      inputSchema: {},
      requiresSigner: true,
    },
    async (_args, ctx) => ({ address: ctx.agentAddress }),
  );

  // ----- reads -----

  register(
    "siege_get_match_state",
    {
      description:
        "Get current 1v1 match state: players, vault HP, current round, phase, node ownership, gate modifiers, and per-player budgets.",
      inputSchema: {
        match_id: z.number().int().nonnegative().describe("1v1 match id"),
      },
    },
    async ({ match_id }, ctx) => {
      ctx.watchMatch(match_id);
      const state = await ctx.state.matchState(match_id);
      const nodes = await ctx.state.nodeStates(match_id);
      const round = await ctx.state.roundMoves(match_id, state.current_round).catch(() => undefined);
      const modifiers = await ctx.state
        .roundModifiers(match_id, state.current_round)
        .then((m) => m.gates)
        .catch(() => null);

      const myRole = ctx.agentAddress ? roleFor(state, ctx.agentAddress) : null;
      return {
        match_id,
        status: state.status,
        status_reason: statusReason(state),
        phase: phaseFor(state, round),
        current_round: state.current_round,
        rounds_remaining: Math.max(0, MAX_ROUNDS - state.current_round),
        commit_deadline: round?.commit_deadline ?? null,
        reveal_deadline: round?.reveal_deadline ?? null,
        vault_a_hp: state.vault_a_hp,
        vault_b_hp: state.vault_b_hp,
        my_role: myRole,
        my_role_name: myRole === null ? null : roleName(myRole),
        player_a: { address: state.player_a, budget: budgetFor(nodes, ROLE_A, state.current_round) },
        player_b: { address: state.player_b, budget: budgetFor(nodes, ROLE_B, state.current_round) },
        commits: round?.commit_count ?? 0,
        reveals: round?.reveal_count ?? 0,
        modifiers,
        modifier_details: describeModifiers(modifiers),
        nodes: nodes.map((n) => ({ index: n.node_index, owner: n.owner })),
        spectate_url: `${ctx.config.frontendUrl}/match-1v1/${match_id}/spectate`,
      };
    },
  );

  register(
    "siege_get_round_history",
    {
      description: "Get recent revealed 1v1 rounds (moves, abilities, traps).",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        num_rounds: z.number().int().positive().default(3),
      },
    },
    async ({ match_id, num_rounds }, ctx) => {
      ctx.watchMatch(match_id);
      const state = await ctx.state.matchState(match_id);
      const rounds = [];
      for (let r = Math.max(1, state.current_round - num_rounds + 1); r <= state.current_round; r++) {
        try {
          rounds.push(await ctx.state.roundMoves(match_id, r));
        } catch {
          // missing future rounds are fine
        }
      }
      const withTraps = await Promise.all(
        rounds.map(async (round) => ({
          round,
          traps: await ctx.state.roundTraps(match_id, round.round).catch(() => null),
        })),
      );
      return {
        match_id,
        current_round: state.current_round,
        rounds: withTraps.map(({ round, traps }) => ({
          round: round.round,
          commits: round.commit_count,
          reveals: round.reveal_count,
          player_a: {
            attack: [round.a_p0, round.a_p1, round.a_p2],
            defense: [round.a_g0, round.a_g1, round.a_g2],
            repair: round.a_repair,
            nodes: [round.a_nc0, round.a_nc1, round.a_nc2],
            ability: { id: round.a_ability_id, target: round.a_ability_target },
            traps: traps?.player_a ?? null,
          },
          player_b: {
            attack: [round.b_p0, round.b_p1, round.b_p2],
            defense: [round.b_g0, round.b_g1, round.b_g2],
            repair: round.b_repair,
            nodes: [round.b_nc0, round.b_nc1, round.b_nc2],
            ability: { id: round.b_ability_id, target: round.b_ability_target },
            traps: traps?.player_b ?? null,
          },
        })),
      };
    },
  );

  register(
    "siege_get_round_details",
    {
      description: "Get one 1v1 round's moves, modifiers, traps, deadlines, and abilities.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        round: z.number().int().positive().optional().describe("Defaults to current round"),
      },
    },
    async ({ match_id, round }, ctx) => {
      ctx.watchMatch(match_id);
      const state = await ctx.state.matchState(match_id);
      const r = round ?? state.current_round;
      const moves = await ctx.state.roundMoves(match_id, r);
      const modifiers = await ctx.state.roundModifiers(match_id, r).catch(() => null);
      const traps = await ctx.state.roundTraps(match_id, r).catch(() => null);
      const a_move = {
        attack: [moves.a_p0, moves.a_p1, moves.a_p2],
        defense: [moves.a_g0, moves.a_g1, moves.a_g2],
      };
      const b_move = {
        attack: [moves.b_p0, moves.b_p1, moves.b_p2],
        defense: [moves.b_g0, moves.b_g1, moves.b_g2],
      };
      const both_revealed = moves.reveal_count >= 2;
      // Node defense owners: for the current (unresolved) round, current node
      // state is pre-contest, so apply this round's contests. For past rounds
      // current ownership is already post-contest (exact for the most recent).
      const nodeStates = await ctx.state.nodeStates(match_id).catch(() => null);
      const owners = nodeStates
        ? r === state.current_round
          ? postContestOwners(
              nodeOwnersForDefense(nodeStates),
              [moves.a_nc0, moves.a_nc1, moves.a_nc2],
              [moves.b_nc0, moves.b_nc1, moves.b_nc2],
            )
          : nodeOwnersForDefense(nodeStates)
        : undefined;
      const effective = both_revealed
        ? effectiveMoves(modifiers?.gates, a_move, b_move, owners)
        : null;
      const predicted =
        both_revealed && effective && modifiers?.gates
          ? predictedDamage(modifiers.gates, effective.player_a, effective.player_b)
          : null;
      return {
        match_id,
        round: r,
        commits: moves.commit_count,
        reveals: moves.reveal_count,
        commit_deadline: moves.commit_deadline,
        reveal_deadline: moves.reveal_deadline,
        modifiers: modifiers?.gates ?? null,
        modifier_details: describeModifiers(modifiers?.gates),
        effective_moves: effective,
        predicted_damage: predicted,
        player_a: {
          attack: a_move.attack,
          defense: a_move.defense,
          repair: moves.a_repair,
          nodes: [moves.a_nc0, moves.a_nc1, moves.a_nc2],
          traps: traps?.player_a ?? null,
          ability: { id: moves.a_ability_id, target: moves.a_ability_target },
          ability_details: describeAbility(moves.a_ability_id, moves.a_ability_target),
        },
        player_b: {
          attack: b_move.attack,
          defense: b_move.defense,
          repair: moves.b_repair,
          nodes: [moves.b_nc0, moves.b_nc1, moves.b_nc2],
          traps: traps?.player_b ?? null,
          ability: { id: moves.b_ability_id, target: moves.b_ability_target },
          ability_details: describeAbility(moves.b_ability_id, moves.b_ability_target),
        },
      };
    },
  );

  register(
    "siege_get_my_status",
    {
      description:
        "Your slot, current budget, commit/reveal status, and phase for a given 1v1 match. Defaults to the authenticated agent's address.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        player_address: z.string().optional().describe("Defaults to siege_whoami"),
      },
    },
    async ({ match_id, player_address }, ctx) => {
      ctx.watchMatch(match_id);
      const address = player_address ?? ctx.agentAddress;
      if (!address) {
        throw new Error("player_address not supplied and the session is not yet authenticated.");
      }

      const state = await ctx.state.matchState(match_id);
      const role = roleFor(state, address);
      if (role === null) {
        return { error: true, message: `Address ${address} is not a player in match ${match_id}` };
      }

      const nodes = await ctx.state.nodeStates(match_id);
      let round;
      let committed = false;
      let revealed = false;
      try {
        round = await ctx.state.roundMoves(match_id, state.current_round);
        const cmt = await ctx.state.commitment(match_id, state.current_round, role);
        committed = cmt.committed;
        revealed = cmt.revealed;
      } catch {
        round = undefined;
      }

      const vault_hp = role === ROLE_A ? state.vault_a_hp : state.vault_b_hp;
      return {
        match_id,
        player_address: address,
        role,
        role_name: roleName(role),
        current_round: state.current_round,
        rounds_remaining: Math.max(0, MAX_ROUNDS - state.current_round),
        phase: phaseFor(state, round),
        committed,
        revealed,
        budget: budgetFor(nodes, role, state.current_round),
        vault_hp,
        // Repair costs 2 budget per HP, so half the budget is the spend ceiling.
        max_useful_repair: Math.min(
          Math.floor(budgetFor(nodes, role, state.current_round) / 2),
          Math.max(0, MAX_VAULT_HP - vault_hp),
        ),
      };
    },
  );

  register(
    "siege_my_abilities",
    {
      description:
        "Get the staked abilities for a player in a 1v1 match, with per-stake used flags. Use this before committing with ability_id != 0 to verify the ability is still available — committing a hash with an ability id you've already used (or never staked) locks you into a reveal that will revert with 'Ability not available'.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        player_address: z.string().optional().describe("Defaults to siege_whoami"),
      },
    },
    async ({ match_id, player_address }, ctx) => {
      ctx.watchMatch(match_id);
      const address = player_address ?? ctx.agentAddress;
      if (!address) {
        throw new Error("player_address not supplied and the session is not yet authenticated.");
      }
      const state = await ctx.state.matchState(match_id);
      const role = roleFor(state, address);
      if (role === null) {
        return { error: true, message: `Address ${address} is not a player in match ${match_id}` };
      }
      const ma = await ctx.state.matchAbilities(match_id).catch(() => null);
      if (!ma) {
        return { match_id, player_address: address, role, role_name: roleName(role), abilities: [] };
      }
      const side = role === ROLE_A ? ma.player_a : ma.player_b;
      const abilities = side.abilities
        .map((id, i) => ({ slot: i, id, used: side.used[i] }))
        .filter((a) => a.id > 0)
        .map((a) => ({ ...a, ...describeAbility(a.id, 0), available: !a.used }));
      return {
        match_id,
        player_address: address,
        role,
        role_name: roleName(role),
        abilities,
      };
    },
  );

  register(
    "siege_get_world_state",
    {
      description:
        "Get metagame world config, resource-token config, and a parcel list for land/kingdom planning.",
      inputSchema: {
        limit: z.number().int().positive().max(500).default(200),
      },
    },
    async ({ limit }, ctx) => {
      const [world, resources, parcels] = await Promise.all([
        ctx.state.worldConfig(),
        ctx.state.resourceConfig().catch(() => null),
        ctx.state.parcels(limit),
      ]);
      return {
        world,
        resources,
        parcels,
        parcel_type_legend: {
          0: "Forge: iron + linen",
          1: "Quarry: stone + wood",
          2: "Grove: ember + seeds",
          255: "Untyped/unassigned",
        },
      };
    },
  );

  register(
    "siege_get_parcel",
    {
      description: "Get one land parcel by id, including position, type, owner, and home flag.",
      inputSchema: {
        parcel_id: z.number().int().nonnegative(),
      },
    },
    async ({ parcel_id }, ctx) => ({ parcel: await ctx.state.parcel(parcel_id) }),
  );

  register(
    "siege_get_player_kingdom",
    {
      description:
        "Get a player's kingdom, reputation, preset defenses, faction membership, pending invites, active pillages, and pillage eligibility. Defaults to the authenticated agent.",
      inputSchema: {
        player_address: z.string().optional().describe("Defaults to siege_whoami"),
      },
    },
    async ({ player_address }, ctx) => {
      const player = player_address ?? ctx.agentAddress;
      if (!player) throw new Error("player_address not supplied and the session is not yet authenticated.");
      const [kingdom, reputation, presets, member, invites, pillages, eligibilities] = await Promise.all([
        ctx.state.playerKingdom(player),
        ctx.state.playerReputation(player),
        ctx.state.presetDefense(player),
        ctx.state.factionMember(player),
        ctx.state.factionInvitesFor(player),
        ctx.state.activePillagesFor(player),
        ctx.state.pillageEligibilitiesFor(player),
      ]);
      const faction = member?.faction_id ? await ctx.state.faction(member.faction_id) : null;
      const now = Math.floor(Date.now() / 1000);
      return {
        player,
        kingdom,
        derived: kingdom
          ? {
              home_parcels: [kingdom.home_0, kingdom.home_1, kingdom.home_2],
              non_home_parcel_count: Math.max(0, kingdom.parcel_count - 3),
              ability_slots: tierAbilitySlots(kingdom.tier),
              preset_slots: tierPresetCount(kingdom.tier),
              next_tier: kingdom.tier < 3 ? kingdom.tier + 1 : null,
              wins_required_for_next_tier:
                kingdom.tier < 3 ? tierWinsRequired(kingdom.tier + 1) : null,
            }
          : null,
        reputation,
        preset_defense: presets,
        faction: { member, faction },
        pending_invites: invites.filter((invite) => !invite.used),
        active_pillages: pillages.filter((pillage) => pillage.active && pillage.expires_at > now),
        pillage_eligibilities: eligibilities.filter((eligibility) => !eligibility.used && eligibility.expires_at > now),
      };
    },
  );

  register(
    "siege_get_player_cosmetics",
    {
      description:
        "Get a player's equipped cosmetics (banner, parcel_skin, hold_decoration). Each value is a circuit key string or null.",
      inputSchema: {
        player_address: z.string().optional().describe("Defaults to siege_whoami"),
      },
    },
    async ({ player_address }, ctx) => {
      const player = player_address ?? ctx.agentAddress;
      if (!player) throw new Error("player_address not supplied and the session is not yet authenticated.");
      const cosmetics = await ctx.state.playerCosmetics(player);
      return { player, cosmetics: cosmetics ?? { banner: null, parcel_skin: null, hold_decoration: null } };
    },
  );

  register(
    "siege_set_cosmetic",
    {
      description:
        "Set a cosmetic slot on your kingdom. cosmetic_type is one of 'banner', 'parcel_skin', 'hold_decoration'. circuit_key is the cosmetic id string (e.g. 'half-wave-rectifier') or null to clear.",
      inputSchema: {
        cosmetic_type: z.enum(["banner", "parcel_skin", "hold_decoration"]),
        circuit_key: z.string().nullable().describe("Circuit key string or null to clear the slot"),
      },
      requiresSigner: true,
    },
    async ({ cosmetic_type, circuit_key }, ctx) => {
      const typeFelt = shortString.encodeShortString(cosmetic_type);
      const keyFelt = circuit_key ? shortString.encodeShortString(circuit_key) : "0x0";
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "set_cosmetic", [typeFelt, keyFelt]),
      ]);
      return { tx_hash: tx, cosmetic_type, circuit_key };
    },
  );

  register(
    "siege_craft_ability",
    {
      description:
        "Craft ability tokens. T1 (ids 1-5) costs ERC-20 resources. T2 (ids 6-10) costs resources + burns 1 matching T1. Multicalls approve + craft_ability_batch or craft_ability_tier2_batch. Use siege_get_world_state to check ResourceConfig token addresses and resource balances first.",
      inputSchema: {
        ability_id: z.number().int().min(1).max(10).describe("1-5 for T1, 6-10 for T2"),
        quantity: z.number().int().min(1).max(50).default(1),
      },
      requiresSigner: true,
    },
    async ({ ability_id, quantity }, ctx) => {
      const resourceConfig = await ctx.state.resourceConfig();
      const tokens: Record<string, string> = {
        iron: resourceConfig.iron,
        linen: resourceConfig.linen,
        stone: resourceConfig.stone,
        wood: resourceConfig.wood,
        ember: resourceConfig.ember,
        seeds: resourceConfig.seeds,
      };

      const tier = Math.floor((ability_id - 1) / 5) + 1;
      const abilityType = ((ability_id - 1) % 5) + 1;

      const costs: Record<number, Record<string, number>> = {
        1: { iron: 8, wood: 5 },
        2: { stone: 8, linen: 5 },
        3: { ember: 8, seeds: 5 },
        4: { iron: 5, stone: 5, ember: 3 },
        5: { stone: 5, linen: 5, wood: 3 },
        6: { iron: 30, wood: 20, ember: 10 },
        7: { stone: 30, linen: 20, seeds: 10 },
        8: { ember: 30, seeds: 20, iron: 10 },
        9: { iron: 20, stone: 20, ember: 10, wood: 10 },
        10: { stone: 20, linen: 20, wood: 10 },
      };

      const cost = costs[ability_id];
      if (!cost) throw new Error(`Unknown ability_id: ${ability_id}`);

      const calls_list: import("starknet").Call[] = [];
      for (const [resource, amount] of Object.entries(cost)) {
        const tokenAddr = tokens[resource];
        if (!tokenAddr) continue;
        calls_list.push(
          call(tokenAddr, "approve", [ctx.config.contracts.crafting1v1, String(amount * quantity), "0"]),
        );
      }

      if (tier === 1) {
        calls_list.push(
          call(ctx.config.contracts.crafting1v1, "craft_ability_batch", [String(ability_id), String(quantity)]),
        );
      } else {
        calls_list.push(
          call(ctx.config.contracts.crafting1v1, "craft_ability_tier2_batch", [String(abilityType), String(quantity)]),
        );
      }

      const tx = await execute(ctx.signer!, calls_list);
      const names = ["", "Siege Sword", "Stone Cloak", "Ember Blast", "Hex", "Fortify"];
      return {
        tx_hash: tx,
        ability_id,
        ability_name: `${names[abilityType]} (T${tier})`,
        quantity,
        resource_cost: Object.fromEntries(Object.entries(cost).map(([r, a]) => [r, a * quantity])),
      };
    },
  );

  register(
    "siege_get_forge_info",
    {
      description:
        "Get circuit forge information: available circuits (cosmetics), component types and their resource costs. Circuit forging is client-side — this tool provides the reference data an agent needs to advise crafting strategy.",
      inputSchema: {},
    },
    async () => {
      const components = [
        { kind: "rune-stone", cost: { stone: 4, iron: 2 } },
        { kind: "flux-well", cost: { ember: 4, linen: 2 } },
        { kind: "spiral-coil", cost: { iron: 4, wood: 2 } },
        { kind: "one-way-valve", cost: { stone: 3, ember: 3, seeds: 2 } },
      ];
      const circuits = [
        { key: "half-wave-rectifier", name: "The First Gate", cosmetic_type: "banner", components_needed: ["one-way-valve", "rune-stone", "flux-well"] },
        { key: "voltage-divider", name: "Bleeder's Mark", cosmetic_type: "parcelSkin", components_needed: ["rune-stone", "rune-stone"] },
        { key: "full-wave-rectifier", name: "The Second Gate", cosmetic_type: "banner", components_needed: ["one-way-valve", "one-way-valve", "one-way-valve", "one-way-valve", "rune-stone"] },
        { key: "rc-low-pass", name: "The Muffler", cosmetic_type: "banner", components_needed: ["rune-stone", "flux-well"] },
        { key: "lc-tank", name: "The Resonance Chamber", cosmetic_type: "banner", components_needed: ["spiral-coil", "flux-well"] },
        { key: "buck-converter", name: "The Quartermaster", cosmetic_type: "holdDecoration", components_needed: ["one-way-valve", "spiral-coil", "flux-well", "one-way-valve"] },
        { key: "common-emitter-amp", name: "Voice of the Keep", cosmetic_type: "parcelSkin", components_needed: ["rune-stone", "rune-stone", "rune-stone", "rune-stone", "flux-well", "one-way-valve"] },
      ];
      return { components, circuits, note: "Circuit forging happens client-side. Use siege_set_cosmetic to equip a forged circuit on-chain." };
    },
  );

  register(
    "siege_get_staked_match",
    {
      description:
        "Get 1v1 match state plus staked ability escrow state for create/join/settle/claim-parcel workflows.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
      },
    },
    async ({ match_id }, ctx) => {
      ctx.watchMatch(match_id);
      const [state, stakes, abilities] = await Promise.all([
        ctx.state.matchState(match_id),
        ctx.state.matchStakes(match_id).catch(() => null),
        ctx.state.matchAbilities(match_id).catch(() => null),
      ]);
      return {
        match: {
          match_id,
          status: state.status,
          status_reason: statusReason(state),
          player_a: state.player_a,
          player_b: state.player_b,
          vault_a_hp: state.vault_a_hp,
          vault_b_hp: state.vault_b_hp,
          current_round: state.current_round,
        },
        stakes,
        abilities,
      };
    },
  );

  register(
    "siege_get_pillage_status",
    {
      description:
        "Get pillage state by home parcel or, by default, active pillages and open eligibilities for the authenticated agent.",
      inputSchema: {
        home_parcel_id: z.number().int().nonnegative().optional(),
        player_address: z.string().optional().describe("Defaults to siege_whoami when home_parcel_id is omitted"),
      },
    },
    async ({ home_parcel_id, player_address }, ctx) => {
      if (home_parcel_id !== undefined) {
        return { pillage: await ctx.state.pillage(home_parcel_id) };
      }
      const player = player_address ?? ctx.agentAddress;
      if (!player) throw new Error("player_address not supplied and the session is not yet authenticated.");
      const [pillages, eligibilities] = await Promise.all([
        ctx.state.activePillagesFor(player),
        ctx.state.pillageEligibilitiesFor(player),
      ]);
      const now = Math.floor(Date.now() / 1000);
      return {
        player,
        active_pillages: pillages.filter((pillage) => pillage.active && pillage.expires_at > now),
        pillage_eligibilities: eligibilities.filter((eligibility) => !eligibility.used && eligibility.expires_at > now),
      };
    },
  );

  register(
    "siege_get_factions",
    {
      description:
        "List factions, inspect a faction's members, or inspect a player's faction membership and pending invites.",
      inputSchema: {
        faction_id: z.number().int().positive().optional(),
        player_address: z.string().optional(),
        limit: z.number().int().positive().max(200).default(50),
      },
    },
    async ({ faction_id, player_address, limit }, ctx) => {
      if (faction_id !== undefined) {
        const [faction, members] = await Promise.all([
          ctx.state.faction(faction_id),
          ctx.state.factionMembers(faction_id),
        ]);
        return { faction_id, faction, members };
      }
      if (player_address) {
        const [member, invites] = await Promise.all([
          ctx.state.factionMember(player_address),
          ctx.state.factionInvitesFor(player_address),
        ]);
        const faction = member?.faction_id ? await ctx.state.faction(member.faction_id) : null;
        return { player_address, member, faction, pending_invites: invites.filter((invite) => !invite.used) };
      }
      return { factions: await ctx.state.factions(limit) };
    },
  );

  // ----- writes -----

  register(
    "siege_register_player",
    {
      description:
        "Register the authenticated agent's kingdom and claim three home parcels. home_types are 0=Forge, 1=Quarry, 2=Grove.",
      inputSchema: {
        home_types: z.array(parcelTypeSchema).length(3).default([0, 1, 2]),
      },
      requiresSigner: true,
    },
    async ({ home_types }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "register_player", feltArray(home_types)),
      ]);
      return { tx_hash: tx, home_types };
    },
  );

  register(
    "siege_claim_drip",
    {
      description:
        "Claim resource drip for the authenticated agent's home parcels. Active pillaged homes are skipped by the contract.",
      inputSchema: {},
      requiresSigner: true,
    },
    async (_args, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "claim_drip", []),
      ]);
      return { tx_hash: tx };
    },
  );

  register(
    "siege_upgrade_kingdom",
    {
      description:
        "Upgrade the authenticated agent's kingdom tier if win and resource requirements are met.",
      inputSchema: {},
      requiresSigner: true,
      annotations: { destructiveHint: true },
    },
    async (_args, ctx) => {
      const before = ctx.agentAddress ? await ctx.state.playerKingdom(ctx.agentAddress) : null;
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "upgrade_kingdom", []),
      ]);
      return {
        tx_hash: tx,
        previous_tier: before?.tier ?? null,
        expected_tier: before ? before.tier + 1 : null,
      };
    },
  );

  register(
    "siege_create_staked_match",
    {
      description:
        "Create a pending staked 1v1 match against an opponent, escrowing 1-3 ability token IDs. Requires AbilityToken approval for world_system before calling.",
      inputSchema: {
        opponent: z.string().min(3),
        abilities: abilityStakeSchema.describe("Ability token IDs to stake, each 1-10"),
      },
      requiresSigner: true,
    },
    async ({ opponent, abilities }, ctx) => {
      const kingdom = ctx.agentAddress ? await ctx.state.playerKingdom(ctx.agentAddress) : null;
      if (kingdom && abilities.length > tierAbilitySlots(kingdom.tier)) {
        throw new Error(
          `Too many abilities for tier ${kingdom.tier}: ${abilities.length}/${tierAbilitySlots(kingdom.tier)}`,
        );
      }
      const tx = await execute(ctx.signer!, buildCreateStakedMatchCalls(ctx.config, opponent, abilities));
      const match_id = ctx.agentAddress
        ? await ctx.state.findLatestMatchForPlayers(ctx.agentAddress, opponent)
        : null;
      if (match_id !== null) ctx.watchMatch(match_id);
      return {
        tx_hash: tx,
        match_id,
        opponent,
        abilities,
        spectate_url: match_id !== null ? `${ctx.config.frontendUrl}/match-1v1/${match_id}/spectate` : null,
        warning:
          match_id === null
            ? "match_id not yet indexed by Torii — query siege_get_staked_match once it appears"
            : undefined,
      };
    },
  );

  register(
    "siege_join_staked_match",
    {
      description:
        "Join a pending staked 1v1 match as player_b, escrowing 1-3 ability token IDs. Requires AbilityToken approval for world_system before calling.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        abilities: abilityStakeSchema.describe("Ability token IDs to stake, each 1-10"),
      },
      requiresSigner: true,
    },
    async ({ match_id, abilities }, ctx) => {
      ctx.watchMatch(match_id);
      const kingdom = ctx.agentAddress ? await ctx.state.playerKingdom(ctx.agentAddress) : null;
      if (kingdom && abilities.length > tierAbilitySlots(kingdom.tier)) {
        throw new Error(
          `Too many abilities for tier ${kingdom.tier}: ${abilities.length}/${tierAbilitySlots(kingdom.tier)}`,
        );
      }
      const tx = await execute(ctx.signer!, buildJoinStakedMatchCalls(ctx.config, match_id, abilities));
      return { tx_hash: tx, match_id, abilities };
    },
  );

  register(
    "siege_cancel_staked_match",
    {
      description:
        "Cancel a staked match you created that the opponent has not joined yet. Refunds your escrowed abilities and closes the match permanently.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
      },
      requiresSigner: true,
    },
    async ({ match_id }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "cancel_staked_match", [String(match_id)]),
      ]);
      return { tx_hash: tx, match_id };
    },
  );

  register(
    "siege_settle_match",
    {
      description:
        "Settle a finished staked 1v1 match: distributes escrowed abilities, updates wins/reputation, releases loser parcel, and may grant pillage eligibility.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
      },
      requiresSigner: true,
      annotations: { destructiveHint: true },
    },
    async ({ match_id }, ctx) => {
      ctx.watchMatch(match_id);
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "settle_match", [String(match_id)]),
      ]);
      return { tx_hash: tx, match_id };
    },
  );

  register(
    "siege_claim_parcel",
    {
      description:
        "Claim one adjacent unclaimed parcel after winning and settling a staked match. parcel_type: 0=Forge, 1=Quarry, 2=Grove.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        parcel_id: z.number().int().nonnegative(),
        parcel_type: parcelTypeSchema,
      },
      requiresSigner: true,
      annotations: { destructiveHint: true },
    },
    async ({ match_id, parcel_id, parcel_type }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "claim_parcel", [
          String(match_id),
          String(parcel_id),
          String(parcel_type),
        ]),
      ]);
      return { tx_hash: tx, match_id, parcel_id, parcel_type };
    },
  );

  register(
    "siege_set_preset_defense",
    {
      description:
        "Set one async conquest defense preset. Total p0+p1+p2+g0+g1+g2 must be <= 12; available preset slots depend on kingdom tier.",
      inputSchema: {
        index: z.number().int().min(0).max(3),
        p0: u8Schema.default(0),
        p1: u8Schema.default(0),
        p2: u8Schema.default(0),
        g0: u8Schema.default(0),
        g1: u8Schema.default(0),
        g2: u8Schema.default(0),
      },
      requiresSigner: true,
    },
    async ({ index, p0, p1, p2, g0, g1, g2 }, ctx) => {
      const total = validateAllocationBudget([p0, p1, p2, g0, g1, g2], DEFENDER_PRESET_BUDGET, "Preset defense");
      const kingdom = ctx.agentAddress ? await ctx.state.playerKingdom(ctx.agentAddress) : null;
      if (kingdom && index >= tierPresetCount(kingdom.tier)) {
        throw new Error(`Preset index ${index} exceeds tier ${kingdom.tier} limit (${tierPresetCount(kingdom.tier)})`);
      }
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.conquest, "set_preset_defense", [
          String(index),
          String(p0),
          String(p1),
          String(p2),
          String(g0),
          String(g1),
          String(g2),
        ]),
      ]);
      return { tx_hash: tx, index, total_allocated: total, budget: DEFENDER_PRESET_BUDGET };
    },
  );

  register(
    "siege_initiate_conquest",
    {
      description:
        "Attack an adjacent non-home target parcel using async preset defense. Submits VRF request_random + conquest.initiate_conquest.",
      inputSchema: {
        target_parcel: z.number().int().nonnegative(),
        p0: u8Schema.default(0),
        p1: u8Schema.default(0),
        p2: u8Schema.default(0),
        g0: u8Schema.default(0),
        g1: u8Schema.default(0),
        g2: u8Schema.default(0),
        ability_id: abilityIdSchema.default(0),
        ability_target: z.number().int().min(0).max(2).default(0),
      },
      requiresSigner: true,
      annotations: { destructiveHint: true },
    },
    async ({ target_parcel, p0, p1, p2, g0, g1, g2, ability_id, ability_target }, ctx) => {
      const total = validateAllocationBudget([p0, p1, p2, g0, g1, g2], CONQUEST_ATTACK_BUDGET, "Conquest attack");
      const target = await ctx.state.parcel(target_parcel);
      if (target.is_home) throw new Error(`Parcel ${target_parcel} is a home parcel; conquest cannot target homes.`);
      const tx = await execute(ctx.signer!, [
        vrfRequestRandom(ctx.config.vrfAddress, ctx.config.contracts.conquest),
        call(ctx.config.contracts.conquest, "initiate_conquest", [
          String(target_parcel),
          String(p0),
          String(p1),
          String(p2),
          String(g0),
          String(g1),
          String(g2),
          String(ability_id),
          String(ability_target),
        ]),
      ]);
      return { tx_hash: tx, target_parcel, total_allocated: total, budget: CONQUEST_ATTACK_BUDGET };
    },
  );

  register(
    "siege_initiate_pillage",
    {
      description:
        "Use an open pillage eligibility from a settled staked-match win to begin pillaging one loser home parcel.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        home_parcel_id: z.number().int().nonnegative(),
      },
      requiresSigner: true,
      annotations: { destructiveHint: true },
    },
    async ({ match_id, home_parcel_id }, ctx) => {
      const parcel = await ctx.state.parcel(home_parcel_id);
      if (!parcel.is_home) throw new Error(`Parcel ${home_parcel_id} is not a home parcel.`);
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "initiate_pillage", [
          String(match_id),
          String(home_parcel_id),
        ]),
      ]);
      return { tx_hash: tx, match_id, home_parcel_id };
    },
  );

  register(
    "siege_claim_pillage_drip",
    {
      description:
        "Claim resources siphoned from an active pillage. If adjacency was lost or the pillage expired, the contract may deactivate it.",
      inputSchema: {
        home_parcel_id: z.number().int().nonnegative(),
      },
      requiresSigner: true,
    },
    async ({ home_parcel_id }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "claim_pillage_drip", [String(home_parcel_id)]),
      ]);
      return { tx_hash: tx, home_parcel_id };
    },
  );

  register(
    "siege_create_faction",
    {
      description:
        "Create a faction as the authenticated agent. Requires Strategos tier and burns the on-chain formation resources.",
      inputSchema: {
        name: z.string().min(1).max(31),
        tag: z.string().min(1).max(31),
      },
      requiresSigner: true,
      annotations: { destructiveHint: true },
    },
    async ({ name, tag }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "create_faction", [
          shortTextFelt(name, "name"),
          shortTextFelt(tag, "tag"),
        ]),
      ]);
      return { tx_hash: tx, name, tag };
    },
  );

  register(
    "siege_invite_faction_member",
    {
      description: "Invite a registered player to the authenticated agent's faction. Caller must be faction leader.",
      inputSchema: {
        target: z.string().min(3),
      },
      requiresSigner: true,
    },
    async ({ target }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "invite_member", [target]),
      ]);
      return { tx_hash: tx, target };
    },
  );

  register(
    "siege_accept_faction_invite",
    {
      description: "Accept a pending faction invite.",
      inputSchema: {
        faction_id: z.number().int().positive(),
      },
      requiresSigner: true,
    },
    async ({ faction_id }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "accept_invite", [String(faction_id)]),
      ]);
      return { tx_hash: tx, faction_id };
    },
  );

  register(
    "siege_leave_faction",
    {
      description:
        "Leave the authenticated agent's faction. If the caller is leader, the faction is dissolved.",
      inputSchema: {},
      requiresSigner: true,
      annotations: { destructiveHint: true },
    },
    async (_args, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "leave_faction", []),
      ]);
      return { tx_hash: tx };
    },
  );

  register(
    "siege_kick_faction_member",
    {
      description: "Kick a member from the authenticated agent's faction. Caller must be faction leader.",
      inputSchema: {
        target: z.string().min(3),
      },
      requiresSigner: true,
      annotations: { destructiveHint: true },
    },
    async ({ target }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "kick_member", [target]),
      ]);
      return { tx_hash: tx, target };
    },
  );

  register(
    "siege_set_faction_reinforcement",
    {
      description: "Toggle whether faction allies can reinforce the authenticated agent's parcel defenses.",
      inputSchema: {
        enabled: z.boolean(),
      },
      requiresSigner: true,
    },
    async ({ enabled }, ctx) => {
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.worldSystem, "set_faction_reinforcement", [enabled ? "1" : "0"]),
      ]);
      return { tx_hash: tx, enabled };
    },
  );

  register(
    "siege_set_ability_operator_approval",
    {
      description:
        "Approve or revoke world_system as operator for the authenticated agent's AbilityToken ERC-1155 inventory. Needed before staking abilities in staked matches. Requires ABILITY_TOKEN_ADDRESS in the MCP server environment before session approval.",
      inputSchema: {
        approved: z.boolean().default(true),
      },
      requiresSigner: true,
    },
    async ({ approved }, ctx) => {
      const abilityToken = ctx.config.abilityTokenAddress;
      if (!abilityToken) {
        const resourceConfig = await ctx.state.resourceConfig().catch(() => null);
        throw new Error(
          `ABILITY_TOKEN_ADDRESS is not configured for the session policy. Current ResourceConfig ability_token is ${resourceConfig?.ability_token ?? "unknown"}. Set ABILITY_TOKEN_ADDRESS and re-approve the Cartridge session before using this tool.`,
        );
      }
      const tx = await execute(ctx.signer!, [
        call(abilityToken, "set_approval_for_all", [
          ctx.config.contracts.worldSystem,
          approved ? "1" : "0",
        ]),
      ]);
      return { tx_hash: tx, ability_token: abilityToken, operator: ctx.config.contracts.worldSystem, approved };
    },
  );

  register(
    "siege_create_match",
    {
      description:
        "Open a 1v1 match between two addresses. Submits a multicall: vRNG request_random + actions_1v1.create_match_1v1. After the tx lands, polls Torii for the assigned match_id (up to ~20s).",
      inputSchema: {
        player_a: z.string().min(3),
        player_b: z.string().min(3),
      },
      requiresSigner: true,
    },
    async ({ player_a, player_b }, ctx) => {
      const tx = await execute(ctx.signer!, [
        vrfRequestRandom(ctx.config.vrfAddress, ctx.config.contracts.actions1v1),
        call(ctx.config.contracts.actions1v1, "create_match_1v1", [player_a, player_b]),
      ]);
      const match_id = await ctx.state.findLatestMatchForPlayers(player_a, player_b);
      if (match_id !== null) ctx.watchMatch(match_id);
      return match_id !== null
        ? { tx_hash: tx, match_id, player_a, player_b, spectate_url: `${ctx.config.frontendUrl}/match-1v1/${match_id}/spectate` }
        : {
            tx_hash: tx,
            match_id: null,
            player_a,
            player_b,
            spectate_url: null,
            warning: "match_id not yet indexed by Torii — query siege_get_match_state by id once it appears",
          };
    },
  );

  register(
    "siege_commit",
    {
      description:
        "Generate a salt, hash the move with Poseidon, and submit commit_reveal_1v1.commit. Returns the salt and exact move — store both for the matching siege_reveal call. Budget is auto-detected from match state.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        budget: z.number().int().positive().default(10).describe("Fallback budget; auto-detected from match state when possible"),
        ...moveShape,
      },
      requiresSigner: true,
    },
    async (args, ctx) => {
      ctx.watchMatch(args.match_id);

      // Auto-detect budget from node ownership
      let budget = args.budget;
      if (ctx.agentAddress) {
        try {
          const st = await ctx.state.matchState(args.match_id);
          const r = roleFor(st, ctx.agentAddress);
          if (r !== null) {
            const ns = await ctx.state.nodeStates(args.match_id);
            budget = budgetFor(ns, r, st.current_round);
          }
        } catch { /* fall back to args.budget */ }
      }

      const move = moveAllocationFromInput(args as unknown as MoveInput);
      const total = validateMove(move, budget);

      // Trap ownership validation. Mirror `commit_reveal_1v1.cairo:167-181` so
      // a bad trap fails fast client-side instead of reverting on-chain.
      if (move.traps.some((t) => t > 0)) {
        if (!ctx.agentAddress) {
          throw new Error("agent address not yet authenticated; cannot validate trap ownership.");
        }
        const matchState = await ctx.state.matchState(args.match_id);
        const role = roleFor(matchState, ctx.agentAddress);
        if (role === null) {
          throw new Error(
            `Address ${ctx.agentAddress} is not a player in match ${args.match_id}; cannot place traps.`,
          );
        }
        const nodes = await ctx.state.nodeStates(args.match_id);
        const myTeam = role === ROLE_A ? "TeamA" : "TeamB";
        for (let i = 0; i < 3; i++) {
          if (move.traps[i] !== 1) continue;
          const node = nodes.find((n) => n.node_index === i);
          if (!node || node.owner !== myTeam) {
            throw new Error(
              `Cannot trap node ${i}: owned by ${node?.owner ?? "Unknown"}, not your team (${myTeam}). Contract would revert with 'Cannot trap unowned node'.`,
            );
          }
        }
      }

      // Effective-allocation preview: show what Narrow Pass / Mirror will do
      // to the agent's own allocation. Best-effort; missing modifiers leave it null.
      let effective_allocation_preview: Array<{
        attack: number; defense: number;
        capped?: boolean; raw_attack?: number; raw_defense?: number;
      }> | null = null;
      try {
        const matchState = await ctx.state.matchState(args.match_id);
        const mods = await ctx.state
          .roundModifiers(args.match_id, matchState.current_round)
          .catch(() => null);
        if (mods?.gates) {
          effective_allocation_preview = [];
          for (let g = 0; g < 3; g++) {
            const raw_a = move.attack[g];
            const raw_d = move.defense[g];
            let a = raw_a;
            let d = raw_d;
            const m = mods.gates[g];
            if (m === MOD_NARROW_PASS) {
              a = min3(a);
              d = min3(d);
            }
            if (m === MOD_MIRROR) {
              [a, d] = [d, a];
            }
            const gate: {
              attack: number; defense: number;
              capped?: boolean; raw_attack?: number; raw_defense?: number;
            } = { attack: a, defense: d };
            if (m === MOD_NARROW_PASS && (raw_a > 3 || raw_d > 3)) {
              gate.capped = true;
              gate.raw_attack = raw_a;
              gate.raw_defense = raw_d;
            }
            effective_allocation_preview.push(gate);
          }
        }
      } catch {
        // Preview is informational only.
      }

      const salt = generateSalt();
      const commitmentHash = buildMoveCommitHash1v1(salt, move);

      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.commitReveal1v1, "commit", [String(args.match_id), commitmentHash]),
      ]);

      return {
        tx_hash: tx,
        salt,
        commitment_hash: commitmentHash,
        total_allocated: total,
        budget,
        effective_allocation_preview,
        move: {
          attack: move.attack,
          defense: move.defense,
          repair: move.repair,
          nodes: move.nodes,
          traps: move.traps,
          ability_id: move.abilityId,
          ability_target: move.abilityTarget,
        },
        warning: "Save salt + move. They are required for siege_reveal — any mismatch will fail on-chain.",
      };
    },
  );

  register(
    "siege_reveal",
    {
      description:
        "Submit commit_reveal_1v1.reveal using the salt and the exact move passed to siege_commit. Recomputes the commitment hash for verification.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        salt: z.string().describe("Salt returned by siege_commit"),
        budget: z.number().int().positive().default(10),
        ...moveShape,
      },
      requiresSigner: true,
    },
    async (args, ctx) => {
      ctx.watchMatch(args.match_id);
      const move = moveAllocationFromInput(args as unknown as MoveInput);
      const total = validateMove(move, args.budget);
      const commitmentHash = buildMoveCommitHash1v1(args.salt, move);

      const tx = await execute(ctx.signer!, [
        call(
          ctx.config.contracts.commitReveal1v1,
          "reveal",
          revealCalldata(args.match_id, args.salt, move),
        ),
      ]);

      return {
        tx_hash: tx,
        commitment_hash: commitmentHash,
        total_allocated: total,
        budget: args.budget,
      };
    },
  );

  register(
    "siege_resolve_round",
    {
      description:
        "Resolve the current round once both players have revealed. Uses designated-resolver election (lower address resolves; non-elected gets a waiting status — pass force=true to override). Returns a damage summary on success. On race-condition errors, returns structured status instead of raw revert.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        skip_vrf: z
          .boolean()
          .default(false)
          .describe("Skip request_random wrap (match-ending rounds)."),
        force: z
          .boolean()
          .default(false)
          .describe("Bypass designated-resolver election. Use if the designated resolver is unresponsive."),
      },
      requiresSigner: true,
    },
    async ({ match_id, skip_vrf, force }, ctx) => {
      ctx.watchMatch(match_id);
      const state = await ctx.state.matchState(match_id);
      const round = await ctx.state
        .roundMoves(match_id, state.current_round)
        .catch(() => undefined);
      const phase = phaseFor(state, round);
      if (phase !== "resolving") {
        throw new Error(
          `Round ${state.current_round} is in phase "${phase}" — both players must reveal before resolve_round can land.`,
        );
      }

      // Designated-resolver election: lower address resolves, other waits.
      if (!force && ctx.agentAddress) {
        const myAddr = BigInt(ctx.agentAddress);
        const addrA = BigInt(state.player_a);
        const addrB = BigInt(state.player_b);
        const lower = addrA < addrB ? addrA : addrB;
        if (myAddr !== lower) {
          return {
            status: "waiting_for_resolver",
            match_id,
            round: state.current_round,
            message:
              "Other player is the designated resolver (lower address). " +
              "Wait for the round to advance via channel. " +
              "If the resolver hasn't acted, call again with force=true or use siege_force_timeout.",
          };
        }
      }

      // Pre-compute damage prediction from revealed moves
      const [preNodes, mods] = await Promise.all([
        ctx.state.nodeStates(match_id),
        ctx.state.roundModifiers(match_id, state.current_round).catch(() => null),
      ]);
      let predicted: DamageBreakdown | null = null;
      if (round && mods?.gates) {
        const a_move = {
          attack: [round.a_p0, round.a_p1, round.a_p2],
          defense: [round.a_g0, round.a_g1, round.a_g2],
        };
        const b_move = {
          attack: [round.b_p0, round.b_p1, round.b_p2],
          defense: [round.b_g0, round.b_g1, round.b_g2],
        };
        const owners = postContestOwners(
          nodeOwnersForDefense(preNodes),
          [round.a_nc0, round.a_nc1, round.a_nc2],
          [round.b_nc0, round.b_nc1, round.b_nc2],
        );
        const eff = effectiveMoves(mods.gates, a_move, b_move, owners);
        if (eff) predicted = predictedDamage(mods.gates, eff.player_a, eff.player_b);
      }

      const calls = skip_vrf
        ? [call(ctx.config.contracts.resolution1v1, "resolve_round", [String(match_id)])]
        : [
            vrfRequestRandom(ctx.config.vrfAddress, ctx.config.contracts.resolution1v1),
            call(ctx.config.contracts.resolution1v1, "resolve_round", [String(match_id)]),
          ];
      try {
        const tx = await execute(ctx.signer!, calls);

        // Build resolve summary with damage prediction + post-resolve state
        const resolve_summary: Record<string, unknown> = {
          round_resolved: state.current_round,
        };
        if (predicted && round) {
          resolve_summary.damage_to_a = predicted.total_to_a;
          resolve_summary.damage_to_b = predicted.total_to_b;
          resolve_summary.per_gate_to_a = predicted.per_gate_to_a;
          resolve_summary.per_gate_to_b = predicted.per_gate_to_b;
          resolve_summary.repair_a = round.a_repair;
          resolve_summary.repair_b = round.b_repair;
          resolve_summary.note = predicted.note;
        }

        try {
          const fresh = await ctx.state.matchState(match_id);
          if (fresh.current_round > state.current_round || fresh.status === "Finished") {
            resolve_summary.vault_a_hp = fresh.vault_a_hp;
            resolve_summary.vault_b_hp = fresh.vault_b_hp;
            resolve_summary.new_round = fresh.current_round;
            resolve_summary.match_status = fresh.status;
            resolve_summary.status_reason = statusReason(fresh);
            const freshNodes = await ctx.state.nodeStates(match_id);
            resolve_summary.nodes_changed = freshNodes
              .filter((fn) => {
                const pre = preNodes.find((n) => n.node_index === fn.node_index);
                return pre && pre.owner !== fn.owner;
              })
              .map((fn) => ({
                index: fn.node_index,
                from: preNodes.find((n) => n.node_index === fn.node_index)?.owner ?? "None",
                to: fn.owner,
              }));
          } else if (predicted && round) {
            resolve_summary.vault_a_hp = Math.min(
              MAX_VAULT_HP,
              Math.max(0, state.vault_a_hp - predicted.total_to_a + round.a_repair),
            );
            resolve_summary.vault_b_hp = Math.min(
              MAX_VAULT_HP,
              Math.max(0, state.vault_b_hp - predicted.total_to_b + round.b_repair),
            );
            resolve_summary.hp_source = "predicted (Torii not yet indexed)";
          }
        } catch {
          // Post-resolve state read failed; damage prediction still available
        }

        return { tx_hash: tx, match_id, skip_vrf, resolve_summary };
      } catch (err) {
        // Extract error string, handling WASM-bindgen errors from Cartridge Controller
        const errStr = (() => {
          const e = err as { __wbg_ptr?: unknown; data?: unknown };
          if (e.__wbg_ptr) {
            try {
              const d = typeof e.data === "function"
                ? (e as { data: () => string }).data()
                : String(e.data ?? "");
              if (d) return d;
            } catch { /* ignore */ }
          }
          return safeStringifyError(err);
        })();

        // VRF "not consumed" — match-ending round, retry without VRF wrap
        if (!skip_vrf && /not consumed/i.test(errStr)) {
          const tx = await execute(ctx.signer!, [
            call(ctx.config.contracts.resolution1v1, "resolve_round", [String(match_id)]),
          ]);
          return {
            tx_hash: tx,
            match_id,
            skip_vrf: true,
            fallback: "match-ending round, retried without VRF",
          };
        }

        // Race: "Not all revealed" — check if opponent resolved
        if (/Not all revealed/i.test(errStr) || /4e6f7420616c6c2072657665616c6564/.test(errStr)) {
          const fresh = await ctx.state.matchState(match_id).catch(() => null);
          if (fresh && (fresh.current_round > state.current_round || fresh.status === "Finished")) {
            return {
              status: "resolved_by_opponent",
              match_id,
              round: state.current_round,
              new_round: fresh.current_round,
              match_status: fresh.status,
              status_reason: statusReason(fresh),
              vault_a_hp: fresh.vault_a_hp,
              vault_b_hp: fresh.vault_b_hp,
            };
          }
        }

        // Race: VRF already consumed by opponent's resolve
        if (/not fulfilled/i.test(errStr)) {
          const fresh = await ctx.state.matchState(match_id).catch(() => null);
          if (fresh && (fresh.current_round > state.current_round || fresh.status === "Finished")) {
            return {
              status: "resolved_by_opponent",
              match_id,
              round: state.current_round,
              new_round: fresh.current_round,
              match_status: fresh.status,
              status_reason: statusReason(fresh),
              vault_a_hp: fresh.vault_a_hp,
              vault_b_hp: fresh.vault_b_hp,
              message: "VRF already consumed — opponent resolved this round",
            };
          }
        }

        // Match already ended
        if (/Match not active/i.test(errStr)) {
          const fresh = await ctx.state.matchState(match_id).catch(() => null);
          return {
            status: "match_finished",
            match_id,
            match_status: fresh?.status ?? "Finished",
            status_reason: fresh ? statusReason(fresh) : null,
            vault_a_hp: fresh?.vault_a_hp ?? null,
            vault_b_hp: fresh?.vault_b_hp ?? null,
          };
        }

        throw err;
      }
    },
  );

  register(
    "siege_force_timeout",
    {
      description: "Force timeout for a 1v1 match whose commit or reveal deadline has elapsed.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
      },
      requiresSigner: true,
      annotations: {
        destructiveHint: true,
      },
    },
    async ({ match_id }, ctx) => {
      const calls = [
        vrfRequestRandom(ctx.config.vrfAddress, ctx.config.contracts.resolution1v1),
        // The VRF server keys the submitted seed to the contract called right
        // after request_random, but force_timeout reaches resolution_1v1 (the
        // consumer) only via commit_reveal_1v1 — so insert a harmless direct
        // view call to resolution_1v1 or consume reverts 'not fulfilled'.
        call(ctx.config.contracts.resolution1v1, "dojo_name", []),
        call(ctx.config.contracts.commitReveal1v1, "force_timeout", [String(match_id)]),
      ];
      try {
        const tx = await execute(ctx.signer!, calls);
        return { tx_hash: tx, match_id };
      } catch (err) {
        const raw = String((err as { data?: unknown })?.data ?? (err as Error)?.message ?? "");
        if (raw.includes("not consumed")) {
          const tx = await execute(ctx.signer!, [
            call(ctx.config.contracts.commitReveal1v1, "force_timeout", [String(match_id)]),
          ]);
          return { tx_hash: tx, match_id, skip_vrf: true };
        }
        throw err;
      }
    },
  );
}
