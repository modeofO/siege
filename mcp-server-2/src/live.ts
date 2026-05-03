import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Config } from "./config.js";
import type { StateClient } from "./state.js";
import {
  createToriiClient,
  subscribeEntities,
  type Clause,
  type Entity,
  type Model,
  type Subscription,
  type ToriiClientInstance,
  type Ty,
} from "./torii.js";

export const SIEGE_LIVE_MODELS = [
  "siege_dojo-MatchState1v1",
  "siege_dojo-RoundMoves1v1",
  "siege_dojo-Commitment",
  "siege_dojo-NodeState",
  "siege_dojo-RoundModifiers1v1",
  "siege_dojo-RoundTraps1v1",
  "siege_dojo-MatchAbilities1v1",
  "siege_dojo-MatchStakes1v1",
] as const;

export interface LiveStateBridge {
  client: ToriiClientInstance;
  subscription: Subscription;
}

interface StartLiveStateBridgeArgs {
  server: McpServer;
  state: StateClient;
  config: Config;
  isWatched: (matchId: number) => boolean;
  notifyMatchChanged: (server: McpServer, state: StateClient, matchId: number) => Promise<void>;
  log: (message: string) => void;
}

export async function startLiveStateBridge({
  server,
  state,
  config,
  isWatched,
  notifyMatchChanged,
  log,
}: StartLiveStateBridgeArgs): Promise<LiveStateBridge> {
  const worldAddress = config.manifest.world.address;
  const client = await createToriiClient(config.toriiUrl, worldAddress);
  const clause: Clause = {
    Keys: {
      keys: [],
      pattern_matching: "VariableLen",
      models: [...SIEGE_LIVE_MODELS],
    },
  };

  log(`Torii gRPC subscribing to models: ${SIEGE_LIVE_MODELS.join(", ")}`);

  let loggedPayloadShape = false;
  const subscription = await subscribeEntities(
    client,
    worldAddress,
    clause,
    (entity) => {
      for (const matchId of matchIdsFromEntity(entity)) {
        if (!isWatched(matchId)) continue;
        void notifyMatchChanged(server, state, matchId).catch((err: unknown) => {
          log(`live notification failed for match ${matchId}: ${errorMessage(err)}`);
        });
      }
    },
    (payload) => {
      if (loggedPayloadShape || process.env.TORII_DEBUG_PAYLOADS !== "1") return;
      loggedPayloadShape = true;
      log(`Torii gRPC first entity payload shape: ${payloadShape(payload)}`);
    },
  );

  log(`Torii gRPC subscription active for ${SIEGE_LIVE_MODELS.length} models`);
  return { client, subscription };
}

function matchIdsFromEntity(entity: Entity): number[] {
  const ids = new Set<number>();
  for (const model of Object.values(entity.models ?? {})) {
    const matchId = tyToSafeInteger((model as Model).match_id);
    if (matchId !== null) ids.add(matchId);
  }
  return [...ids];
}

function tyToSafeInteger(value: Ty | unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = value.startsWith("0x") ? BigInt(value) : BigInt(value || "0");
    return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : null;
  }
  if (typeof value !== "object") return null;

  if ("value" in value) {
    return tyToSafeInteger((value as { value: unknown }).value);
  }

  for (const candidate of Object.values(value as Record<string, unknown>)) {
    if (candidate === undefined) continue;
    const parsed = tyToSafeInteger(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function payloadShape(payload: unknown): string {
  if (Array.isArray(payload)) return `array(${payload.length})`;
  if (payload === null) return "null";
  if (typeof payload !== "object") return typeof payload;

  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record).slice(0, 8);
  const data = record.data;
  if (Array.isArray(data)) return `object{${keys.join(",")}} data=array(${data.length})`;
  if (data && typeof data === "object") return `object{${keys.join(",")}} data=object{${Object.keys(data).slice(0, 8).join(",")}}`;
  return `object{${keys.join(",")}}`;
}
