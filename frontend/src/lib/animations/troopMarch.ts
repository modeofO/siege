import { createTimeline, createSpring } from "animejs";

export interface TroopTarget {
  el: HTMLElement;
  toX: number;
  toY: number;
  delay: number;  // ms offset for type-based stagger
}

export function createMarchTimeline(
  troops: TroopTarget[],
  onComplete?: () => void,
) {
  const tl = createTimeline({
    autoplay: false,
    onComplete,
  });

  // Phase 0: Rally — all troops scale up and bob before departing (0ms)
  for (let i = 0; i < troops.length; i++) {
    const { el } = troops[i];
    tl.add(
      el,
      {
        scale: [1, 1.1, 1],
        translateY: [0, -3, 0],
        duration: 300,
        ease: "inOutQuad",
      },
      0,
    );
  }

  // Phase 1: March with type-based stagger (350ms base + delay)
  const marchBase = 350;
  for (let i = 0; i < troops.length; i++) {
    const { el, toX, toY, delay } = troops[i];
    const offset = marchBase + delay + i * 40;

    // Dust trail: opacity dip during mid-transit
    tl.add(
      el,
      {
        opacity: [0.5, 0.3, 0.5],
        duration: 200,
        ease: "inOutQuad",
      },
      offset + 150,
    );

    // Main movement with spring arrival bounce
    tl.add(
      el,
      {
        left: `${toX}%`,
        top: `${toY}%`,
        opacity: [0.5, 1],
        duration: 600,
        ease: createSpring({ stiffness: 100, damping: 14 }),
      },
      offset,
    );
  }

  return tl;
}
