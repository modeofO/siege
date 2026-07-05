"use client";

import { useEffect, useState } from "react";
import { toriiSql, toNum, sqlAddr, sqlU64 } from "@/lib/toriiSql";
import type { PlayerMove } from "@/lib/resolution1v1";
import { replayMatch } from "./replay";
import { buildProfile, type OpponentProfile } from "./profile";
import type { HistoricalRound, ReplayedMatch, ReplayedRound } from "./types";

/** Cap on historical finished matches pulled per opponent (surfaced as "last N matches" in the UI). */
export const MAX_HISTORY_MATCHES = 25;

export interface OpponentIntel {
  profile: OpponentProfile | null; // null while loading or no history
  h2h: { wins: number; losses: number } | null; // from MY perspective vs them
  currentRounds: ReplayedRound[]; // opponent's revealed rounds THIS match (for bluff)
  loading: boolean;
}

// Torii rows come back as loosely-typed records; column access is dynamic
// (mirrors the Record-view approach in gameState1v1's useRevealedMoves1v1).
type Row = Record<string, unknown>;

/** BigInt-normalized decimal string, so zero-padded-hex Torii ids compare cleanly. */
function normId(v: unknown): string {
  return BigInt(v as string | number).toString();
}

/**
 * Map a RoundMoves1v1 row (+ optional RoundTraps1v1 row) into a PlayerMove for
 * one side. Mirrors the column->field mapping in `useRevealedMoves1v1`.
 * Exported for unit testing the pure SQL-row -> move mapping.
 */
export function moveFromRow(row: Row, side: "a" | "b", trapRow: Row | undefined): PlayerMove {
  const f = (c: string): number => toNum(row[`${side}_${c}`]);
  const trap = (c: string): number => (trapRow ? toNum(trapRow[`${side}_${c}`]) : 0);
  return {
    attack: [f("p0"), f("p1"), f("p2")],
    defense: [f("g0"), f("g1"), f("g2")],
    repair: f("repair"),
    nodeContest: [f("nc0"), f("nc1"), f("nc2")],
    traps: [trap("trap0"), trap("trap1"), trap("trap2")],
    abilityId: f("ability_id"),
    abilityTarget: f("ability_target"),
  };
}

/**
 * Assemble one match's fully-revealed rounds in ascending order from the batched
 * move/trap/modifier row sets. Rounds with `reveal_count < 2` are excluded (the
 * replay engine trusts callers to pass only revealed rounds). Rounds missing a
 * modifiers row default to [0,0,0]. Exported for unit testing.
 */
export function historicalRoundsFor(
  matchIdDec: string,
  moves: Row[],
  traps: Row[],
  mods: Row[],
): HistoricalRound[] {
  const trapByRound = new Map<number, Row>();
  for (const t of traps) {
    if (normId(t.match_id) === matchIdDec) trapByRound.set(toNum(t.round), t);
  }
  const modByRound = new Map<number, Row>();
  for (const m of mods) {
    if (normId(m.match_id) === matchIdDec) modByRound.set(toNum(m.round), m);
  }

  const rounds: HistoricalRound[] = [];
  for (const rm of moves) {
    if (normId(rm.match_id) !== matchIdDec) continue;
    if (toNum(rm.reveal_count) < 2) continue;
    const round = toNum(rm.round);
    const trapRow = trapByRound.get(round);
    const modRow = modByRound.get(round);
    rounds.push({
      round,
      moveA: moveFromRow(rm, "a", trapRow),
      moveB: moveFromRow(rm, "b", trapRow),
      modifiers: modRow
        ? [toNum(modRow.gate_0), toNum(modRow.gate_1), toNum(modRow.gate_2)]
        : [0, 0, 0],
    });
  }
  rounds.sort((a, b) => a.round - b.round);
  return rounds;
}

// --- Torii fetches --------------------------------------------------------

async function fetchFinishedMatches(addr: string): Promise<Row[]> {
  const a = sqlAddr(addr);
  return toriiSql<Row>(
    `SELECT match_id, player_a, player_b, status FROM "siege_dojo-MatchState1v1" ` +
      `WHERE (player_a = ${a} OR player_b = ${a}) AND status = 'Finished' ` +
      `ORDER BY match_id DESC LIMIT ${MAX_HISTORY_MATCHES}`,
  );
}

async function fetchRoundData(
  matchIdsDec: string[],
): Promise<{ moves: Row[]; traps: Row[]; mods: Row[] }> {
  if (matchIdsDec.length === 0) return { moves: [], traps: [], mods: [] };
  const inList = matchIdsDec.map((id) => sqlU64(id)).join(", ");
  const [moves, traps, mods] = await Promise.all([
    toriiSql<Row>(`SELECT * FROM "siege_dojo-RoundMoves1v1" WHERE match_id IN (${inList})`),
    toriiSql<Row>(`SELECT * FROM "siege_dojo-RoundTraps1v1" WHERE match_id IN (${inList})`),
    toriiSql<Row>(`SELECT * FROM "siege_dojo-RoundModifiers1v1" WHERE match_id IN (${inList})`),
  ]);
  return { moves, traps, mods };
}

async function fetchH2H(
  myAddr: string,
  opponentAddr: string,
): Promise<{ wins: number; losses: number } | null> {
  const rows = await toriiSql<Row>(
    `SELECT wins, losses FROM "siege_dojo-MatchRecord" ` +
      `WHERE player = ${sqlAddr(myAddr)} AND opponent = ${sqlAddr(opponentAddr)}`,
  );
  if (rows.length === 0) return null;
  return { wins: toNum(rows[0].wins), losses: toNum(rows[0].losses) };
}

// --- Profile cache --------------------------------------------------------
// Keyed by normalized opponent address; the joined finished-match id set is the
// invalidation key, so the (expensive) replay+aggregation only reruns when the
// opponent's finished-match set actually changes.
interface CacheEntry {
  matchIds: string;
  profile: OpponentProfile;
}
const profileCache = new Map<string, CacheEntry>();

/** Test hook: clear the module-level profile cache. */
export function _clearIntelCache(): void {
  profileCache.clear();
}

async function computeProfile(
  opponentAddr: string,
  currentMatchIdDec: string | null,
): Promise<OpponentProfile | null> {
  const matchRows = await fetchFinishedMatches(opponentAddr);
  // Exclude the current match from the profile (it feeds currentRounds instead);
  // an Active match won't be Finished, so this is normally a safety no-op.
  const finishedIds = matchRows
    .map((ms) => normId(ms.match_id))
    .filter((id) => id !== currentMatchIdDec);
  if (finishedIds.length === 0) return null;

  const sig = finishedIds.slice().sort().join(",");
  const oppKey = BigInt(opponentAddr).toString();
  const cached = profileCache.get(oppKey);
  if (cached && cached.matchIds === sig) return cached.profile;

  const idSet = new Set(finishedIds);
  const oppBig = BigInt(opponentAddr);
  const { moves, traps, mods } = await fetchRoundData(finishedIds);

  const replayed: ReplayedMatch[] = matchRows
    .filter((ms) => idSet.has(normId(ms.match_id)))
    .map((ms) => {
      const idDec = normId(ms.match_id);
      const opponentIsA = BigInt(ms.player_a as string) === oppBig;
      return replayMatch(idDec, historicalRoundsFor(idDec, moves, traps, mods), opponentIsA);
    });

  const profile = buildProfile(replayed);
  profileCache.set(oppKey, { matchIds: sig, profile });
  return profile;
}

async function fetchCurrentRounds(
  currentMatchId: string,
  opponentAddr: string,
): Promise<ReplayedRound[]> {
  const idDec = normId(currentMatchId);
  const [msRows, roundData] = await Promise.all([
    toriiSql<Row>(
      `SELECT match_id, player_a, player_b FROM "siege_dojo-MatchState1v1" ` +
        `WHERE match_id = ${sqlU64(currentMatchId)}`,
    ),
    fetchRoundData([idDec]),
  ]);
  if (msRows.length === 0) return [];
  const opponentIsA = BigInt(msRows[0].player_a as string) === BigInt(opponentAddr);
  const rounds = historicalRoundsFor(idDec, roundData.moves, roundData.traps, roundData.mods);
  return replayMatch(idDec, rounds, opponentIsA).rounds;
}

async function fetchIntel(
  opponentAddr: string,
  myAddr: string | null,
  currentMatchId: string | null,
): Promise<Omit<OpponentIntel, "loading">> {
  const currentMatchIdDec = currentMatchId ? normId(currentMatchId) : null;
  const [profile, h2h, currentRounds] = await Promise.all([
    computeProfile(opponentAddr, currentMatchIdDec),
    myAddr ? fetchH2H(myAddr, opponentAddr) : Promise.resolve(null),
    currentMatchId ? fetchCurrentRounds(currentMatchId, opponentAddr) : Promise.resolve([]),
  ]);
  return { profile, h2h, currentRounds };
}

/**
 * Fetches an opponent's cross-match profile, head-to-head record, and this
 * match's revealed rounds. Follows the derived-loading pattern from
 * `useAbilityBalances` (loading = liveKey !== loadedKey) so no synchronous
 * setState runs in the effect body. Re-fetches as `currentRound` advances to
 * pick up newly-revealed rounds.
 */
export function useOpponentIntel(
  opponentAddr: string | null,
  myAddr: string | null,
  currentMatchId: string | null,
  currentRound: number,
): OpponentIntel {
  const [state, setState] = useState<Omit<OpponentIntel, "loading">>({
    profile: null,
    h2h: null,
    currentRounds: [],
  });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const liveKey = opponentAddr
    ? `${BigInt(opponentAddr).toString()}|${myAddr ? BigInt(myAddr).toString() : ""}|` +
      `${currentMatchId ?? ""}|${currentRound}`
    : null;
  const loading = liveKey !== null && loadedKey !== liveKey;

  useEffect(() => {
    if (!opponentAddr || liveKey === null) return;
    let cancelled = false;
    const key = liveKey;
    fetchIntel(opponentAddr, myAddr, currentMatchId)
      .then((result) => {
        if (cancelled) return;
        setState(result);
        setLoadedKey(key);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("[useOpponentIntel] fetch failed:", e);
        setState({ profile: null, h2h: null, currentRounds: [] });
        setLoadedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [liveKey, opponentAddr, myAddr, currentMatchId, currentRound]);

  return { ...state, loading };
}
