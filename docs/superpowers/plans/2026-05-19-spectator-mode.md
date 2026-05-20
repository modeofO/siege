# Spectator Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only spectator view for live 1v1 matches, a "Live Battles" section on the world page, and spectator URLs in MCP tool responses.

**Architecture:** New `/match-1v1/[id]/spectate` route reuses existing gRPC subscription hooks and display components with neutral labeling. World page gets a Torii SQL-powered live match list. MCP server adds `spectate_url` to match creation/state tool responses via a configurable frontend URL.

**Tech Stack:** Next.js 16, React 19, Dojo SDK gRPC hooks, Torii SQL, existing BattlefieldView/MatchStakesHeader/HoldStatusStrip components. Zero new dependencies.

---

### Task 1: MCP Server — Add `frontendUrl` Config

**Files:**
- Modify: `mcp-server-2/src/config.ts`

- [ ] **Step 1: Add `frontendUrl` to Config interface**

In `mcp-server-2/src/config.ts`, add `frontendUrl` to the `Config` interface and read it from env:

```typescript
// In the Config interface, add after agentPromptPath:
frontendUrl: string;
```

```typescript
// In loadConfig(), add to the returned object after agentPromptPath:
frontendUrl: process.env.SIEGE_FRONTEND_URL ?? "https://localhost:3000",
```

- [ ] **Step 2: Verify MCP server still compiles**

Run: `cd mcp-server-2 && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add mcp-server-2/src/config.ts
git commit -m "feat(mcp): add frontendUrl config for spectator URLs"
```

---

### Task 2: MCP Server — Add `spectate_url` to Tool Responses

**Files:**
- Modify: `mcp-server-2/src/tools.ts`

- [ ] **Step 1: Add `spectate_url` to `siege_get_match_state` response**

In `mcp-server-2/src/tools.ts`, find the `siege_get_match_state` handler (around line 515). Add `spectate_url` to the returned object:

```typescript
return {
  match_id,
  spectate_url: `${ctx.config.frontendUrl}/match-1v1/${match_id}/spectate`,
  status: state.status,
  // ... rest unchanged
};
```

- [ ] **Step 2: Add `spectate_url` to `siege_create_match` response**

Find the `siege_create_match` handler (around line 1519). Modify both return branches:

```typescript
if (match_id !== null) ctx.watchMatch(match_id);
return match_id !== null
  ? { tx_hash: tx, match_id, player_a, player_b, spectate_url: `${ctx.config.frontendUrl}/match-1v1/${match_id}/spectate` }
  : {
      tx_hash: tx,
      match_id: null,
      player_a,
      player_b,
      spectate_url: null,
      warning: "match_id not yet indexed by Torii — query siege_get_match_state by id once it appears",
    };
```

- [ ] **Step 3: Add `spectate_url` to `siege_create_staked_match` response**

Find the `siege_create_staked_match` handler (around line 1156). Modify the return:

```typescript
return {
  tx_hash: tx,
  match_id,
  spectate_url: match_id !== null ? `${ctx.config.frontendUrl}/match-1v1/${match_id}/spectate` : null,
  opponent,
  abilities,
  warning:
    match_id === null
      ? "match_id not yet indexed by Torii — query siege_get_staked_match once it appears"
      : undefined,
};
```

- [ ] **Step 4: Verify MCP server compiles**

Run: `cd mcp-server-2 && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add mcp-server-2/src/tools.ts
git commit -m "feat(mcp): add spectate_url to match creation and state tool responses"
```

---

### Task 3: Spectator Page — Core Structure

**Files:**
- Create: `frontend/src/app/match-1v1/[id]/spectate/page.tsx`

- [ ] **Step 1: Create the spectator page**

Create `frontend/src/app/match-1v1/[id]/spectate/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  useMatchState1v1,
  useRoundStatus1v1,
  useRoundHistory1v1,
  useRoundModifiers1v1,
  useMatchStakes1v1,
  MODIFIER_NAMES,
} from "@/lib/gameState1v1";
import type { RoundResult1v1 } from "@/lib/gameState1v1";
import { BattlefieldView } from "@/components/BattlefieldView";
import { MatchStakesHeader } from "@/components/MatchStakesHeader";
import { HoldStatusStrip } from "@/components/HoldStatusStrip";
import { usePlayerCosmetics } from "@/lib/cosmetics";
import { ArcaneSeal } from "@/components/forge/ArcaneSeal";
import { CIRCUITS } from "@/lib/forge/circuits";

export default function SpectatorPage() {
  const params = useParams();
  const matchId = params.id as string;

  const { state, loading, refreshKey } = useMatchState1v1(matchId);
  const history = useRoundHistory1v1(matchId);
  const roundStatus = useRoundStatus1v1(matchId, state?.round ?? 1, refreshKey);
  const modifiers = useRoundModifiers1v1(matchId, state?.round ?? 1);
  const matchStakes = useMatchStakes1v1(matchId, refreshKey);

  const cosmeticsA = usePlayerCosmetics(state?.playerA ?? undefined, refreshKey);
  const cosmeticsB = usePlayerCosmetics(state?.playerB ?? undefined, refreshKey);

  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());

  const toggleRound = (round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#7a7060] tracking-wider animate-pulse">LOADING MATCH...</div>
      </div>
    );
  }

  const vaultAPct = Math.max(0, Math.min(100, (state.vaultAHp / 50) * 100));
  const vaultBPct = Math.max(0, Math.min(100, (state.vaultBHp / 50) * 100));
  const hpBarColor = (pct: number) => (pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500");

  // Phase status text (neutral — no "your" / "opponent" language)
  let phaseText = "";
  if (state.phase === "committing") {
    phaseText = roundStatus.commitCount === 0
      ? "Both players committing..."
      : `Waiting for commits (${roundStatus.commitCount}/2)...`;
  } else if (state.phase === "revealing") {
    phaseText = `Waiting for reveals (${roundStatus.revealCount}/2)...`;
  } else if (state.phase === "resolving") {
    phaseText = "Round resolving...";
  } else if (state.phase === "finished") {
    phaseText = "Match finished";
  }

  // Only show allocations from fully resolved rounds (no partial reveals)
  const lastRound = history.length > 0 ? history[0] : null;
  const aAllocations = lastRound && lastRound.round === state.round - 1
    ? [...lastRound.aAttack, ...lastRound.aDefense, 0, 0, 0, 0, ...lastRound.aTraps]
    : null;
  const bAllocations = lastRound && lastRound.round === state.round - 1
    ? [...lastRound.bAttack, ...lastRound.bDefense, 0, 0, 0, 0, ...lastRound.bTraps]
    : null;

  // Finished state
  if (state.phase === "finished" && state.winner !== null) {
    const winnerLabel = state.winner === 1 ? "Player A" : state.winner === 2 ? "Player B" : "Draw";
    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-6 text-center space-y-3">
          <div className="text-[10px] tracking-wider text-[#7a7060] uppercase">Spectating</div>
          <div className="text-2xl font-bold font-serif text-[#daa520]">MATCH COMPLETE</div>
          <div className="text-lg text-[#d4cfc6]">
            Winner: <span className="font-bold text-[#c8a44e]">{winnerLabel}</span>
          </div>
          <div className="flex justify-center gap-8 text-sm">
            <span>Player A: {state.vaultAHp}/50 HP</span>
            <span>Player B: {state.vaultBHp}/50 HP</span>
          </div>
          <div className="text-xs text-[#7a7060]">{history.length} rounds played</div>
        </div>

        {/* Round history for finished match */}
        <RoundHistorySection
          history={history}
          expandedRounds={expandedRounds}
          toggleRound={toggleRound}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 max-w-7xl mx-auto">
      {/* ===== HEADER BANNER ===== */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] space-y-0 panel-header">
        {/* Row 1: Title, round, match ID, spectating badge */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tracking-wider font-serif">SIEGE</span>
            <span className="text-sm font-bold text-[#d4cfc6] bg-[#252019] px-2 py-0.5 rounded">
              Round {state.round}
            </span>
            <span className="text-xs text-[#7a7060]">#{matchId}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#ff8800] border border-[#ff8800]/50 bg-[#ff8800]/10 rounded px-2 py-0.5 font-bold tracking-wider">
              SPECTATING
            </span>
          </div>
        </div>

        {/* Row 2: Both citadels with HP bars — neutral labeling */}
        <div className="grid grid-cols-2 gap-6 px-4 pb-3">
          {/* Player A Citadel */}
          <div className="flex flex-col items-center">
            {(() => {
              const bannerKey = cosmeticsA?.banner;
              return bannerKey && CIRCUITS[bannerKey] ? (
                <ArcaneSeal circuit={CIRCUITS[bannerKey]} name={bannerKey} size={48} />
              ) : null;
            })()}
            <Image
              src="/sprites/citadel.png"
              alt="Player A Citadel"
              width={128}
              height={128}
              className="w-32 h-32 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(200,164,78,0.3)]"
            />
            <span className="text-xs tracking-wider text-[#c8a44e] uppercase font-bold mt-1">Player A</span>
            <div className="w-full mt-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span className={`text-sm font-bold ${vaultAPct < 10 ? "animate-pulse text-red-400" : "text-[#d4cfc6]"}`}>
                  {state.vaultAHp} / 50
                </span>
                <span className="text-[10px] text-[#7a7060]">{Math.round(vaultAPct)}%</span>
              </div>
              <div className="w-full h-3 bg-[#252019] rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpBarColor(vaultAPct)} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${vaultAPct}%` }}
                />
              </div>
            </div>
          </div>
          {/* Player B Citadel */}
          <div className="flex flex-col items-center">
            {(() => {
              const bannerKey = cosmeticsB?.banner;
              return bannerKey && CIRCUITS[bannerKey] ? (
                <ArcaneSeal circuit={CIRCUITS[bannerKey]} name={bannerKey} size={48} />
              ) : null;
            })()}
            <Image
              src="/sprites/citadel.png"
              alt="Player B Citadel"
              width={128}
              height={128}
              className="w-32 h-32 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(255,51,68,0.3)]"
              style={{ filter: "hue-rotate(340deg) saturate(1.5)" }}
            />
            <span className="text-xs tracking-wider text-[#ff3344] uppercase font-bold mt-1">Player B</span>
            <div className="w-full mt-1.5">
              <div className="flex justify-between items-center mb-0.5">
                <span className={`text-sm font-bold ${vaultBPct < 10 ? "animate-pulse text-red-400" : "text-[#d4cfc6]"}`}>
                  {state.vaultBHp} / 50
                </span>
                <span className="text-[10px] text-[#7a7060]">{Math.round(vaultBPct)}%</span>
              </div>
              <div className="w-full h-3 bg-[#252019] rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpBarColor(vaultBPct)} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${vaultBPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== STAKES + HOLD STATUS ===== */}
      <MatchStakesHeader stakes={matchStakes} isPlayerA={true} />
      <HoldStatusStrip playerA={state.playerA || ""} playerB={state.playerB || ""} isPlayerA={true} refreshKey={refreshKey} />

      {/* ===== BATTLEFIELD + WAR LOG ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-2">
        {/* Left: Battlefield */}
        <div className="flex flex-col gap-2">
          <BattlefieldView
            allocations={aAllocations || new Array(13).fill(0)}
            isPlayerA={true}
            committed={aAllocations !== null}
            modifiers={modifiers}
            opponentAllocations={bAllocations}
          />

          {/* Phase status */}
          {phaseText && (
            <div className="text-center py-2 text-sm text-[#7a7060] italic">
              {phaseText}
            </div>
          )}
        </div>

        {/* Right: War Dispatch Log */}
        <RoundHistorySection
          history={history}
          expandedRounds={expandedRounds}
          toggleRound={toggleRound}
        />
      </div>
    </div>
  );
}

function RoundHistorySection({
  history,
  expandedRounds,
  toggleRound,
}: {
  history: RoundResult1v1[];
  expandedRounds: Set<number>;
  toggleRound: (round: number) => void;
}) {
  const gateNames = ["East", "West", "Underground"];

  return (
    <div className="border border-[#3d3428] rounded-lg bg-[#1a1714]">
      <div className="px-4 pt-3 pb-2">
        <span className="text-[10px] tracking-wider text-[#7a7060] uppercase font-serif">War Dispatch Log</span>
      </div>
      {history.length === 0 ? (
        <div className="px-4 pb-3 text-sm text-[#7a7060]">No rounds resolved yet</div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {history.map((r: RoundResult1v1) => {
            const dmgToA = r.damageToA + r.bTraps.filter((t) => t > 0).length * 5;
            const dmgToB = r.damageToB + r.aTraps.filter((t) => t > 0).length * 5;
            const isExpanded = expandedRounds.has(r.round);

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
                    <span className="text-[#c8a44e]">A: -{dmgToA}</span>
                    <span className="text-[#7a7060]">/</span>
                    <span className="text-[#ff3344]">B: -{dmgToB}</span>
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
                        return (
                          <div key={i} className="bg-[#252019] rounded p-2 space-y-1 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-[#d4cfc6] font-bold">{gateNames[i]}</span>
                              {gate.modifier !== 0 && <span className={`${modColor} text-[10px]`}>{modName}</span>}
                            </div>
                            <div className="text-[#7a7060]">
                              A: {gate.attackA} atk / {gate.defenseA} def
                            </div>
                            <div className="text-[#7a7060]">
                              B: {gate.attackB} atk / {gate.defenseB} def
                            </div>
                            <div>
                              {gate.dmgToB > 0 && <span className="text-[#c8a44e]">A→B +{gate.dmgToB} </span>}
                              {gate.dmgToA > 0 && <span className="text-[#ff3344]">B→A +{gate.dmgToA}</span>}
                              {gate.dmgToA === 0 && gate.dmgToB === 0 && <span className="text-[#7a7060]">0</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(r.aTraps.some((t) => t > 0) || r.bTraps.some((t) => t > 0)) && (
                      <div className="text-xs border-t border-[#3d3428] pt-2 space-y-1">
                        <div className="text-[10px] tracking-wider text-[#7a7060] uppercase">Node Traps</div>
                        {["Forge", "Quarry", "Grove"].map((name, ni) => {
                          const aTrap = r.aTraps[ni];
                          const bTrap = r.bTraps[ni];
                          if (!aTrap && !bTrap) return null;
                          return (
                            <div key={ni} className="text-[#7a7060]">
                              {aTrap > 0 && <span className="text-[#c8a44e]">A trapped {name} (5 dmg to B) </span>}
                              {bTrap > 0 && <span className="text-[#ff3344]">B trapped {name} (5 dmg to A)</span>}
                            </div>
                          );
                        })}
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
  );
}
```

- [ ] **Step 2: Verify the frontend compiles**

Run: `cd frontend && npx next lint && npx tsc --noEmit`
Expected: No errors (warnings about unused vars are acceptable if they come from other files)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/match-1v1/\[id\]/spectate/page.tsx
git commit -m "feat: add spectator page for live 1v1 matches (#40)"
```

---

### Task 4: Live Battles Section on World Page

**Files:**
- Modify: `frontend/src/app/world/page.tsx`

- [ ] **Step 1: Add a `useActiveBattles` hook and Live Battles section**

In `frontend/src/app/world/page.tsx`, add the following import at the top alongside existing imports:

```tsx
import { toriiSql, toNum } from "@/lib/toriiSql";
```

Then add this hook function before `export default function WorldPage()`:

```tsx
interface ActiveBattle {
  matchId: number;
  playerA: string;
  playerB: string;
  round: number;
  vaultAHp: number;
  vaultBHp: number;
  status: number;
}

function useActiveBattles(refreshKey: number): { battles: ActiveBattle[]; loading: boolean } {
  const [battles, setBattles] = useState<ActiveBattle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchBattles = async () => {
      const rows = await toriiSql<Record<string, unknown>>(
        `SELECT match_id, player_a, player_b, current_round, vault_a_hp, vault_b_hp, status FROM "siege_dojo-MatchState1v1" WHERE status = 'Active' ORDER BY match_id DESC LIMIT 20`
      );
      if (cancelled) return;
      setBattles(
        rows.map((r) => ({
          matchId: toNum(r.match_id),
          playerA: String(r.player_a ?? ""),
          playerB: String(r.player_b ?? ""),
          round: toNum(r.current_round),
          vaultAHp: toNum(r.vault_a_hp),
          vaultBHp: toNum(r.vault_b_hp),
          status: toNum(r.status),
        }))
      );
      setLoading(false);
    };
    void fetchBattles();
    const interval = setInterval(fetchBattles, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshKey]);

  return { battles, loading };
}

function truncAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || "???";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
```

- [ ] **Step 2: Add the Live Battles section to the JSX**

In the `WorldPage` component's return JSX, find the existing "Battles" section (the one with `CREATE MATCH` and `JOIN MATCH` links). Immediately after that section's closing `</div>`, add the Live Battles section.

First, add the hook call inside the component body (after `const refresh = useCallback(...)`:

```tsx
const { battles, loading: battlesLoading } = useActiveBattles(refreshKey);
```

Then add the JSX — place it between the "Battles" section and the `{/* Faction panel */}` comment:

```tsx
      {/* Live Battles */}
      {kingdom.registered && (
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
          <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">Live Battles</div>
          {battlesLoading ? (
            <div className="text-[11px] text-[#7a7060] animate-pulse">Loading...</div>
          ) : battles.length === 0 ? (
            <div className="text-[11px] text-[#7a7060]">No active battles</div>
          ) : (
            <div className="space-y-2">
              {battles.map((b) => {
                const aPct = Math.max(0, Math.min(100, (b.vaultAHp / 50) * 100));
                const bPct = Math.max(0, Math.min(100, (b.vaultBHp / 50) * 100));
                return (
                  <Link
                    key={b.matchId}
                    href={`/match-1v1/${b.matchId}/spectate`}
                    className="block border border-[#3d3428] rounded p-2 hover:border-[#c8a44e]/50 hover:bg-[#252019] transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#7a7060]">#{b.matchId}</span>
                        <span className="text-xs text-[#d4cfc6]">
                          {truncAddr(b.playerA)} vs {truncAddr(b.playerB)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#7a7060]">R{b.round}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-[#252019] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${aPct > 50 ? "bg-green-500" : aPct > 20 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${aPct}%` }}
                        />
                      </div>
                      <div className="flex-1 h-1.5 bg-[#252019] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${bPct > 50 ? "bg-green-500" : bPct > 20 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${bPct}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 3: Verify the frontend compiles**

Run: `cd frontend && npx next lint && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/world/page.tsx
git commit -m "feat: add Live Battles section to world page with spectate links (#40)"
```

---

### Task 5: Manual Testing

**Files:** None (testing only)

- [ ] **Step 1: Start the frontend dev server**

Run: `cd frontend && npm run dev`
Expected: Dev server starts on `https://localhost:3000`

- [ ] **Step 2: Test spectator page with a known match ID**

Navigate to `https://localhost:3000/match-1v1/1/spectate` (use any existing match ID from Sepolia).

Verify:
- Page loads without errors
- "SPECTATING" badge visible in header
- Both citadels labeled "Player A" / "Player B"
- If match is active: phase status text shows ("Both players committing..." or similar)
- If match is finished: shows "MATCH COMPLETE" with winner and round history
- No interactive controls visible (no allocation form, no resolve button)
- BattlefieldView renders (may show idle troops if no resolved rounds yet)

- [ ] **Step 3: Test Live Battles section on world page**

Navigate to `https://localhost:3000/world` while connected with a wallet.

Verify:
- "Live Battles" section appears between "Battles" and "Faction" sections
- If active matches exist: they appear as clickable rows with HP bars
- If no active matches: "No active battles" text shown
- Clicking a battle navigates to `/match-1v1/<id>/spectate`

- [ ] **Step 4: Test MCP server spectate_url**

Run: `cd mcp-server-2 && npx tsc --noEmit`
Verify the build still succeeds with the config + tools changes.
