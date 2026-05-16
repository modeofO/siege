export type ComponentKind =
  | "origin-crystal"
  | "void-drain"
  | "rune-stone"
  | "flux-well"
  | "spiral-coil"
  | "one-way-valve";

export interface CircuitComponent {
  id: string;
  kind: ComponentKind;
  col: number;
  row: number;
  label: string;
  locked?: boolean;
}

export interface CircuitTrace {
  points: [number, number][];
}

export type CosmeticType = "banner" | "parcelSkin" | "holdDecoration";

export interface Circuit {
  title: string;
  realName: string;
  category: string;
  blurb: string;
  cosmeticType: CosmeticType;
  components: CircuitComponent[];
  traces: CircuitTrace[];
}

export const CIRCUITS: Record<string, Circuit> = {
  "half-wave-rectifier": {
    title: "The First Gate",
    realName: "Half-Wave Rectifier",
    category: "rectifier · ac→dc · single-phase",
    blurb: "The gatekeepers of old would stand at the pass and let the levy through — but never the retreating cowards. One direction only. What enters your Hold as strength stays as strength. The first ward any castellan learns.",
    cosmeticType: "banner",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "v1", kind: "one-way-valve", col: 2, row: 2, label: "VALVE" },
      { id: "r1", kind: "rune-stone", col: 4, row: 2, label: "RUNE" },
      { id: "f1", kind: "flux-well", col: 4, row: 4, label: "FLUX" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2]] },
      { points: [[2,2],[3,2],[4,2]] },
      { points: [[4,2],[5,2],[6,2],[7,2]] },
      { points: [[4,2],[4,3],[4,4]] },
      { points: [[4,4],[5,4],[6,4],[7,4],[7,3],[7,2]] },
    ],
  },
  "voltage-divider": {
    title: "Bleeder's Mark",
    realName: "Voltage Divider",
    category: "analog · scaling · two-resistor",
    blurb: "When the war chest arrives, the quartermaster must split it — a share for the garrison, a share for the scouts. Two stones mark the division. The art is in knowing exactly where to cut so each outpost gets its due.",
    cosmeticType: "parcelSkin",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "r1", kind: "rune-stone", col: 2, row: 2, label: "RUNE I" },
      { id: "r2", kind: "rune-stone", col: 5, row: 2, label: "RUNE II" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2]] },
      { points: [[2,2],[3,2],[4,2],[5,2]] },
      { points: [[5,2],[6,2],[7,2]] },
      { points: [[4,2],[4,4]] },
    ],
  },
  "full-wave-rectifier": {
    title: "The Twin Tide",
    realName: "Full-Wave Rectifier",
    category: "rectifier · ac→dc · bridge",
    blurb: "The twin gates of the inner ward — whether the enemy charges from the east or the west, the defenders fold both assaults into a single killing ground. No surge is wasted. Twice the harvest of a single gate, and no blind side.",
    cosmeticType: "banner",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "v1", kind: "one-way-valve", col: 3, row: 1, label: "VALVE I" },
      { id: "v2", kind: "one-way-valve", col: 5, row: 1, label: "VALVE II" },
      { id: "v3", kind: "one-way-valve", col: 3, row: 4, label: "VALVE III" },
      { id: "v4", kind: "one-way-valve", col: 5, row: 4, label: "VALVE IV" },
      { id: "r1", kind: "rune-stone", col: 6, row: 2, label: "RUNE" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[2,1],[3,1]] },
      { points: [[2,2],[2,4],[3,4]] },
      { points: [[3,1],[4,1],[5,1]] },
      { points: [[3,4],[4,4],[5,4]] },
      { points: [[5,1],[6,1],[6,2]] },
      { points: [[5,4],[6,4],[6,2]] },
      { points: [[6,2],[7,2]] },
    ],
  },
  "rc-low-pass": {
    title: "The Still Pool",
    realName: "RC Low-Pass Filter",
    category: "filter · passive · 1st order",
    blurb: "The spymaster's sieve. Rumours, false reports, panicked riders screaming of phantom armies — the still pool swallows them all. Only the slow, steady truth filters through. If the message survives the pool, it can be trusted.",
    cosmeticType: "banner",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "r1", kind: "rune-stone", col: 3, row: 2, label: "RUNE" },
      { id: "f1", kind: "flux-well", col: 5, row: 4, label: "FLUX" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[3,2]] },
      { points: [[3,2],[4,2],[5,2],[6,2],[7,2]] },
      { points: [[5,2],[5,3],[5,4]] },
      { points: [[5,4],[6,4],[7,4],[7,3],[7,2]] },
    ],
  },
  "lc-tank": {
    title: "The Singing Spire",
    realName: "LC Tank",
    category: "resonator · oscillator · parallel",
    blurb: "The watchtower rings with a hundred bells, but only one tone carries the true signal. The coil and the well pass the call between them until every false note dies away and a single clear pitch remains — the frequency of the enemy's march.",
    cosmeticType: "banner",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "c1", kind: "spiral-coil", col: 3, row: 1, label: "COIL" },
      { id: "f1", kind: "flux-well", col: 5, row: 1, label: "FLUX" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[2,1],[3,1]] },
      { points: [[3,1],[4,1],[5,1]] },
      { points: [[5,1],[6,1],[6,2],[7,2]] },
      { points: [[3,1],[3,3],[5,3],[5,1]] },
    ],
  },
  "buck-converter": {
    title: "The Crown Step",
    realName: "Buck Converter",
    category: "switching · dc-dc · step-down",
    blurb: "The crown commands ten thousand swords, but the village needs only a garrison. The Crown Step takes the king's overwhelming force and measures it down — less men, same authority. The brook still turns the mill wheel.",
    cosmeticType: "holdDecoration",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 2, label: "ORIGIN", locked: true },
      { id: "v1", kind: "one-way-valve", col: 2, row: 2, label: "SWITCH" },
      { id: "c1", kind: "spiral-coil", col: 4, row: 2, label: "COIL" },
      { id: "f1", kind: "flux-well", col: 6, row: 4, label: "FLUX" },
      { id: "v2", kind: "one-way-valve", col: 3, row: 4, label: "CATCH" },
      { id: "drain", kind: "void-drain", col: 7, row: 2, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2]] },
      { points: [[2,2],[3,2],[4,2]] },
      { points: [[4,2],[5,2],[6,2],[7,2]] },
      { points: [[6,2],[6,3],[6,4]] },
      { points: [[6,4],[5,4],[4,4],[3,4]] },
      { points: [[3,4],[2,4],[2,2]] },
    ],
  },
  "common-emitter-amp": {
    title: "The Herald's Voice",
    realName: "Common-Emitter Amp",
    category: "amplifier · inverting · single-stage",
    blurb: "The herald stands before the assembled host and speaks the king's whisper so that ten thousand hear it as a roar. A small voice steers a great one — the messenger's breath moves an army.",
    cosmeticType: "parcelSkin",
    components: [
      { id: "origin", kind: "origin-crystal", col: 0, row: 0, label: "ORIGIN", locked: true },
      { id: "r1", kind: "rune-stone", col: 2, row: 0, label: "BIAS I" },
      { id: "r2", kind: "rune-stone", col: 4, row: 0, label: "COLLECT" },
      { id: "r3", kind: "rune-stone", col: 2, row: 4, label: "BIAS II" },
      { id: "r4", kind: "rune-stone", col: 4, row: 4, label: "EMITTER" },
      { id: "f1", kind: "flux-well", col: 6, row: 2, label: "COUPLE" },
      { id: "v1", kind: "one-way-valve", col: 4, row: 2, label: "GATE" },
      { id: "drain", kind: "void-drain", col: 7, row: 4, label: "DRAIN", locked: true },
    ],
    traces: [
      { points: [[0,0],[1,0],[2,0]] },
      { points: [[2,0],[3,0],[4,0]] },
      { points: [[4,0],[4,1],[4,2]] },
      { points: [[2,0],[2,1],[2,2]] },
      { points: [[2,2],[3,2],[4,2]] },
      { points: [[2,2],[2,3],[2,4]] },
      { points: [[2,4],[3,4],[4,4]] },
      { points: [[4,2],[4,3],[4,4]] },
      { points: [[4,2],[5,2],[6,2]] },
      { points: [[6,2],[6,3],[6,4],[7,4]] },
      { points: [[4,4],[5,4],[6,4]] },
    ],
  },
};

export type CircuitKey = keyof typeof CIRCUITS;
export const CIRCUIT_KEYS = Object.keys(CIRCUITS) as CircuitKey[];

export const COMPONENT_NAMES: Record<ComponentKind, string> = {
  "origin-crystal": "Origin Crystal",
  "void-drain": "Void Drain",
  "rune-stone": "Rune Stone",
  "flux-well": "Flux Well",
  "spiral-coil": "Spiral Coil",
  "one-way-valve": "One-Way Valve",
};

export const COMPONENT_FANTASY: Record<ComponentKind, string> = {
  "origin-crystal": "Source of arcane flow",
  "void-drain": "Where the current ends",
  "rune-stone": "Restricts arcane flow",
  "flux-well": "Stores and releases energy",
  "spiral-coil": "Smooths the aetheric current",
  "one-way-valve": "Permits flow in a single direction",
};
