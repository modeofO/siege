import { createTimeline } from "animejs";
import type { RoundResult1v1 } from "@/lib/gameState1v1";

export interface ClashElements {
  container: HTMLElement;
  gates: HTMLElement[];
  whiteFlashes: HTMLElement[];
  damageNumbers: HTMLElement[];
}

export function createClashTimeline(
  els: ClashElements,
  result: RoundResult1v1,
  isPlayerA: boolean,
  onComplete?: () => void,
) {
  void isPlayerA;
  const tl = createTimeline({
    autoplay: false,
    onComplete,
  });

  // Phase 0: White flash on impact (0ms)
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const totalDmg = gate.dmgToA + gate.dmgToB;
    if (totalDmg === 0 || !els.whiteFlashes[i]) continue;
    tl.add(
      els.whiteFlashes[i],
      {
        scale: [0.5, 2.5],
        opacity: [1, 0],
        duration: 250,
        ease: "outQuad",
      },
      0,
    );
  }

  // Phase 1: Orange gate flashes (50ms)
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const totalDmg = gate.dmgToA + gate.dmgToB;
    if (totalDmg === 0 || !els.gates[i]) continue;
    const intensity = Math.min(totalDmg / 8, 1);
    tl.add(
      els.gates[i],
      {
        scale: [0.3, 1.8],
        opacity: [0.9 * intensity, 0],
        duration: 500,
        ease: "outQuad",
      },
      50,
    );
  }

  // Phase 2: Aggressive screen shake (100ms)
  tl.add(
    els.container,
    {
      translateX: [0, -6, 8, -7, 5, -4, 3, -1, 0],
      translateY: [0, 4, -6, 5, -3, 2, -2, 1, 0],
      duration: 450,
      ease: "inOutQuad",
    },
    100,
  );

  // Phase 3: Damage numbers scale up and float (350ms)
  for (let i = 0; i < els.damageNumbers.length; i++) {
    const numEl = els.damageNumbers[i];
    if (!numEl) continue;
    tl.add(
      numEl,
      {
        translateY: [0, -48],
        scale: [0.5, 1.3, 1.0],
        opacity: [0, 1, 1, 0],
        duration: 1000,
        ease: "outQuad",
      },
      350 + i * 80,
    );
  }

  return tl;
}
