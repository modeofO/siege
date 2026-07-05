import type { OpponentProfile } from "./profile";
import { phaseOf } from "./profile";
import type { ReplayedRound } from "./types";

export interface BluffReading {
  score: number; // 0 = playing to type, 1 = fully off-book
  sample: number; // rounds compared
  note: string; // one-line human summary, e.g. "Attacking West far more than usual"
}

// Data-gate index -> player-facing display name.
const GATE_NAMES = ["East", "West", "Underground"] as const;

// Scores at or above this read as a strong, deliberate deviation.
const STRONG_THRESHOLD = 0.4;

const sum3 = (v: readonly [number, number, number]): number => v[0] + v[1] + v[2];

/**
 * Compare the current match's revealed opponent rounds against their profile.
 *
 * Per comparable round we take 0.5 x the L1 distance between the round's
 * attack-share vector and the profile's phase `atkShareByGate`. L1 of two
 * distributions is in [0, 2], so halving normalizes each round's distance to
 * [0, 1]; the score is the mean over compared rounds.
 *
 * A round is comparable only when it has non-zero attack (a zero-attack round
 * has no share vector to compare) and its phase profile has a non-zero sample
 * (`rounds > 0`); other rounds are skipped. Fewer than 2 comparable rounds is
 * too little signal, so we report "Not enough data".
 */
export function detectDeviation(
  current: ReplayedRound[],
  profile: OpponentProfile,
): BluffReading {
  let distanceSum = 0;
  let sample = 0;
  // Summed per-gate deviation (round share - profile share) over compared
  // rounds; the gate with the largest positive total is the one they are
  // attacking more than usual.
  const devByGate: [number, number, number] = [0, 0, 0];

  for (const r of current) {
    const total = sum3(r.move.attack);
    if (total <= 0) continue; // zero-attack round: not comparable

    const phase = profile.phases[phaseOf(r.round)];
    if (phase.rounds === 0) continue; // no baseline for this phase

    const share: [number, number, number] = [
      r.move.attack[0] / total,
      r.move.attack[1] / total,
      r.move.attack[2] / total,
    ];
    const ref = phase.atkShareByGate;

    let l1 = 0;
    for (let g = 0; g < 3; g++) {
      l1 += Math.abs(share[g] - ref[g]);
      devByGate[g] += share[g] - ref[g];
    }
    distanceSum += 0.5 * l1;
    sample += 1;
  }

  if (sample < 2) {
    return { score: 0, sample, note: "Not enough data" };
  }

  const score = distanceSum / sample;

  // Pick the gate they are over-attacking relative to their baseline.
  let topGate = 0;
  for (let g = 1; g < 3; g++) {
    if (devByGate[g] > devByGate[topGate]) topGate = g;
  }

  let note: string;
  if (devByGate[topGate] <= 1e-9) {
    note = "Playing to type";
  } else if (score >= STRONG_THRESHOLD) {
    note = `Attacking ${GATE_NAMES[topGate]} far more than usual`;
  } else {
    note = `Leaning on ${GATE_NAMES[topGate]} more than usual`;
  }

  return { score, sample, note };
}
