import { createTimeline } from "animejs";
import type { RoundResult1v1 } from "@/lib/gameState1v1";

export interface ClashElements {
  container: HTMLElement;
  gates: HTMLElement[];
  whiteFlashes: HTMLElement[];
  rings: HTMLElement[];
  sparks: HTMLElement[][];  // sparks[gateIndex] = array of spark elements
  damageNumbers: HTMLElement[];
  vignetteEl: HTMLElement | null;
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

  // Phase 0b: Ring shockwave expanding from each gate (30ms)
  for (let i = 0; i < 3; i++) {
    const gate = result.gateBreakdown[i];
    const totalDmg = gate.dmgToA + gate.dmgToB;
    if (totalDmg === 0 || !els.rings[i]) continue;
    tl.add(
      els.rings[i],
      {
        scale: [0.3, 2.5],
        opacity: [0.8, 0],
        duration: 500,
        ease: "outQuad",
      },
      30,
    );
  }

  // Phase 0c: Sparks scatter outward from each gate (30ms)
  const sparkDirections = [
    { x: -30, y: -25 },
    { x: 25, y: -35 },
    { x: 35, y: 20 },
    { x: -20, y: 30 },
    { x: 15, y: -40 },
  ];
  for (let i = 0; i < els.sparks.length; i++) {
    const gate = result.gateBreakdown[i];
    if (!gate) continue;
    const totalDmg = gate.dmgToA + gate.dmgToB;
    if (totalDmg === 0) continue;
    const sparks = els.sparks[i];
    if (!sparks) continue;
    for (let s = 0; s < sparks.length; s++) {
      if (!sparks[s]) continue;
      const dir = sparkDirections[s % sparkDirections.length];
      tl.add(
        sparks[s],
        {
          translateX: [0, dir.x],
          translateY: [0, dir.y],
          opacity: [1, 0],
          scale: [1, 0.3],
          duration: 400,
          ease: "outQuad",
        },
        30,
      );
    }
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

  // Phase 2b: Red vignette pulse when damage is taken (150ms)
  if (els.vignetteEl) {
    const totalDmgToPlayer = result.gateBreakdown.reduce(
      (sum, g) => sum + (isPlayerA ? g.dmgToA : g.dmgToB),
      0,
    );
    if (totalDmgToPlayer > 0) {
      tl.add(
        els.vignetteEl,
        {
          opacity: [0, 0.5, 0],
          duration: 500,
          ease: "inOutQuad",
        },
        150,
      );
    }
  }

  // Phase 3: Damage numbers — dealt appears 100ms before taken (350ms)
  // Numbers are ordered: dealt first, then taken, per gate
  let dealtIdx = 0;
  let takenIdx = 0;
  for (let i = 0; i < els.damageNumbers.length; i++) {
    const numEl = els.damageNumbers[i];
    if (!numEl) continue;
    // Check data attribute or alternating pattern: dealt entries come first per gate
    const text = numEl.textContent ?? "";
    const isDealt = text.startsWith("+");
    const groupDelay = isDealt ? dealtIdx++ * 80 : takenIdx++ * 80;
    const typeOffset = isDealt ? 0 : 100;
    tl.add(
      numEl,
      {
        translateY: [0, -48],
        scale: [0.5, 1.3, 1.0],
        opacity: [0, 1, 1, 0],
        duration: 1000,
        ease: "outQuad",
      },
      350 + typeOffset + groupDelay,
    );
  }

  return tl;
}
