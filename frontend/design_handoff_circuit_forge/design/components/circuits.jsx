// Circuit topologies — each defines components placed on the 8×6 grid + traces between them.
// All circuits share the convention: ORIGIN at (0, midrow) and DRAIN at (7, midrow).

// Symbols used:
//   origin-crystal  → Power source
//   void-drain      → Ground / sink
//   rune-stone      → Resistor
//   flux-well       → Capacitor
//   spiral-coil     → Inductor
//   one-way-valve   → Diode

const CIRCUITS = {
  'half-wave-rectifier': {
    title: 'The First Gate',
    realName: 'Half-Wave Rectifier',
    category: 'rectifier · ac→dc · single-phase',
    blurb: "In the world before runes, this circuit took alternating current and let only one half through — turning a tide that surged in both directions into a current that flowed only forward. The valve permits, the well steadies, the rune throttles. The same as your gate.",
    components: [
      { id: 'origin', kind: 'origin-crystal', col: 0, row: 2, label: 'ORIGIN', locked: true },
      { id: 'v1',     kind: 'one-way-valve',  col: 2, row: 2, label: 'VALVE' },
      { id: 'r1',     kind: 'rune-stone',     col: 4, row: 2, label: 'RUNE' },
      { id: 'f1',     kind: 'flux-well',      col: 4, row: 4, label: 'FLUX' },
      { id: 'drain',  kind: 'void-drain',     col: 7, row: 2, label: 'DRAIN', locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2]] },
      { points: [[2,2],[3,2],[4,2]] },
      { points: [[4,2],[5,2],[6,2],[7,2]] },
      { points: [[4,2],[4,3],[4,4]] },
      { points: [[4,4],[5,4],[6,4],[7,4],[7,3],[7,2]] },
    ],
  },

  'voltage-divider': {
    title: "Bleeder's Mark",
    realName: 'Voltage Divider',
    category: 'analog · scaling · two-resistor',
    blurb: "Two stones in a row, splitting the tide. What enters at full pressure leaves diminished — measured at the seam between the two, you find a fraction of the source. A bleeder's trick, stamped into countless instruments.",
    components: [
      { id: 'origin', kind: 'origin-crystal', col: 0, row: 2, label: 'ORIGIN', locked: true },
      { id: 'r1',     kind: 'rune-stone',     col: 2, row: 2, label: 'RUNE I' },
      { id: 'r2',     kind: 'rune-stone',     col: 5, row: 2, label: 'RUNE II' },
      { id: 'drain',  kind: 'void-drain',     col: 7, row: 2, label: 'DRAIN', locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2]] },
      { points: [[2,2],[3,2],[4,2],[5,2]] },
      { points: [[5,2],[6,2],[7,2]] },
      // tap node going down (output node)
      { points: [[4,2],[4,4]] },
    ],
  },

  'full-wave-rectifier': {
    title: 'The Twin Tide',
    realName: 'Full-Wave Rectifier',
    category: 'rectifier · ac→dc · bridge',
    blurb: "Four valves in a diamond, taking the tide whichever way it surges and folding both halves into one steady forward current. The smith's bridge — twice the yield of the single gate.",
    components: [
      { id: 'origin', kind: 'origin-crystal', col: 0, row: 2, label: 'ORIGIN', locked: true },
      // bridge of four diodes in a diamond around column 3-4
      { id: 'v1',     kind: 'one-way-valve',  col: 3, row: 1, label: 'VALVE I' },
      { id: 'v2',     kind: 'one-way-valve',  col: 5, row: 1, label: 'VALVE II' },
      { id: 'v3',     kind: 'one-way-valve',  col: 3, row: 4, label: 'VALVE III' },
      { id: 'v4',     kind: 'one-way-valve',  col: 5, row: 4, label: 'VALVE IV' },
      { id: 'r1',     kind: 'rune-stone',     col: 6, row: 2, label: 'RUNE' },
      { id: 'drain',  kind: 'void-drain',     col: 7, row: 2, label: 'DRAIN', locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[2,1],[3,1]] }, // origin to top-left
      { points: [[2,2],[2,4],[3,4]] },              // origin branch to bottom-left
      { points: [[3,1],[4,1],[5,1]] },              // top rail to top-right
      { points: [[3,4],[4,4],[5,4]] },              // bottom rail to bottom-right
      { points: [[5,1],[6,1],[6,2]] },              // top-right to rune top
      { points: [[5,4],[6,4],[6,2]] },              // bottom-right to rune top
      { points: [[6,2],[7,2]] },                    // rune to drain
    ],
  },

  'rc-low-pass': {
    title: 'The Still Pool',
    realName: 'RC Low-Pass Filter',
    category: 'filter · passive · 1st order',
    blurb: "A throttle and a well, set in series. Sharp gusts are absorbed by the well's reservoir; only the slow, steady currents pass through to the drain. The first lesson in dampening — what stills the chatter, lets the song through.",
    components: [
      { id: 'origin', kind: 'origin-crystal', col: 0, row: 2, label: 'ORIGIN', locked: true },
      { id: 'r1',     kind: 'rune-stone',     col: 3, row: 2, label: 'RUNE' },
      { id: 'f1',     kind: 'flux-well',      col: 5, row: 4, label: 'FLUX' },
      { id: 'drain',  kind: 'void-drain',     col: 7, row: 2, label: 'DRAIN', locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[3,2]] },
      { points: [[3,2],[4,2],[5,2],[6,2],[7,2]] },
      { points: [[5,2],[5,3],[5,4]] },
      { points: [[5,4],[6,4],[7,4],[7,3],[7,2]] },
    ],
  },

  'lc-tank': {
    title: 'The Singing Spire',
    realName: 'LC Tank',
    category: 'resonator · oscillator · parallel',
    blurb: "A coil and a well, joined in a closed ring. Energy passes between them in perfect cadence — magnetic field giving way to stored charge, then back again — ringing at one true note. The smiths use it to find a single frequency in a noisy sky.",
    components: [
      { id: 'origin', kind: 'origin-crystal', col: 0, row: 2, label: 'ORIGIN', locked: true },
      { id: 'c1',     kind: 'spiral-coil',    col: 3, row: 1, label: 'COIL' },
      { id: 'f1',     kind: 'flux-well',      col: 5, row: 1, label: 'FLUX' },
      { id: 'drain',  kind: 'void-drain',     col: 7, row: 2, label: 'DRAIN', locked: true },
    ],
    traces: [
      { points: [[0,2],[1,2],[2,2],[2,1],[3,1]] }, // origin to coil
      { points: [[3,1],[4,1],[5,1]] },              // coil to flux
      { points: [[5,1],[6,1],[6,2],[7,2]] },        // flux to drain
      // parallel return path forming the tank loop
      { points: [[3,1],[3,3],[5,3],[5,1]] },
    ],
  },

  'buck-converter': {
    title: 'The Crown Step',
    realName: 'Buck Converter',
    category: 'switching · dc-dc · step-down',
    blurb: "A valve, a coil, and a well — switched in sequence to step a tall current down to a humbler one without losing its strength. The crown's secret: a torrent that becomes a brook, but the brook still turns the wheel.",
    components: [
      { id: 'origin', kind: 'origin-crystal', col: 0, row: 2, label: 'ORIGIN', locked: true },
      { id: 'v1',     kind: 'one-way-valve',  col: 2, row: 2, label: 'SWITCH' },
      { id: 'c1',     kind: 'spiral-coil',    col: 4, row: 2, label: 'COIL' },
      { id: 'f1',     kind: 'flux-well',      col: 6, row: 4, label: 'FLUX' },
      { id: 'v2',     kind: 'one-way-valve',  col: 3, row: 4, label: 'CATCH' },
      { id: 'drain',  kind: 'void-drain',     col: 7, row: 2, label: 'DRAIN', locked: true },
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

  'common-emitter-amp': {
    title: "The Herald's Voice",
    realName: 'Common-Emitter Amp',
    category: 'amplifier · inverting · single-stage',
    blurb: "Two stones biasing the gate, a well to couple the song in, another to send it on — and at the heart, a gate that turns a whisper into a shout. The herald's trick: a small voice steers a large one.",
    components: [
      { id: 'origin', kind: 'origin-crystal', col: 0, row: 0, label: 'ORIGIN', locked: true },
      { id: 'r1',     kind: 'rune-stone',     col: 2, row: 0, label: 'BIAS I' },
      { id: 'r2',     kind: 'rune-stone',     col: 4, row: 0, label: 'COLLECT' },
      { id: 'r3',     kind: 'rune-stone',     col: 2, row: 4, label: 'BIAS II' },
      { id: 'r4',     kind: 'rune-stone',     col: 4, row: 4, label: 'EMITTER' },
      { id: 'f1',     kind: 'flux-well',      col: 6, row: 2, label: 'COUPLE' },
      { id: 'v1',     kind: 'one-way-valve',  col: 4, row: 2, label: 'GATE' },
      { id: 'drain',  kind: 'void-drain',     col: 7, row: 4, label: 'DRAIN', locked: true },
    ],
    traces: [
      { points: [[0,0],[1,0],[2,0]] },
      { points: [[2,0],[3,0],[4,0]] },
      { points: [[4,0],[4,1],[4,2]] }, // collector to gate
      { points: [[2,0],[2,1],[2,2]] }, // bias mid-tap
      { points: [[2,2],[3,2],[4,2]] },
      { points: [[2,2],[2,3],[2,4]] }, // bias to lower rail
      { points: [[2,4],[3,4],[4,4]] },
      { points: [[4,2],[4,3],[4,4]] }, // emitter
      { points: [[4,2],[5,2],[6,2]] }, // gate output
      { points: [[6,2],[6,3],[6,4],[7,4]] },
      { points: [[4,4],[5,4],[6,4]] },
    ],
  },
};

const CIRCUIT_KEYS = Object.keys(CIRCUITS);

Object.assign(window, { CIRCUITS, CIRCUIT_KEYS });
