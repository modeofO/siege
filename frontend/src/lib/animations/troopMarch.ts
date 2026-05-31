import { createTimeline, createSpring } from "animejs";

export interface TroopTarget {
  el: HTMLElement;
  toX: number;
  toY: number;
}

export function createMarchTimeline(
  troops: TroopTarget[],
  onComplete?: () => void,
) {
  const tl = createTimeline({
    autoplay: false,
    onComplete,
  });

  for (let i = 0; i < troops.length; i++) {
    const { el, toX, toY } = troops[i];
    tl.add(
      el,
      {
        left: `${toX}%`,
        top: `${toY}%`,
        opacity: [0.5, 1],
        duration: 600,
        ease: createSpring({ stiffness: 120, damping: 18 }),
      },
      i * 80,
    );
  }

  return tl;
}
