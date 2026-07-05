import type { RoundResult1v1 } from "@/lib/gameState1v1";

// Per-round wear decays exponentially: each point of cumulative damage moves the
// surface a fixed fraction of the remaining distance toward fully worn (1).
const DECAY = 0.92;

export interface Aftermath {
  // 0–1 per gate: 1 - 0.92^(total damage through that gate, both directions),
  // summed across the whole round history. Perspective-independent.
  gateScorch: [number, number, number];
  // 0–1 from cumulative damage taken by the viewer's own side.
  myVaultWear: number;
  // 0–1 from cumulative damage taken by the opponent's side.
  enemyVaultWear: number;
}

function wearFrom(totalDamage: number): number {
  return 1 - Math.pow(DECAY, totalDamage);
}

/**
 * Derives cumulative battle wear from the full round history so it survives
 * reloads (history is the durable source; the transient resolution playback only
 * animates the latest round). Empty history yields all zeros.
 *
 * Gate scorch sums both damage directions (dmgToA + dmgToB) through each gate
 * over every round. Vault wear sums the damage each vault took: side A if the
 * viewer is player A, side B otherwise, and the enemy is the other side.
 */
export function deriveAftermath(history: RoundResult1v1[], isPlayerA: boolean): Aftermath {
  const gateTotals: [number, number, number] = [0, 0, 0];
  let damageA = 0;
  let damageB = 0;

  for (const r of history) {
    for (const g of r.gateBreakdown) {
      if (g.gate >= 0 && g.gate < 3) {
        gateTotals[g.gate] += g.dmgToA + g.dmgToB;
      }
    }
    damageA += r.damageToA;
    damageB += r.damageToB;
  }

  const myDamage = isPlayerA ? damageA : damageB;
  const enemyDamage = isPlayerA ? damageB : damageA;

  return {
    gateScorch: [wearFrom(gateTotals[0]), wearFrom(gateTotals[1]), wearFrom(gateTotals[2])],
    myVaultWear: wearFrom(myDamage),
    enemyVaultWear: wearFrom(enemyDamage),
  };
}
