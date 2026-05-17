export const MOD_NORMAL = 0;
export const MOD_NARROW_PASS = 1;
export const MOD_MIRROR = 2;
export const MOD_DEADLOCK = 3;
export const MOD_OVERFLOW = 4;

export interface MovePerGate {
  attack: number;
  defense: number;
}

export interface DamageBreakdown {
  per_gate_to_a: [number, number, number];
  per_gate_to_b: [number, number, number];
  unused_def_a: [number, number, number];
  unused_def_b: [number, number, number];
  total_to_a: number;
  total_to_b: number;
  note: string;
}

const min3 = (n: number) => (n > 3 ? 3 : n);

export function effectiveMoves(
  gates: number[] | null | undefined,
  a: { attack: number[]; defense: number[] } | null | undefined,
  b: { attack: number[]; defense: number[] } | null | undefined,
): { player_a: MovePerGate[]; player_b: MovePerGate[] } | null {
  if (!gates || !a || !b) return null;
  const out_a: MovePerGate[] = [];
  const out_b: MovePerGate[] = [];
  for (let g = 0; g < 3; g++) {
    let aa = a.attack[g];
    let ad = a.defense[g];
    let ba = b.attack[g];
    let bd = b.defense[g];
    const m = gates[g];
    if (m === MOD_NARROW_PASS) {
      aa = min3(aa); ad = min3(ad); ba = min3(ba); bd = min3(bd);
    }
    if (m === MOD_MIRROR) {
      [aa, ad] = [ad, aa];
      [ba, bd] = [bd, ba];
    }
    out_a.push({ attack: aa, defense: ad });
    out_b.push({ attack: ba, defense: bd });
  }
  return { player_a: out_a, player_b: out_b };
}

export function predictedDamage(
  gates: number[],
  eff_a: MovePerGate[],
  eff_b: MovePerGate[],
): DamageBreakdown {
  const dmg_a: [number, number, number] = [0, 0, 0];
  const dmg_b: [number, number, number] = [0, 0, 0];
  const unused_a: [number, number, number] = [0, 0, 0];
  const unused_b: [number, number, number] = [0, 0, 0];
  const ovf_to_a: [number, number, number] = [0, 0, 0];
  const ovf_to_b: [number, number, number] = [0, 0, 0];

  for (let g = 0; g < 3; g++) {
    const aa = eff_a[g].attack;
    const ad = eff_a[g].defense;
    const ba = eff_b[g].attack;
    const bd = eff_b[g].defense;
    const m = gates[g];

    if (m === MOD_DEADLOCK) {
      unused_a[g] = ad;
      unused_b[g] = bd;
    } else if (m === MOD_OVERFLOW) {
      ovf_to_b[g] = Math.max(aa - bd, 0);
      ovf_to_a[g] = Math.max(ba - ad, 0);
      unused_a[g] = Math.max(ad - ba, 0);
      unused_b[g] = Math.max(bd - aa, 0);
    } else {
      dmg_b[g] = Math.max(aa - bd, 0);
      dmg_a[g] = Math.max(ba - ad, 0);
      unused_a[g] = Math.max(ad - ba, 0);
      unused_b[g] = Math.max(bd - aa, 0);
    }
  }

  for (let g = 0; g < 3; g++) {
    if (ovf_to_b[g] > 0) {
      const per = Math.floor(ovf_to_b[g] / 2);
      for (let t = 0; t < 3; t++) {
        if (t !== g && gates[t] !== MOD_DEADLOCK) {
          const def = unused_b[t];
          if (per > def) dmg_b[t] += per - def;
        }
      }
    }
    if (ovf_to_a[g] > 0) {
      const per = Math.floor(ovf_to_a[g] / 2);
      for (let t = 0; t < 3; t++) {
        if (t !== g && gates[t] !== MOD_DEADLOCK) {
          const def = unused_a[t];
          if (per > def) dmg_a[t] += per - def;
        }
      }
    }
  }

  return {
    per_gate_to_a: dmg_a,
    per_gate_to_b: dmg_b,
    unused_def_a: unused_a,
    unused_def_b: unused_b,
    total_to_a: dmg_a[0] + dmg_a[1] + dmg_a[2],
    total_to_b: dmg_b[0] + dmg_b[1] + dmg_b[2],
    note: "Excludes ability effects (Fortify, Stone Cloak, Hex, Ember Blast, Siege Sword) and trap damage. Exact when both ability_id == 0.",
  };
}
