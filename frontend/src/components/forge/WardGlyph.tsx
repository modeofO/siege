// frontend/src/components/forge/WardGlyph.tsx
"use client";

import type { ComponentKind } from "@/lib/forge/circuits";

interface WardGlyphProps {
  kind: ComponentKind;
  cx: number;
  cy: number;
  color: string;
}

export function WardGlyph({ kind, cx, cy, color }: WardGlyphProps) {
  switch (kind) {
    case "origin-crystal":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon points="0,-4 3.5,0 0,4 -3.5,0" fill="none" stroke={color} strokeWidth="1.2" />
          <circle r="1" fill={color} />
        </g>
      );
    case "void-drain":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="3.5" fill="none" stroke={color} strokeWidth="1" />
          <circle r="1.2" fill={color} />
        </g>
      );
    case "rune-stone":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <rect x="-3" y="-3.5" width="6" height="7" rx="0.5" fill="none" stroke={color} strokeWidth="1" />
          <line x1="-1.5" y1="0" x2="1.5" y2="0" stroke={color} strokeWidth="0.8" />
        </g>
      );
    case "flux-well":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle r="3.5" fill="none" stroke={color} strokeWidth="1" />
          <circle r="1.5" fill="none" stroke={color} strokeWidth="0.6" />
        </g>
      );
    case "spiral-coil":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <circle cx="-2.5" cy="0" r="1.8" fill="none" stroke={color} strokeWidth="0.8" />
          <circle cx="0" cy="0" r="1.8" fill="none" stroke={color} strokeWidth="0.8" />
          <circle cx="2.5" cy="0" r="1.8" fill="none" stroke={color} strokeWidth="0.8" />
        </g>
      );
    case "one-way-valve":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon points="-3,-3 3,0 -3,3" fill="none" stroke={color} strokeWidth="1" />
          <line x1="3" y1="-3" x2="3" y2="3" stroke={color} strokeWidth="1" />
        </g>
      );
    default:
      return null;
  }
}
