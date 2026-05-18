"use client";

import type { Circuit } from "@/lib/forge/circuits";
import { projectToCircle, traceToCirclePoints } from "@/lib/forge/wardProjection";
import { WardGlyph } from "./WardGlyph";

interface ArcaneSealProps {
  circuit: Circuit;
  name: string;
  size: number;
  tintColor?: string;
}

export function ArcaneSeal({ circuit, name, size, tintColor = "#daa520" }: ArcaneSealProps) {
  const r = size / 2;
  const traceRadius = r * 0.7;
  const filterId = `seal-glow-${name.replace(/\s+/g, "-")}`;

  return (
    <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`}>
      <defs>
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feFlood floodColor={tintColor} floodOpacity="0.5" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`seal-bg-${name.replace(/\s+/g, "-")}`}>
          <stop offset="0%" stopColor="#0a0604" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0a0604" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background */}
      <circle r={r - 2} fill={`url(#seal-bg-${name.replace(/\s+/g, "-")})`} />

      {/* Outer ring — solid */}
      <circle r={r - 3} fill="none" stroke={tintColor} strokeWidth="1.5" strokeOpacity="0.6" />
      {/* Inner ring — dashed */}
      <circle r={r - 8} fill="none" stroke={tintColor} strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="3 2" />

      {/* Title along top arc */}
      <defs>
        <path id={`seal-arc-top-${name.replace(/\s+/g, "-")}`} d={`M ${-(r - 12)},0 A ${r - 12},${r - 12} 0 0,1 ${r - 12},0`} fill="none" />
        <path id={`seal-arc-bot-${name.replace(/\s+/g, "-")}`} d={`M ${-(r - 12)},0 A ${r - 12},${r - 12} 0 0,0 ${r - 12},0`} fill="none" />
      </defs>
      {size >= 100 && (
        <>
          <text fill={tintColor} fillOpacity="0.7" fontSize={size > 100 ? 7 : 5} fontFamily="Cinzel, serif" letterSpacing="2" textAnchor="middle">
            <textPath href={`#seal-arc-top-${name.replace(/\s+/g, "-")}`} startOffset="50%">
              {circuit.title.toUpperCase()}
            </textPath>
          </text>
          <text fill={tintColor} fillOpacity="0.4" fontSize={size > 100 ? 5 : 4} fontFamily='"JetBrains Mono", monospace' letterSpacing="1.5" textAnchor="middle">
            <textPath href={`#seal-arc-bot-${name.replace(/\s+/g, "-")}`} startOffset="50%">
              {circuit.realName}
            </textPath>
          </text>
        </>
      )}

      {/* Ward traces */}
      <g filter={`url(#${filterId})`}>
        {circuit.traces.map((trace, i) => (
          <polyline
            key={i}
            points={traceToCirclePoints(trace, traceRadius)}
            fill="none"
            stroke={tintColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* Node sigils */}
        {circuit.components.map((comp) => {
          const { x, y } = projectToCircle(comp.col, comp.row, traceRadius);
          return <WardGlyph key={comp.id} kind={comp.kind} cx={x} cy={y} color={tintColor} />;
        })}
      </g>

      {/* Outer glow ring */}
      <circle r={r - 1} fill="none" stroke={tintColor} strokeWidth="0.5" strokeOpacity="0.2" />
    </svg>
  );
}
