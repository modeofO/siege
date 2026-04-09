import { useEffect, useState } from "react";

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

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

async function toriiQuery<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.errors) return null;
    return (data?.data as T) || null;
  } catch {
    return null;
  }
}

export function usePlayerReputation(playerAddress: string | null): PlayerReputationData | null {
  const [data, setData] = useState<PlayerReputationData | null>(null);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoPlayerReputationModels: GraphEdges<{
          total_losses: string;
          current_streak: string;
          best_streak: string;
          bracket: string;
        }>;
        siegeDojoPlayerKingdomModels: GraphEdges<{
          total_wins: string;
        }>;
      }>(`
        query {
          siegeDojoPlayerReputationModels(where: { player: "${playerAddress}" }) {
            edges { node { total_losses current_streak best_streak bracket } }
          }
          siegeDojoPlayerKingdomModels(where: { player: "${playerAddress}" }) {
            edges { node { total_wins } }
          }
        }
      `);

      const rep = result?.siegeDojoPlayerReputationModels?.edges?.[0]?.node;
      const kingdom = result?.siegeDojoPlayerKingdomModels?.edges?.[0]?.node;

      const totalWins = toNum(kingdom?.total_wins);
      const totalLosses = toNum(rep?.total_losses);
      const totalMatches = totalWins + totalLosses;

      setData({
        totalWins,
        totalLosses,
        totalMatches,
        winRate: totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0,
        currentStreak: toNum(rep?.current_streak),
        bestStreak: toNum(rep?.best_streak),
        bracket: toNum(rep?.bracket),
      });
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return data;
}

export function useMatchRecords(playerAddress: string | null): MatchRecordData[] {
  const [records, setRecords] = useState<MatchRecordData[]>([]);

  useEffect(() => {
    if (!playerAddress) return;

    const doFetch = async () => {
      const result = await toriiQuery<{
        siegeDojoMatchRecordModels: GraphEdges<{
          opponent: string;
          wins: string;
          losses: string;
          last_match_id: string;
        }>;
      }>(`
        query {
          siegeDojoMatchRecordModels(where: { player: "${playerAddress}" }) {
            edges { node { opponent wins losses last_match_id } }
          }
        }
      `);

      const entries = (result?.siegeDojoMatchRecordModels?.edges || []).map((e) => {
        const wins = toNum(e.node.wins);
        const losses = toNum(e.node.losses);
        const totalMatches = wins + losses;
        const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
        return {
          opponent: e.node.opponent,
          wins,
          losses,
          totalMatches,
          lastMatchId: toNum(e.node.last_match_id),
          isRival: totalMatches >= 5,
          isBloodRival: totalMatches >= 10 && winRate >= 35 && winRate <= 65,
        };
      });

      entries.sort((a, b) => b.totalMatches - a.totalMatches);
      setRecords(entries);
    };

    const t = setTimeout(() => { void doFetch(); }, 0);
    const i = setInterval(() => { void doFetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress]);

  return records;
}

export function bracketMismatchWarning(myBracket: number, opponentBracket: number): string | null {
  const diff = Math.abs(myBracket - opponentBracket);
  if (diff < 2) return null;
  const direction = opponentBracket > myBracket ? "above" : "below";
  return `This opponent is ${diff} brackets ${direction} you`;
}
