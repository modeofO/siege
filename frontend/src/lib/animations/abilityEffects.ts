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
    case 1: // Siege Sword — icon scales up at gate with gold slash trail
      tl.add(els.effectEl, {
        scale: [0.2, 1.3, 1.1],
        opacity: [0, 1],
        rotate: [-15, 0],
        duration: 400,
        ease: "outBack",
      }, 0);
      if (els.secondaryEl) {
        // Gold slash trail behind the icon
        tl.add(els.secondaryEl, {
          scaleX: [0.1, 2.5],
          scaleY: [0.3, 1.2],
          opacity: [0.9, 0],
          duration: 500,
          ease: "outQuad",
        }, 100);
      }
      // Fade out icon
      tl.add(els.effectEl, {
        opacity: [1, 0],
        scale: [1.1, 1.3],
        duration: 400,
        ease: "inQuad",
      }, 600);
      break;

    case 2: // Stone Cloak — icon appears with blue/silver shimmer dome
      tl.add(els.effectEl, {
        scale: [0.3, 1.2, 1.0],
        opacity: [0, 1],
        duration: 500,
        ease: "outBack",
      }, 0);
      if (els.secondaryEl) {
        // Blue shimmer dome expanding behind icon
        tl.add(els.secondaryEl, {
          scale: [0.3, tier === 2 ? 2.0 : 1.6],
          opacity: [0.7, 0],
          duration: 800,
          ease: "outQuad",
        }, 100);
      }
      // Fade out icon
      tl.add(els.effectEl, {
        opacity: [1, 0],
        scale: [1.0, 0.8],
        duration: 400,
        ease: "inQuad",
      }, 700);
      break;

    case 3: // Ember Blast — icon appears with orange radial explosion
      tl.add(els.effectEl, {
        scale: [0.1, 1.4, 1.2],
        opacity: [0, 1],
        rotate: [0, 10],
        duration: 400,
        ease: "outExpo",
      }, 0);
      if (els.secondaryEl) {
        // Orange radial explosion burst behind it
        tl.add(els.secondaryEl, {
          scale: [0.2, tier === 2 ? 3.0 : 2.2],
          opacity: [0.9, 0],
          duration: 600,
          ease: "outExpo",
        }, 50);
      }
      // Fade out icon
      tl.add(els.effectEl, {
        opacity: [1, 0],
        scale: [1.2, 1.6],
        duration: 350,
        ease: "inQuad",
      }, 550);
      break;

    case 4: // Hex — icon at center with red ripple rings
      tl.add(els.effectEl, {
        scale: [0.2, 1.3, 1.1],
        opacity: [0, 1],
        rotate: [0, -5],
        duration: 500,
        ease: "outBack",
      }, 0);
      if (els.secondaryEl) {
        // Red ripple rings expanding outward
        tl.add(els.secondaryEl, {
          scale: [0.3, tier === 2 ? 3.5 : 2.5],
          opacity: [0.6, 0],
          duration: 900,
          ease: "outQuad",
        }, 100);
      }
      // Fade out icon
      tl.add(els.effectEl, {
        opacity: [1, 0],
        scale: [1.1, 0.9],
        duration: 400,
        ease: "inQuad",
      }, 700);
      break;

    case 5: // Fortify — icon rises upward with golden shimmer particles
      tl.add(els.effectEl, {
        scale: [0.3, 1.2, 1.0],
        translateY: [20, -10],
        opacity: [0, 1],
        duration: 600,
        ease: createSpring({ stiffness: 100, damping: 14 }),
      }, 0);
      if (els.secondaryEl) {
        // Golden shimmer particles rising
        tl.add(els.secondaryEl, {
          scaleY: [0.3, 1.5],
          translateY: [0, -30],
          opacity: [0.8, 0],
          duration: 700,
          ease: "outQuad",
        }, 100);
      }
      // Fade out icon
      tl.add(els.effectEl, {
        opacity: [1, 0],
        translateY: [-10, -30],
        duration: 400,
        ease: "inQuad",
      }, 700);
      break;
  }

  return tl;
}
