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
import { addAddressPadding, CallData, type Call, type WalletAccount } from "starknet";
import { z } from "zod";

import type { Config } from "./config.js";
import type { StateClient } from "./state.js";
import { buildMoveCommitHash1v1, generateSalt, revealCalldata } from "./hash.js";
import { moveAllocationFromInput, moveShape, validateMove, type MoveInput } from "./move.js";
import { call, extractTxError, vrfRequestRandom } from "./tx.js";

const ROLE_A = 0;
const ROLE_B = 1;

export interface ToolContext {
  config: Config;
  state: StateClient;
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

function budgetFor(nodes: { owner: string }[], role: number): number {
  const team = role === ROLE_A ? "TeamA" : "TeamB";
  return 10 + nodes.filter((n) => n.owner === team).length;
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

async function execute(signer: WalletAccount, calls: Call[]): Promise<string> {
  // The node SessionProvider's WalletAccount.execute tries executeFromOutside
  // (paymaster path) then silently falls back to direct execute, swallowing
  // the paymaster error. Call executeFromOutside directly so paymaster
  // failures surface and we never accidentally pay fees from the agent.
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
  const res = await controller.executeFromOutside(normalized);
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
      const state = await ctx.state.matchState(match_id);
      const nodes = await ctx.state.nodeStates(match_id);
      const round = await ctx.state.roundMoves(match_id, state.current_round).catch(() => undefined);
      const modifiers = await ctx.state
        .roundModifiers(match_id, state.current_round)
        .then((m) => m.gates)
        .catch(() => null);

      return {
        match_id,
        status: state.status,
        phase: phaseFor(state, round),
        current_round: state.current_round,
        vault_a_hp: state.vault_a_hp,
        vault_b_hp: state.vault_b_hp,
        player_a: { address: state.player_a, budget: budgetFor(nodes, ROLE_A) },
        player_b: { address: state.player_b, budget: budgetFor(nodes, ROLE_B) },
        commits: round?.commit_count ?? 0,
        reveals: round?.reveal_count ?? 0,
        modifiers,
        nodes: nodes.map((n) => ({ index: n.node_index, owner: n.owner })),
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
      const state = await ctx.state.matchState(match_id);
      const r = round ?? state.current_round;
      const moves = await ctx.state.roundMoves(match_id, r);
      const modifiers = await ctx.state.roundModifiers(match_id, r).catch(() => null);
      const traps = await ctx.state.roundTraps(match_id, r).catch(() => null);
      return {
        match_id,
        round: r,
        commits: moves.commit_count,
        reveals: moves.reveal_count,
        commit_deadline: moves.commit_deadline,
        reveal_deadline: moves.reveal_deadline,
        modifiers: modifiers?.gates ?? null,
        player_a: {
          attack: [moves.a_p0, moves.a_p1, moves.a_p2],
          defense: [moves.a_g0, moves.a_g1, moves.a_g2],
          repair: moves.a_repair,
          nodes: [moves.a_nc0, moves.a_nc1, moves.a_nc2],
          traps: traps?.player_a ?? null,
          ability: { id: moves.a_ability_id, target: moves.a_ability_target },
        },
        player_b: {
          attack: [moves.b_p0, moves.b_p1, moves.b_p2],
          defense: [moves.b_g0, moves.b_g1, moves.b_g2],
          repair: moves.b_repair,
          nodes: [moves.b_nc0, moves.b_nc1, moves.b_nc2],
          traps: traps?.player_b ?? null,
          ability: { id: moves.b_ability_id, target: moves.b_ability_target },
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

      return {
        match_id,
        player_address: address,
        role,
        role_name: roleName(role),
        current_round: state.current_round,
        phase: phaseFor(state, round),
        committed,
        revealed,
        budget: budgetFor(nodes, role),
      };
    },
  );

  // ----- writes -----

  register(
    "siege_create_match",
    {
      description:
        "Open a 1v1 match between two addresses. Submits a multicall: vRNG request_random + actions_1v1.create_match_1v1.",
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
      return { tx_hash: tx, player_a, player_b };
    },
  );

  register(
    "siege_commit",
    {
      description:
        "Generate a salt, hash the move with Poseidon, and submit commit_reveal_1v1.commit. Returns the salt and exact move — store both for the matching siege_reveal call.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
        budget: z.number().int().positive().default(10).describe("Validate against this budget; default 10"),
        ...moveShape,
      },
      requiresSigner: true,
    },
    async (args, ctx) => {
      const move = moveAllocationFromInput(args as unknown as MoveInput);
      const total = validateMove(move, args.budget);
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
        budget: args.budget,
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
      const move = moveAllocationFromInput(args as unknown as MoveInput);
      const total = validateMove(move, args.budget);
      const commitmentHash = buildMoveCommitHash1v1(args.salt, move);

      const tx = await execute(ctx.signer!, [
        vrfRequestRandom(ctx.config.vrfAddress, ctx.config.contracts.commitReveal1v1),
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
        "Resolve the current round once both players have revealed. Submits resolution_1v1.resolve_round.",
      inputSchema: {
        match_id: z.number().int().nonnegative(),
      },
      requiresSigner: true,
    },
    async ({ match_id }, ctx) => {
      const tx = await execute(ctx.signer!, [
        vrfRequestRandom(ctx.config.vrfAddress, ctx.config.contracts.resolution1v1),
        call(ctx.config.contracts.resolution1v1, "resolve_round", [String(match_id)]),
      ]);
      return { tx_hash: tx, match_id };
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
      const tx = await execute(ctx.signer!, [
        call(ctx.config.contracts.commitReveal1v1, "force_timeout", [String(match_id)]),
      ]);
      return { tx_hash: tx, match_id };
    },
  );
}
