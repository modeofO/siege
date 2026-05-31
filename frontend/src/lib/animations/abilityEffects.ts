import { createTimeline, createSpring } from "animejs";

export interface AbilityElements {
  effectEl: HTMLElement | SVGElement;
  secondaryEl?: HTMLElement | SVGElement | null;
}

export function createAbilityTimeline(
  abilityId: number,
  els: AbilityElements,
  onComplete?: () => void,
) {
  const tier = Math.floor((abilityId - 1) / 5) + 1;
  const type = ((abilityId - 1) % 5) + 1;
  const tl = createTimeline({ autoplay: false, onComplete });

  switch (type) {
    case 1: // Siege Sword — slash
      tl.add(els.effectEl, {
        strokeDashoffset: [60, 0],
        opacity: [0.9, 1, 0],
        duration: 600,
        ease: "outQuad",
      }, 0);
      if (els.secondaryEl) {
        tl.add(els.secondaryEl, {
          strokeDashoffset: [60, 0],
          opacity: [0.9, 1, 0],
          duration: 600,
          ease: "outQuad",
        }, 80);
      }
      break;

    case 2: // Stone Cloak — shield dome
      tl.add(els.effectEl, {
        scaleY: [0.3, 1.1, 1],
        opacity: [0, 0.8, 0.6, 0],
        duration: 800,
        ease: "outQuad",
      }, 0);
      break;

    case 3: // Ember Blast — explosion burst
      tl.add(els.effectEl, {
        scale: [0.1, tier === 2 ? 2.0 : 1.5, tier === 2 ? 2.5 : 1.8],
        opacity: [0.9, 0.8, 0],
        duration: 700,
        ease: "outExpo",
      }, 0);
      break;

    case 4: // Hex — curse ripple
      tl.add(els.effectEl, {
        scale: [0.3, 1.5, 2.2],
        opacity: [0.5, 0.3, 0],
        duration: 800,
        ease: "outQuad",
      }, 0);
      if (els.secondaryEl) {
        tl.add(els.secondaryEl, {
          scale: [0.2, 1.2, 1.8],
          opacity: [0.4, 0.2, 0],
          duration: 800,
          ease: "outQuad",
        }, 150);
      }
      break;

    case 5: // Fortify — golden beam
      tl.add(els.effectEl, {
        scaleY: [0.3, 1.3, 1.0],
        opacity: [0, 0.9, 0.7, 0],
        duration: 700,
        ease: createSpring({ stiffness: 100, damping: 14 }),
      }, 0);
      break;
  }

  return tl;
}
