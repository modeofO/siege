import type { Call } from "starknet";

import type { Config } from "./config.js";
import { call, vrfRequestRandom } from "./tx.js";

function feltArray(values: number[]): string[] {
  return [String(values.length), ...values.map(String)];
}

export function buildCreateStakedMatchCalls(config: Config, opponent: string, abilities: number[]): Call[] {
  return [
    vrfRequestRandom(config.vrfAddress, config.contracts.actions1v1),
    call(config.contracts.worldSystem, "create_staked_match", [
      opponent,
      ...feltArray(abilities),
    ]),
  ];
}

export function buildJoinStakedMatchCalls(config: Config, matchId: number, abilities: number[]): Call[] {
  return [
    call(config.contracts.worldSystem, "join_staked_match", [
      String(matchId),
      ...feltArray(abilities),
    ]),
  ];
}
