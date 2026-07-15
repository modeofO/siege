"use client";

// Dev-only visual test fixture for the war-table scene. Not linked anywhere;
// renders 404 in production. Drive it with scripts/battlefield-shot.mjs to
// capture console + screenshot evidence without a human in the loop.
import { notFound } from "next/navigation";
import { useMemo, useState } from "react";
import Battlefield3D from "@/components/battlefield3d/Battlefield3D";
import { IntelDrawer } from "@/components/intel/IntelDrawer";
import { resolveRoundLocal } from "@/lib/resolution1v1";
import type { RoundOutcome } from "@/lib/resolution1v1";
import type { OpponentIntel } from "@/lib/intel/queries";
import type { OpponentProfile } from "@/lib/intel/profile";
import type { BluffReading } from "@/lib/intel/bluff";

const MOVE0 = {
  attack: [0, 0, 0] as [number, number, number],
  defense: [0, 0, 0] as [number, number, number],
  repair: 0,
  nodeContest: [0, 0, 0] as [number, number, number],
  traps: [0, 0, 0] as [number, number, number],
  abilityId: 0,
  abilityTarget: 0,
};

// --- Intel drawer fixture: rich synthetic profile for visual verification ---
// Deliberately non-uniform gate shares so the heatmap reads at a glance:
// early leans East attack, mid leans Under defense, endgame hammers Under.
const FIXTURE_PROFILE: OpponentProfile = {
  matchesAnalyzed: 7,
  roundsAnalyzed: 43,
  phases: {
    early: {
      rounds: 18,
      atkShareByGate: [0.62, 0.1, 0.28],
      defShareByGate: [0.2, 0.5, 0.3],
      avgAttackTotal: 5.2,
      avgDefenseTotal: 2.9,
      avgRepair: 0.3,
      avgContest: 1.4,
    },
    mid: {
      rounds: 16,
      atkShareByGate: [0.34, 0.4, 0.26],
      defShareByGate: [0.15, 0.25, 0.6],
      avgAttackTotal: 6.1,
      avgDefenseTotal: 3.4,
      avgRepair: 0.9,
      avgContest: 2.1,
    },
    endgame: {
      rounds: 9,
      atkShareByGate: [0.1, 0.75, 0.15],
      defShareByGate: [0.45, 0.15, 0.4],
      avgAttackTotal: 8.3,
      avgDefenseTotal: 2.2,
      avgRepair: 1.6,
      avgContest: 1.2,
    },
  },
  trapRate: 0.31,
  repairWhenLowShare: 0.22,
  abilityRounds: { 2: [6, 6, 7, 8], 3: [2, 3, 3], 5: [8, 9] },
  winRate: 0.57,
};

const FIXTURE_INTEL: OpponentIntel = {
  profile: FIXTURE_PROFILE,
  h2h: { wins: 3, losses: 1 },
  currentRounds: [],
  loading: false,
};

const FIXTURE_BLUFF: BluffReading = {
  score: 0.61,
  sample: 4,
  note: "Attacking West far more than usual",
};

export default function DevBattlefieldPage() {
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [intelOpen, setIntelOpen] = useState(true);

  if (process.env.NODE_ENV === "production") notFound();

  const demoOutcome = useMemo(
    () =>
      resolveRoundLocal({
        moveA: { ...MOVE0, attack: [4, 2, 0], repair: 2, nodeContest: [2, 0, 0] },
        moveB: { ...MOVE0, defense: [1, 0, 0], attack: [0, 3, 1], abilityId: 3 },
        nodeOwners: ["neutral", "teamB", "neutral"],
        modifiers: [0, 1, 4],
        vaultAHp: 42,
        vaultBHp: 37,
        round: 4,
      }),
    [],
  );

  return (
    <div style={{ width: "100%", height: "100vh", background: "#0d0b0a" }}>
      <div style={{ position: "absolute", zIndex: 10, top: 8, left: 8 }}>
        <button
          id="play-round"
          onClick={() => setOutcome(demoOutcome)}
          style={{ padding: "6px 12px", background: "#c8a44e", borderRadius: 4 }}
        >
          Play round
        </button>
      </div>
      <Battlefield3D
        allocations={[3, 1, 0, 2, 0, 1, 1, 2, 0, 0, 1, 0, 0]}
        isPlayerA={true}
        committed={false}
        opponentCommitted={true}
        modifiers={[0, 1, 4]}
        opponentAllocations={null}
        nodes={["teamA", "teamB", "neutral"]}
        vaultAHp={42}
        vaultBHp={37}
        history={[]}
        outcome={outcome}
        onResolutionComplete={() => console.log("[dev] resolution complete")}
      />
      {/* Intel drawer fixture — open by default so battlefield-shot.mjs captures it. */}
      <IntelDrawer
        open={intelOpen}
        onClose={() => setIntelOpen(false)}
        intel={FIXTURE_INTEL}
        bluff={FIXTURE_BLUFF}
        opponentLabel="0x04a2...9f31"
        projectedBudget={12}
        preDraft={null}
        onSavePreDraft={(a) => console.log("[dev] save pre-draft", a)}
        onLoadIntoOrders={null}
      />
    </div>
  );
}
