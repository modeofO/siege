#!/usr/bin/env node

/**
 * Siege MCP server (autonomous-signing edition).
 *
 * Architecture:
 *   1. Redirect ALL console output to stderr (MCP owns stdout).
 *   2. Register tools and connect stdio transport (instant handshake).
 *   3. Bootstrap in background — load config, open Cartridge session.
 *      The auth URL surfaces through tool errors until the user approves.
 *   4. Optional polling sends notifications/resources/updated when watched
 *      matches advance phase.
 */

// ── stdout redirect — must come BEFORE any import that might log ──
{
  const toStderr = (...a: any[]) => process.stderr.write(a.map(String).join(" ") + "\n");
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
  // Keep warn/error on stderr but filter known starknet.js noise.
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
// host that spawns us with an arbitrary CWD. Must run before any module
// that reads process.env. ──
import { loadDotenv } from "./paths.js";
loadDotenv();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import type { WalletAccount } from "starknet";

import { loadConfig, type Config } from "./config.js";
import { getAccount } from "./session.js";
import { StateClient } from "./state.js";
import { registerTools, type NotReadyState, type ToolContext } from "./tools.js";

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

  const ctx: ToolContext = {
    config,
    state,
    get signer() { return signer; },
    get agentAddress() { return agentAddress; },
  } as unknown as ToolContext;
  // ^ The getters keep ctx live as bootstrap fills in fields.

  const getNotReady = (): NotReadyState | null => {
    if (bootstrapDone) return null;
    return { authUrl, bootstrapPhase, bootstrapError };
  };

  // ── server + tools ──
  const server = new Server(
    { name: "siege-mcp-server-2", version: "2.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  registerTools(server, () => ctx, getNotReady);
  registerResourcesAndPrompts(server, agentPrompt);

  // ── transport — instant handshake ──
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("stdio transport connected — tools advertised. Bootstrapping in background.");

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

      startPolling(server, state, config);
    } catch (err: any) {
      bootstrapError = err?.message ?? String(err);
      log(`bootstrap failed: ${bootstrapError}`);
    }
  })();
}

// ── resources + prompts (agent-prompt.md surfaced two ways) ─────────

function registerResourcesAndPrompts(server: Server, agentPrompt: string): void {
  const resources = [
    {
      uri: "siege://agent-prompt",
      name: "siege-agent-prompt",
      title: "Siege 1v1 Agent Prompt",
      description: "Game rules + tool flow for an autonomous Siege player.",
      mimeType: "text/markdown",
    },
  ];

  const prompts = [
    {
      name: "siege_play_round",
      title: "Play a Siege round",
      description: "Use the Siege MCP to inspect a 1v1 match, choose a move, commit, and reveal.",
      arguments: [{ name: "match_id", description: "1v1 match id", required: true }],
    },
  ];

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri !== "siege://agent-prompt") {
      throw new Error(`Unknown resource: ${req.params.uri}`);
    }
    return {
      contents: [
        { uri: "siege://agent-prompt", mimeType: "text/markdown", text: agentPrompt },
      ],
    };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    if (req.params.name !== "siege_play_round") {
      throw new Error(`Unknown prompt: ${req.params.name}`);
    }
    const matchId = req.params.arguments?.match_id ?? "<match_id>";
    return {
      description: "Play one Siege 1v1 round.",
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `${agentPrompt}\n\n` +
              `Current task: play match ${matchId}. Start with siege_whoami, then ` +
              `siege_get_match_state and siege_get_my_status. Decide a move within budget, ` +
              `then siege_commit. Once both players have committed, siege_reveal with the ` +
              `same salt and move you got back from siege_commit.`,
          },
        },
      ],
    };
  });
}

// ── polling — same shape as v1, hits the active StateClient ─────────

interface PollSnapshot {
  currentRound: number;
  commitCount: number;
  revealCount: number;
  status: string;
}

const watchedMatches = new Set<number>();
const pollSnapshots = new Map<number, PollSnapshot>();

function startPolling(server: Server, state: StateClient, config: Config): void {
  // Watched-match registry is populated by tool calls; nothing to do until the
  // first state read. We simply tick on the configured interval.
  setInterval(() => {
    for (const matchId of watchedMatches) {
      void pollMatch(server, state, matchId).catch(() => undefined);
    }
  }, config.pollIntervalMs);
}

async function pollMatch(server: Server, state: StateClient, matchId: number): Promise<void> {
  const ms = await state.matchState(matchId);
  const round = await state.roundMoves(matchId, ms.current_round).catch(() => undefined);

  const next: PollSnapshot = {
    currentRound: ms.current_round,
    commitCount: round?.commit_count ?? 0,
    revealCount: round?.reveal_count ?? 0,
    status: ms.status,
  };
  const prev = pollSnapshots.get(matchId);

  if (prev) {
    const notify = async (suffix: string) => {
      await server.notification({
        method: "notifications/resources/updated",
        params: { uri: `siege://match-1v1/${matchId}/${suffix}` },
      });
    };

    if (next.currentRound > prev.currentRound) await notify("round_started");
    if (next.commitCount === 2 && prev.commitCount < 2) await notify("all_committed");
    if (next.revealCount === 2 && prev.revealCount < 2) await notify("ready_to_resolve");
    if (next.status === "Finished" && prev.status !== "Finished") await notify("match_ended");
  }

  pollSnapshots.set(matchId, next);
}

/** Exposed so tools can opt a match into polling. Currently unused — read tools
 *  could call this if you want notifications. */
export function watchMatch(matchId: number): void {
  watchedMatches.add(matchId);
}

main().catch((err) => {
  process.stderr.write(`[siege-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
