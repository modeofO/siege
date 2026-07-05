"use client";

import { lazy, Suspense, useMemo, type ReactNode } from "react";
import { BattlefieldView } from "@/components/BattlefieldView";
import type { Battlefield3DProps } from "./Battlefield3D";

const Battlefield3D = lazy(() => import("./Battlefield3D"));

function webglAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// NEXT_PUBLIC_BATTLE_3D=0 force-disables (dev escape hatch); default on.
const FLAG_ON = process.env.NEXT_PUBLIC_BATTLE_3D !== "0";

// `fallbackOnly` renders ONLY in the 2D fallback path (as BattlefieldView's
// children). In the 3D path the scene plays the resolution itself, so this slot
// — the 2D BattleAnimation overlay — is dropped. Anything that must appear in
// BOTH paths (e.g. the "confirming on-chain…" pill) stays a sibling of the gate
// in the caller, not a child here. This keeps the 2D fallback DOM byte-identical
// to the pre-integration page.
export function Battlefield3DGate(
  props: Battlefield3DProps & { fallbackOnly?: ReactNode },
) {
  const { fallbackOnly, ...rest } = props;
  const use3d = useMemo(() => FLAG_ON && webglAvailable(), []);

  if (!use3d) {
    return (
      <BattlefieldView
        allocations={rest.allocations}
        isPlayerA={rest.isPlayerA}
        committed={rest.committed}
        modifiers={rest.modifiers}
        opponentAllocations={rest.opponentAllocations}
      >
        {fallbackOnly}
      </BattlefieldView>
    );
  }

  return (
    <Suspense fallback={<div className="h-full min-h-[320px] animate-pulse bg-[#1a1714] rounded-lg" />}>
      <Battlefield3D {...rest} />
    </Suspense>
  );
}
