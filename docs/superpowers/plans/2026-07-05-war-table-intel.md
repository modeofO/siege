# War Table Intel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An intel drawer on the 1v1 match page showing the opponent's cross-match patterns (gate habits by game phase, trap/repair/ability tendencies, head-to-head record, a bluff detector) plus a pre-draft scratchpad that loads into the allocation form in one tap — giving players something to strategize with during waits.

**Architecture:** Read-only, no contract changes, no new transactions. A thin Torii SQL fetch layer pulls the opponent's finished matches, all revealed moves, and per-round modifiers; a pure replay/aggregation core reconstructs each match round-by-round with the existing Cairo-pinned `resolveRoundLocal` engine (accurate HP timelines and node ownership, not crude averages) and folds it into an `OpponentProfile`; pure scoring compares the current match's revealed rounds against the profile (bluff detector); the drawer renders it with plain CSS bars in the app palette. Pre-draft persists to localStorage keyed by match+round.

**Tech Stack:** TypeScript, vitest, existing `toriiSql` helpers, existing `resolveRoundLocal` / `computeBudget`. No new dependencies.

## Global Constraints

- Work from `/Users/modeofo/Apps/siege/frontend`, branch `feat/war-table-intel`. Do NOT touch `.claude/worktrees/`.
- Torii SQL is the only new read path — **no GraphQL**. Address columns compare via `sqlAddr()`, u64 keys via `sqlU64()` (zero-padded hex text), tables quoted as `"siege_dojo-Model"` — all from `@/lib/toriiSql`.
- Frontend rules: `BigInt(0)` not `0n`; `react-hooks/set-state-in-effect` strict — data hooks use the derived-loading pattern already in the codebase (see `useAbilityBalances` in `stakedMatch.ts`: `loading = liveKey !== loadedKey`).
- Gates every task: `bun run lint` (baseline: 10 pre-existing problems, add ZERO), `bunx tsc --noEmit`, `bun run build`; vitest for every pure module.
- Commit per task with trailer `Co-authored-by: Claude <noreply@anthropic.com>`. No pushes.
- UI palette: bg `#1a1714`, panel `#252019`, borders `#3d3428`, gold `#c8a44e`, muted `#7a7060`, text `#d4cfc6`, accent `#daa520`, attack `#ff8800`, defense `#6b8cae`, repair `#66cc66`, danger `#ff3344`. Serif headings via `font-serif`, tracking-wider uppercase micro-labels — match `AllocationForm1v1.tsx`'s idiom.
- Visual verification: `node scripts/battlefield-shot.mjs <url> <shot.png>` (headless Brave; dev server is **https**://localhost:3000, use `domcontentloaded`) — screenshot evidence goes in task reports for UI tasks.

## Domain facts the implementer must not rediscover wrong

- Allocation array: `[p0,p1,p2, g0,g1,g2, repair, nc0,nc1,nc2, trap0,trap1,trap2]`. Repair costs 2 budget/HP, traps 2 each. Budget = `10 + ownedNodes + max(0, round-6)` (`computeBudget` in `gameState1v1.ts`).
- Game phases for aggregation: early = rounds 1–3, mid = 4–6, endgame = 7–10.
- Ability decode: `abilityType(id)`/`abilityTier(id)` exported from `@/lib/resolution1v1`; types 1 Siege Sword, 2 Stone Cloak, 3 Ember Blast, 4 Hex, 5 Fortify.
- Every match starts: vaults 50/50, all nodes neutral, round-1 modifiers from `RoundModifiers1v1 (match_id, 1)`.
- `RoundMoves1v1` columns: `a_p0..a_p2, a_g0..a_g2, a_repair, a_nc0..a_nc2, a_ability_id, a_ability_target` (+ `b_*` mirrors), `reveal_count`. Trap columns live in `RoundTraps1v1` (`a_trap0..2`, `b_trap0..2`).
- `MatchState1v1` columns include `player_a`, `player_b`, `status` (text: 'Pending' | 'Active' | 'Finished'), `current_round`.
- `MatchRecord` is keyed `(player, opponent)` with `wins`, `losses`, `last_match_id`.

## File Structure

- Create: `frontend/src/lib/intel/types.ts` — shared interfaces (kept tiny)
- Create: `frontend/src/lib/intel/replay.ts` — pure: replay one match's rounds through `resolveRoundLocal`
- Create: `frontend/src/lib/intel/profile.ts` — pure: fold replayed matches into `OpponentProfile`
- Create: `frontend/src/lib/intel/bluff.ts` — pure: deviation of current match vs profile
- Create: `frontend/src/lib/intel/predraft.ts` — localStorage pre-draft store + projected budget
- Create: `frontend/src/lib/intel/queries.ts` — Torii SQL fetches + per-opponent cache + `useOpponentIntel` hook
- Create: `frontend/src/components/intel/IntelDrawer.tsx` — the drawer UI (heatmap, tendencies, H2H, bluff, pre-draft)
- Modify: `frontend/src/app/match-1v1/[id]/page.tsx` — drawer toggle + pre-draft load wiring
- Tests: `frontend/src/lib/intel/__tests__/{replay,profile,bluff,predraft}.test.ts`

---

### Task 1: Types + match replay (pure, TDD)

**Files:** `types.ts`, `replay.ts`, test.

**Interfaces (exact — later tasks import verbatim):**

```ts
// types.ts
import type { PlayerMove } from "@/lib/resolution1v1";

export interface HistoricalRound {
  round: number;
  moveA: PlayerMove;
  moveB: PlayerMove;
  modifiers: [number, number, number];
}

export interface ReplayedRound {
  round: number;
  /** The OPPONENT's move this round (side-normalized by replayMatch). */
  move: PlayerMove;
  /** Opponent's vault HP entering the round. */
  hpBefore: number;
  /** Opponent's owned-node count entering the round (drives budget). */
  nodesBefore: number;
}

export interface ReplayedMatch {
  matchId: string;
  rounds: ReplayedRound[];
  opponentWon: boolean | null; // null = draw/unfinished-at-10
}
```

```ts
// replay.ts
import { resolveRoundLocal } from "@/lib/resolution1v1";
import type { NodeOwner } from "@/lib/gameState1v1";
import type { HistoricalRound, ReplayedMatch, ReplayedRound } from "./types";

/**
 * Replays a finished match round-by-round through the Cairo-pinned engine to
 * recover the OPPONENT's per-round context (their HP entering each round and
 * their node count), normalized so `move` is always the opponent's move
 * regardless of which slot they held.
 */
export function replayMatch(
  matchId: string,
  rounds: HistoricalRound[],           // ascending round order, revealed only
  opponentIsA: boolean,
): ReplayedMatch {
  let hpA = 50;
  let hpB = 50;
  let nodes: [NodeOwner, NodeOwner, NodeOwner] = ["neutral", "neutral", "neutral"];
  const out: ReplayedRound[] = [];
  let winnerTeam: 0 | 1 | 2 | null = null;

  for (const r of rounds) {
    const oppTeam: NodeOwner = opponentIsA ? "teamA" : "teamB";
    out.push({
      round: r.round,
      move: opponentIsA ? r.moveA : r.moveB,
      hpBefore: opponentIsA ? hpA : hpB,
      nodesBefore: nodes.filter((n) => n === oppTeam).length,
    });
    const res = resolveRoundLocal({
      moveA: r.moveA,
      moveB: r.moveB,
      nodeOwners: nodes,
      modifiers: r.modifiers,
      vaultAHp: hpA,
      vaultBHp: hpB,
      round: r.round,
    });
    hpA = res.vaultAHpAfter;
    hpB = res.vaultBHpAfter;
    nodes = res.nodeOwnersAfter;
    if (res.finished) {
      winnerTeam = res.winnerTeam;
      break;
    }
  }

  const opponentWon =
    winnerTeam === null || winnerTeam === 0
      ? winnerTeam === 0 ? null : null
      : (winnerTeam === 1) === opponentIsA;
  return { matchId, rounds: out, opponentWon };
}
```

(The `opponentWon` expression above is deliberately spelled clumsily to make the intent unmissable — implementer may simplify to an equivalent form, but the truth table is: winner 1 & opponentIsA → true; winner 2 & !opponentIsA → true; winner 0 or null → null; otherwise false. Pin all four cases in tests.)

- [ ] **Step 1: failing tests** — a 2-round synthetic match (build moves inline; reuse the `MOVE0` fixture idea from `resolution1v1.test.ts`): assert `hpBefore` sequence matches engine outputs (round 1: 50, round 2: `vaultXHpAfter` of round 1); `nodesBefore` updates after a capture; side normalization (same rounds, `opponentIsA` flipped, yields the mirrored `move`s); the four `opponentWon` cases (win as A, win as B, draw → null, loss → false); replay stops at `finished`.
- [ ] **Step 2: run, verify fail** (`bunx vitest run src/lib/intel/__tests__/replay.test.ts`), implement, verify pass.
- [ ] **Step 3: gates + commit** — `intel: types and Cairo-engine match replay`

---

### Task 2: Opponent profile aggregation (pure, TDD)

**Files:** `profile.ts`, test.

**Interfaces (exact):**

```ts
export type Phase = "early" | "mid" | "endgame";
export function phaseOf(round: number): Phase; // 1-3, 4-6, 7-10 (>=7 all endgame)

export interface PhaseProfile {
  rounds: number;                       // sample size
  atkShareByGate: [number, number, number];  // opponent attack distribution, sums to 1 (or all 0 if no attack)
  defShareByGate: [number, number, number];
  avgAttackTotal: number;               // mean attack points per round
  avgDefenseTotal: number;
  avgRepair: number;                    // mean repair HP per round
  avgContest: number;                   // mean node-contest points per round
}

export interface OpponentProfile {
  matchesAnalyzed: number;
  roundsAnalyzed: number;
  phases: Record<Phase, PhaseProfile>;
  trapRate: number;                     // traps armed / rounds where they owned >=1 node
  repairWhenLowShare: number;           // budget share spent on repair in rounds entered below 30 HP (0 if never low)
  abilityRounds: Record<number, number[]>; // abilityType (1-5) -> rounds where used (any tier)
  winRate: number;                      // wins / decided matches (draws excluded); 0 if none
}

export function buildProfile(matches: ReplayedMatch[]): OpponentProfile;
```

Semantics to pin in tests: shares normalize within phase across all rounds (sum of per-gate attack ÷ total attack); `trapRate` denominator counts only rounds with `nodesBefore >= 1` (can't trap unowned nodes); `repairWhenLowShare` = Σ(repair×2) ÷ Σ(budget) over rounds with `hpBefore < 30`, where budget = `10 + nodesBefore + max(0, round-6)`; empty input → zeroed profile with `matchesAnalyzed: 0`.

- [ ] TDD steps as usual (failing tests incl. empty input, a crafted two-phase distribution, trap denominator, low-HP repair share, ability round collection, winRate with a draw excluded), gates, commit — `intel: opponent profile aggregation`

---

### Task 3: Bluff detector + pre-draft store (pure, TDD)

**Files:** `bluff.ts`, `predraft.ts`, tests.

**bluff.ts (exact):**

```ts
export interface BluffReading {
  score: number;        // 0 = playing to type, 1 = fully off-book
  sample: number;       // rounds compared
  note: string;         // one-line human summary, e.g. "Attacking West far more than usual"
}
/** Compare the current match's revealed opponent rounds against their profile. */
export function detectDeviation(current: ReplayedRound[], profile: OpponentProfile): BluffReading;
```

Score = mean over compared rounds of 0.5×L1-distance between the round's attack-share vector and the profile's phase `atkShareByGate` (L1 of two distributions is in [0,2]; halving normalizes to [0,1]); rounds in phases with `rounds === 0` sample are skipped; fewer than 2 comparable rounds → `{score: 0, sample, note: "Not enough data"}`. The note names the gate with the largest positive deviation using the display names East/West/Underground for data gates 0/1/2.

**predraft.ts (exact):**

```ts
export interface PreDraft { allocations: number[]; forRound: number; }
export function savePreDraft(matchId: string, forRound: number, allocations: number[]): void;
export function loadPreDraft(matchId: string, forRound: number): PreDraft | null;
export function clearPreDraft(matchId: string): void;              // all rounds for the match
export function projectedBudget(nodes: NodeOwner[], team: "teamA" | "teamB", forRound: number): number; // delegates to computeBudget
```

localStorage keys: `siege_intel_predraft_<matchId>_<forRound>` (matches the `siege_1v1_*` convention family). Guard `typeof window === "undefined"` (SSR) by no-oping. Tests run under jsdom/happy-dom via vitest — check `vitest.config`/existing tests for the environment; if none is configured for DOM, stub a minimal localStorage in the test file rather than adding a dependency.

- [ ] TDD, gates, commit — `intel: bluff detector and pre-draft store`

---

### Task 4: Torii SQL fetch layer + hook

**Files:** `queries.ts`.

**Interfaces:**

```ts
export interface OpponentIntel {
  profile: OpponentProfile | null;   // null while loading or no data
  h2h: { wins: number; losses: number } | null;  // from MY perspective vs them
  currentRounds: ReplayedRound[];    // opponent's revealed rounds THIS match (for bluff)
  loading: boolean;
}
export function useOpponentIntel(
  opponentAddr: string | null,
  myAddr: string | null,
  currentMatchId: string | null,
  currentRound: number,              // re-fetch trigger as rounds resolve
): OpponentIntel;
```

Implementation notes (bind these):
- Finished matches: `SELECT match_id, player_a, player_b, status FROM "siege_dojo-MatchState1v1" WHERE (player_a = ${sqlAddr(addr)} OR player_b = ${sqlAddr(addr)}) AND status = 'Finished' ORDER BY match_id DESC LIMIT 25` — cap at 25 matches (`log()`-free silent caps are a plan smell, so surface the cap: profile card shows "last N matches").
- Moves+modifiers per match batch: `WHERE match_id IN (...)` with `sqlU64` values; join `RoundTraps1v1` the same way; only `reveal_count >= 2` rounds enter replay. Exclude the CURRENT match from the profile (it feeds `currentRounds` instead, minus rounds not yet revealed).
- H2H: `SELECT wins, losses FROM "siege_dojo-MatchRecord" WHERE player = ${sqlAddr(myAddr)} AND opponent = ${sqlAddr(opponentAddr)}`.
- Cache: module-level `Map<opponentAddr, {matchIds: string, profile}>` — recompute only when the finished-match id set changes. Current-match rounds re-derive on `currentRound` change.
- Hook: fetch in `useEffect` with cancellation flag + derived-loading pattern (`loadedKey !== liveKey`), mirroring `useAbilityBalances` in `stakedMatch.ts`. NO synchronous setState outside async callbacks.
- Column value mapping into `PlayerMove` mirrors `useRevealedMoves1v1` in `gameState1v1.ts` — read it and follow the same field mapping (`toNum` for coercion).

- [ ] Implement; gates (no unit tests mandated for the thin fetch layer — the pure core is already covered; typecheck + lint + build). Commit — `intel: Torii history fetch, cache, and useOpponentIntel hook`

---

### Task 5: Intel drawer UI

**Files:** `IntelDrawer.tsx`.

**Props (exact):**

```ts
interface IntelDrawerProps {
  open: boolean;
  onClose: () => void;
  intel: OpponentIntel;
  bluff: BluffReading | null;          // null pre-computation
  opponentLabel: string;               // short address or name
  // Pre-draft:
  projectedBudget: number;
  preDraft: number[] | null;
  onSavePreDraft: (allocations: number[]) => void;
  onLoadIntoOrders: (() => void) | null; // null when not in commit phase (button disabled)
}
```

Layout (right-side slide-over drawer, `fixed inset-y-0 right-0 w-[380px]`, panel bg `#1a1714`, border-l `#3d3428`, z-40 — below the victory overlay's z-50):
1. **Header**: "WAR TABLE INTEL" serif micro-label + opponent label + close ×.
2. **Gate habits**: a 3×3 grid (phases × gates East/Under/West to match `GATE_ORDER` display order in `AllocationForm1v1.tsx`) — each cell a horizontal bar pair: attack share (`#ff8800`) over defense share (`#6b8cae`), opacity scaled by share; phase row label shows sample size ("EARLY · 12r"). Pure CSS divs, no chart lib.
3. **Tendencies**: stat rows — trap rate (%), repair-when-low share (%), avg contest, per-ability chips (name + typical rounds, e.g. "Stone Cloak · R6–8") from `abilityRounds` (show median-ish range; simple min–max is fine, pin the choice in code comment).
4. **Head to head**: "You 3 — 1 Them" from `h2h` (perspective already mine); hide row when null.
5. **Bluff detector**: labeled meter 0–100% (`#66cc66` → `#daa520` → `#ff3344` by thirds) + the `note`; hidden when `bluff` null or sample < 2.
6. **Pre-draft**: compact 10-slot editor — reuse `AllocationForm1v1`'s slider idiom but minimal (attack/defense/repair/contest rows against `projectedBudget`, no ability selector, no traps); "Save sketch" (calls `onSavePreDraft`) and "Load into orders" (disabled with tooltip when `onLoadIntoOrders` null).
7. Empty state when `profile?.matchesAnalyzed === 0`: "No finished matches on record for this commander."
8. Loading state: three shimmer rows.

- [ ] Implement; gates. **Visual evidence:** temporarily render the drawer with a synthetic `OpponentIntel` on `/dev-battlefield` (add a query param or a second fixture block — keep it in the fixture, it's dev-only), capture with `battlefield-shot.mjs`, attach the screenshot path + a one-line description to the report, then leave the fixture wiring in place (it's the visual test bed). Commit — `intel: war table intel drawer UI`

---

### Task 6: Page wiring

**Files:** `page.tsx`.

- Opponent address: `isPlayerA ? state.playerB : state.playerA`.
- `useOpponentIntel(opponentAddr, address, matchId, state.round)`.
- Bluff: `useMemo(() => intel.profile && intel.currentRounds.length ? detectDeviation(intel.currentRounds, intel.profile) : null, [...])`.
- Drawer toggle: a small "INTEL" button in the header row next to the budget (gold-bordered chip, matching the existing `Player A/B` chip idiom at ~line 663); pulse its border subtly (existing `animate-pulse` idiom) while `phaseText` indicates a waiting state — the drawer is the thing to do while waiting.
- Pre-draft wiring: `projectedBudget` = `computeBudget(state.nodes, myTeam, state.round + 1)`; `onLoadIntoOrders` non-null only when `state.phase === "committing" && !effectiveCommitted` — it copies the saved sketch into `setAllocations` (pad/trim to 13 slots, zero the trap slots if the sketch's traps are now invalid — simplest: keep trap slots from sketch, the form's own budget guard already rejects overspend; document the choice). Save current `allocations` as the sketch for round+1 via the drawer.
- Drawer state: plain `useState(false)`; no effects.
- Gates: lint baseline / tsc / `bun run test` (only pre-existing stakedMatch failure) / build. **Visual evidence:** `battlefield-shot.mjs` against `https://localhost:3000/match-1v1/6` with the drawer opened via `page.click` on the INTEL button (extend the script invocation inline in the report if needed — puppeteer `page.click('#intel-toggle')`; give the button that id).
- [ ] Commit — `match page: intel drawer and pre-draft wiring`

---

## Testing

Pure modules (replay, profile, bluff, predraft) are vitest-covered with exact semantics pinned. The fetch layer is thin and typed; the drawer and wiring are verified by gates + headless screenshots via the established harness.

## Out of scope (YAGNI)

- The prediction/"call their move" mini-game (possible later drawer addition).
- Opponent name resolution (Cartridge usernames) — short address is fine for v1.
- Any caching beyond the in-memory per-opponent map (no IndexedDB).
- Spectate-page intel.
