import { createTimeline } from "animejs";
import type { RoundResult1v1 } from "@/lib/gameState1v1";

export interface ClashElements {
  container: HTMLElement;
  gates: HTMLElement[];
  damageNumbers: HTMLElement[];
}

export function createClashTimeline(
  els: ClashElements,
  result: RoundResult1v1,
  isPlayerA: boolean,
  onComplete?: () => void,
) {
  const tl = createTimeline({
    autoplay: false,
    onComplete,
  });

  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const totalDmg = gate.dmgToA + gate.dmgToB;
    if (totalDmg === 0 || !els.gates[i]) continue;
    const intensity = Math.min(totalDmg / 8, 1);
    tl.add(
      els.gates[i],
      {
        scale: [0.3, 1.5],
        opacity: [0.9 * intensity, 0],
        duration: 400,
        ease: "outQuad",
      },
      0,
    );
  }

  tl.add(
    els.container,
    {
      translateX: [0, -4, 5, -3, 2, 0],
      translateY: [0, 3, -4, 2, -1, 0],
      duration: 300,
      ease: "inOutQuad",
    },
    300,
  );

  for (let i = 0; i < els.damageNumbers.length; i++) {
    const numEl = els.damageNumbers[i];
    if (!numEl) continue;
    tl.add(
      numEl,
      {
        translateY: [0, -36],
        opacity: [0, 1, 1, 0],
        duration: 800,
        ease: "outQuad",
      },
      400 + i * 60,
    );
  }

  void isPlayerA;

  return tl;
}
