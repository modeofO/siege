import { useMemo } from "react";
import { useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import {
  ModelsMapping,
  type SchemaType,
  type PlayerReputation,
  type PlayerKingdom as PlayerKingdomModel,
  type MatchRecord,
} from "@/bindings/typescript/models.gen";

import { safeNum, flatModels } from "@/lib/modelUtils";
import { useVisibilityReseed } from "@/lib/useReseed";

export const BRACKET_NAMES = ["Newcomer", "Developing", "Experienced", "Veteran", "Elite"] as const;
export type BracketName = (typeof BRACKET_NAMES)[number];

export function bracketName(bracket: number): BracketName {
  return BRACKET_NAMES[bracket] ?? "Newcomer";
}

export interface PlayerReputationData {
  totalWins: number;
  totalLosses: number;
  totalMatches: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  bracket: number;
}

export interface MatchRecordData {
  opponent: string;
  wins: number;
  losses: number;
  totalMatches: number;
  lastMatchId: number;
  isRival: boolean;
  isBloodRival: boolean;
}

// Static queries — never keyed by the player address. See playerKingdomQuery
// in worldState.ts for why: an address-keyed query changes when the wallet
// connects, which routes the SDK through its broken updateEntitySubscription
// path ("expected instance of V") and the new address's data never loads.
// Selectors filter by address client-side instead.
function reputationQuery() {
  return new ToriiQueryBuilder<SchemaType>()
    .withClause(
      KeysClause<SchemaType>(
        [ModelsMapping.PlayerReputation, ModelsMapping.PlayerKingdom],
        [undefined],
        "VariableLen",
      ).build(),
    )
    .withEntityModels([ModelsMapping.PlayerReputation, ModelsMapping.PlayerKingdom])
    .withLimit(10_000)
    .includeHashedKeys();
}

function matchRecordsQuery() {
  return new ToriiQueryBuilder<SchemaType>()
    .withClause(KeysClause<SchemaType>([ModelsMapping.MatchRecord], [undefined], "VariableLen").build())
    .withEntityModels([ModelsMapping.MatchRecord])
    .withLimit(10_000)
    .includeHashedKeys();
}

function reputationReseedQueries() {
  return [reputationQuery()];
}

function matchRecordsReseedQueries() {
  return [matchRecordsQuery()];
}

export function usePlayerReputation(playerAddress: string | null): PlayerReputationData | null {
  useEntityQuery(reputationQuery());
  useVisibilityReseed(reputationReseedQueries);

  const reputations = useModels(ModelsMapping.PlayerReputation);
  const kingdoms = useModels(ModelsMapping.PlayerKingdom);

  return useMemo<PlayerReputationData | null>(() => {
    if (!playerAddress) return null;
    const addr = playerAddress.toLowerCase();
    const rep = flatModels<PlayerReputation>(reputations).find((x) => String(x.player).toLowerCase() === addr);
    const kingdom = flatModels<PlayerKingdomModel>(kingdoms).find((x) => String(x.player).toLowerCase() === addr);

    const totalWins = safeNum(kingdom?.total_wins);
    const totalLosses = safeNum(rep?.total_losses);
    const totalMatches = totalWins + totalLosses;

    return {
      totalWins,
      totalLosses,
      totalMatches,
      winRate: totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0,
      currentStreak: safeNum(rep?.current_streak),
      bestStreak: safeNum(rep?.best_streak),
      bracket: safeNum(rep?.bracket),
    };
  }, [playerAddress, reputations, kingdoms]);
}

export function useMatchRecords(playerAddress: string | null): MatchRecordData[] {
  useEntityQuery(matchRecordsQuery());
  useVisibilityReseed(matchRecordsReseedQueries);

  const matchRecords = useModels(ModelsMapping.MatchRecord);

  return useMemo<MatchRecordData[]>(() => {
    if (!playerAddress) return [];
    const addr = playerAddress.toLowerCase();
    const entries = flatModels<MatchRecord>(matchRecords)
      .filter((r) => String(r.player).toLowerCase() === addr)
      .map((r) => {
        const wins = safeNum(r.wins);
        const losses = safeNum(r.losses);
        const totalMatches = wins + losses;
        const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
        return {
          opponent: String(r.opponent),
          wins,
          losses,
          totalMatches,
          lastMatchId: safeNum(r.last_match_id),
          isRival: totalMatches >= 5,
          isBloodRival: totalMatches >= 10 && winRate >= 35 && winRate <= 65,
        };
      });
    entries.sort((a, b) => b.totalMatches - a.totalMatches);
    return entries;
  }, [playerAddress, matchRecords]);
}

export function bracketMismatchWarning(myBracket: number, opponentBracket: number): string | null {
  const diff = Math.abs(myBracket - opponentBracket);
  if (diff < 2) return null;
  const direction = opponentBracket > myBracket ? "above" : "below";
  return `This opponent is ${diff} brackets ${direction} you`;
}
