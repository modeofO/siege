import { createTimeline } from "animejs";

export interface RoundElements {
  container: HTMLElement;
  troopEls: HTMLElement[];
  troopTargets: { toX: number; toY: number }[];
  gateFlashEls: HTMLElement[];
  whiteFlashEls: HTMLElement[];
  damageNumberEls: HTMLElement[];
  abilityEl: HTMLElement | SVGElement | null;
  abilitySecondaryEl: HTMLElement | SVGElement | null;
  nodeEls: HTMLElement[];
  vaultHpEl: HTMLElement | null;
}

export interface RoundConfig {
  abilityId: number;
  abilityTier: number;
  abilityType: number;
  gateDamages: { dmgToA: number; dmgToB: number }[];
  nodesChanged: boolean[];
  vaultHpFrom: number;
  vaultHpTo: number;
}

export function createRoundTimeline(
  els: RoundElements,
  config: RoundConfig,
  onComplete?: () => void,
) {
  const tl = createTimeline({ autoplay: false, onComplete });

  // Phase 1: Troop deploy (0ms-800ms)
  for (let i = 0; i < els.troopEls.length; i++) {
    const el = els.troopEls[i];
    const target = els.troopTargets[i];
    if (!el || !target) continue;
    tl.add(el, {
      left: `${target.toX}%`,
      top: `${target.toY}%`,
      opacity: [0.5, 1],
      duration: 500,
      ease: "outQuad",
    }, i * 60);
  }

  // Phase 2: Gate clash (900ms) - White flash first
  for (let i = 0; i < 3; i++) {
    const totalDmg = config.gateDamages[i].dmgToA + config.gateDamages[i].dmgToB;
    if (totalDmg === 0 || !els.whiteFlashEls[i]) continue;
    tl.add(els.whiteFlashEls[i], {
      scale: [0.5, 2.5],
      opacity: [1, 0],
      duration: 250,
      ease: "outQuad",
    }, 900);
  }

  // Orange gate flashes (950ms)
  for (let i = 0; i < 3; i++) {
    const totalDmg = config.gateDamages[i].dmgToA + config.gateDamages[i].dmgToB;
    if (totalDmg === 0 || !els.gateFlashEls[i]) continue;
    const intensity = Math.min(totalDmg / 8, 1);
    tl.add(els.gateFlashEls[i], {
      scale: [0.3, 1.8],
      opacity: [0.9 * intensity, 0],
      duration: 500,
      ease: "outQuad",
    }, 950);
  }

  // Aggressive screen shake at impact (1000ms)
  tl.add(els.container, {
    translateX: [0, -6, 8, -7, 5, -4, 3, -1, 0],
    translateY: [0, 4, -6, 5, -3, 2, -2, 1, 0],
    duration: 450,
    ease: "inOutQuad",
  }, 1000);

  // Damage numbers with scale-up (1200ms)
  for (let i = 0; i < els.damageNumberEls.length; i++) {
    if (!els.damageNumberEls[i]) continue;
    tl.add(els.damageNumberEls[i], {
      translateY: [0, -48],
      scale: [0.5, 1.3, 1.0],
      opacity: [0, 1, 1, 0],
      duration: 1000,
      ease: "outQuad",
    }, 1200 + i * 80);
  }

  // Phase 3: Node flips (2200ms) - more pause between phases
  for (let i = 0; i < 3; i++) {
    if (!config.nodesChanged[i] || !els.nodeEls[i]) continue;
    tl.add(els.nodeEls[i], {
      scale: [1, 1.5, 1],
      opacity: [0, 1, 0.8],
      duration: 500,
      ease: "outQuad",
    }, 2200);
  }

  // Phase 4: Ability effect (2900ms) - more pause for readability
  if (els.abilityEl && config.abilityId > 0) {
    const abilityType = config.abilityType;
    if (abilityType === 1) {
      // Siege Sword — icon scale-up
      tl.add(els.abilityEl, {
        scale: [0.2, 1.3, 1.1],
        opacity: [0, 1, 1, 0],
        rotate: [-15, 0],
        duration: 800,
        ease: "outBack",
      }, 2900);
      if (els.abilitySecondaryEl) {
        tl.add(els.abilitySecondaryEl, {
          scaleX: [0.1, 2.5],
          scaleY: [0.3, 1.2],
          opacity: [0.9, 0],
          duration: 500,
          ease: "outQuad",
        }, 3000);
      }
    } else if (abilityType === 2) {
      // Stone Cloak — shield dome
      tl.add(els.abilityEl, {
        scale: [0.3, 1.2, 1.0],
        opacity: [0, 1, 1, 0],
        duration: 900,
        ease: "outBack",
      }, 2900);
    } else if (abilityType === 3) {
      // Ember Blast — explosion
      tl.add(els.abilityEl, {
        scale: [0.1, 1.4, 1.2],
        opacity: [0, 1, 1, 0],
        duration: 700,
        ease: "outExpo",
      }, 2900);
    } else if (abilityType === 4) {
      // Hex — curse ripple
      tl.add(els.abilityEl, {
        scale: [0.2, 1.3, 1.1],
        opacity: [0, 1, 1, 0],
        duration: 800,
        ease: "outBack",
      }, 2900);
    } else if (abilityType === 5) {
      // Fortify — rising beam
      tl.add(els.abilityEl, {
        scale: [0.3, 1.2, 1.0],
        translateY: [20, -10],
        opacity: [0, 1, 1, 0],
        duration: 800,
        ease: "outQuad",
      }, 2900);
    }
  }

  // Phase 5: Vault HP drain text (3800ms)
  if (els.vaultHpEl) {
    tl.add(els.vaultHpEl, {
      scale: [1, 1.2, 1],
      opacity: [1, 0.5, 1],
      duration: 400,
      ease: "inOutQuad",
    }, 3800);
  }

  return tl;
}
