// CircuitSilhouette: tiny preview of the topology for the Forge hint card
// CircuitSchematic: real EE schematic for the celebration reveal panel

const COMP_GLYPH = {
  'origin-crystal': (x, y, color) => (
    <g key={`g-${x}-${y}`} transform={`translate(${x},${y})`}>
      <circle r="4" fill={color} />
      <circle r="6.5" fill="none" stroke={color} strokeWidth="1" />
    </g>
  ),
  'void-drain': (x, y, color) => (
    <g key={`g-${x}-${y}`} transform={`translate(${x},${y})`}>
      <circle r="5" fill="none" stroke={color} strokeWidth="1.2" />
      <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" stroke={color} strokeWidth="1" />
      <line x1="3.5" y1="-3.5" x2="-3.5" y2="3.5" stroke={color} strokeWidth="1" />
    </g>
  ),
  'rune-stone': (x, y, color) => (
    <rect key={`g-${x}-${y}`} x={x-5} y={y-3.5} width="10" height="7"
      fill="none" stroke={color} strokeWidth="1" />
  ),
  'flux-well': (x, y, color) => (
    <g key={`g-${x}-${y}`} transform={`translate(${x},${y})`}>
      <line x1="-1.5" y1="-5" x2="-1.5" y2="5" stroke={color} strokeWidth="1.4" />
      <line x1="1.5" y1="-5" x2="1.5" y2="5" stroke={color} strokeWidth="1.4" />
    </g>
  ),
  'spiral-coil': (x, y, color) => (
    <g key={`g-${x}-${y}`} transform={`translate(${x},${y})`}>
      <circle cx="-4" cy="0" r="2.5" fill="none" stroke={color} strokeWidth="0.9" />
      <circle cx="0"  cy="0" r="2.5" fill="none" stroke={color} strokeWidth="0.9" />
      <circle cx="4"  cy="0" r="2.5" fill="none" stroke={color} strokeWidth="0.9" />
    </g>
  ),
  'one-way-valve': (x, y, color) => (
    <g key={`g-${x}-${y}`} transform={`translate(${x},${y})`}>
      <polygon points="-4,-3.5 4,0 -4,3.5" fill="none" stroke={color} strokeWidth="1" />
      <line x1="4" y1="-3.5" x2="4" y2="3.5" stroke={color} strokeWidth="1" />
    </g>
  ),
};

function CircuitSilhouette({ circuit }) {
  // Deliberately abstract — gives NO topology hints. Just an aged schematic
  // cartouche: an inscribed frame with a wax seal and the circuit's name in
  // flowing arcane script. The player must figure out the layout themselves.
  const title = (circuit && circuit.title) || 'Unknown Sigil';
  const real = (circuit && circuit.realName) || '???';
  return (
    <svg viewBox="0 0 180 100" width="100%" height="100">
      <defs>
        <radialGradient id="sil-vellum" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#1a0e08" />
          <stop offset="100%" stopColor="#0a0604" />
        </radialGradient>
      </defs>
      <rect width="180" height="100" fill="url(#sil-vellum)" />

      {/* outer cartouche frame */}
      <rect x="8" y="8" width="164" height="84" fill="none"
        stroke="rgba(255,180,80,0.35)" strokeWidth="0.8" />
      <rect x="11" y="11" width="158" height="78" fill="none"
        stroke="rgba(255,180,80,0.18)" strokeWidth="0.4" />

      {/* corner flourishes */}
      {[[8,8,1,1],[172,8,-1,1],[8,92,1,-1],[172,92,-1,-1]].map(([x,y,sx,sy], i) => (
        <g key={i} transform={`translate(${x},${y}) scale(${sx},${sy})`}
          stroke="rgba(255,180,80,0.5)" strokeWidth="0.6" fill="none">
          <path d="M 0 6 Q 0 0 6 0" />
          <circle cx="6" cy="6" r="1.2" fill="rgba(255,180,80,0.5)" stroke="none" />
        </g>
      ))}

      {/* sigil ring (decorative — no topology data) */}
      <g transform="translate(90,46)">
        <circle r="20" fill="none" stroke="rgba(255,180,80,0.3)" strokeWidth="0.6" />
        <circle r="16" fill="none" stroke="rgba(255,180,80,0.18)" strokeWidth="0.4" strokeDasharray="2 2" />
        {/* runic tick marks around the ring */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const x1 = Math.cos(a) * 20, y1 = Math.sin(a) * 20;
          const x2 = Math.cos(a) * 23, y2 = Math.sin(a) * 23;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(255,180,80,0.45)" strokeWidth="0.5" />;
        })}
        {/* abstract glyph in the center — same for every circuit, no info leaked */}
        <text x="0" y="3" textAnchor="middle"
          fontFamily="Cinzel, serif" fontSize="14" fontWeight="700"
          fill="rgba(255,180,80,0.55)" letterSpacing="0">?</text>
      </g>

      {/* title strip */}
      <text x="90" y="82" textAnchor="middle"
        fontFamily="Cinzel, serif" fontSize="6.5" fontWeight="600"
        fill="rgba(255,180,80,0.7)" letterSpacing="2">{title.toUpperCase()}</text>
    </svg>
  );
}

// Simplified EE schematic per circuit. Hand-drawn so each looks correct.
function CircuitSchematic({ circuitKey }) {
  const W = 200, H = 90;
  const stroke = 'var(--amber)';
  const sw = 1;
  const labelStyle = { fill: 'var(--ink-faint)', fontSize: 6.5, fontFamily: 'JetBrains Mono, monospace' };

  // Common drawing helpers
  const wire = (x1, y1, x2, y2, key) => <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} />;
  const ground = (x, y) => (
    <g key={`gnd-${x}-${y}`}>
      <line x1={x} y1={y} x2={x} y2={y+6} stroke={stroke} strokeWidth={sw} />
      <line x1={x-5} y1={y+6} x2={x+5} y2={y+6} stroke={stroke} strokeWidth={sw} />
      <line x1={x-3} y1={y+9} x2={x+3} y2={y+9} stroke={stroke} strokeWidth={sw} />
      <line x1={x-1.5} y1={y+12} x2={x+1.5} y2={y+12} stroke={stroke} strokeWidth={sw} />
    </g>
  );
  const resistor = (x, y, label, horizontal = true) => (
    <g key={`r-${x}-${y}-${label}`}>
      {horizontal ? (
        <path d={`M${x-10} ${y} l3 -4 l4 8 l4 -8 l4 8 l4 -8 l3 4`}
          fill="none" stroke={stroke} strokeWidth={sw} />
      ) : (
        <path d={`M${x} ${y-10} l-4 3 l8 4 l-8 4 l8 4 l-8 4 l4 3`}
          fill="none" stroke={stroke} strokeWidth={sw} />
      )}
      <text x={x + (horizontal ? 0 : 10)} y={y + (horizontal ? -8 : 0)} textAnchor="middle" {...labelStyle}>{label}</text>
    </g>
  );
  const capacitor = (x, y, label, vertical = true) => (
    <g key={`c-${x}-${y}-${label}`}>
      {vertical ? (
        <>
          <line x1={x-6} y1={y-2} x2={x+6} y2={y-2} stroke={stroke} strokeWidth={sw+0.4} />
          <line x1={x-6} y1={y+2} x2={x+6} y2={y+2} stroke={stroke} strokeWidth={sw+0.4} />
        </>
      ) : (
        <>
          <line x1={x-2} y1={y-6} x2={x-2} y2={y+6} stroke={stroke} strokeWidth={sw+0.4} />
          <line x1={x+2} y1={y-6} x2={x+2} y2={y+6} stroke={stroke} strokeWidth={sw+0.4} />
        </>
      )}
      <text x={x + (vertical ? 10 : 0)} y={y + (vertical ? 1 : -8)} textAnchor="middle" {...labelStyle}>{label}</text>
    </g>
  );
  const inductor = (x, y, label) => (
    <g key={`l-${x}-${y}-${label}`}>
      <path d={`M${x-12} ${y} q3 -6 6 0 q3 -6 6 0 q3 -6 6 0 q3 -6 6 0`}
        fill="none" stroke={stroke} strokeWidth={sw} />
      <text x={x} y={y - 8} textAnchor="middle" {...labelStyle}>{label}</text>
    </g>
  );
  const diode = (x, y, label, horizontal = true) => (
    <g key={`d-${x}-${y}-${label}`}>
      {horizontal ? (
        <>
          <polygon points={`${x-5},${y-4} ${x+4},${y} ${x-5},${y+4}`} fill="none" stroke={stroke} strokeWidth={sw} />
          <line x1={x+4} y1={y-4} x2={x+4} y2={y+4} stroke={stroke} strokeWidth={sw} />
        </>
      ) : (
        <>
          <polygon points={`${x-4},${y-5} ${x},${y+4} ${x+4},${y-5}`} fill="none" stroke={stroke} strokeWidth={sw} />
          <line x1={x-4} y1={y+4} x2={x+4} y2={y+4} stroke={stroke} strokeWidth={sw} />
        </>
      )}
      <text x={x + (horizontal ? 0 : 10)} y={y + (horizontal ? -8 : 0)} textAnchor="middle" {...labelStyle}>{label}</text>
    </g>
  );
  const source = (x, y, label = 'Vin') => (
    <g key={`v-${x}-${y}`}>
      <circle cx={x} cy={y} r="6" fill="none" stroke={stroke} strokeWidth={sw} />
      <text x={x} y={y+2} textAnchor="middle" {...labelStyle} style={{...labelStyle, fontSize: 7}}>~</text>
      <text x={x - 10} y={y + 1} textAnchor="end" {...labelStyle}>{label}</text>
    </g>
  );
  const dot = (x, y) => <circle key={`dot-${x}-${y}`} cx={x} cy={y} r="1.4" fill={stroke} />;
  const out = (x, y) => (
    <g key={`out-${x}-${y}`}>
      <circle cx={x} cy={y} r="1.8" fill="none" stroke={stroke} strokeWidth={sw} />
      <text x={x + 5} y={y + 2} {...labelStyle}>Vout</text>
    </g>
  );

  let parts = [];
  switch (circuitKey) {
    case 'half-wave-rectifier':
      parts = [
        source(15, 45),
        wire(21, 45, 50, 45, 'w1'),
        diode(56, 45, 'D1'),
        wire(60, 45, 100, 45, 'w2'),
        resistor(110, 45, 'R'),
        wire(120, 45, 160, 45, 'w3'),
        capacitor(140, 60, 'C', false),
        wire(140, 45, 140, 54, 'w4'),
        dot(140, 45),
        wire(140, 66, 140, 75, 'w5'),
        wire(15, 51, 15, 75, 'wg1'),
        wire(15, 75, 160, 75, 'wg2'),
        out(160, 45),
        ground(85, 75),
      ];
      break;
    case 'voltage-divider':
      parts = [
        source(15, 35),
        wire(21, 35, 60, 35, 'w1'),
        resistor(70, 35, 'R1'),
        wire(80, 35, 130, 35, 'w2'),
        resistor(140, 35, 'R2'),
        wire(150, 35, 175, 35, 'wt'),
        wire(15, 41, 15, 75, 'wg1'),
        wire(15, 75, 175, 75, 'wg2'),
        wire(175, 35, 175, 75, 'wr'),
        dot(105, 35),
        wire(105, 35, 105, 25, 'wo'),
        out(105, 22),
        ground(95, 75),
      ];
      break;
    case 'full-wave-rectifier':
      parts = [
        source(15, 45),
        wire(21, 45, 35, 45, 'w1'),
        // diamond bridge
        wire(35, 45, 35, 25, 'w2'), wire(35, 45, 35, 65, 'w3'),
        diode(50, 25, 'D1'), diode(80, 25, 'D2'),
        diode(50, 65, 'D3'), diode(80, 65, 'D4'),
        wire(35, 25, 45, 25, 'w4'), wire(54, 25, 75, 25, 'w5'), wire(84, 25, 95, 25, 'w6'),
        wire(35, 65, 45, 65, 'w7'), wire(54, 65, 75, 65, 'w8'), wire(84, 65, 95, 65, 'w9'),
        wire(95, 25, 95, 45, 'w10'), wire(95, 65, 95, 45, 'w11'),
        dot(95, 45),
        wire(95, 45, 130, 45, 'w12'),
        resistor(140, 45, 'R'),
        wire(150, 45, 175, 45, 'w13'),
        out(178, 45),
        wire(15, 51, 15, 90, 'wg1'),
        wire(15, 90, 175, 90, 'wg2'),
        wire(175, 45, 175, 90, 'wg3'),
        ground(95, 90),
      ];
      break;
    case 'rc-low-pass':
      parts = [
        source(15, 35),
        wire(21, 35, 70, 35, 'w1'),
        resistor(80, 35, 'R'),
        wire(90, 35, 175, 35, 'w2'),
        capacitor(135, 50, 'C', false),
        wire(135, 35, 135, 44, 'w3'),
        dot(135, 35),
        wire(135, 56, 135, 75, 'w4'),
        wire(15, 41, 15, 75, 'wg1'),
        wire(15, 75, 175, 75, 'wg2'),
        wire(175, 35, 175, 75, 'wr'),
        out(165, 25),
        wire(155, 35, 155, 25, 'wo1'), wire(155, 25, 165, 25, 'wo2'),
        dot(155, 35),
        ground(95, 75),
      ];
      break;
    case 'lc-tank':
      parts = [
        source(15, 50),
        wire(21, 50, 50, 50, 'w1'),
        // parallel L and C
        wire(50, 50, 50, 30, 'w2'), wire(50, 50, 50, 70, 'w3'),
        wire(50, 30, 90, 30, 'w4'), wire(50, 70, 90, 70, 'w5'),
        inductor(70, 30, 'L'),
        capacitor(70, 70, 'C', true),
        wire(90, 30, 90, 50, 'w6'), wire(90, 70, 90, 50, 'w7'),
        dot(90, 50),
        wire(90, 50, 175, 50, 'wt'),
        out(178, 50),
        wire(15, 56, 15, 90, 'wg1'),
        wire(15, 90, 175, 90, 'wg2'),
        wire(175, 50, 175, 90, 'wr'),
        ground(95, 90),
      ];
      break;
    case 'buck-converter':
      parts = [
        // simplified: switch (drawn as diode-like) → L → out, with catch diode and cap
        source(15, 30, 'Vin'),
        wire(21, 30, 40, 30, 'w1'),
        // switch symbol (slash)
        <g key="sw">
          <line x1="40" y1="30" x2="50" y2="22" stroke={stroke} strokeWidth={sw} />
          <circle cx="40" cy="30" r="1.4" fill={stroke} />
          <circle cx="52" cy="30" r="1.4" fill={stroke} />
          <text x="46" y="14" textAnchor="middle" {...labelStyle}>SW</text>
        </g>,
        wire(52, 30, 75, 30, 'w2'),
        inductor(90, 30, 'L'),
        wire(105, 30, 175, 30, 'w3'),
        // catch diode from sw-output node down to ground
        wire(75, 30, 75, 50, 'w4'),
        diode(75, 60, 'D', false),
        wire(75, 65, 75, 80, 'w5'),
        // output cap
        capacitor(140, 50, 'C', false),
        wire(140, 30, 140, 44, 'w6'),
        dot(140, 30),
        wire(140, 56, 140, 80, 'w7'),
        wire(15, 36, 15, 80, 'wg1'),
        wire(15, 80, 175, 80, 'wg2'),
        wire(175, 30, 175, 80, 'wr'),
        out(178, 30),
        ground(95, 80),
      ];
      break;
    case 'common-emitter-amp':
      parts = [
        // Vcc rail at top
        <text key="vcc" x="100" y="10" textAnchor="middle" {...labelStyle}>+Vcc</text>,
        wire(20, 14, 180, 14, 'rail'),
        // R1 (bias upper) from rail down to base node
        resistor(50, 30, 'R1', false),
        wire(50, 14, 50, 20, 'rb1'), wire(50, 40, 50, 50, 'rb2'),
        // Rc (collector) from rail down to collector
        resistor(120, 30, 'Rc', false),
        wire(120, 14, 120, 20, 'rc1'), wire(120, 40, 120, 50, 'rc2'),
        // input cap to base
        capacitor(25, 50, 'Cin', true),
        wire(15, 50, 19, 50, 'win1'), wire(31, 50, 50, 50, 'win2'),
        // base node dot, base R2 to ground
        dot(50, 50),
        resistor(50, 70, 'R2', false),
        wire(50, 60, 50, 65, 'rb3'), wire(50, 75, 50, 85, 'rb4'),
        // transistor — simple Y
        <g key="bjt">
          <circle cx="85" cy="50" r="9" fill="none" stroke={stroke} strokeWidth={sw} />
          <line x1="50" y1="50" x2="76" y2="50" stroke={stroke} strokeWidth={sw} />
          <line x1="78" y1="44" x2="78" y2="56" stroke={stroke} strokeWidth={sw+0.4} />
          <line x1="78" y1="46" x2="92" y2="38" stroke={stroke} strokeWidth={sw} />
          <line x1="78" y1="54" x2="92" y2="62" stroke={stroke} strokeWidth={sw} />
          <polygon points="88,60 92,62 87,64" fill={stroke} />
          <text x="100" y="56" {...labelStyle}>Q1</text>
        </g>,
        wire(92, 38, 120, 38, 'wc'), wire(120, 38, 120, 40, 'wc2'),
        dot(120, 50),
        // collector to output cap
        wire(120, 50, 140, 50, 'wo1'),
        capacitor(150, 50, 'Cout', true),
        wire(156, 50, 175, 50, 'wo2'),
        // emitter to Re to ground
        wire(92, 62, 92, 70, 'we'),
        resistor(92, 75, 'Re', false),
        wire(92, 80, 92, 88, 'we2'),
        // ground rail bottom
        wire(20, 88, 180, 88, 'gnd-rail'),
        wire(50, 85, 50, 88, 'gw1'),
        out(178, 50),
        ground(100, 88),
      ];
      break;
    default:
      parts = [<text key="t" x="100" y="50" textAnchor="middle" {...labelStyle}>—</text>];
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="80">
      {parts}
    </svg>
  );
}

Object.assign(window, { CircuitSilhouette, CircuitSchematic });
