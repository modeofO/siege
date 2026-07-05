"use client";

// Dev-only visual test fixture for the war-table scene. Not linked anywhere;
// renders 404 in production. Drive it with scripts/battlefield-shot.mjs to
// capture console + screenshot evidence without a human in the loop.
import { notFound } from "next/navigation";
import { useMemo, useState } from "react";
import Battlefield3D from "@/components/battlefield3d/Battlefield3D";
import { resolveRoundLocal } from "@/lib/resolution1v1";
import type { RoundOutcome } from "@/lib/resolution1v1";

const MOVE0 = {
  attack: [0, 0, 0] as [number, number, number],
  defense: [0, 0, 0] as [number, number, number],
  repair: 0,
  nodeContest: [0, 0, 0] as [number, number, number],
  traps: [0, 0, 0] as [number, number, number],
  abilityId: 0,
  abilityTarget: 0,
};

export default function DevBattlefieldPage() {
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);

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
    <div style={{ width: "100vw", height: "100vh", background: "#0d0b0a" }}>
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
    </div>
  );
}
