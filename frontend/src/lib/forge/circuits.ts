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
    blurb: "In the world before runes, this circuit took alternating current and let only one half through — turning a tide that surged in both directions into a current that flowed only forward. The valve permits, the well steadies, the rune throttles. The same as your gate.",
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
    blurb: "Two stones in a row, splitting the tide. What enters at full pressure leaves diminished — measured at the seam between the two, you find a fraction of the source. A bleeder's trick, stamped into countless instruments.",
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
    blurb: "Four valves in a diamond, taking the tide whichever way it surges and folding both halves into one steady forward current. The smith's bridge — twice the yield of the single gate.",
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
    blurb: "A throttle and a well, set in series. Sharp gusts are absorbed by the well's reservoir; only the slow, steady currents pass through to the drain. The first lesson in dampening — what stills the chatter, lets the song through.",
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
    blurb: "A coil and a well, joined in a closed ring. Energy passes between them in perfect cadence — magnetic field giving way to stored charge, then back again — ringing at one true note. The smiths use it to find a single frequency in a noisy sky.",
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
    blurb: "A valve, a coil, and a well — switched in sequence to step a tall current down to a humbler one without losing its strength. The crown's secret: a torrent that becomes a brook, but the brook still turns the wheel.",
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
    blurb: "Two stones biasing the gate, a well to couple the song in, another to send it on — and at the heart, a gate that turns a whisper into a shout. The herald's trick: a small voice steers a large one.",
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
