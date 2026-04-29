// Shared chrome and atoms across all screens

const ACCENTS = {
  amber:    { h: 75,  name: 'AMBER',    hex: '#e8a857' },
  verdigris:{ h: 165, name: 'VERDIGRIS',hex: '#5fb89a' },
  blood:    { h: 25,  name: 'BLOODOAK', hex: '#c46a4a' },
  arcane:   { h: 250, name: 'ARCANE',   hex: '#8a86d8' },
};

function applyAccent(name) {
  const a = ACCENTS[name] || ACCENTS.amber;
  const root = document.documentElement;
  // build oklch values from hue
  root.style.setProperty('--amber', `oklch(0.78 0.13 ${a.h})`);
  root.style.setProperty('--amber-soft', `oklch(0.72 0.10 ${a.h})`);
  root.style.setProperty('--amber-dim', `oklch(0.55 0.09 ${a.h})`);
  root.style.setProperty('--amber-glow', `oklch(0.85 0.16 ${a.h + 5})`);
}

// Top nav used on Forge / Gallery
function NavStrip({ active = 'FORGE', wallet = '0x0502_13a0' }) {
  return (
    <div className="nav-strip">
      <div className="font-serif" style={{ color: 'var(--amber)', fontSize: 14, fontWeight: 600, letterSpacing: '0.32em' }}>SIEGE</div>
      <div style={{ display: 'flex', gap: 24, marginLeft: 32 }}>
        {['FORGE', 'WORLD', 'HOLD'].map(item => (
          <span key={item} className="label-sm" style={{
            color: active === item ? 'var(--amber)' : 'var(--ink-faint)',
            fontSize: 11, letterSpacing: '0.22em',
          }}>{item}</span>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="label-sm">modus</span>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{wallet}</span>
        <button className="btn-ghost amber" style={{ padding: '4px 10px' }}>Profile</button>
        <button className="btn-ghost" style={{ padding: '4px 10px' }}>Disconnect</button>
      </div>
    </div>
  );
}

// Section header below nav strip
function SectionHeader({ title, meta }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '20px 32px 16px', position: 'relative', zIndex: 4,
    }}>
      <div className="font-serif" style={{ color: 'var(--amber)', fontSize: 16, letterSpacing: '0.28em' }}>
        {title}
      </div>
      <div className="font-mono label-sm">{meta}</div>
    </div>
  );
}

// Decorative ember particles inside a container
function EmberField({ count = 8 }) {
  const particles = React.useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: 6 + Math.random() * 88,
    bottom: Math.random() * 30,
    delay: Math.random() * 3,
    dur: 2 + Math.random() * 2,
  })), [count]);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map((p, i) => (
        <span key={i} className="ember-particle" style={{
          left: `${p.left}%`, bottom: `${p.bottom}%`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.dur}s`,
        }} />
      ))}
    </div>
  );
}

// Small SVG icons rendered in fantasy style — runic
function RuneIcon({ kind, size = 24, color = 'currentColor' }) {
  const s = size;
  const stroke = { stroke: color, strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (kind) {
    case 'rune-stone':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <polygon points="12,3 20,9 17,20 7,20 4,9" {...stroke} />
          <line x1="12" y1="7" x2="12" y2="17" {...stroke} />
          <line x1="9" y1="10" x2="15" y2="10" {...stroke} />
          <line x1="9" y1="14" x2="15" y2="14" {...stroke} />
        </svg>
      );
    case 'flux-well':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" {...stroke} />
          <circle cx="12" cy="12" r="5" {...stroke} />
          <line x1="3" y1="12" x2="7" y2="12" {...stroke} />
          <line x1="17" y1="12" x2="21" y2="12" {...stroke} />
        </svg>
      );
    case 'spiral-coil':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <path d="M3 12 Q 6 4, 12 12 T 21 12" {...stroke} />
          <path d="M3 12 Q 6 20, 12 12 T 21 12" {...stroke} />
        </svg>
      );
    case 'one-way-valve':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <polygon points="5,5 19,12 5,19" {...stroke} />
          <line x1="19" y1="5" x2="19" y2="19" {...stroke} />
        </svg>
      );
    case 'origin-crystal':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <polygon points="12,2 19,9 12,22 5,9" {...stroke} />
          <line x1="5" y1="9" x2="19" y2="9" {...stroke} />
          <line x1="12" y1="2" x2="12" y2="22" {...stroke} />
        </svg>
      );
    case 'void-drain':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M7 7 L17 17 M17 7 L7 17" {...stroke} />
        </svg>
      );
    case 'compass':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" {...stroke} />
          <polygon points="12,4 14,12 12,20 10,12" fill={color} stroke="none" />
        </svg>
      );
    case 'book':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <rect x="4" y="3" width="16" height="18" {...stroke} />
          <line x1="4" y1="7" x2="20" y2="7" {...stroke} />
          <line x1="4" y1="17" x2="20" y2="17" {...stroke} />
        </svg>
      );
    default:
      return <svg width={s} height={s} />;
  }
}

// Resource chip (Iron / Stone / Ember)
function ResourceChip({ kind, value }) {
  const icons = {
    iron:  <svg width="14" height="14" viewBox="0 0 16 16"><polygon points="8,2 14,8 8,14 2,8" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>,
    stone: <svg width="14" height="14" viewBox="0 0 16 16"><polygon points="3,5 8,2 13,5 12,12 4,12" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>,
    ember: <svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 2 Q11 6 11 9 A3 3 0 0 1 5 9 Q5 6 8 2 Z" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>,
  };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px',
      border: '1px solid var(--rule)',
      color: 'var(--ink-dim)',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11,
    }}>
      <span style={{ color: 'var(--amber-dim)' }}>{icons[kind]}</span>
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.14em' }}>{kind}</span>
      <span style={{ marginLeft: 4, color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}

Object.assign(window, { ACCENTS, applyAccent, NavStrip, SectionHeader, EmberField, RuneIcon, ResourceChip });
