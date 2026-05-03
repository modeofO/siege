#!/usr/bin/env node

/**
 * Siege MCP server (autonomous-signing edition).
 *
 * Architecture:
 *   1. Redirect ALL console output to stderr (MCP owns stdout).
 *   2. Load .env from this project root (works from any CWD).
 *   3. Build an McpServer, register tools/resources/prompts via the high-level
 *      SDK API. The SDK derives draft-2020-12 JSON Schema from raw Zod shapes.
 *   4. Connect stdio transport (instant handshake).
 *   5. Bootstrap in background — open the Cartridge session. Auth URL surfaces
 *      via tool errors until the user approves.
 *   6. Torii gRPC subscriptions invalidate watched match resources.
 */

// ── stdout redirect — must come BEFORE any import that might log ──
{
  const toStderr = (...a: any[]) => process.stderr.write(a.map(String).join(" ") + "\n");
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
  const providerNoise = (msg: string) =>
    msg.includes("[provider]") || msg.includes("Failed to estimate") || msg.includes("Insufficient transaction");
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...a: any[]) => {
    if (!providerNoise(String(a[0] ?? ""))) origWarn(...a);
  };
  console.error = (...a: any[]) => {
    if (!providerNoise(String(a[0] ?? ""))) origError(...a);
  };
}

// ── Load .env from this project's root (NOT process.cwd) so the server
// works whether launched by `pnpm run dev`, `tsx`, or by a Claude Code MCP
// host that spawns us with an arbitrary CWD. ──
import { loadDotenv } from "./paths.js";
loadDotenv();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ImplementationSchema,
  InitializeResultSchema,
  LATEST_PROTOCOL_VERSION,
  ServerCapabilitiesSchema,
  type ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import type { WalletAccount } from "starknet";
import { z } from "zod";

import { loadConfig, type Config } from "./config.js";
import { getAccount } from "./session.js";
import { StateClient } from "./state.js";
import { startLiveStateBridge, type LiveStateBridge } from "./live.js";
import {
  buildMatchResourceSnapshot,
  matchStateResourceUri,
  registerMatchResources,
  type MatchResourceSnapshot,
} from "./match-resource.js";
import { registerSiegeTools, type NotReadyState, type ToolContext } from "./tools.js";

const log = (msg: string) => process.stderr.write(`[siege-mcp] ${msg}\n`);

async function main(): Promise<void> {
  log("starting...");

  const config = loadConfig();
  const state = new StateClient(config.toriiUrl);
  const agentPrompt = readFileSync(config.agentPromptPath, "utf8");

  // ── mutable bootstrap state ──
  let signer: WalletAccount | null = null;
  let agentAddress = "";
  let bootstrapDone = false;
  let bootstrapError: string | null = null;
  let bootstrapPhase = "starting";
  let authUrl: string | null = null;
  const liveBridges: LiveStateBridge[] = [];

  // Live ToolContext: getters so tool handlers see the freshest signer/address
  // as bootstrap progresses, without us having to re-register tools later.
  const ctx: ToolContext = {
    config,
    state,
    watchMatch: (matchId) => watchMatch(state, matchId),
    get signer(): WalletAccount | null {
      return signer;
    },
    get agentAddress(): string {
      return agentAddress;
    },
  };

  const getNotReady = (): NotReadyState | null => {
    if (bootstrapDone) return null;
    return { authUrl, bootstrapPhase, bootstrapError };
  };

  // ── McpServer + registrations ──
  const serverCapabilities = ServerCapabilitiesSchema.parse({
    prompts: { listChanged: true },
    resources: { listChanged: true, subscribe: true },
    tools: { listChanged: true },
    // Claude Code channel push: lets the server pump match-state diffs straight
    // into the conversation as <channel source="siege" ...> tags, since the
    // host doesn't act on standard MCP `notifications/resources/updated`.
    experimental: { "claude/channel": {} },
  }) satisfies ServerCapabilities;
  const serverInfo = ImplementationSchema.parse({
    name: "siege-mcp-server-2",
    title: "Siege MCP Server 2",
    version: "2.1.0",
  });
  InitializeResultSchema.parse({
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: serverCapabilities,
    serverInfo,
    instructions: agentPrompt,
  });

  const server = new McpServer(serverInfo, {
    capabilities: serverCapabilities,
    instructions: agentPrompt,
  });

  registerSiegeTools({ server, getCtx: () => ctx, getNotReady });
  registerAgentResources(server, agentPrompt);
  registerMatchResources({
    server,
    state,
    getWatchedMatches: () => [...watchedMatches],
    isSubscribed: (uri) => subscribedMatchResourceUris.has(uri),
    subscribe: (uri) => subscribedMatchResourceUris.add(uri),
    unsubscribe: (uri) => subscribedMatchResourceUris.delete(uri),
    watchMatch: (matchId) => watchMatch(state, matchId),
  });

  // ── transport — instant handshake ──
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("stdio transport connected — tools advertised. Bootstrapping in background.");

  void startLiveStateBridge({
    server,
    state,
    config,
    isWatched: (matchId) => watchedMatches.has(matchId),
    notifyMatchChanged,
    log,
  })
    .then((bridge) => {
      liveBridges.push(bridge);
    })
    .catch((err: unknown) => {
      log(`Torii gRPC subscription unavailable; live match updates will not be pushed: ${errorMessage(err)}`);
    });

  // ── background bootstrap ──
  void (async () => {
    try {
      bootstrapPhase = "authenticating";
      log(`world: ${config.manifest.world.address}`);
      log(`actions_1v1: ${config.contracts.actions1v1}`);

      const account = await getAccount(
        {
          rpcUrl: config.rpcUrl,
          chainId: config.chainId,
          contracts: config.contracts,
          vrfAddress: config.vrfAddress,
          basePath: config.sessionDir,
        },
        {
          onAuthUrl: (url) => {
            authUrl = url;
            log(`auth required — open: ${url}`);
          },
        },
      );

      signer = account;
      agentAddress = account.address;
      authUrl = null;
      bootstrapDone = true;
      bootstrapPhase = "ready";
      log(`session ready — agent address: ${agentAddress}`);
    } catch (err: any) {
      bootstrapError = err?.message ?? String(err);
      log(`bootstrap failed: ${bootstrapError}`);
    }
  })();
}

// ── resources + prompts (agent-prompt.md surfaced two ways) ─────────

function registerAgentResources(server: McpServer, agentPrompt: string): void {
  server.registerResource(
    "siege-agent-prompt",
    "siege://agent-prompt",
    {
      title: "Siege 1v1 Agent Prompt",
      description: "Game rules + tool flow for an autonomous Siege player.",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "siege://agent-prompt",
          mimeType: "text/markdown",
          text: agentPrompt,
        },
      ],
    }),
  );

  server.registerPrompt(
    "siege_play_round",
    {
      title: "Play a Siege round",
      description: "Use the Siege MCP to inspect a 1v1 match, choose a move, commit, and reveal.",
      argsSchema: {
        match_id: z.string().describe("1v1 match id"),
      },
    },
    async ({ match_id }) => ({
      description: "Play one Siege 1v1 round.",
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `${agentPrompt}\n\n` +
              `Current task: play match ${match_id}. Start with siege_whoami, then ` +
              `siege_get_match_state and siege_get_my_status. Decide a move within budget, ` +
              `then siege_commit. Once both players have committed, siege_reveal with the ` +
              `same salt and move you got back from siege_commit.`,
          },
        },
      ],
    }),
  );
}

// ── watched match resource invalidation ─

const watchedMatches = new Set<number>();
const subscribedMatchResourceUris = new Set<string>();
const matchResourceSnapshots = new Map<number, string>();

export async function notifyMatchChanged(server: McpServer, state: StateClient, matchId: number): Promise<void> {
  const { changed, snapshot } = await updateMatchSnapshot(state, matchId);
  if (!changed) return;

  const uri = matchStateResourceUri(matchId);
  if (subscribedMatchResourceUris.has(uri)) {
    await server.server.sendResourceUpdated({ uri });
  }

  await pushChannelEvent(server, snapshot).catch((err: unknown) => {
    log(`channel notification failed for match ${matchId}: ${errorMessage(err)}`);
  });
}

/** Exposed so tools/resources can opt a match into live notifications. */
export function watchMatch(state: StateClient, matchId: number): void {
  if (watchedMatches.has(matchId)) return;
  watchedMatches.add(matchId);
  void updateMatchSnapshot(state, matchId).catch((err: unknown) => {
    log(`failed to seed match ${matchId} snapshot: ${errorMessage(err)}`);
  });
}

async function updateMatchSnapshot(
  state: StateClient,
  matchId: number,
): Promise<{ changed: boolean; snapshot: MatchResourceSnapshot }> {
  const snapshot = await buildMatchResourceSnapshot(state, matchId);
  const next = JSON.stringify({ ...snapshot, updated_at: undefined });
  const prev = matchResourceSnapshots.get(matchId);
  matchResourceSnapshots.set(matchId, next);
  return { changed: prev !== undefined && prev !== next, snapshot };
}

async function pushChannelEvent(server: McpServer, snapshot: MatchResourceSnapshot): Promise<void> {
  const content =
    `match ${snapshot.match_id} round ${snapshot.current_round} ${snapshot.phase}: ` +
    `${snapshot.commits}/2 committed, ${snapshot.reveals}/2 revealed — ` +
    `HP ${snapshot.vault_a_hp}/${snapshot.vault_b_hp}`;
  // Cast: the SDK's notification type union doesn't statically know about the
  // `notifications/claude/channel` extension method, but the underlying
  // Protocol.notification accepts any { method, params } and the server's
  // assertNotificationCapability falls through for unknown methods.
  await (server.server.notification as (n: unknown) => Promise<void>)({
    method: "notifications/claude/channel",
    params: {
      content,
      meta: {
        match_id: String(snapshot.match_id),
        phase: snapshot.phase,
        round: String(snapshot.current_round),
        commits: String(snapshot.commits),
        reveals: String(snapshot.reveals),
        hp_a: String(snapshot.vault_a_hp),
        hp_b: String(snapshot.vault_b_hp),
        status: snapshot.status,
      },
    },
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

main().catch((err) => {
  process.stderr.write(`[siege-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
