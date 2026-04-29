// All five screens, designed as artboards.

// ============================================================
// SCREEN 1 — Circuit Forge main view
// ============================================================
function ScreenForge({ lit, setLit, traceSpeed, showHint, ornate, circuitKey, setCircuitKey }) {
  const circuit = window.CIRCUITS[circuitKey];
  return (
    <div className="wood-bg wood-grain" style={{ width: 1280, height: 820, position: 'relative', overflow: 'hidden' }}>
      <NavStrip active="FORGE" />
      <SectionHeader title="THE CIRCUIT FORGE" meta="bench · iii / vii" />

      {/* Body row: tray | board | inventory */}
      <div style={{ display: 'flex', gap: 20, padding: '0 32px', position: 'relative', zIndex: 3 }}>

        {/* LEFT: Component tray */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div className="label-sm amber" style={{ marginBottom: 12 }}>COMPONENT TRAY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TRAY.map(t => (
              <div key={t.kind} className="drag-handle" style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 10,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--rule)',
                borderRadius: 2,
                position: 'relative',
              }}>
                <div style={{
                  width: 40, height: 40,
                  background: '#1a0f08',
                  border: '1px solid rgba(255,180,80,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--amber-dim)',
                }}>
                  <RuneIcon kind={t.kind} size={22} color="var(--amber)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink)', letterSpacing: '0.04em' }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 2 }}>{t.fantasy}</div>
                </div>
                <div className="font-mono" style={{
                  fontSize: 11, color: 'var(--amber)',
                  borderLeft: '1px solid var(--rule)',
                  paddingLeft: 10, alignSelf: 'stretch',
                  display: 'flex', alignItems: 'center',
                }}>×{t.count}</div>
              </div>
            ))}
          </div>

          <div className="label-sm" style={{ marginTop: 24, marginBottom: 10 }}>RESOURCES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <ResourceChip kind="iron" value="284" />
            <ResourceChip kind="stone" value="612" />
            <ResourceChip kind="ember" value="47" />
          </div>
        </div>

        {/* CENTER: Board */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          {/* lanterns at corners of the bench area */}
          <div style={{ position: 'relative', padding: 20 }}>
            <span className="lantern" style={{ left: 0, top: 0 }} />
            <span className="lantern" style={{ right: 0, top: 0 }} />
            <span className="lantern" style={{ left: 0, bottom: 0 }} />
            <span className="lantern" style={{ right: 0, bottom: 0 }} />
            <ForgeBoard lit={lit} traceSpeed={traceSpeed} showHint={showHint} ornate={ornate} circuitKey={circuitKey} />
          </div>

          {/* Below-board status + action */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', maxWidth: 530,
            padding: '14px 4px',
            borderTop: '1px solid var(--rule)',
            marginTop: 8,
          }}>
            <div>
              <div className="label-sm">PATTERN MATCH</div>
              <div className="font-mono" style={{
                fontSize: 13,
                color: lit ? 'var(--amber)' : 'var(--ink-dim)',
                marginTop: 4,
                letterSpacing: '0.06em',
              }}>
                {lit ? '5 / 5 conduits aligned' : '4 / 5 conduits aligned'}
              </div>
            </div>
            <button
              onClick={() => setLit(!lit)}
              className="btn-ghost amber"
              style={{
                padding: '12px 28px',
                fontSize: 12,
                background: lit ? 'rgba(255,180,80,0.12)' : 'transparent',
                boxShadow: lit ? '0 0 20px rgba(255,180,80,0.3)' : 'none',
              }}
            >
              {lit ? '◉ Aether Flowing' : '◯ Run Aether'}
            </button>
          </div>
        </div>

        {/* RIGHT: Hint card + objective */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div className="label-sm amber" style={{ marginBottom: 12 }}>TARGET SILHOUETTE</div>
          <div style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--rule)',
            padding: 16,
            position: 'relative',
          }}>
            <CircuitSilhouette circuit={circuit} />
            <div style={{
              fontSize: 10, color: 'var(--ink-faint)',
              fontFamily: 'JetBrains Mono, monospace',
              marginTop: 10, lineHeight: 1.5,
            }}>
              {circuit.components.length - 2} crafted parts. The shape is yours to divine.
            </div>
          </div>

          <div className="label-sm" style={{ marginTop: 22, marginBottom: 10 }}>REWARD ON COMPLETION</div>
          <div style={{
            background: 'linear-gradient(180deg, #2a1a08, #1a0f08)',
            border: '1px solid rgba(255,180,80,0.3)',
            padding: 14,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 40, height: 52, position: 'relative', overflow: 'hidden' }}>
              <div style={{ transform: 'scale(0.143)', transformOrigin: 'top left', width: 280, height: 360, position: 'absolute' }}>
                <IlluminatedBanner locked={!lit} name={circuitKey} title={circuit.title} circuit={circuit} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', color: 'var(--amber)', textTransform: 'uppercase' }}>Banner of</div>
              <div className="font-serif" style={{ fontSize: 14, color: 'var(--ink)', marginTop: 2 }}>{circuit.title}</div>
              <div style={{ fontSize: 9, color: lit ? 'var(--amber-dim)' : 'var(--ink-faint)', marginTop: 4, letterSpacing: '0.14em' }}>
                {lit ? 'FORGED — READY TO CLAIM' : 'SEALED — UNTIL FORGED'}
              </div>
            </div>
          </div>

          {/* Circuit picker — cycle through topologies */}
          <div className="label-sm" style={{ marginTop: 22, marginBottom: 10 }}>BLUEPRINT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {CIRCUIT_KEYS.map(k => {
              const c = window.CIRCUITS[k];
              const active = k === circuitKey;
              return (
                <button key={k}
                  onClick={() => setCircuitKey && setCircuitKey(k)}
                  style={{
                    background: active ? 'rgba(255,180,80,0.10)' : 'transparent',
                    border: '1px solid ' + (active ? 'var(--amber)' : 'var(--rule)'),
                    color: active ? 'var(--amber)' : 'var(--ink-dim)',
                    padding: '6px 10px',
                    fontFamily: 'Cinzel, serif',
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}>
                  {c.title}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* corner brackets on the whole frame */}
      <span className="bracket tl" />
      <span className="bracket tr" />
      <span className="bracket bl" />
      <span className="bracket br" />
      {lit && <EmberField count={14} />}
    </div>
  );
}

// ============================================================
// SCREEN 2 — Component detail card (hover state)
// ============================================================
function ScreenComponent() {
  return (
    <div className="wood-bg wood-grain" style={{ width: 720, height: 540, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmberField count={6} />
      {/* dim board behind */}
      <div style={{ position: 'absolute', inset: 60, opacity: 0.3, filter: 'blur(2px)' }}>
        <svg width="100%" height="100%" viewBox="0 0 600 420">
          {Array.from({length: 8}).map((_, c) =>
            Array.from({length: 6}).map((_, r) => (
              <rect key={`${c}-${r}`} x={c*70+10} y={r*60+10} width="60" height="50"
                fill="none" stroke="rgba(255,180,80,0.15)" strokeWidth="0.5" />
            ))
          )}
        </svg>
      </div>

      {/* Card */}
      <div style={{
        width: 360,
        background: 'linear-gradient(180deg, #2a190d, #1a0f08)',
        border: '1px solid rgba(255,180,80,0.4)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 30px rgba(255,180,80,0.15)',
        position: 'relative',
        zIndex: 2,
      }}>
        <span className="bracket tl" style={{ width: 18, height: 18, top: 6, left: 6 }} />
        <span className="bracket tr" style={{ width: 18, height: 18, top: 6, right: 6 }} />
        <span className="bracket bl" style={{ width: 18, height: 18, bottom: 6, left: 6 }} />
        <span className="bracket br" style={{ width: 18, height: 18, bottom: 6, right: 6 }} />

        {/* Glyph hero */}
        <div style={{
          padding: '36px 24px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          borderBottom: '1px solid var(--rule)',
        }}>
          <div style={{
            width: 96, height: 96,
            background: 'radial-gradient(circle, #3a2818 0%, #1a0f08 80%)',
            border: '1px solid rgba(255,180,80,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
            position: 'relative',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.7), 0 0 24px rgba(255,180,80,0.2)',
          }}>
            <RuneIcon kind="rune-stone" size={56} color="var(--amber)" />
          </div>
          <div className="label-sm amber">CRAFTED · TIER II</div>
          <div className="font-serif" style={{ fontSize: 22, color: 'var(--ink)', marginTop: 8, letterSpacing: '0.16em' }}>
            RUNE STONE
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{
            fontFamily: 'Cinzel, serif',
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--ink-dim)',
            lineHeight: 1.6,
            textAlign: 'center',
          }}>
            "A weathered glyph carved from siege-stone. It throttles the aether's rush — what passes through emerges tempered."
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 20, padding: '12px 0', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
            <div style={{ flex: 1 }}>
              <div className="label-sm">OWNED</div>
              <div className="font-mono" style={{ fontSize: 18, color: 'var(--amber)', marginTop: 4 }}>×4</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="label-sm">CRAFT COST</div>
              <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink-dim)', marginTop: 6, lineHeight: 1.4 }}>
                12 IRON<br/>4 STONE
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="label-sm">PLACED</div>
              <div className="font-mono" style={{ fontSize: 18, color: 'var(--ink)', marginTop: 4 }}>×1</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn-ghost amber" style={{ flex: 1, padding: '10px' }}>Place on Board</button>
            <button className="btn-ghost" style={{ padding: '10px 14px' }}>Forge ×1</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 3 — Completed circuit celebration
// ============================================================
function ScreenCelebration({ circuitKey = 'half-wave-rectifier' }) {
  const circuit = window.CIRCUITS[circuitKey];
  return (
    <div className="wood-bg wood-grain" style={{ width: 1280, height: 820, position: 'relative', overflow: 'hidden' }}>
      {/* heavy ambient glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, rgba(255,180,80,0.18) 0%, transparent 55%)',
        pointerEvents: 'none', zIndex: 1,
      }} />
      <EmberField count={24} />

      <NavStrip active="FORGE" />

      {/* Centered glory layout */}
      <div style={{
        position: 'absolute', top: 60, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        zIndex: 3, padding: '40px 0',
      }}>
        <div className="label-sm amber" style={{ letterSpacing: '0.4em', animation: 'shimmer 2s ease-in-out infinite' }}>
          ✦ TOPOLOGY COMPLETE ✦
        </div>
        <div className="font-serif" style={{
          fontSize: 32, color: 'var(--amber)', marginTop: 14, letterSpacing: '0.24em',
          textShadow: '0 0 20px rgba(255,180,80,0.5)',
        }}>
          {circuit.title.toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-dim)', letterSpacing: '0.2em', marginTop: 6 }}>
          A BANNER FORGED FROM THE OLD CRAFT
        </div>

        {/* Body grid: lit board on left, illuminated banner reward on right */}
        <div style={{ display: 'flex', gap: 60, marginTop: 30, alignItems: 'center' }}>
          {/* Lit board */}
          <div style={{ position: 'relative' }}>
            <span className="lantern" style={{ left: 0, top: 0 }} />
            <span className="lantern" style={{ right: 0, top: 0 }} />
            <span className="lantern" style={{ left: 0, bottom: 0 }} />
            <span className="lantern" style={{ right: 0, bottom: 0 }} />
            <ForgeBoard lit={true} traceSpeed={1.2} showHint={false} ornate={true} circuitKey={circuitKey} />
          </div>

          {/* Illuminated manuscript banner */}
          <div style={{ width: 280 }}>
            <IlluminatedBanner name={circuitKey} title={circuit.title} circuit={circuit} />
          </div>
        </div>

        {/* Real circuit reveal panel */}
        <div style={{
          marginTop: 28,
          width: 760,
          background: 'rgba(15, 10, 6, 0.85)',
          border: '1px solid var(--amber)',
          padding: '20px 28px',
          position: 'relative',
          backdropFilter: 'blur(4px)',
        }}>
          <span className="bracket tl" style={{ width: 16, height: 16, top: 6, left: 6 }} />
          <span className="bracket tr" style={{ width: 16, height: 16, top: 6, right: 6 }} />
          <span className="bracket bl" style={{ width: 16, height: 16, bottom: 6, left: 6 }} />
          <span className="bracket br" style={{ width: 16, height: 16, bottom: 6, right: 6 }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div className="label-sm amber">THE OLD-WORLD NAME</div>
              <div className="font-serif" style={{ fontSize: 20, color: 'var(--ink)', marginTop: 6, letterSpacing: '0.14em' }}>
                {circuit.realName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 12, lineHeight: 1.6, fontStyle: 'italic' }}>
                {circuit.blurb}
              </div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)' }} />
            <div style={{ width: 200 }}>
              <div className="label-sm">SCHEMATIC</div>
              <div style={{ marginTop: 6, padding: 8, background: '#0a0604', border: '1px solid var(--rule)' }}>
                <CircuitSchematic circuitKey={circuitKey} />
              </div>
              <div className="label-sm" style={{ marginTop: 8 }}>CATEGORY</div>
              <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink-dim)', marginTop: 4 }}>
                {circuit.category}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <button className="btn-ghost amber" style={{ padding: '10px 22px' }}>Equip Banner</button>
          <button className="btn-ghost" style={{ padding: '10px 22px' }}>To Gallery</button>
          <button className="btn-ghost" style={{ padding: '10px 22px' }}>Forge Again</button>
        </div>
      </div>

      <span className="bracket tl" />
      <span className="bracket tr" />
      <span className="bracket bl" />
      <span className="bracket br" />
    </div>
  );
}

// Illuminated manuscript banner — heraldic, gold-leaf, parchment.
// The circuit's topology becomes the heraldic motif at its center.
function IlluminatedBanner({ scale = 1, locked = false, name = 'first-gate', title, circuit }) {
  const C = circuit || (window.CIRCUITS && window.CIRCUITS[name]) || (window.CIRCUITS && window.CIRCUITS['half-wave-rectifier']);
  const displayTitle = title || (C && C.title) || 'First Gate';
  const ink = locked ? '#3a2810' : '#7a3818';
  const gold = locked ? '#5a4520' : '#b8862c';

  // Map (col 0..7, row 0..5) into heraldic emblem space, centered around (0,0)
  // Emblem area: roughly -55..+55 horizontally, -38..+38 vertically
  const ex = (c) => -55 + (c / 7) * 110;
  const ey = (r) => -32 + (r / 5) * 64;

  const traces = (C && C.traces) || [];
  const components = (C && C.components) || [];

  // heraldic glyph shapes — drawn as gold-leaf inlay
  const glyph = {
    'origin-crystal': (cx, cy) => (
      <g key={`og-${cx}-${cy}`} transform={`translate(${cx},${cy})`}>
        <polygon points="0,-6 5,0 0,6 -5,0" fill={ink} />
        <polygon points="0,-9 7,0 0,9 -7,0" fill="none" stroke={gold} strokeWidth="0.6" />
      </g>
    ),
    'void-drain': (cx, cy) => (
      <g key={`og-${cx}-${cy}`} transform={`translate(${cx},${cy})`}>
        <circle r="6" fill="none" stroke={ink} strokeWidth="1.5" />
        <circle r="2" fill={ink} />
        <circle r="9" fill="none" stroke={gold} strokeWidth="0.6" strokeDasharray="2 2" />
      </g>
    ),
    'rune-stone': (cx, cy) => (
      <g key={`og-${cx}-${cy}`} transform={`translate(${cx},${cy})`}>
        <rect x="-5" y="-6" width="10" height="12" rx="1" fill={ink} />
        <line x1="-3" y1="-2" x2="3" y2="-2" stroke={gold} strokeWidth="0.6" />
        <line x1="-3" y1="2" x2="3" y2="2" stroke={gold} strokeWidth="0.6" />
      </g>
    ),
    'flux-well': (cx, cy) => (
      <g key={`og-${cx}-${cy}`} transform={`translate(${cx},${cy})`}>
        <circle r="6" fill="none" stroke={ink} strokeWidth="1.5" />
        <circle r="2.5" fill={ink} />
      </g>
    ),
    'spiral-coil': (cx, cy) => (
      <g key={`og-${cx}-${cy}`} transform={`translate(${cx},${cy})`}>
        <circle cx="-4" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
        <circle cx="0" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
        <circle cx="4" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
      </g>
    ),
    'one-way-valve': (cx, cy) => (
      <g key={`og-${cx}-${cy}`} transform={`translate(${cx},${cy})`}>
        <polygon points="-5,-5 5,0 -5,5" fill={ink} />
        <line x1="5" y1="-5" x2="5" y2="5" stroke={ink} strokeWidth="1.5" />
      </g>
    ),
  };

  return (
    <div style={{
      width: 280 * scale, height: 360 * scale,
      background: 'linear-gradient(180deg, #d6c19a 0%, #b39768 100%)',
      position: 'relative',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 0 40px rgba(120,80,30,0.3)',
      filter: locked ? 'grayscale(0.9) brightness(0.4)' : 'none',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background:
          'radial-gradient(circle at 18% 22%, rgba(80,50,20,0.3) 0 5%, transparent 14%),' +
          'radial-gradient(circle at 82% 78%, rgba(80,50,20,0.25) 0 6%, transparent 16%),' +
          'radial-gradient(circle at 60% 50%, rgba(80,50,20,0.1) 0 3%, transparent 10%)',
      }} />

      <div style={{
        position: 'absolute', inset: 12,
        border: `${2 * scale}px solid ${gold}`,
        boxShadow: 'inset 0 0 0 1px rgba(184, 134, 44, 0.4)',
      }} />
      <div style={{
        position: 'absolute', inset: 18,
        border: `1px solid ${locked ? '#3a2810' : 'rgba(184, 134, 44, 0.5)'}`,
      }} />

      <svg viewBox="0 0 200 280" style={{
        position: 'absolute', inset: 28, width: 'calc(100% - 56px)', height: 'calc(100% - 56px)',
      }}>
        <rect width="200" height="280" fill="transparent" />

        {/* TITLE */}
        <text x="100" y="36" textAnchor="middle"
          fontFamily="Cinzel, serif" fontSize="11" fontWeight="700"
          fill={ink} letterSpacing="2.5">{displayTitle.toUpperCase()}</text>
        <line x1="40" y1="44" x2="160" y2="44" stroke={gold} strokeWidth="0.6" />

        {/* central emblem */}
        <g transform="translate(100, 150)">
          <ellipse cx="0" cy="0" rx="70" ry="80" fill="none" stroke={gold} strokeWidth="1" />
          <ellipse cx="0" cy="0" rx="62" ry="72" fill="none" stroke={gold} strokeWidth="0.5" />

          {/* topology traces as gold-leaf knotwork */}
          <g stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
            {traces.map((t, i) => (
              <polyline key={i}
                points={t.points.map(([c, r]) => `${ex(c)},${ey(r)}`).join(' ')} />
            ))}
          </g>
          {/* highlight under-strokes for parchment depth */}
          <g stroke={gold} strokeWidth="0.4" fill="none" opacity="0.6">
            {traces.map((t, i) => (
              <polyline key={`h${i}`}
                points={t.points.map(([c, r]) => `${ex(c)},${ey(r) + 0.6}`).join(' ')} />
            ))}
          </g>

          {/* component glyphs */}
          {components.map(comp => {
            const cx = ex(comp.col), cy = ey(comp.row);
            const draw = glyph[comp.kind];
            return draw ? draw(cx, cy) : null;
          })}

          {/* corner flourishes */}
          <g stroke={gold} strokeWidth="0.7" fill="none">
            <path d="M -60 -50 Q -40 -60 -20 -50" />
            <path d="M 60 -50 Q 40 -60 20 -50" />
            <path d="M -60 60 Q -40 70 -20 60" />
            <path d="M 60 60 Q 40 70 20 60" />
          </g>

          {/* top sigil — small star */}
          <g transform="translate(0,-58)" fill={gold}>
            <polygon points="0,-5 1.4,-1.4 5,0 1.4,1.4 0,5 -1.4,1.4 -5,0 -1.4,-1.4" />
          </g>
        </g>

        <line x1="40" y1="245" x2="160" y2="245" stroke={gold} strokeWidth="0.6" />
        <text x="100" y="258" textAnchor="middle"
          fontFamily="Cinzel, serif" fontSize="7" fontStyle="italic"
          fill={ink} letterSpacing="1.5">ut superius est inferius</text>
        <text x="100" y="270" textAnchor="middle"
          fontFamily="JetBrains Mono, monospace" fontSize="5"
          fill={ink} letterSpacing="2">{(name || 'unknown').toUpperCase()}</text>
      </svg>

      {[[20,20],[260*scale-20, 20],[20, 340*scale-20],[260*scale-20, 340*scale-20]].map(([l,t], i) => (
        <div key={i} style={{
          position: 'absolute', left: l, top: t, width: 5, height: 5, borderRadius: '50%',
          background: gold,
          boxShadow: 'inset -1px -1px 1px rgba(0,0,0,0.3)',
        }}/>
      ))}

      {locked && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10,6,4,0.55)',
        }}>
          <div className="font-mono label-sm" style={{ color: 'var(--ink-dim)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>⊘</div>
            SEALED
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SCREEN 4 — Collection gallery
// ============================================================
const GALLERY_ITEMS = [
  { name: 'half-wave-rectifier', circuitKey: 'half-wave-rectifier', unlocked: true,  category: 'BANNER' },
  { name: 'full-wave-rectifier', circuitKey: 'full-wave-rectifier', unlocked: true,  category: 'BANNER' },
  { name: 'voltage-divider',     circuitKey: 'voltage-divider',     unlocked: true,  category: 'PARCEL SKIN' },
  { name: 'rc-low-pass',         circuitKey: 'rc-low-pass',         unlocked: false, progress: 0.6,  category: 'BANNER' },
  { name: 'buck-converter',      circuitKey: 'buck-converter',      unlocked: false, progress: 0,    category: 'HOLD DECOR' },
  { name: 'lc-tank',             circuitKey: 'lc-tank',             unlocked: false, progress: 0.25, category: 'BANNER' },
  { name: 'common-emitter-amp',  circuitKey: 'common-emitter-amp',  unlocked: false, progress: 0,    category: 'PARCEL SKIN' },
  { name: 'unknown',             circuitKey: null,                  unlocked: false, progress: 0,    category: '???' },
];

function ScreenGallery() {
  return (
    <div className="wood-bg wood-grain" style={{ width: 1280, height: 820, position: 'relative', overflow: 'hidden' }}>
      <NavStrip active="HOLD" />
      <SectionHeader title="THE COSMETIC RELIQUARY" meta="3 / 8 forged" />

      {/* tabs */}
      <div style={{ display: 'flex', gap: 24, padding: '0 32px 16px', borderBottom: '1px solid var(--rule)' }}>
        {[
          ['ALL', 8, true],
          ['BANNERS', 4, false],
          ['PARCEL SKINS', 2, false],
          ['HOLD DECORATIONS', 1, false],
        ].map(([name, count, active]) => (
          <div key={name} style={{
            paddingBottom: 10,
            borderBottom: active ? '2px solid var(--amber)' : '2px solid transparent',
            display: 'flex', alignItems: 'baseline', gap: 8,
          }}>
            <span className="label-sm" style={{
              color: active ? 'var(--amber)' : 'var(--ink-faint)',
              fontSize: 11, letterSpacing: '0.22em',
            }}>{name}</span>
            <span className="font-mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Gallery grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24,
        padding: '28px 32px', position: 'relative', zIndex: 3,
      }}>
        {GALLERY_ITEMS.map(item => {
          const c = item.circuitKey ? window.CIRCUITS[item.circuitKey] : null;
          const title = c ? c.title : '???';
          const realName = c ? c.realName : '???';
          return (
          <div key={item.name} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <div style={{ transform: 'scale(0.62)', transformOrigin: 'top center', height: 360 * 0.62 + 4 }}>
              <IlluminatedBanner locked={!item.unlocked} name={item.name} title={title} circuit={c} />
            </div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <div className="label-sm amber" style={{ fontSize: 9 }}>{item.category || 'BANNER'}</div>
              <div className="font-serif" style={{
                fontSize: 14, color: item.unlocked ? 'var(--ink)' : 'var(--ink-faint)',
                marginTop: 4, letterSpacing: '0.14em',
              }}>{title}</div>
              <div className="font-mono" style={{
                fontSize: 10, color: 'var(--ink-faint)', marginTop: 4, letterSpacing: '0.08em',
              }}>{realName}</div>
              {!item.unlocked && (
                <div style={{
                  marginTop: 8,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 10, color: 'var(--ember)', letterSpacing: '0.16em',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  <span style={{ width: 30, height: 2, background: 'var(--rule)', position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 0, top: 0, height: '100%',
                      width: `${(item.progress || 0) * 100}%`,
                      background: 'var(--ember)',
                    }} />
                  </span>
                  {item.progress != null ? `${Math.round(item.progress * 100)}%` : '?'}
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>

      <span className="bracket tl" />
      <span className="bracket tr" />
      <span className="bracket bl" />
      <span className="bracket br" />
    </div>
  );
}

// ============================================================
// SCREEN 5 — Profile / public banner card
// ============================================================
function ScreenProfile({ circuitKey = 'half-wave-rectifier' }) {
  const circuit = window.CIRCUITS[circuitKey];
  return (
    <div className="wood-bg wood-grain" style={{ width: 720, height: 540, position: 'relative', overflow: 'hidden' }}>
      <EmberField count={6} />
      {/* Header strip */}
      <div style={{
        padding: '20px 32px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div className="font-serif" style={{ color: 'var(--amber)', fontSize: 14, letterSpacing: '0.28em' }}>WARLORD'S CARD</div>
        <div className="font-mono label-sm">public profile · v3</div>
      </div>

      <div style={{ padding: 32, display: 'flex', gap: 28, position: 'relative', zIndex: 2 }}>
        {/* Equipped banner */}
        <div style={{ position: 'relative' }}>
          <IlluminatedBanner scale={0.85} name={circuitKey} title={circuit.title} circuit={circuit} />
        </div>

        {/* Profile data */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="label-sm amber">WARLORD</div>
          <div className="font-serif" style={{ fontSize: 24, color: 'var(--ink)', marginTop: 6, letterSpacing: '0.16em' }}>
            MODUS, OF THE MARCHES
          </div>
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }}>
            0x0502_13a0 · joined wk.124
          </div>

          <div style={{ marginTop: 20, padding: '14px 0', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
            <div className="label-sm">EQUIPPED BANNER</div>
            <div style={{ marginTop: 6 }}>
              <div className="font-serif" style={{ fontSize: 16, color: 'var(--amber)' }}>{circuit.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-dim)', marginTop: 4, fontStyle: 'italic' }}>
                {circuit.realName} · forged on day 47
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
            <div>
              <div className="label-sm">PARCELS HELD</div>
              <div className="font-mono" style={{ fontSize: 22, color: 'var(--ink)', marginTop: 4 }}>3</div>
            </div>
            <div>
              <div className="label-sm">CIRCUITS FORGED</div>
              <div className="font-mono" style={{ fontSize: 22, color: 'var(--amber)', marginTop: 4 }}>3 / 8</div>
            </div>
            <div>
              <div className="label-sm">HOLD STANDING</div>
              <div className="font-mono" style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 4 }}>BANNERMAN · TIER II</div>
            </div>
            <div>
              <div className="label-sm">ALLEGIANCE</div>
              <div className="font-mono" style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 4 }}>THE MARCHES</div>
            </div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', gap: 8, paddingTop: 16 }}>
            <button className="btn-ghost amber" style={{ flex: 1 }}>Change Banner</button>
            <button className="btn-ghost">Share</button>
          </div>
        </div>
      </div>

      <span className="bracket tl" />
      <span className="bracket tr" />
      <span className="bracket bl" />
      <span className="bracket br" />
    </div>
  );
}

Object.assign(window, { ScreenForge, ScreenComponent, ScreenCelebration, ScreenGallery, ScreenProfile, IlluminatedBanner });
