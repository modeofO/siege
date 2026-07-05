// frontend/src/lib/gameState1v1.ts
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useEntityQuery, useModels } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder, KeysClause } from "@dojoengine/sdk";
import {
  ModelsMapping,
  type SchemaType,
  type MatchState1v1 as MatchState1v1Model,
  type NodeState,
  type RoundMoves1v1 as RoundMoves1v1Model,
  type RoundModifiers1v1,
  type RoundTraps1v1,
  type Commitment,
  type MatchAbilities1v1,
} from "@/bindings/typescript/models.gen";
// The SDK's entity store occasionally contains placeholder / partial entries
// (e.g., fresh subscription results before fields are hydrated). The shared
// helpers guard every conversion so a render-time throw can't nuke the page.
import { safeNum, safeBigIntEq, flatModels } from "@/lib/modelUtils";
import { resolveRoundLocal, type PlayerMove } from "@/lib/resolution1v1";

function safeNumEq(v: unknown, target: number): boolean {
  if (v === undefined || v === null) return false;
  const n = Number(v);
  return Number.isFinite(n) && n === target;
}

/**
 * Torii gRPC keys are felt252 hex strings left-padded to 64 hex chars —
 * i.e., the full 252-bit representation. `BigInt("4").toString(16) = "4"`,
 * but Torii expects `"0x00…04"`.
 */
export function toFeltHex(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  try {
    return "0x" + BigInt(v).toString(16).padStart(64, "0");
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[gameState1v1] toFeltHex failed to parse:", v, e);
    return undefined;
  }
}

type EnumLike = { activeVariant?: () => string; variant?: Record<string, unknown> };

function enumVariant(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e; // SDK returns enums as plain variant strings
  const v = e as EnumLike;
  if (typeof v.activeVariant === "function") return v.activeVariant();
  if (v.variant && typeof v.variant === "object") {
    return Object.keys(v.variant).find((k) => v.variant![k] !== undefined) || "";
  }
  return "";
}

export type NodeOwner = "neutral" | "teamA" | "teamB";

export interface MatchState1v1 {
  matchId: string;
  playerA: string;
  playerB: string;
  round: number;
  phase: "committing" | "revealing" | "resolving" | "finished";
  vaultAHp: number;
  vaultBHp: number;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  budgetA: number;
  budgetB: number;
  winner: number | null;
}

export interface GateDamage {
  gate: number;
  modifier: number;
  attackA: number;
  defenseA: number;
  attackB: number;
  defenseB: number;
  dmgToA: number;
  dmgToB: number;
}

export interface RoundResult1v1 {
  round: number;
  aAttack: number[];
  aDefense: number[];
  bAttack: number[];
  bDefense: number[];
  damageToA: number;
  damageToB: number;
  modifiers: [number, number, number];
  gateBreakdown: GateDamage[];
  aTraps: [number, number, number];
  bTraps: [number, number, number];
  trapDmgToA: number;
  trapDmgToB: number;
  aAbilityId: number;
  aAbilityTarget: number;
  bAbilityId: number;
  bAbilityTarget: number;
}

function ownerToNode(owner: string): NodeOwner {
  if (owner === "TeamA") return "teamA";
  if (owner === "TeamB") return "teamB";
  return "neutral";
}

// Mirrors commit_reveal_1v1::calc_budget: 10 base, +1 per owned node,
// +1 per round above 6 (endgame escalation, rounds 7-10).
export function computeBudget(nodes: NodeOwner[], team: "teamA" | "teamB", round: number): number {
  const escalation = round > 6 ? round - 6 : 0;
  return 10 + nodes.filter((n) => n === team).length + escalation;
}

/**
 * Subscribes via gRPC to all match-scoped entities (MatchState1v1 + NodeState + RoundMoves1v1)
 * keyed by match_id, then synthesizes the unified MatchState1v1 view from the store.
 *
 * Public shape ({ state, loading, refresh, refreshKey }) is preserved so dependent hooks
 * and the match page work unchanged. `refresh` is now a no-op (push updates make polling
 * redundant); `refreshKey` bumps whenever the synthesized state changes, which dependent
 * hooks still use to invalidate their own polling until they're migrated too.
 */
export function useMatchState1v1(matchId: string | null) {
  // Single match-scoped subscription. Every match-page hook below reads from
  // the store this populates — no per-hook subscription.
  useEntityQuery(
    new ToriiQueryBuilder<SchemaType>()
      .withClause(
        KeysClause<SchemaType>(
          [
            ModelsMapping.MatchState1v1,
            ModelsMapping.NodeState,
            ModelsMapping.RoundMoves1v1,
            ModelsMapping.RoundModifiers1v1,
            ModelsMapping.RoundTraps1v1,
            ModelsMapping.Commitment,
            ModelsMapping.MatchAbilities1v1,
          ],
          [toFeltHex(matchId)],
          "VariableLen",
        ).build(),
      )
      .includeHashedKeys(),
  );

  const matchStates = useModels(ModelsMapping.MatchState1v1);
  const nodeStates = useModels(ModelsMapping.NodeState);
  const roundMoves = useModels(ModelsMapping.RoundMoves1v1);

  const state = useMemo<MatchState1v1 | null>(() => {
    if (!matchId) return null;
    const idBig = BigInt(matchId);

    const match = flatModels<MatchState1v1Model>(matchStates).find((m) => safeBigIntEq(m.match_id, idBig));
    if (!match) return null;

    const round = safeNum(match.current_round);
    const vaultAHp = safeNum(match.vault_a_hp);
    const vaultBHp = safeNum(match.vault_b_hp);

    const nodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "neutral", "neutral"];
    for (const ns of flatModels<NodeState>(nodeStates)) {
      if (!safeBigIntEq(ns.match_id, idBig)) continue;
      const idx = safeNum(ns.node_index);
      if (idx < 0 || idx > 2) continue;
      nodes[idx] = ownerToNode(enumVariant(ns.owner));
    }

    const status = enumVariant(match.status);

    let phase: MatchState1v1["phase"] = "committing";
    if (status === "Finished") {
      phase = "finished";
    } else {
      const rm = flatModels<RoundMoves1v1Model>(roundMoves).find(
        (r) => safeBigIntEq(r.match_id, idBig) && safeNumEq(r.round, round),
      );
      if (rm) {
        const cc = safeNum(rm.commit_count);
        const rc = safeNum(rm.reveal_count);
        if (cc >= 2) phase = rc >= 2 ? "resolving" : "revealing";
      }
    }

    let winner: number | null = null;
    if (status === "Finished") {
      if (vaultAHp === 0 && vaultBHp > 0) winner = 2;
      else if (vaultBHp === 0 && vaultAHp > 0) winner = 1;
      else if (vaultAHp > vaultBHp) winner = 1;
      else if (vaultBHp > vaultAHp) winner = 2;
      else winner = 0;
    }

    return {
      matchId: String(match.match_id),
      playerA: String(match.player_a),
      playerB: String(match.player_b),
      round,
      phase,
      vaultAHp,
      vaultBHp,
      nodes,
      budgetA: computeBudget(nodes, "teamA", round),
      budgetB: computeBudget(nodes, "teamB", round),
      winner,
    };
  }, [matchId, matchStates, nodeStates, roundMoves]);

  const loading = state === null && matchId !== null;

  const [refreshKey, setRefreshKey] = useState(0);
  const lastSigRef = useRef<string>("");
  useEffect(() => {
    const sig = state ? JSON.stringify(state) : "";
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      setRefreshKey((k) => k + 1);
    }
  }, [state]);

  const refresh = useCallback(async () => {
    // gRPC push updates make manual refresh a no-op.
  }, []);

  return { state, loading, refresh, refreshKey };
}

/** `refreshKey` params are kept only for API compat with the old polling flow — ignored. */
export function useRoundStatus1v1(matchId: string | null, round: number, _refreshKey?: number) {
  const roundMoves = useModels(ModelsMapping.RoundMoves1v1);
  const result = useMemo(() => {
    if (!matchId) return { commitCount: 0, revealCount: 0 };
    const idBig = BigInt(matchId);
    const rm = flatModels<RoundMoves1v1Model>(roundMoves).find(
      (r) => safeBigIntEq(r.match_id, idBig) && safeNumEq(r.round, round),
    );
    if (!rm) return { commitCount: 0, revealCount: 0 };
    return {
      commitCount: safeNum(rm.commit_count),
      revealCount: safeNum(rm.reveal_count),
    };
  }, [matchId, round, roundMoves]);
  return result;
}

export function useCommitmentStatus1v1(matchId: string | null, round: number, role: 0 | 1, _refreshKey?: number) {
  const commitments = useModels(ModelsMapping.Commitment);
  const result = useMemo(() => {
    if (!matchId) return { committed: false, revealed: false };
    const idBig = BigInt(matchId);
    const c = flatModels<Commitment>(commitments).find(
      (x) => safeBigIntEq(x.match_id, idBig) && safeNumEq(x.round, round) && safeNumEq(x.role, role),
    );
    if (!c) return { committed: false, revealed: false };
    return { committed: !!c.committed, revealed: !!c.revealed };
  }, [matchId, round, role, commitments]);
  return result;
}

export function useRoundHistory1v1(matchId: string | null): RoundResult1v1[] {
  const roundMoves = useModels(ModelsMapping.RoundMoves1v1);
  const roundMods = useModels(ModelsMapping.RoundModifiers1v1);
  const roundTraps = useModels(ModelsMapping.RoundTraps1v1);

  return useMemo<RoundResult1v1[]>(() => {
    if (!matchId) return [];
    const idBig = BigInt(matchId);

    const modsByRound: Record<number, [number, number, number]> = {};
    for (const mm of flatModels<RoundModifiers1v1>(roundMods)) {
      if (!safeBigIntEq(mm.match_id, idBig)) continue;
      modsByRound[safeNum(mm.round)] = [safeNum(mm.gate_0), safeNum(mm.gate_1), safeNum(mm.gate_2)];
    }

    const trapsByRound: Record<number, { a: [number, number, number]; b: [number, number, number] }> = {};
    for (const tt of flatModels<RoundTraps1v1>(roundTraps)) {
      if (!safeBigIntEq(tt.match_id, idBig)) continue;
      trapsByRound[safeNum(tt.round)] = {
        a: [safeNum(tt.a_trap0), safeNum(tt.a_trap1), safeNum(tt.a_trap2)],
        b: [safeNum(tt.b_trap0), safeNum(tt.b_trap1), safeNum(tt.b_trap2)],
      };
    }

    return flatModels<RoundMoves1v1Model>(roundMoves)
      .filter((r) => safeBigIntEq(r.match_id, idBig) && safeNum(r.reveal_count) >= 2)
      .sort((a, b) => safeNum(b.round) - safeNum(a.round))
      .slice(0, 10)
      .map((n): RoundResult1v1 => {
        const rnd = safeNum(n.round);
        const aAtk: [number, number, number] = [safeNum(n.a_p0), safeNum(n.a_p1), safeNum(n.a_p2)];
        const aDef: [number, number, number] = [safeNum(n.a_g0), safeNum(n.a_g1), safeNum(n.a_g2)];
        const bAtk: [number, number, number] = [safeNum(n.b_p0), safeNum(n.b_p1), safeNum(n.b_p2)];
        const bDef: [number, number, number] = [safeNum(n.b_g0), safeNum(n.b_g1), safeNum(n.b_g2)];
        const mods: [number, number, number] = modsByRound[rnd] || [0, 0, 0];
        const traps = trapsByRound[rnd] || {
          a: [0, 0, 0] as [number, number, number],
          b: [0, 0, 0] as [number, number, number],
        };
        const aAbilityId = safeNum(n.a_ability_id);
        const aAbilityTarget = safeNum(n.a_ability_target);
        const bAbilityId = safeNum(n.b_ability_id);
        const bAbilityTarget = safeNum(n.b_ability_target);

        // History rows don't carry each past round's PRE-round node ownership,
        // so we pass neutral nodes and vault HP of 50 with the row's round. The
        // engine call here only supplies the per-gate breakdown and damage
        // totals (now ability-aware); node defense was never reflected in the
        // history breakdown before either, so this preserves that limitation
        // explicitly. Per-round HP display remains driven by RoundResolved data.
        const outcome = resolveRoundLocal({
          moveA: {
            attack: aAtk,
            defense: aDef,
            repair: safeNum(n.a_repair),
            nodeContest: [safeNum(n.a_nc0), safeNum(n.a_nc1), safeNum(n.a_nc2)],
            traps: traps.a,
            abilityId: aAbilityId,
            abilityTarget: aAbilityTarget,
          },
          moveB: {
            attack: bAtk,
            defense: bDef,
            repair: safeNum(n.b_repair),
            nodeContest: [safeNum(n.b_nc0), safeNum(n.b_nc1), safeNum(n.b_nc2)],
            traps: traps.b,
            abilityId: bAbilityId,
            abilityTarget: bAbilityTarget,
          },
          nodeOwners: ["neutral", "neutral", "neutral"],
          modifiers: mods,
          vaultAHp: 50,
          vaultBHp: 50,
          round: rnd,
        });
        const gateBreakdown: GateDamage[] = outcome.gates.map((g) => ({
          gate: g.gate,
          modifier: g.modifier,
          attackA: g.attackA,
          defenseA: g.defenseA,
          attackB: g.attackB,
          defenseB: g.defenseB,
          dmgToA: g.dmgToA,
          dmgToB: g.dmgToB,
        }));
        const damageToA = outcome.totalDamageToA;
        const damageToB = outcome.totalDamageToB;
        return {
          round: rnd,
          aAttack: aAtk,
          aDefense: aDef,
          bAttack: bAtk,
          bDefense: bDef,
          damageToA,
          damageToB,
          modifiers: mods,
          gateBreakdown,
          aTraps: traps.a,
          bTraps: traps.b,
          trapDmgToA: 0,
          trapDmgToB: 0,
          aAbilityId,
          aAbilityTarget,
          bAbilityId,
          bAbilityTarget,
        };
      });
  }, [matchId, roundMoves, roundMods, roundTraps]);
}

// Note: usePlayerKingdom lives in worldState.ts — canonical impl since it
// returns the full PlayerKingdomData shape used across faction/hold UIs.

export const MODIFIER_NAMES: Record<number, string> = {
  0: "Normal",
  1: "Narrow Pass",
  2: "Mirror Gate",
  3: "Deadlock",
  4: "Reflection",
};

export const MODIFIER_DESCRIPTIONS: Record<number, string> = {
  0: "",
  1: "Attack and defense capped at 3",
  2: "Attack and defense values swap",
  3: "No damage dealt at this gate",
  4: "Damage reflects to other gates",
};

export interface MatchAbilitiesData {
  abilities: [number, number, number];
  used: [boolean, boolean, boolean];
}

export function useMatchAbilities1v1(
  matchId: string | null,
  playerAddress: string | null,
  playerA: string | null,
  _refreshKey?: number,
): MatchAbilitiesData {
  const matchAbilities = useModels(ModelsMapping.MatchAbilities1v1);

  return useMemo<MatchAbilitiesData>(() => {
    const empty: MatchAbilitiesData = { abilities: [0, 0, 0], used: [false, false, false] };
    if (!matchId || !playerAddress || !playerA) return empty;
    const idBig = BigInt(matchId);
    const isA = playerAddress.toLowerCase() === playerA.toLowerCase();
    const node = flatModels<MatchAbilities1v1>(matchAbilities).find((m) => safeBigIntEq(m.match_id, idBig));
    if (!node) return empty;
    return isA
      ? {
          abilities: [safeNum(node.a_ability_1), safeNum(node.a_ability_2), safeNum(node.a_ability_3)],
          used: [!!node.a_used_1, !!node.a_used_2, !!node.a_used_3],
        }
      : {
          abilities: [safeNum(node.b_ability_1), safeNum(node.b_ability_2), safeNum(node.b_ability_3)],
          used: [!!node.b_used_1, !!node.b_used_2, !!node.b_used_3],
        };
  }, [matchId, playerAddress, playerA, matchAbilities]);
}

export interface MatchStakesData {
  a: [number, number, number];
  b: [number, number, number];
  aUsed: [boolean, boolean, boolean];
  bUsed: [boolean, boolean, boolean];
  isStaked: boolean;
  loaded: boolean;
}

/**
 * Returns both players' staked abilities for a match. Used by the stakes
 * header (issue #4). Non-staked 1v1 matches will return all zeros and
 * `isStaked: false`.
 */
// NOTE (pre-existing): despite the name, this reads MatchAbilities1v1 (the
// abilities-in-play model) rather than the dedicated MatchStakes1v1 model.
// Preserved verbatim from the original behavior — semantic cleanup is out of
// scope for this transport migration.
export function useMatchStakes1v1(matchId: string | null, _refreshKey?: number): MatchStakesData {
  const matchAbilities = useModels(ModelsMapping.MatchAbilities1v1);

  return useMemo<MatchStakesData>(() => {
    const empty: MatchStakesData = {
      a: [0, 0, 0],
      b: [0, 0, 0],
      aUsed: [false, false, false],
      bUsed: [false, false, false],
      isStaked: false,
      loaded: false,
    };
    if (!matchId) return empty;
    const idBig = BigInt(matchId);
    const node = flatModels<MatchAbilities1v1>(matchAbilities).find((m) => safeBigIntEq(m.match_id, idBig));
    if (!node) return { ...empty, loaded: true };
    const a: [number, number, number] = [
      safeNum(node.a_ability_1),
      safeNum(node.a_ability_2),
      safeNum(node.a_ability_3),
    ];
    const b: [number, number, number] = [
      safeNum(node.b_ability_1),
      safeNum(node.b_ability_2),
      safeNum(node.b_ability_3),
    ];
    return {
      a,
      b,
      aUsed: [!!node.a_used_1, !!node.a_used_2, !!node.a_used_3],
      bUsed: [!!node.b_used_1, !!node.b_used_2, !!node.b_used_3],
      isStaked: a.some((x) => x > 0) || b.some((x) => x > 0),
      loaded: true,
    };
  }, [matchId, matchAbilities]);
}

/**
 * Returns both players' fully-decoded moves for a round, but only once both
 * have revealed (`reveal_count === 2`); otherwise null. Pure `useMemo` over the
 * already-subscribed RoundMoves1v1 / RoundTraps1v1 stores — no effects, no new
 * subscription. Feeds `resolveRoundLocal` so the match page can show the round
 * outcome the instant reveal #2 indexes, ~30-45s before the chain resolve.
 */
export function useRevealedMoves1v1(
  matchId: string | null,
  round: number,
): { moveA: PlayerMove; moveB: PlayerMove } | null {
  const roundMoves = useModels(ModelsMapping.RoundMoves1v1);
  const roundTraps = useModels(ModelsMapping.RoundTraps1v1);

  return useMemo(() => {
    if (!matchId || round < 1) return null;
    const idBig = BigInt(matchId);
    const rm = flatModels<RoundMoves1v1Model>(roundMoves).find(
      (r) => safeBigIntEq(r.match_id, idBig) && safeNumEq(r.round, round),
    );
    if (!rm || safeNum(rm.reveal_count) < 2) return null;
    const rt = flatModels<RoundTraps1v1>(roundTraps).find(
      (r) => safeBigIntEq(r.match_id, idBig) && safeNumEq(r.round, round),
    );
    // Generated model structs have no string index signature; read fields
    // through a Record view so template-literal keys type-check.
    const rmRec = rm as unknown as Record<string, unknown>;
    const rtRec = rt as unknown as Record<string, unknown> | undefined;
    const traps = (side: "a" | "b"): [number, number, number] =>
      rtRec
        ? [safeNum(rtRec[`${side}_trap0`]), safeNum(rtRec[`${side}_trap1`]), safeNum(rtRec[`${side}_trap2`])]
        : [0, 0, 0];
    const move = (s: "a" | "b"): PlayerMove => ({
      attack: [safeNum(rmRec[`${s}_p0`]), safeNum(rmRec[`${s}_p1`]), safeNum(rmRec[`${s}_p2`])],
      defense: [safeNum(rmRec[`${s}_g0`]), safeNum(rmRec[`${s}_g1`]), safeNum(rmRec[`${s}_g2`])],
      repair: safeNum(rmRec[`${s}_repair`]),
      nodeContest: [safeNum(rmRec[`${s}_nc0`]), safeNum(rmRec[`${s}_nc1`]), safeNum(rmRec[`${s}_nc2`])],
      traps: traps(s),
      abilityId: safeNum(rmRec[`${s}_ability_id`]),
      abilityTarget: safeNum(rmRec[`${s}_ability_target`]),
    });
    return { moveA: move("a"), moveB: move("b") };
  }, [matchId, round, roundMoves, roundTraps]);
}

export function useRoundModifiers1v1(matchId: string | null, round: number): [number, number, number] {
  const roundMods = useModels(ModelsMapping.RoundModifiers1v1);

  return useMemo<[number, number, number]>(() => {
    if (!matchId) return [0, 0, 0];
    const idBig = BigInt(matchId);
    const m = flatModels<RoundModifiers1v1>(roundMods).find(
      (r) => safeBigIntEq(r.match_id, idBig) && safeNumEq(r.round, round),
    );
    if (!m) return [0, 0, 0];
    return [safeNum(m.gate_0), safeNum(m.gate_1), safeNum(m.gate_2)];
  }, [matchId, round, roundMods]);
}
