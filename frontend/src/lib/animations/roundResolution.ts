import { createTimeline } from "animejs";

export interface RoundElements {
  container: HTMLElement;
  troopEls: HTMLElement[];
  troopTargets: { toX: number; toY: number }[];
  gateFlashEls: HTMLElement[];
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

  // Phase 1: Troop deploy (0ms–800ms)
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

  // Phase 2: Gate clash (800ms)
  for (let i = 0; i < 3; i++) {
    const totalDmg = config.gateDamages[i].dmgToA + config.gateDamages[i].dmgToB;
    if (totalDmg === 0 || !els.gateFlashEls[i]) continue;
    tl.add(els.gateFlashEls[i], {
      scale: [0.3, 1.5],
      opacity: [0.8, 0],
      duration: 400,
      ease: "outQuad",
    }, 800);
  }

  // Screen shake at impact
  tl.add(els.container, {
    translateX: [0, -3, 4, -2, 0],
    translateY: [0, 2, -3, 1, 0],
    duration: 250,
    ease: "inOutQuad",
  }, 850);

  // Damage numbers
  for (let i = 0; i < els.damageNumberEls.length; i++) {
    if (!els.damageNumberEls[i]) continue;
    tl.add(els.damageNumberEls[i], {
      translateY: [0, -36],
      opacity: [0, 1, 1, 0],
      duration: 800,
      ease: "outQuad",
    }, 1000 + i * 50);
  }

  // Phase 3: Node flips (1600ms)
  for (let i = 0; i < 3; i++) {
    if (!config.nodesChanged[i] || !els.nodeEls[i]) continue;
    tl.add(els.nodeEls[i], {
      scale: [1, 1.5, 1],
      opacity: [0, 1, 0.8],
      duration: 500,
      ease: "outQuad",
    }, 1600);
  }

  // Phase 4: Ability effect (2200ms)
  if (els.abilityEl && config.abilityId > 0) {
    const abilityType = config.abilityType;
    if (abilityType === 3) {
      tl.add(els.abilityEl, {
        scale: [0.1, 1.5, 1.8],
        opacity: [0.9, 0.7, 0],
        duration: 700,
        ease: "outExpo",
      }, 2200);
    } else if (abilityType === 1) {
      tl.add(els.abilityEl, {
        strokeDashoffset: [60, 0],
        opacity: [0.9, 1, 0],
        duration: 600,
        ease: "outQuad",
      }, 2200);
      if (els.abilitySecondaryEl) {
        tl.add(els.abilitySecondaryEl, {
          strokeDashoffset: [60, 0],
          opacity: [0.9, 1, 0],
          duration: 600,
          ease: "outQuad",
        }, 2280);
      }
    } else if (abilityType === 2) {
      tl.add(els.abilityEl, {
        scaleY: [0.3, 1.1, 1],
        opacity: [0, 0.8, 0],
        duration: 800,
        ease: "outQuad",
      }, 2200);
    } else if (abilityType === 4) {
      tl.add(els.abilityEl, {
        scale: [0.3, 1.5, 2.2],
        opacity: [0.5, 0.3, 0],
        duration: 800,
        ease: "outQuad",
      }, 2200);
    } else if (abilityType === 5) {
      tl.add(els.abilityEl, {
        scaleY: [0.3, 1.3, 1.0],
        opacity: [0, 0.9, 0],
        duration: 700,
        ease: "outQuad",
      }, 2200);
    }
  }

  // Phase 5: Vault HP drain text (3000ms)
  if (els.vaultHpEl) {
    tl.add(els.vaultHpEl, {
      scale: [1, 1.2, 1],
      opacity: [1, 0.5, 1],
      duration: 400,
      ease: "inOutQuad",
    }, 3000);
  }

  return tl;
}
