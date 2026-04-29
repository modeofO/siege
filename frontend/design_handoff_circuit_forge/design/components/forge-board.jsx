// The carved-stone grid board with components and traces.
// One scripted interaction: clicking "Run Aether" pulses energy through valid traces.

// Board geometry: 8 cols × 6 rows, cell = 56px, gap channels carved in stone.
const COLS = 8;
const ROWS = 6;
const CELL = 56;

// Pre-built layout: a Half-Wave Rectifier topology
// Components: O = Origin Crystal, V = One-Way Valve (diode), F = Flux Well (cap),
//             R = Rune Stone (resistor), D = Void Drain
// Empty slot = trace passes through
const PLACED = [
  { id: 'origin',  kind: 'origin-crystal', col: 0, row: 2, label: 'ORIGIN', locked: true },
  { id: 'v1',      kind: 'one-way-valve',  col: 2, row: 2, label: 'VALVE',  rot: 0 },
  { id: 'f1',      kind: 'flux-well',      col: 4, row: 4, label: 'FLUX',   rot: 0 },
  { id: 'r1',      kind: 'rune-stone',     col: 4, row: 2, label: 'RUNE',   rot: 0 },
  { id: 'drain',   kind: 'void-drain',     col: 7, row: 2, label: 'DRAIN',  locked: true },
];

// Traces are paths along the channel grid, defined as polylines through (col,row) lattice
// Each segment is animated when "lit"
const TRACES = [
  // origin -> valve
  { id: 't1', from: 'origin', to: 'v1', points: [[0,2],[1,2],[2,2]] },
  // valve -> rune
  { id: 't2', from: 'v1', to: 'r1', points: [[2,2],[3,2],[4,2]] },
  // rune -> drain (top branch)
  { id: 't3', from: 'r1', to: 'drain', points: [[4,2],[5,2],[6,2],[7,2]] },
  // rune -> flux (down branch)
  { id: 't4', from: 'r1', to: 'f1', points: [[4,2],[4,3],[4,4]] },
  // flux -> drain via bottom
  { id: 't5', from: 'f1', to: 'drain', points: [[4,4],[5,4],[6,4],[7,4],[7,3],[7,2]] },
];

// Tray components available to drag (decorative — not actually draggable in this scripted version)
const TRAY = [
  { kind: 'rune-stone',     name: 'Rune Stone',     fantasy: 'Restricts arcane flow',     count: 4 },
  { kind: 'flux-well',      name: 'Flux Well',      fantasy: 'Stores and releases energy', count: 2 },
  { kind: 'spiral-coil',    name: 'Spiral Coil',    fantasy: 'Smooths the aetheric current', count: 1 },
  { kind: 'one-way-valve',  name: 'One-Way Valve',  fantasy: 'Permits flow in a single direction', count: 3 },
];

function cellToPx(col, row) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function tracePath(points) {
  return points.map(([c, r]) => {
    const { x, y } = cellToPx(c, r);
    return `${x},${y}`;
  }).join(' ');
}

// Component glyph rendered on the board — weathered medieval artifact look
function BoardComponent({ comp, lit, ornate }) {
  const { x, y } = cellToPx(comp.col, comp.row);
  const isSource = comp.kind === 'origin-crystal';
  const isSink = comp.kind === 'void-drain';
  const size = 44;
  const color = lit || isSource ? 'var(--amber)' : 'var(--ink-dim)';

  return (
    <g transform={`translate(${x - size/2}, ${y - size/2})`}>
      {/* base stone tile */}
      <rect width={size} height={size}
        fill="#2a190d"
        stroke={lit || isSource ? 'var(--amber)' : '#1a0f08'}
        strokeWidth={lit || isSource ? 1.5 : 1}
        rx={ornate ? 4 : 2}
        style={{
          filter: lit || isSource ? 'drop-shadow(0 0 8px rgba(255,180,80,0.6))' : 'none',
          transition: 'all 0.4s ease',
        }}
      />
      {/* inner bevel */}
      <rect x="2" y="2" width={size - 4} height={size - 4}
        fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1" rx={ornate ? 3 : 1.5} />
      {ornate && (
        <>
          {/* corner notches for ornate */}
          <line x1="0" y1="6" x2="6" y2="0" stroke="rgba(255,180,80,0.3)" strokeWidth="0.8" />
          <line x1={size} y1="6" x2={size-6} y2="0" stroke="rgba(255,180,80,0.3)" strokeWidth="0.8" />
          <line x1="0" y1={size-6} x2="6" y2={size} stroke="rgba(255,180,80,0.3)" strokeWidth="0.8" />
          <line x1={size} y1={size-6} x2={size-6} y2={size} stroke="rgba(255,180,80,0.3)" strokeWidth="0.8" />
        </>
      )}
      {/* glyph */}
      <g transform={`translate(${size/2}, ${size/2})`}>
        <g transform="translate(-12,-12)">
          {comp.kind === 'origin-crystal' && (
            <g>
              <polygon points="12,2 19,9 12,22 5,9" fill="rgba(255,200,100,0.3)" stroke={color} strokeWidth="1.4" />
              <line x1="5" y1="9" x2="19" y2="9" stroke={color} strokeWidth="1.4" />
              <line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth="1.4" />
            </g>
          )}
          {comp.kind === 'void-drain' && (
            <g>
              <circle cx="12" cy="12" r="9" fill="rgba(0,0,0,0.6)" stroke={color} strokeWidth="1.4" />
              <circle cx="12" cy="12" r="5" fill="none" stroke={color} strokeWidth="1.4" />
              <circle cx="12" cy="12" r="2" fill={color} />
            </g>
          )}
          {comp.kind === 'one-way-valve' && (
            <g>
              <polygon points="5,5 19,12 5,19" fill={lit ? 'rgba(255,180,80,0.25)' : 'none'} stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
              <line x1="19" y1="5" x2="19" y2="19" stroke={color} strokeWidth="1.4" />
            </g>
          )}
          {comp.kind === 'flux-well' && (
            <g>
              <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="1.4" />
              <circle cx="12" cy="12" r="5" fill={lit ? 'rgba(255,180,80,0.25)' : 'none'} stroke={color} strokeWidth="1.4" />
              <line x1="3" y1="12" x2="7" y2="12" stroke={color} strokeWidth="1.4" />
              <line x1="17" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1.4" />
            </g>
          )}
          {comp.kind === 'rune-stone' && (
            <g>
              <polygon points="12,3 20,9 17,20 7,20 4,9" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
              <line x1="12" y1="7" x2="12" y2="17" stroke={color} strokeWidth="1.4" />
              <line x1="9" y1="10" x2="15" y2="10" stroke={color} strokeWidth="1.4" />
              <line x1="9" y1="14" x2="15" y2="14" stroke={color} strokeWidth="1.4" />
            </g>
          )}
          {comp.kind === 'spiral-coil' && (
            <g>
              <path d="M3 12 Q 6 4, 12 12 T 21 12" fill="none" stroke={color} strokeWidth="1.4" />
              <path d="M3 12 Q 6 20, 12 12 T 21 12" fill="none" stroke={color} strokeWidth="1.4" />
            </g>
          )}
        </g>
      </g>
    </g>
  );
}

function ForgeBoard({ lit, traceSpeed = 1, showHint = true, ornate = false, circuitKey = 'half-wave-rectifier' }) {
  const W = COLS * CELL;
  const H = ROWS * CELL;
  const circuit = (window.CIRCUITS && window.CIRCUITS[circuitKey]) || { components: PLACED, traces: TRACES };
  const placed = circuit.components;
  const traces = circuit.traces;

  return (
    <div style={{
      position: 'relative',
      width: W + 32,
      height: H + 32,
      padding: 16,
      background:
        'radial-gradient(ellipse at 50% 50%, #3a2818 0%, #1f1208 80%)',
      border: '1px solid #0a0604',
      boxShadow: 'inset 0 0 40px rgba(0,0,0,0.7), 0 4px 30px rgba(0,0,0,0.6)',
    }}>
      {/* Stone surface noise */}
      <div style={{
        position: 'absolute', inset: 16,
        background:
          'repeating-radial-gradient(circle at 20% 30%, rgba(0,0,0,0.15) 0 2px, transparent 2px 8px),' +
          'repeating-radial-gradient(circle at 70% 60%, rgba(0,0,0,0.1) 0 1px, transparent 1px 5px)',
        pointerEvents: 'none',
      }} />

      <svg width={W} height={H} style={{ display: 'block', position: 'relative' }}>
        <defs>
          <linearGradient id="trace-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.85 0.16 80)" />
            <stop offset="50%" stopColor="var(--amber)" />
            <stop offset="100%" stopColor="oklch(0.85 0.16 80)" />
          </linearGradient>
          <filter id="trace-glow">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Carved channel grid — etched stone lines */}
        {Array.from({ length: ROWS + 1 }).map((_, r) => (
          <line key={`h${r}`} x1={0} y1={r * CELL} x2={W} y2={r * CELL}
            stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
        ))}
        {Array.from({ length: COLS + 1 }).map((_, c) => (
          <line key={`v${c}`} x1={c * CELL} y1={0} x2={c * CELL} y2={H}
            stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
        ))}
        {/* highlight grain on top of carved lines */}
        {Array.from({ length: ROWS + 1 }).map((_, r) => (
          <line key={`hh${r}`} x1={0} y1={r * CELL + 1} x2={W} y2={r * CELL + 1}
            stroke="rgba(255,200,140,0.04)" strokeWidth="1" />
        ))}

        {/* Cell dots — small carved pivots at each intersection */}
        {Array.from({ length: ROWS + 1 }).map((_, r) =>
          Array.from({ length: COLS + 1 }).map((_, c) => (
            <circle key={`d${r}-${c}`} cx={c * CELL} cy={r * CELL} r="1.5"
              fill="rgba(0,0,0,0.6)" />
          ))
        )}

        {/* Hint silhouette — dashed faint outline of the target topology */}
        {showHint && traces.map((t, i) => (
          <polyline key={`hint-${i}`}
            points={tracePath(t.points)}
            fill="none"
            stroke="rgba(255,180,80,0.12)"
            strokeWidth="3"
            strokeDasharray="4 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Carved channel base (always visible, dim) */}
        {traces.map((t, i) => (
          <polyline key={`base-${i}`}
            points={tracePath(t.points)}
            fill="none"
            stroke="rgba(0,0,0,0.7)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Lit traces — amber glow flowing */}
        {lit && traces.map((t, i) => (
          <g key={`lit-${i}`} style={{
            animation: 'glow-pulse 2s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}>
            <polyline
              points={tracePath(t.points)}
              fill="none"
              stroke="url(#trace-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="8 4"
              style={{
                animation: `pulse-flow ${2.4 / traceSpeed}s linear infinite`,
              }}
            />
            <polyline
              points={tracePath(t.points)}
              fill="none"
              stroke="var(--amber-glow)"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
          </g>
        ))}

        {/* Components */}
        {placed.map(comp => (
          <BoardComponent key={comp.id} comp={comp} lit={lit} ornate={ornate} />
        ))}
      </svg>

      {/* Component labels under each */}
      {placed.map(comp => {
        const { x, y } = cellToPx(comp.col, comp.row);
        return (
          <div key={`lbl-${comp.id}`} style={{
            position: 'absolute',
            left: 16 + x,
            top: 16 + y + 28,
            transform: 'translateX(-50%)',
            fontSize: 8,
            letterSpacing: '0.18em',
            color: lit || comp.locked ? 'var(--amber-dim)' : 'var(--ink-faint)',
            fontFamily: 'JetBrains Mono, monospace',
            pointerEvents: 'none',
          }}>{comp.label}</div>
        );
      })}
    </div>
  );
}

Object.assign(window, { ForgeBoard, TRAY, PLACED, TRACES });
