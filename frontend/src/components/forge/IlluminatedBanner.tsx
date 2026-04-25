"use client";

import type { Circuit } from "@/lib/forge/circuits";

interface IlluminatedBannerProps {
  circuit: Circuit;
  name: string;
  scale?: number;
  locked?: boolean;
}

const ex = (c: number) => -55 + (c / 7) * 110;
const ey = (r: number) => -32 + (r / 5) * 64;

function HeraldGlyph({ kind, cx, cy, ink, gold }: { kind: string; cx: number; cy: number; ink: string; gold: string }) {
  switch (kind) {
    case "origin-crystal":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon points="0,-6 5,0 0,6 -5,0" fill={ink} />
          <polygon points="0,-9 7,0 0,9 -7,0" fill="none" stroke={gold} strokeWidth="0.6" />
        </g>
      );
    case "void-drain":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="6" fill="none" stroke={ink} strokeWidth="1.5" />
          <circle r="2" fill={ink} />
          <circle r="9" fill="none" stroke={gold} strokeWidth="0.6" strokeDasharray="2 2" />
        </g>
      );
    case "rune-stone":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <rect x="-5" y="-6" width="10" height="12" rx="1" fill={ink} />
          <line x1="-3" y1="-2" x2="3" y2="-2" stroke={gold} strokeWidth="0.6" />
          <line x1="-3" y1="2" x2="3" y2="2" stroke={gold} strokeWidth="0.6" />
        </g>
      );
    case "flux-well":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="6" fill="none" stroke={ink} strokeWidth="1.5" />
          <circle r="2.5" fill={ink} />
        </g>
      );
    case "spiral-coil":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle cx="-4" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
          <circle cx="0" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
          <circle cx="4" cy="0" r="2.5" fill="none" stroke={ink} strokeWidth="1.2" />
        </g>
      );
    case "one-way-valve":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon points="-5,-5 5,0 -5,5" fill={ink} />
          <line x1="5" y1="-5" x2="5" y2="5" stroke={ink} strokeWidth="1.5" />
        </g>
      );
    default:
      return null;
  }
}

export function IlluminatedBanner({ circuit, name, scale = 1, locked = false }: IlluminatedBannerProps) {
  const ink = locked ? "#3a2810" : "#7a3818";
  const gold = locked ? "#5a4520" : "#b8862c";

  return (
    <div
      style={{
        width: 280 * scale,
        height: 360 * scale,
        background: "linear-gradient(180deg, #d6c19a 0%, #b39768 100%)",
        position: "relative",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 0 40px rgba(120,80,30,0.3)",
        filter: locked ? "grayscale(0.9) brightness(0.4)" : "none",
      }}
    >
      {/* Aging stains */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 18% 22%, rgba(80,50,20,0.3) 0 5%, transparent 14%)," +
            "radial-gradient(circle at 82% 78%, rgba(80,50,20,0.25) 0 6%, transparent 16%)," +
            "radial-gradient(circle at 60% 50%, rgba(80,50,20,0.1) 0 3%, transparent 10%)",
        }}
      />

      {/* Gold borders */}
      <div style={{ position: "absolute", inset: 12, border: `${2 * scale}px solid ${gold}`, boxShadow: "inset 0 0 0 1px rgba(184,134,44,0.4)" }} />
      <div style={{ position: "absolute", inset: 18, border: `1px solid ${locked ? "#3a2810" : "rgba(184,134,44,0.5)"}` }} />

      {/* SVG content */}
      <svg
        viewBox="0 0 200 280"
        style={{ position: "absolute", inset: 28, width: "calc(100% - 56px)", height: "calc(100% - 56px)" }}
      >
        {/* Title */}
        <text x="100" y="36" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="11" fontWeight="700" fill={ink} letterSpacing="2.5">
          {circuit.title.toUpperCase()}
        </text>
        <line x1="40" y1="44" x2="160" y2="44" stroke={gold} strokeWidth="0.6" />

        {/* Central emblem */}
        <g transform="translate(100, 150)">
          <ellipse cx="0" cy="0" rx="70" ry="80" fill="none" stroke={gold} strokeWidth="1" />
          <ellipse cx="0" cy="0" rx="62" ry="72" fill="none" stroke={gold} strokeWidth="0.5" />

          {/* Topology traces as knotwork */}
          <g stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
            {circuit.traces.map((t, i) => (
              <polyline key={i} points={t.points.map(([c, r]) => `${ex(c)},${ey(r)}`).join(" ")} />
            ))}
          </g>
          <g stroke={gold} strokeWidth="0.4" fill="none" opacity="0.6">
            {circuit.traces.map((t, i) => (
              <polyline key={`h${i}`} points={t.points.map(([c, r]) => `${ex(c)},${ey(r) + 0.6}`).join(" ")} />
            ))}
          </g>

          {/* Component glyphs */}
          {circuit.components.map((comp) => (
            <HeraldGlyph key={comp.id} kind={comp.kind} cx={ex(comp.col)} cy={ey(comp.row)} ink={ink} gold={gold} />
          ))}

          {/* Corner flourishes */}
          <g stroke={gold} strokeWidth="0.7" fill="none">
            <path d="M -60 -50 Q -40 -60 -20 -50" />
            <path d="M 60 -50 Q 40 -60 20 -50" />
            <path d="M -60 60 Q -40 70 -20 60" />
            <path d="M 60 60 Q 40 70 20 60" />
          </g>

          {/* Top sigil */}
          <g transform="translate(0,-58)" fill={gold}>
            <polygon points="0,-5 1.4,-1.4 5,0 1.4,1.4 0,5 -1.4,1.4 -5,0 -1.4,-1.4" />
          </g>
        </g>

        <line x1="40" y1="245" x2="160" y2="245" stroke={gold} strokeWidth="0.6" />
        <text x="100" y="258" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="7" fontStyle="italic" fill={ink} letterSpacing="1.5">
          ut superius est inferius
        </text>
        <text x="100" y="270" textAnchor="middle" fontFamily='"JetBrains Mono", monospace' fontSize="5" fill={ink} letterSpacing="2">
          {name.toUpperCase()}
        </text>
      </svg>

      {/* Corner rivets */}
      {[
        [20, 20],
        [260 * scale - 20, 20],
        [20, 340 * scale - 20],
        [260 * scale - 20, 340 * scale - 20],
      ].map(([l, t], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: l,
            top: t,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: gold,
            boxShadow: "inset -1px -1px 1px rgba(0,0,0,0.3)",
          }}
        />
      ))}

      {/* Locked overlay */}
      {locked && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,6,4,0.55)",
          }}
        >
          <div style={{ color: "#b39e74", textAlign: "center", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>⊘</div>
            SEALED
          </div>
        </div>
      )}
    </div>
  );
}
