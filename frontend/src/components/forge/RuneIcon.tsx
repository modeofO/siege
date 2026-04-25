"use client";

import type { ComponentKind } from "@/lib/forge/circuits";

interface RuneIconProps {
  kind: ComponentKind;
  size?: number;
  color?: string;
}

export function RuneIcon({ kind, size = 24, color = "currentColor" }: RuneIconProps) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.4,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "rune-stone":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="12,3 20,9 17,20 7,20 4,9" {...stroke} />
          <line x1="12" y1="7" x2="12" y2="17" {...stroke} />
          <line x1="9" y1="10" x2="15" y2="10" {...stroke} />
          <line x1="9" y1="14" x2="15" y2="14" {...stroke} />
        </svg>
      );
    case "flux-well":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" {...stroke} />
          <circle cx="12" cy="12" r="5" {...stroke} />
          <line x1="3" y1="12" x2="7" y2="12" {...stroke} />
          <line x1="17" y1="12" x2="21" y2="12" {...stroke} />
        </svg>
      );
    case "spiral-coil":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M3 12 Q 6 4, 12 12 T 21 12" {...stroke} />
          <path d="M3 12 Q 6 20, 12 12 T 21 12" {...stroke} />
        </svg>
      );
    case "one-way-valve":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="5,5 19,12 5,19" {...stroke} />
          <line x1="19" y1="5" x2="19" y2="19" {...stroke} />
        </svg>
      );
    case "origin-crystal":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="12,2 19,9 12,22 5,9" {...stroke} />
          <line x1="5" y1="9" x2="19" y2="9" {...stroke} />
          <line x1="12" y1="2" x2="12" y2="22" {...stroke} />
        </svg>
      );
    case "void-drain":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M7 7 L17 17 M17 7 L7 17" {...stroke} />
        </svg>
      );
    default:
      return <svg width={size} height={size} />;
  }
}
