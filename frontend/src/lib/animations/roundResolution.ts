import { createTimeline, createSpring } from "animejs";

export interface RoundElements {
  container: HTMLElement;
  vignetteEl: HTMLElement | null;
  troopEls: HTMLElement[];
  troopTargets: { toX: number; toY: number; delay: number }[];
  gateFlashEls: HTMLElement[];
  whiteFlashEls: HTMLElement[];
  ringEls: HTMLElement[];
  sparkEls: HTMLElement[][];
  damageNumberEls: HTMLElement[];
  abilityEl: HTMLElement | SVGElement | null;
  abilitySecondaryEl: HTMLElement | SVGElement | null;
  nodeEls: HTMLElement[];
  nodeBurstEls: HTMLElement[];
  vaultHpElA: HTMLElement | null;
  vaultHpElB: HTMLElement | null;
}

export interface RoundConfig {
  abilityId: number;
  abilityTier: number;
  abilityType: number;
  gateDamages: { dmgToA: number; dmgToB: number }[];
  nodesChanged: boolean[];
  vaultAHpFrom: number;
  vaultAHpTo: number;
  vaultBHpFrom: number;
  vaultBHpTo: number;
}

export function createRoundTimeline(
  els: RoundElements,
  config: RoundConfig,
  onComplete?: () => void,
) {
  const tl = createTimeline({ autoplay: false, onComplete });

  // Phase 0: Battle started dark vignette fade-in (0ms)
  if (els.vignetteEl) {
    tl.add(els.vignetteEl, {
      opacity: [0, 0.6],
      duration: 400,
      ease: "inQuad",
    }, 0);
  }

  // Phase 1a: Rally — all troops scale up and bob (0ms)
  for (let i = 0; i < els.troopEls.length; i++) {
    const el = els.troopEls[i];
    if (!el) continue;
    tl.add(el, {
      scale: [1, 1.1, 1],
      translateY: [0, -3, 0],
      duration: 300,
      ease: "inOutQuad",
    }, 0);
  }

  // Phase 1b: Troop deploy with type stagger (350ms base)
  const marchBase = 350;
  for (let i = 0; i < els.troopEls.length; i++) {
    const el = els.troopEls[i];
    const target = els.troopTargets[i];
    if (!el || !target) continue;
    const offset = marchBase + (target.delay ?? 0) + i * 40;

    // Dust trail opacity dip
    tl.add(el, {
      opacity: [0.5, 0.3, 0.5],
      duration: 200,
      ease: "inOutQuad",
    }, offset + 150);

    // Main movement with spring bounce
    tl.add(el, {
      left: `${target.toX}%`,
      top: `${target.toY}%`,
      opacity: [0.5, 1],
      duration: 500,
      ease: createSpring({ stiffness: 100, damping: 14 }),
    }, offset);
  }

  // Phase 2: Tension pause (200ms gap) then Gate clash (1100ms)
  const clashStart = 1100;

  // White flash
  for (let i = 0; i < 3; i++) {
    const totalDmg = config.gateDamages[i].dmgToA + config.gateDamages[i].dmgToB;
    if (totalDmg === 0 || !els.whiteFlashEls[i]) continue;
    tl.add(els.whiteFlashEls[i], {
      scale: [0.5, 2.5],
      opacity: [1, 0],
      duration: 250,
      ease: "outQuad",
    }, clashStart);
  }

  // Ring shockwave per gate
  for (let i = 0; i < 3; i++) {
    const totalDmg = config.gateDamages[i].dmgToA + config.gateDamages[i].dmgToB;
    if (totalDmg === 0 || !els.ringEls[i]) continue;
    tl.add(els.ringEls[i], {
      scale: [0.3, 2.5],
      opacity: [0.8, 0],
      duration: 500,
      ease: "outQuad",
    }, clashStart + 50);
  }

  // Sparks scatter per gate
  for (let i = 0; i < els.sparkEls.length; i++) {
    const totalDmg = config.gateDamages[i]
      ? config.gateDamages[i].dmgToA + config.gateDamages[i].dmgToB
      : 0;
    if (totalDmg === 0) continue;
    const sparks = els.sparkEls[i];
    if (!sparks) continue;
    const directions = [
      { x: -30, y: -25 },
      { x: 25, y: -35 },
      { x: 35, y: 20 },
      { x: -20, y: 30 },
      { x: 15, y: -40 },
    ];
    for (let s = 0; s < sparks.length; s++) {
      if (!sparks[s]) continue;
      const dir = directions[s % directions.length];
      tl.add(sparks[s], {
        translateX: [0, dir.x],
        translateY: [0, dir.y],
        opacity: [1, 0],
        scale: [1, 0.3],
        duration: 400,
        ease: "outQuad",
      }, clashStart + 30);
    }
  }

  // Orange gate flashes
  for (let i = 0; i < 3; i++) {
    const totalDmg = config.gateDamages[i].dmgToA + config.gateDamages[i].dmgToB;
    if (totalDmg === 0 || !els.gateFlashEls[i]) continue;
    const intensity = Math.min(totalDmg / 8, 1);
    tl.add(els.gateFlashEls[i], {
      scale: [0.3, 1.8],
      opacity: [0.9 * intensity, 0],
      duration: 500,
      ease: "outQuad",
    }, clashStart + 50);
  }

  // Aggressive screen shake at impact
  tl.add(els.container, {
    translateX: [0, -6, 8, -7, 5, -4, 3, -1, 0],
    translateY: [0, 4, -6, 5, -3, 2, -2, 1, 0],
    duration: 450,
    ease: "inOutQuad",
  }, clashStart + 100);

  // Damage numbers — dealt 100ms before taken
  for (let i = 0; i < els.damageNumberEls.length; i++) {
    if (!els.damageNumberEls[i]) continue;
    // Even indices are "dealt", odd are "taken" per gate pair
    const isDealt = i % 2 === 0;
    const dealtOffset = isDealt ? 0 : 100;
    tl.add(els.damageNumberEls[i], {
      translateY: [0, -48],
      scale: [0.5, 1.3, 1.0],
      opacity: [0, 1, 1, 0],
      duration: 1000,
      ease: "outQuad",
    }, clashStart + 300 + dealtOffset + Math.floor(i / 2) * 80);
  }

  // Phase 3: Node flips (2400ms) — with color burst
  for (let i = 0; i < 3; i++) {
    if (!config.nodesChanged[i] || !els.nodeEls[i]) continue;
    tl.add(els.nodeEls[i], {
      scale: [1, 1.5, 1],
      opacity: [0, 1, 0.8],
      duration: 500,
      ease: "outQuad",
    }, 2400);

    // Color burst around the node
    if (els.nodeBurstEls[i]) {
      tl.add(els.nodeBurstEls[i], {
        scale: [0.3, 2.5],
        opacity: [0.9, 0],
        duration: 500,
        ease: "outQuad",
      }, 2400);
    }
  }

  // Phase 4: Ability effect (3100ms)
  if (els.abilityEl && config.abilityId > 0) {
    const abilityType = config.abilityType;
    if (abilityType === 1) {
      tl.add(els.abilityEl, {
        scale: [0.2, 1.3, 1.1],
        opacity: [0, 1, 1, 0],
        rotate: [-15, 0],
        duration: 800,
        ease: "outBack",
      }, 3100);
      if (els.abilitySecondaryEl) {
        tl.add(els.abilitySecondaryEl, {
          scaleX: [0.1, 2.5],
          scaleY: [0.3, 1.2],
          opacity: [0.9, 0],
          duration: 500,
          ease: "outQuad",
        }, 3200);
      }
    } else if (abilityType === 2) {
      tl.add(els.abilityEl, {
        scale: [0.3, 1.2, 1.0],
        opacity: [0, 1, 1, 0],
        duration: 900,
        ease: "outBack",
      }, 3100);
    } else if (abilityType === 3) {
      tl.add(els.abilityEl, {
        scale: [0.1, 1.4, 1.2],
        opacity: [0, 1, 1, 0],
        duration: 700,
        ease: "outExpo",
      }, 3100);
    } else if (abilityType === 4) {
      tl.add(els.abilityEl, {
        scale: [0.2, 1.3, 1.1],
        opacity: [0, 1, 1, 0],
        duration: 800,
        ease: "outBack",
      }, 3100);
    } else if (abilityType === 5) {
      tl.add(els.abilityEl, {
        scale: [0.3, 1.2, 1.0],
        translateY: [20, -10],
        opacity: [0, 1, 1, 0],
        duration: 800,
        ease: "outQuad",
      }, 3100);
    }
  }

  // Phase 5: Vault HP drain — both vaults count down with shake (4000ms)
  const animateVaultHp = (
    el: HTMLElement,
    from: number,
    to: number,
    color: string,
    colorFlash: string,
    offset: number,
  ) => {
    const diff = from - to;
    if (diff <= 0) return;
    tl.add(el, {
      translateX: [0, -4, 5, -3, 2, -1, 0],
      duration: 300,
      ease: "inOutQuad",
    }, offset);
    tl.add(el, {
      scale: [1, 1.3, 1],
      opacity: [1, 0.5, 1],
      duration: 500,
      ease: "inOutQuad",
    }, offset);
    tl.add(el, {
      color: [color, colorFlash, color],
      duration: 500,
      ease: "linear",
      onUpdate: (anim) => {
        const progress = anim.progress / 100;
        const current = Math.round(from - diff * progress);
        el.textContent = `${current} HP`;
      },
    }, offset);
  };

  if (els.vaultHpElA) {
    animateVaultHp(els.vaultHpElA, config.vaultAHpFrom, config.vaultAHpTo, "#ef4444", "#ff6666", 4000);
  }
  if (els.vaultHpElB) {
    animateVaultHp(els.vaultHpElB, config.vaultBHpFrom, config.vaultBHpTo, "#ef4444", "#ff6666", 4000);
  }

  // Phase 6: Vignette fade-out at end (4800ms)
  if (els.vignetteEl) {
    tl.add(els.vignetteEl, {
      opacity: [0.6, 0],
      duration: 400,
      ease: "outQuad",
    }, 4800);
  }

  return tl;
}
