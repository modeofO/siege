// frontend/src/app/match-1v1/[id]/page.tsx
"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useAccount } from "@/app/providers";
import {
  useMatchState1v1,
  useRoundStatus1v1,
  useRoundHistory1v1,
  useCommitmentStatus1v1,
  useRoundModifiers1v1,
  useMatchAbilities1v1,
  useRevealedMoves1v1,
  computeBudget,
  MODIFIER_NAMES,
} from "@/lib/gameState1v1";
import type { RoundResult1v1, NodeOwner } from "@/lib/gameState1v1";
import { resolveRoundLocal } from "@/lib/resolution1v1";
import { IntelDrawer } from "@/components/intel/IntelDrawer";
import { useOpponentIntel } from "@/lib/intel/queries";
import { detectDeviation } from "@/lib/intel/bluff";
import { savePreDraft, loadPreDraft } from "@/lib/intel/predraft";
import { generateSalt, computeCommitment1v1, storeSalt1v1, storeMove1v1, getSalt1v1, getMove1v1, clearCommitData1v1 } from "@/lib/crypto";
import { commitMove1v1, revealMove1v1, resolveRound1v1, extractErrorMsg } from "@/lib/contracts1v1";
import { useResourceBalances } from "@/lib/useResourceBalances";
import { AllocationForm1v1 } from "@/components/AllocationForm1v1";
import { Battlefield3DGate, isBattle3DActive } from "@/components/battlefield3d/Battlefield3DGate";
import { MatchStakesHeader } from "@/components/MatchStakesHeader";
import { MatchEndActions } from "@/components/MatchEndActions";
import { HoldStatusStrip } from "@/components/HoldStatusStrip";
import { useMatchStakes1v1 } from "@/lib/gameState1v1";
import { usePlayerCosmetics } from "@/lib/cosmetics";
import { ArcaneSeal } from "@/components/forge/ArcaneSeal";
import { CIRCUITS } from "@/lib/forge/circuits";
import { toriiSql, sqlInt, sqlU64, toNum } from "@/lib/toriiSql";
import { ABILITIES } from "@/lib/craftingContracts";
import { BattleAnimation } from "@/components/BattleAnimation";
import { ModifierCards } from "@/components/ModifierCards";

export default function Match1v1Page() {
  const params = useParams();
  const matchId = params.id as string;
  const { account, address } = useAccount();

  const { state, loading, refresh, refreshKey } = useMatchState1v1(matchId);
  const history = useRoundHistory1v1(matchId);
  const resources = useResourceBalances(address);

  // Role detection
  const addrMatch = (a: string | undefined, b: string | undefined) => {
    if (!a || !b) return false;
    try {
      return BigInt(a) === BigInt(b);
    } catch {
      return false;
    }
  };

  let isPlayerA = false;
  let isPlayerB = false;
  let role: 0 | 1 = 0;
  if (state && address) {
    isPlayerA = addrMatch(state.playerA, address);
    isPlayerB = addrMatch(state.playerB, address);
    role = isPlayerA ? 0 : 1;
  }
  const roleFound = isPlayerA || isPlayerB;

  // Commitment status from chain — refreshKey ensures these re-fetch when match state updates
  const { committed, revealed } = useCommitmentStatus1v1(matchId, state?.round ?? 1, role, refreshKey);

  // Round status for polling commit/reveal counts
  const roundStatus = useRoundStatus1v1(matchId, state?.round ?? 1, refreshKey);

  const modifiers = useRoundModifiers1v1(matchId, state?.round ?? 1);

  // --- Optimistic round outcome ---
  // The moment both reveals index (phase === "resolving"), mirror the Cairo
  // round math locally so the result shows ~30-45s before the chain resolve.
  const revealedMoves = useRevealedMoves1v1(matchId, state?.round ?? 0);
  const optimisticOutcome = useMemo(() => {
    if (!revealedMoves || !state || state.phase !== "resolving") return null;
    return resolveRoundLocal({
      moveA: revealedMoves.moveA,
      moveB: revealedMoves.moveB,
      nodeOwners: state.nodes,
      modifiers: modifiers ?? [0, 0, 0],
      vaultAHp: state.vaultAHp,
      vaultBHp: state.vaultBHp,
      round: state.round,
    });
  }, [revealedMoves, state, modifiers]);

  // Map the optimistic outcome into the exact shape the chain result path feeds
  // BattleAnimation + heldHp. `heldHp` follows the existing convention
  // (finalHP + gate damage) so the animation counts down to the optimistic
  // final; top HP bars read the final directly (below).
  const optimisticView = useMemo(() => {
    if (!optimisticOutcome || !revealedMoves || !state) return null;
    const o = optimisticOutcome;
    const result: RoundResult1v1 = {
      round: state.round,
      aAttack: revealedMoves.moveA.attack,
      aDefense: revealedMoves.moveA.defense,
      bAttack: revealedMoves.moveB.attack,
      bDefense: revealedMoves.moveB.defense,
      damageToA: o.totalDamageToA,
      damageToB: o.totalDamageToB,
      modifiers: [o.gates[0].modifier, o.gates[1].modifier, o.gates[2].modifier],
      gateBreakdown: o.gates.map((g) => ({
        gate: g.gate,
        modifier: g.modifier,
        attackA: g.attackA,
        defenseA: g.defenseA,
        attackB: g.attackB,
        defenseB: g.defenseB,
        dmgToA: g.dmgToA,
        dmgToB: g.dmgToB,
      })),
      aTraps: revealedMoves.moveA.traps,
      bTraps: revealedMoves.moveB.traps,
      trapDmgToA: o.trapDamageToA,
      trapDmgToB: o.trapDamageToB,
      aAbilityId: revealedMoves.moveA.abilityId,
      aAbilityTarget: revealedMoves.moveA.abilityTarget,
      bAbilityId: revealedMoves.moveB.abilityId,
      bAbilityTarget: revealedMoves.moveB.abilityTarget,
    };
    return {
      result,
      heldHp: { a: o.vaultAHpAfter + o.totalDamageToA, b: o.vaultBHpAfter + o.totalDamageToB },
      newNodes: o.nodeOwnersAfter,
    };
  }, [optimisticOutcome, revealedMoves, state]);

  // Ability selection state
  const [selectedAbility, setSelectedAbility] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState(0);

  const matchAbilities = useMatchAbilities1v1(matchId, address || null, state?.playerA || null, refreshKey);

  // Stakes for the match header (#4) — both sides' wagered abilities.
  const matchStakes = useMatchStakes1v1(matchId, refreshKey);

  const cosmeticsA = usePlayerCosmetics(state?.playerA ?? undefined, refreshKey);
  const cosmeticsB = usePlayerCosmetics(state?.playerB ?? undefined, refreshKey);

  // --- War Table Intel ---
  // Opponent address (null until roles resolve). The intel hook keeps stale data
  // when the opponent goes null, so the drawer is only rendered when it's truthy.
  const opponentAddr = state ? (isPlayerA ? state.playerB : state.playerA) : null;
  const intel = useOpponentIntel(opponentAddr, address ?? null, matchId, state?.round ?? 0);
  const bluff = useMemo(
    () =>
      intel.profile && intel.currentRounds.length
        ? detectDeviation(intel.currentRounds, intel.profile)
        : null,
    [intel.profile, intel.currentRounds],
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Pre-draft sketch for the NEXT round. `preDraft` must be a STABLE reference:
  // the drawer reseeds its scratch state by reference-comparing this prop, so a
  // fresh array on every render would silently wipe an in-progress sketch. We
  // hold it in state (seeded lazily from storage) and only swap the reference in
  // two cases — a round change (reseed from that round's saved sketch, via the
  // render-time state-adjustment pattern, no effect) and an explicit save (adopt
  // the just-saved array). This keeps storage and the in-memory reference in
  // sync without a memo/nonce that trips react-hooks/exhaustive-deps.
  const preDraftForRound = (state?.round ?? 0) + 1;
  const [preDraft, setPreDraft] = useState<number[] | null>(
    () => loadPreDraft(matchId, preDraftForRound)?.allocations ?? null,
  );
  const [preDraftLoadedForRound, setPreDraftLoadedForRound] = useState(preDraftForRound);
  if (preDraftLoadedForRound !== preDraftForRound) {
    setPreDraftLoadedForRound(preDraftForRound);
    setPreDraft(loadPreDraft(matchId, preDraftForRound)?.allocations ?? null);
  }
  const handleSavePreDraft = useCallback(
    (alloc: number[]) => {
      savePreDraft(matchId, preDraftForRound, alloc);
      setPreDraft(alloc);
    },
    [matchId, preDraftForRound],
  );

  const handleAbilitySelect = useCallback((abilityId: number, target: number) => {
    setSelectedAbility(abilityId);
    setSelectedTarget(target);
  }, []);

  // Reset ability selection when round changes
  useEffect(() => {
    setSelectedAbility(0);
    setSelectedTarget(0);
  }, [state?.round]);

  // Allocations: [p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2]
  const [allocations, setAllocations] = useState<number[]>(new Array(13).fill(0));
  const [submitting, setSubmitting] = useState(false);
  // After a commit tx resolves, we stay in `confirming` until Torii reports
  // the committed flag on-chain. Keeps the button disabled in a visibly
  // pending state during the ~5-10s indexing lag (issue #11).
  const [confirming, setConfirming] = useState(false);
  const [autoRevealStatus, setAutoRevealStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [autoRevealError, setAutoRevealError] = useState("");
  const [revealRetry, setRevealRetry] = useState(0);
  const autoRevealLock = useRef(false);
  const autoResolveLock = useRef(false);
  const commitLock = useRef(false);
  const [autoResolveError, setAutoResolveError] = useState("");
  const [resolveRetryCount, setResolveRetryCount] = useState(0);
  const [error, setError] = useState("");
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [pendingResult, setPendingResult] = useState<RoundResult1v1 | null>(null);
  const [heldHp, setHeldHp] = useState<{ a: number; b: number } | null>(null);
  const [prevNodes, setPrevNodes] = useState<[NodeOwner, NodeOwner, NodeOwner]>(["neutral", "neutral", "neutral"]);
  const prevRoundRef = useRef<number>(0);
  // The round whose optimistic animation has finished playing — hides the
  // optimistic overlay while we keep the confirming pill up until reconcile.
  const [dismissedOptimisticRound, setDismissedOptimisticRound] = useState(0);
  // Last optimistic outcome shown, captured for reconcile against the chain
  // resolve (ref, not state — set from a ref-only effect so no setState-in-effect).
  const shownOptimisticRef = useRef<{
    round: number;
    vaultAHpAfter: number;
    vaultBHpAfter: number;
    nodeOwnersAfter: [NodeOwner, NodeOwner, NodeOwner];
  } | null>(null);

  // --- Polling fallback for stale gRPC subscription state ---
  // After a user's own commit/reveal tx, we poll Torii SQL for a short window
  // to detect the state change faster than the gRPC subscription delivers it.
  const [pollCommitCount, setPollCommitCount] = useState<number | null>(null);
  const [pollRevealCount, setPollRevealCount] = useState<number | null>(null);
  const [pollCommitted, setPollCommitted] = useState<boolean | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Effective values: max of subscription data and poll data
  const effectiveCommitCount = Math.max(roundStatus.commitCount, pollCommitCount ?? 0);
  const effectiveRevealCount = Math.max(roundStatus.revealCount, pollRevealCount ?? 0);
  const effectiveCommitted = committed || pollCommitted === true;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // Stop polling once subscription catches up (poll data becomes redundant)
  useEffect(() => {
    const allCaughtUp =
      (pollCommitCount === null || roundStatus.commitCount >= pollCommitCount) &&
      (pollRevealCount === null || roundStatus.revealCount >= pollRevealCount) &&
      (pollCommitted === null || committed);
    if (allCaughtUp && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      setPollCommitCount(null);
      setPollRevealCount(null);
      setPollCommitted(null);
    }
  }, [roundStatus.commitCount, roundStatus.revealCount, committed, pollCommitCount, pollRevealCount, pollCommitted]);

  /**
   * Start polling Torii SQL for commit/reveal counts + committed flag.
   * Polls every 2s for up to 30s then stops.
   */
  const startPostTxPoll = useCallback(
    (opts: { expectCommitCount?: number; expectRevealCount?: number; expectCommitted?: boolean }) => {
      // Clear any existing poll
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      const currentMatchId = matchId;
      const currentRound = state?.round;
      const currentRole = role;
      if (!currentMatchId || !currentRound) return;

      let elapsed = 0;
      const INTERVAL = 2000;
      const MAX_DURATION = 30000;

      const doPoll = async () => {
        elapsed += INTERVAL;
        if (elapsed > MAX_DURATION) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          return;
        }

        try {
          // Poll RoundMoves1v1 for commit_count / reveal_count
          const rmRows = await toriiSql<{ commit_count: unknown; reveal_count: unknown }>(
            `SELECT commit_count, reveal_count FROM "siege_dojo-RoundMoves1v1" WHERE match_id = ${sqlInt(currentMatchId)} AND round = ${sqlInt(currentRound)}`,
          );
          let cc = 0;
          let rc = 0;
          if (rmRows.length > 0) {
            cc = toNum(rmRows[0].commit_count);
            rc = toNum(rmRows[0].reveal_count);
            setPollCommitCount(cc);
            setPollRevealCount(rc);
          }

          // Poll Commitment for our committed flag
          let isCommittedNow = false;
          if (opts.expectCommitted) {
            const cRows = await toriiSql<{ committed: unknown }>(
              `SELECT committed FROM "siege_dojo-Commitment" WHERE match_id = ${sqlInt(currentMatchId)} AND round = ${sqlInt(currentRound)} AND role = ${sqlInt(currentRole)}`,
            );
            if (cRows.length > 0 && toNum(cRows[0].committed)) {
              isCommittedNow = true;
              setPollCommitted(true);
            }
          }

          // Check if we've reached the expected state and can stop early
          let done = true;
          if (opts.expectCommitCount !== undefined && cc < opts.expectCommitCount) done = false;
          if (opts.expectRevealCount !== undefined && rc < opts.expectRevealCount) done = false;
          if (opts.expectCommitted && !isCommittedNow) done = false;

          if (done && pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        } catch (e) {
          console.warn("[post-tx-poll] error:", e);
        }
      };

      pollTimerRef.current = setInterval(doPoll, INTERVAL);
      // Fire immediately (don't wait 2s for first check)
      void doPoll();
    },
    [matchId, state?.round, role],
  );

  const budget = state ? (isPlayerA ? state.budgetA : state.budgetB) : 10;

  // Reset state on round change
  useEffect(() => {
    setAllocations(new Array(13).fill(0));
    setAutoRevealStatus("idle");
    setAutoRevealError("");
    setRevealRetry(0);
    setAutoResolveError("");
    setResolveRetryCount(0);
    autoRevealLock.current = false;
    autoResolveLock.current = false;
    commitLock.current = false;
    setSubmitting(false);
    setConfirming(false);
    setError("");
    // Reset poll state on round change
    setPollCommitCount(null);
    setPollRevealCount(null);
    setPollCommitted(null);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [state?.round, setAllocations, setAutoRevealStatus, setAutoRevealError, setRevealRetry, setSubmitting, setConfirming, setError]);

  // Which battlefield path renders. When 3D is active the scene plays the
  // resolution and the top HP bars read chain-correct raw vault props, so the
  // 2D BattleAnimation state (heldHp/pendingResult) must not be set — nothing
  // clears it in the 3D path, and a stuck heldHp would freeze the HP bars.
  const battle3DActive = useMemo(() => isBattle3DActive(), []);

  // Detect round transitions and capture pre-resolution HP for the overlay.
  // Also reconciles the optimistic outcome against the chain resolve: if we
  // already animated this round optimistically, we skip the replay and just
  // compare (chain is authoritative — bars are chain-derived once resolving
  // clears). Otherwise fall back to the original chain-driven animation.
  useEffect(() => {
    if (!state || !history.length) return;
    const currentRound = state.round;
    if (prevRoundRef.current > 0 && currentRound > prevRoundRef.current) {
      const resolvedRound = prevRoundRef.current;
      const justResolved = history.find((r) => r.round === resolvedRound);
      const shown = shownOptimisticRef.current;
      const optimisticAlreadyShown = shown?.round === resolvedRound;
      if (optimisticAlreadyShown && shown) {
        // Reconcile local vs chain; chain wins on any mismatch.
        const nodesMatch = shown.nodeOwnersAfter.every((n, i) => n === state.nodes[i]);
        if (
          shown.vaultAHpAfter !== state.vaultAHp ||
          shown.vaultBHpAfter !== state.vaultBHp ||
          !nodesMatch
        ) {
          console.error("[optimistic-resolve] mismatch", {
            round: resolvedRound,
            local: {
              vaultAHpAfter: shown.vaultAHpAfter,
              vaultBHpAfter: shown.vaultBHpAfter,
              nodeOwnersAfter: shown.nodeOwnersAfter,
            },
            chain: { vaultAHp: state.vaultAHp, vaultBHp: state.vaultBHp, nodes: state.nodes },
          });
        }
        // Optimistic animation already played — don't replay. Chain-derived
        // HP bars (heldHp stays null) snap to the authoritative values.
      } else if (justResolved && !battle3DActive) {
        // 2D path only: the BattleAnimation overlay consumes this state and
        // handleResolutionComplete clears heldHp. In the 3D path that animation
        // never mounts, so setting heldHp here would leave it stuck forever.
        setHeldHp({
          a: state.vaultAHp + justResolved.damageToA,
          b: state.vaultBHp + justResolved.damageToB,
        });
        setPendingResult(justResolved);
      }
    }
    if (currentRound !== prevRoundRef.current) {
      setPrevNodes(state.nodes);
      prevRoundRef.current = currentRound;
    }
  }, [state?.round, history, state, isPlayerA, battle3DActive]);

  // Capture the optimistic outcome for later reconcile. Ref-only write (no
  // setState) so this effect doesn't run afoul of react-hooks/set-state-in-effect.
  useEffect(() => {
    if (optimisticOutcome && state) {
      shownOptimisticRef.current = {
        round: state.round,
        vaultAHpAfter: optimisticOutcome.vaultAHpAfter,
        vaultBHpAfter: optimisticOutcome.vaultBHpAfter,
        nodeOwnersAfter: optimisticOutcome.nodeOwnersAfter,
      };
    }
  }, [optimisticOutcome, state]);

  // One-shot mount log — if this never appears in console after reload, the
  // page is serving a stale bundle and a hard refresh is needed.
  useEffect(() => {
    console.log("[siege] match-1v1 page loaded — reveal gate diagnostics v1");
  }, []);

  // Check if an error is a known recoverable case
  const isAlreadyRevealed = (msg: string) =>
    msg.includes("Already revealed") || msg.includes("416c72656164792072657665616c6564");

  // Auto-reveal: when both committed & we haven't revealed yet.
  // No VRF needed — reveal no longer triggers resolution (issue #16).
  useEffect(() => {
    console.log("[auto-reveal] gate check", {
      hasAccount: !!account,
      hasState: !!state,
      round: state?.round,
      committed: effectiveCommitted,
      revealed,
      commitCount: effectiveCommitCount,
      locked: autoRevealLock.current,
      status: autoRevealStatus,
    });

    if (!account || !state || !effectiveCommitted || revealed || effectiveCommitCount < 2 || autoRevealLock.current) return;

    autoRevealLock.current = true;

    const salt = getSalt1v1(matchId, state.round);
    const move = getMove1v1(matchId, state.round);
    if (!salt || !move) {
      console.warn(
        `[auto-reveal] No local commit data for match ${matchId} round ${state.round}. ` +
          `This browser/tab did not store the salt — likely committed from a different device.`,
      );
      setAutoRevealStatus("error");
      setAutoRevealError(
        "Local commit data not found in this browser. Commits must be revealed from " +
          "the same browser they were made in. If you committed in another tab or device, " +
          "reopen the match there to reveal.",
      );
      return;
    }

    setAutoRevealStatus("pending");
    console.log(`[auto-reveal] starting reveal for match ${matchId} round ${state.round}`);

    const abilityData = localStorage.getItem(`siege_1v1_ability_${matchId}_${state.round}`);
    const parsedAbility = abilityData ? JSON.parse(abilityData) : { abilityId: 0, abilityTarget: 0 };

    (async () => {
      try {
        await revealMove1v1(
          account,
          matchId,
          salt,
          move[0].toString(),
          move[1].toString(),
          move[2].toString(),
          move[3].toString(),
          move[4].toString(),
          move[5].toString(),
          move[6].toString(),
          move[7].toString(),
          move[8].toString(),
          move[9].toString(),
          move[10].toString(),
          move[11].toString(),
          move[12].toString(),
          parsedAbility.abilityId.toString(),
          parsedAbility.abilityTarget.toString(),
        );
        setAutoRevealStatus("done");
        setAutoRevealError("");
        clearCommitData1v1(matchId, state.round);
        console.log("[auto-reveal] reveal submitted");
        // Start polling for reveal_count to reach 2 (bridges gRPC lag for auto-resolve)
        startPostTxPoll({ expectRevealCount: 2 });
      } catch (e) {
        const msg = extractErrorMsg(e);
        if (isAlreadyRevealed(msg)) {
          console.log("[auto-reveal] Already revealed — round progressed normally.");
          setAutoRevealStatus("done");
          startPostTxPoll({ expectRevealCount: 2 });
          return;
        }
        console.error("[auto-reveal] failed:", msg);
        setAutoRevealStatus("error");
        setAutoRevealError(msg);
      }
      void refresh();
    })();
  }, [
    account,
    state,
    matchId,
    effectiveCommitted,
    revealed,
    effectiveCommitCount,
    refresh,
    revealRetry,
    autoRevealStatus,
    startPostTxPoll,
  ]);

  // Refs for values the auto-resolve timer callback needs, so the
  // effect itself doesn't depend on `state` or `refresh` (which get
  // new references on every subscription tick and would cancel the timer).
  const accountRef = useRef(account);
  accountRef.current = account;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const stateRef = useRef(state);
  stateRef.current = state;

  // Auto-resolve: only the elected player (lower address) fires resolve_round.
  // The non-elected player waits for the subscription to deliver the round
  // update, with a manual button as fallback. Single-caller avoids competing
  // transactions that trigger Controller "Review Transactions" prompts (#21/#22).
  useEffect(() => {
    if (
      !account ||
      !state ||
      !address ||
      effectiveRevealCount < 2 ||
      state.phase === "finished" ||
      autoResolveLock.current
    )
      return;

    autoResolveLock.current = true;

    let isElected = true;
    try {
      const a = BigInt(state.playerA);
      const b = BigInt(state.playerB);
      const me = BigInt(address);
      const lower = a < b ? a : b;
      isElected = me === lower;
    } catch {
      // If address parsing fails, try to resolve.
    }

    if (!isElected) {
      console.log(`[auto-resolve] non-elected, waiting for opponent to resolve round ${state.round}`);
      return;
    }

    const currentRound = state.round;
    const delay = [2000, 4000, 6000, 10000, 15000][resolveRetryCount] ?? 15000;
    console.log(`[auto-resolve] elected=true, round=${currentRound}, attempt=${resolveRetryCount}, delay=${delay}ms`);

    const timer = setTimeout(() => {
      const acc = accountRef.current;
      const curState = stateRef.current;
      if (!acc || !curState || curState.round !== currentRound) return;
      (async () => {
        try {
          const rows = await toriiSql<{ reveal_count: unknown }>(
            `SELECT reveal_count FROM "siege_dojo-RoundMoves1v1" WHERE match_id = ${sqlU64(matchId)} AND round = ${sqlInt(currentRound)}`,
          );
          const onChainReveals = rows.length > 0 ? toNum(rows[0].reveal_count) : 0;
          if (onChainReveals < 2) {
            console.log(`[auto-resolve] Torii SQL reveal_count=${onChainReveals}, deferring`);
            autoResolveLock.current = false;
            if (resolveRetryCount < 4) setResolveRetryCount((c) => c + 1);
            return;
          }
        } catch {
          // SQL check failed — proceed with resolve attempt anyway
        }

        try {
          await resolveRound1v1(acc, matchId);
          console.log("[auto-resolve] resolve_round submitted");
          setAutoResolveError("");
        } catch (e) {
          const msg = extractErrorMsg(e);
          const isTransient =
            msg.includes("Not all revealed") ||
            msg.includes("4e6f7420616c6c2072657665616c6564") ||
            msg.includes("not fulfilled") ||
            msg.includes("6e6f742066756c66696c6c6564");
          if (isTransient && resolveRetryCount < 4) {
            console.log(`[auto-resolve] transient failure, retry ${resolveRetryCount + 1}/4`);
            autoResolveLock.current = false;
            setResolveRetryCount((c) => c + 1);
          } else if (isTransient) {
            console.log("[auto-resolve] retries exhausted, waiting for opponent or manual resolve");
          } else {
            console.error("[auto-resolve] failed:", msg);
            setAutoResolveError(msg);
            if (resolveRetryCount < 4) {
              setResolveRetryCount((c) => c + 1);
              autoResolveLock.current = false;
            }
          }
        }
        void refreshRef.current();
      })();
    }, delay);

    return () => clearTimeout(timer);
    // Intentionally narrow deps — state/refresh accessed via refs so
    // subscription-driven re-renders don't cancel the pending timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, matchId, effectiveRevealCount, resolveRetryCount]);

  const handleRetryReveal = useCallback(() => {
    autoRevealLock.current = false;
    setAutoRevealStatus("idle");
    setAutoRevealError("");
    setRevealRetry((c) => c + 1);
  }, []);

  const handleResolutionComplete = useCallback(() => {
    setPendingResult(null);
    setHeldHp(null);
  }, []);

  // Optimistic animation finished — hide the overlay but keep the confirming
  // pill and final HP bars until the chain resolve reconciles. setState here is
  // in a callback (gsap oncomplete), not an effect body.
  const handleOptimisticComplete = useCallback(() => {
    setDismissedOptimisticRound(state?.round ?? 0);
  }, [state?.round]);

  // Commit handler
  const handleCommit = useCallback(async () => {
    if (!account || !state || commitLock.current) return;
    const trapCost = (allocations[10] + allocations[11] + allocations[12]) * 2;
    // Repair (index 6) costs 2 budget per HP — count it twice, matching the
    // form's spendOf and the contract's reveal-time budget check.
    const total = allocations.slice(0, 10).reduce((a, b) => a + b, 0) + (allocations[6] || 0) + trapCost;
    if (total !== budget) return;

    commitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const salt = generateSalt();
      storeSalt1v1(matchId, state.round, salt);
      storeMove1v1(matchId, state.round, allocations);

      const commitment = computeCommitment1v1(
        salt,
        allocations[0],
        allocations[1],
        allocations[2],
        allocations[3],
        allocations[4],
        allocations[5],
        allocations[6],
        allocations[7],
        allocations[8],
        allocations[9],
        allocations[10],
        allocations[11],
        allocations[12],
        selectedAbility,
        selectedTarget,
      );

      await commitMove1v1(account, matchId, commitment);
      localStorage.setItem(
        `siege_1v1_ability_${matchId}_${state.round}`,
        JSON.stringify({ abilityId: selectedAbility, abilityTarget: selectedTarget }),
      );
      // Tx submitted — now wait for Torii to reflect `committed`. Button
      // stays disabled with a "CONFIRMING ON-CHAIN..." label until the
      // useEffect below flips `confirming` off.
      setSubmitting(false);
      setConfirming(true);
      // Start polling to bridge the gRPC subscription lag
      startPostTxPoll({ expectCommitted: true, expectCommitCount: roundStatus.commitCount + 1 });
      void refresh();
    } catch (e) {
      console.error("Commit failed:", e);
      setError(extractErrorMsg(e));
      commitLock.current = false;
      setSubmitting(false);
    }
  }, [account, state, allocations, budget, matchId, refresh, selectedAbility, selectedTarget, startPostTxPoll, roundStatus.commitCount]);

  // Clear confirming once Torii reports the commit on-chain (ends the
  // 5-10s indexing lag where the button was previously re-enabling).
  useEffect(() => {
    if (effectiveCommitted && confirming) setConfirming(false);
  }, [effectiveCommitted, confirming, setConfirming]);

  // Loading
  if (loading || !state) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#7a7060] tracking-wider animate-pulse">LOADING MATCH...</div>
      </div>
    );
  }

  // Not a player
  if (address && !roleFound) {
    return (
      <div className="max-w-lg mx-auto mt-20 space-y-4 text-center">
        <div className="text-[#ff3344] text-lg font-bold">NOT A PLAYER IN THIS MATCH</div>
        <div className="text-[#7a7060] text-sm">
          Your address: <span className="font-mono text-[#d4cfc6]">{address}</span>
        </div>
        <div className="text-[#7a7060] text-xs space-y-1">
          <div>
            Player A: <span className="font-mono">{state.playerA}</span>
          </div>
          <div>
            Player B: <span className="font-mono">{state.playerB}</span>
          </div>
        </div>
      </div>
    );
  }

  // End screen
  if (state.phase === "finished" && state.winner !== null) {
    const winnerNum = (state.winner === 0 || state.winner === 1 || state.winner === 2 ? state.winner : 0) as 0 | 1 | 2;
    return (
      <MatchEndActions
        matchId={matchId}
        winner={winnerNum}
        isPlayerA={isPlayerA}
        isPlayerB={isPlayerB}
        playerAAddr={state.playerA || ""}
        playerBAddr={state.playerB || ""}
        vaultAHp={state.vaultAHp}
        vaultBHp={state.vaultBHp}
        roundsPlayed={history.length}
      />
    );
  }

  // During optimistic resolving (heldHp not yet set by the chain path), show the
  // optimistic final HP; CSS width transition animates the bars down to it.
  const displayHp = heldHp ?? (optimisticOutcome ? { a: optimisticOutcome.vaultAHpAfter, b: optimisticOutcome.vaultBHpAfter } : null);
  const yourVault = displayHp ? (isPlayerA ? displayHp.a : displayHp.b) : (isPlayerA ? state.vaultAHp : state.vaultBHp);
  const enemyVault = displayHp ? (isPlayerA ? displayHp.b : displayHp.a) : (isPlayerA ? state.vaultBHp : state.vaultAHp);
  const yourPct = Math.max(0, Math.min(100, (yourVault / 50) * 100));
  const enemyPct = Math.max(0, Math.min(100, (enemyVault / 50) * 100));
  const hpBarColor = (pct: number) => (pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500");

  // Phase status text
  let phaseText = "";
  if (effectiveCommitted && !revealed && effectiveCommitCount < 2) {
    phaseText = "Waiting for opponent to commit...";
  } else if (effectiveCommitted && !revealed && effectiveCommitCount >= 2) {
    if (autoRevealStatus === "error") {
      phaseText = "Reveal failed — retry below";
    } else if (autoRevealStatus === "pending") {
      phaseText = "Auto-revealing your move...";
    } else {
      phaseText = "Preparing to reveal...";
    }
  } else if (effectiveCommitted && revealed && effectiveRevealCount < 2) {
    phaseText = "Waiting for opponent to reveal...";
  } else if (state.phase === "resolving") {
    phaseText = autoResolveError
      ? "Resolve failed — retry below"
      : optimisticOutcome
        ? "Confirming outcome on-chain..."
        : "Resolving round...";
  }

  const toggleRound = (round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  // Derive opponent allocations from the latest resolved round (shown post-reveal)
  const lastRound = history.length > 0 ? history[history.length - 1] : null;
  const opponentAllocations = lastRound && lastRound.round === state.round - 1
    ? isPlayerA
      ? [...lastRound.bAttack, ...lastRound.bDefense, 0, 0, 0, 0, ...lastRound.bTraps]
      : [...lastRound.aAttack, ...lastRound.aDefense, 0, 0, 0, 0, ...lastRound.aTraps]
    : null;

  // Whether the opponent has committed this round, derived from the total commit
  // count: both committed (>=2), or exactly one commit that isn't ours.
  const opponentCommitted =
    effectiveCommitCount >= 2 || (effectiveCommitCount >= 1 && !effectiveCommitted);

  // --- Intel pre-draft wiring ---
  // Budget the sketch should assume for the round it plans (state.round + 1).
  const myTeam: "teamA" | "teamB" = isPlayerA ? "teamA" : "teamB";
  const projectedBudget = computeBudget(state.nodes, myTeam, state.round + 1);
  // "Load Into Orders" is only offered while we can still edit this round's
  // commit. It copies the drawer's LIVE draft (a 10-slot array) into the 13-slot
  // allocation form, padding/zeroing the three trap slots — the pre-draft UI has
  // no trap inputs, and the form's own budget guard rejects any overspend, so we
  // don't re-validate here. The drawer persists the draft before calling this.
  const onLoadIntoOrders =
    state.phase === "committing" && !effectiveCommitted
      ? (alloc: number[]) => {
          const next = new Array(13).fill(0);
          for (let i = 0; i < 13; i++) next[i] = alloc[i] || 0;
          setAllocations(next);
        }
      : null;

  return (
    <div className="space-y-2 max-w-7xl mx-auto">
      {/* ===== 1. HEADER BANNER ===== */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] space-y-0 panel-header">
        {/* Row 1: Title, round, match ID, budget, player badge */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tracking-wider font-serif">SIEGE</span>
            <span className="text-sm font-bold text-[#d4cfc6] bg-[#252019] px-2 py-0.5 rounded">
              Round {state.round}
            </span>
            <span className="text-xs text-[#7a7060]">#{matchId}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#daa520] font-bold text-sm">
              {budget} pts
              {state.round > 6 && (
                <span className="ml-1.5 text-[10px] text-[#ff8800] font-normal tracking-wider">
                  +{state.round - 6} ENDGAME
                </span>
              )}
            </span>
            <span className="text-[10px] text-[#7a7060] border border-[#3d3428] rounded px-2 py-0.5">
              Player {isPlayerA ? "A" : "B"}
            </span>
            {opponentAddr && (
              <button
                id="intel-toggle"
                onClick={() => setDrawerOpen((o) => !o)}
                aria-label="Toggle war table intel"
                aria-pressed={drawerOpen}
                className={`text-[10px] tracking-wider uppercase font-serif font-bold text-[#c8a44e] border border-[#c8a44e]/60 rounded px-2 py-0.5 hover:bg-[#c8a44e]/10 transition-colors ${
                  phaseText ? "animate-pulse" : ""
                }`}
              >
                Intel
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Citadels as centerpieces with HP bars below */}
        <div className="grid grid-cols-2 gap-6 px-4 pb-3">
          {/* Your Citadel */}
          <div className="flex flex-col items-center">
            {(() => {
              const yourCosmetics = isPlayerA ? cosmeticsA : cosmeticsB;
              const bannerKey = yourCosmetics?.banner;
              return bannerKey && CIRCUITS[bannerKey] ? (
                <ArcaneSeal circuit={CIRCUITS[bannerKey]} name={bannerKey} size={48} />
              ) : null;
            })()}
            <Image
              src="/sprites/citadel.png"
              alt="Your Citadel"
              width={128}
              height={128}
              className="w-32 h-32 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(200,164,78,0.3)]"
            />
            <span className="text-xs tracking-wider text-[#c8a44e] uppercase font-bold mt-1">Your Citadel</span>
            <div className="w-full mt-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span className={`text-sm font-bold ${yourPct < 10 ? "animate-pulse text-red-400" : "text-[#d4cfc6]"}`}>
                  {yourVault} / 50
                </span>
                <span className="text-[10px] text-[#7a7060]">{Math.round(yourPct)}%</span>
              </div>
              <div className="w-full h-3 bg-[#252019] rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpBarColor(yourPct)} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${yourPct}%` }}
                />
              </div>
            </div>
          </div>
          {/* Enemy Citadel */}
          <div className="flex flex-col items-center">
            {(() => {
              const enemyCosmetics = isPlayerA ? cosmeticsB : cosmeticsA;
              const bannerKey = enemyCosmetics?.banner;
              return bannerKey && CIRCUITS[bannerKey] ? (
                <ArcaneSeal circuit={CIRCUITS[bannerKey]} name={bannerKey} size={48} />
              ) : null;
            })()}
            <Image
              src="/sprites/citadel.png"
              alt="Enemy Citadel"
              width={128}
              height={128}
              className="w-32 h-32 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(255,51,68,0.3)]"
              style={{ filter: "hue-rotate(340deg) saturate(1.5)" }}
            />
            <span className="text-xs tracking-wider text-[#ff3344] uppercase font-bold mt-1">Enemy Citadel</span>
            <div className="w-full mt-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span
                  className={`text-sm font-bold ${enemyPct < 10 ? "animate-pulse text-red-400" : "text-[#d4cfc6]"}`}
                >
                  {enemyVault} / 50
                </span>
                <span className="text-[10px] text-[#7a7060]">{Math.round(enemyPct)}%</span>
              </div>
              <div className="w-full h-3 bg-[#252019] rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpBarColor(enemyPct)} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${enemyPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 1b. STAKES + HOLD STATUS ===== */}
      <MatchStakesHeader stakes={matchStakes} isPlayerA={isPlayerA} />
      <HoldStatusStrip playerA={state.playerA} playerB={state.playerB} isPlayerA={isPlayerA} refreshKey={refreshKey} />

      {/* ===== 2. BATTLEFIELD + CONTROLS (side-by-side) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-2">
        {/* Left: Animated Battlefield + War Log */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Battlefield3DGate
              allocations={allocations}
              isPlayerA={isPlayerA}
              committed={effectiveCommitted}
              opponentCommitted={opponentCommitted}
              modifiers={modifiers}
              opponentAllocations={opponentAllocations}
              nodes={state.nodes}
              vaultAHp={state.vaultAHp}
              vaultBHp={state.vaultBHp}
              history={history}
              outcome={optimisticOutcome ?? null}
              onResolutionComplete={handleOptimisticComplete}
              fallbackOnly={
                pendingResult && heldHp ? (
                  <BattleAnimation
                    result={pendingResult}
                    prevNodes={prevNodes}
                    newNodes={state.nodes}
                    isPlayerA={isPlayerA}
                    heldHp={heldHp}
                    onComplete={handleResolutionComplete}
                  />
                ) : optimisticView && dismissedOptimisticRound !== state.round ? (
                  <BattleAnimation
                    result={optimisticView.result}
                    prevNodes={prevNodes}
                    newNodes={optimisticView.newNodes}
                    isPlayerA={isPlayerA}
                    heldHp={optimisticView.heldHp}
                    onComplete={handleOptimisticComplete}
                  />
                ) : null
              }
            />
            {optimisticOutcome && state.phase === "resolving" && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-[10px] tracking-wider uppercase text-[#c8a44e] bg-[#1a1714]/90 border border-[#c8a44e]/40 rounded-full px-3 py-1 animate-pulse">
                confirming on-chain…
              </div>
            )}
          </div>

          {/* Gate modifier cards — this round's modifiers, paired by accent
              color with the glowing bands on the 3D gates. */}
          <ModifierCards modifiers={modifiers} />

          {/* War Dispatch Log */}
          <div className="border border-[#3d3428] rounded-lg bg-[#1a1714]">
            <div className="px-4 pt-3 pb-2">
              <span className="text-[10px] tracking-wider text-[#7a7060] uppercase font-serif">War Dispatch Log</span>
            </div>
            {history.length === 0 ? (
              <div className="px-4 pb-3 text-sm text-[#7a7060]">No rounds played yet</div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {history.map((r: RoundResult1v1) => {
                  const gateDmgDealt = isPlayerA ? r.damageToB : r.damageToA;
                  const gateDmgTaken = isPlayerA ? r.damageToA : r.damageToB;
                  const myTraps = isPlayerA ? r.aTraps : r.bTraps;
                  const theirTraps = isPlayerA ? r.bTraps : r.aTraps;
                  const myTrapDmg = myTraps.filter((t) => t > 0).length * 5;
                  const theirTrapDmg = theirTraps.filter((t) => t > 0).length * 5;
                  const dmgDealt = gateDmgDealt + myTrapDmg;
                  const dmgTaken = gateDmgTaken + theirTrapDmg;
                  const isExpanded = expandedRounds.has(r.round);
                  const gateNames = ["East", "West", "Underground"];

                  return (
                    <div key={r.round} className="border-t border-[#252019]">
                      <button
                        onClick={() => toggleRound(r.round)}
                        className="w-full px-4 py-2 flex items-center justify-between text-xs hover:bg-[#252019] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[#7a7060] text-[10px]">{isExpanded ? "▼" : "▶"}</span>
                          <span className="text-[#d4cfc6] font-bold">R{r.round}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400">+{dmgDealt} dealt</span>
                          {myTrapDmg > 0 && <span className="text-[#daa520]">(trap +{myTrapDmg})</span>}
                          <span className="text-[#7a7060]">/</span>
                          <span className="text-red-400">-{dmgTaken} taken</span>
                          {theirTrapDmg > 0 && <span className="text-[#ff3344]">(trap -{theirTrapDmg})</span>}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            {r.gateBreakdown.map((gate, i) => {
                              const modName = MODIFIER_NAMES[gate.modifier] || "Normal";
                              const modColor =
                                gate.modifier === 0
                                  ? "text-[#7a7060]"
                                  : gate.modifier === 1
                                    ? "text-[#daa520]"
                                    : gate.modifier === 2
                                      ? "text-[#c8a44e]"
                                      : gate.modifier === 3
                                        ? "text-[#ff3344]"
                                        : "text-[#ff8800]";
                              const myDmgDealt = isPlayerA ? gate.dmgToB : gate.dmgToA;
                              const myDmgTaken = isPlayerA ? gate.dmgToA : gate.dmgToB;
                              return (
                                <div key={i} className="bg-[#252019] rounded p-2 space-y-1 text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[#d4cfc6] font-bold">{gateNames[i]}</span>
                                    {gate.modifier !== 0 && <span className={`${modColor} text-[10px]`}>{modName}</span>}
                                  </div>
                                  <div className="text-[#7a7060]">
                                    You: {isPlayerA ? gate.attackA : gate.attackB} atk /{" "}
                                    {isPlayerA ? gate.defenseA : gate.defenseB} def
                                  </div>
                                  <div className="text-[#7a7060]">
                                    Them: {isPlayerA ? gate.attackB : gate.attackA} atk /{" "}
                                    {isPlayerA ? gate.defenseB : gate.defenseA} def
                                  </div>
                                  <div>
                                    {myDmgDealt > 0 && <span className="text-green-400">+{myDmgDealt} </span>}
                                    {myDmgTaken > 0 && <span className="text-red-400">-{myDmgTaken}</span>}
                                    {myDmgDealt === 0 && myDmgTaken === 0 && <span className="text-[#7a7060]">0</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {(r.aTraps.some((t) => t > 0) || r.bTraps.some((t) => t > 0)) && (
                            <div className="text-xs border-t border-[#3d3428] pt-2 space-y-1">
                              <div className="text-[10px] tracking-wider text-[#7a7060] uppercase">Node Traps</div>
                              {(() => {
                                const nodeNames = ["Forge", "Quarry", "Grove"];
                                return [0, 1, 2].map((ni) => {
                                  const myTrap = isPlayerA ? r.aTraps[ni] : r.bTraps[ni];
                                  const theirTrap = isPlayerA ? r.bTraps[ni] : r.aTraps[ni];
                                  if (myTrap) {
                                    return (
                                      <div key={`mt${ni}`} className="text-[#daa520]">
                                        You trapped {nodeNames[ni]} — opponent takes{" "}
                                        <span className="text-[#ff3344] font-bold">5 damage</span> if they captured it
                                      </div>
                                    );
                                  }
                                  if (theirTrap) {
                                    return (
                                      <div key={`tt${ni}`} className="text-[#ff3344]">
                                        Enemy trapped {nodeNames[ni]}! You take <span className="font-bold">5 damage</span>{" "}
                                        if you captured it
                                      </div>
                                    );
                                  }
                                  return null;
                                });
                              })()}
                            </div>
                          )}
                          {(r.aAbilityId > 0 || r.bAbilityId > 0) && (
                            <div className="text-xs border-t border-[#3d3428] pt-2 space-y-1">
                              <div className="text-[10px] tracking-wider text-[#7a7060] uppercase">Abilities Used</div>
                              {(() => {
                                const myAbilityId = isPlayerA ? r.aAbilityId : r.bAbilityId;
                                const myAbilityTarget = isPlayerA ? r.aAbilityTarget : r.bAbilityTarget;
                                const theirAbilityId = isPlayerA ? r.bAbilityId : r.aAbilityId;
                                const theirAbilityTarget = isPlayerA ? r.bAbilityTarget : r.aAbilityTarget;
                                const abilityGateNames = ["East Gate", "West Gate", "Underground Gate"];
                                const getAbilityName = (id: number) => ABILITIES[id - 1]?.name || `Ability #${id}`;
                                return (
                                  <>
                                    {myAbilityId > 0 && (
                                      <div className="text-[#c8a44e]">
                                        You used <span className="font-bold">{getAbilityName(myAbilityId)}</span>
                                        {myAbilityTarget > 0 && ` on ${abilityGateNames[myAbilityTarget - 1] || `target ${myAbilityTarget}`}`}
                                      </div>
                                    )}
                                    {theirAbilityId > 0 && (
                                      <div className="text-[#ff8800]">
                                        Opponent used <span className="font-bold">{getAbilityName(theirAbilityId)}</span>
                                        {theirAbilityTarget > 0 && ` on ${abilityGateNames[theirAbilityTarget - 1] || `target ${theirAbilityTarget}`}`}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Resources + Deployment Controls */}
        <div className="flex flex-col gap-2">
          {/* Resources bar */}
          <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-[#1a1714] border border-[#3d3428] rounded-lg">
            <span className="text-[10px] tracking-wider text-[#7a7060] uppercase shrink-0 mr-2">Resources</span>
            {[
              { label: "Iron", value: resources.iron, color: "text-[#a0a0b0]" },
              { label: "Linen", value: resources.linen, color: "text-[#d4a574]" },
              { label: "Stone", value: resources.stone, color: "text-[#8a8a9a]" },
              { label: "Wood", value: resources.wood, color: "text-[#8b6914]" },
              { label: "Ember", value: resources.ember, color: "text-[#ff6633]" },
              { label: "Seeds", value: resources.seeds, color: "text-[#66cc66]" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-1 px-2 py-0.5 bg-[#252019] rounded text-xs shrink-0">
                <span className={`font-bold ${color}`}>{value}</span>
                <span className="text-[10px] text-[#7a7060]">{label}</span>
              </div>
            ))}
          </div>

          {/* Deployment panel */}
          <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] flex-1">
            {state.phase === "committing" && (!effectiveCommitted || confirming) ? (
              <AllocationForm1v1
                budget={budget}
                allocations={allocations}
                onChange={setAllocations}
                onCommit={handleCommit}
                submitting={submitting}
                confirming={confirming}
                error={error}
                nodes={state.nodes}
                isPlayerA={isPlayerA}
                abilities={matchAbilities.abilities}
                abilitiesUsed={matchAbilities.used}
                selectedAbility={selectedAbility}
                selectedTarget={selectedTarget}
                onAbilitySelect={handleAbilitySelect}
              />
            ) : (
              <div className="p-3 flex flex-col items-center justify-center gap-2 h-full">
                {phaseText ? (
                  <span
                    className={`text-sm tracking-wide ${autoRevealStatus === "error" ? "text-[#ff9944]" : "text-[#7a7060] animate-pulse"}`}
                  >
                    {phaseText}
                  </span>
                ) : (
                  <span className="text-[#7a7060] text-xs">Awaiting next phase...</span>
                )}
                {autoRevealStatus === "error" && (
                  <>
                    {autoRevealError && (
                      <span className="text-[10px] text-[#7a7060] font-mono max-w-full truncate px-2">
                        {autoRevealError}
                      </span>
                    )}
                    <button
                      onClick={handleRetryReveal}
                      className="px-4 py-1.5 bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] text-xs tracking-wider rounded hover:bg-[#c8a44e]/20 transition-colors"
                    >
                      RETRY REVEAL
                    </button>
                  </>
                )}
                {autoResolveError && (
                  <>
                    <span className="text-[10px] text-[#7a7060] font-mono max-w-full truncate px-2">
                      {autoResolveError}
                    </span>
                    <button
                      onClick={() => {
                        autoResolveLock.current = false;
                        setAutoResolveError("");
                        setResolveRetryCount((c) => c + 1);
                      }}
                      className="px-4 py-1.5 bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] text-xs tracking-wider rounded hover:bg-[#c8a44e]/20 transition-colors"
                    >
                      RETRY RESOLVE
                    </button>
                  </>
                )}
                {state.phase === "resolving" && !autoResolveError && effectiveRevealCount >= 2 && (
                  <button
                    onClick={async () => {
                      if (!account) return;
                      try {
                        await resolveRound1v1(account, matchId);
                        setAutoResolveError("");
                      } catch (e) {
                        setAutoResolveError(extractErrorMsg(e));
                      }
                      void refresh();
                    }}
                    className="px-4 py-1.5 bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] text-xs tracking-wider rounded hover:bg-[#c8a44e]/20 transition-colors mt-1"
                  >
                    RESOLVE MANUALLY
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && !state.phase && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">{error}</div>
      )}

      <div className="text-[10px] text-[#3d3428] text-center pb-4">
        Move data stored in localStorage until revealed. Auto-reveal triggers when both players commit.
      </div>

      {opponentAddr && (
        <IntelDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          intel={intel}
          bluff={bluff}
          opponentLabel={`${opponentAddr.slice(0, 6)}…${opponentAddr.slice(-4)}`}
          projectedBudget={projectedBudget}
          preDraft={preDraft}
          onSavePreDraft={handleSavePreDraft}
          onLoadIntoOrders={onLoadIntoOrders}
        />
      )}
    </div>
  );
}
