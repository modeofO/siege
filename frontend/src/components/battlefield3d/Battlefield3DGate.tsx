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

export function Battlefield3DGate(props: Battlefield3DProps & { children?: ReactNode }) {
  const use3d = useMemo(() => FLAG_ON && webglAvailable(), []);

  if (!use3d) {
    return (
      <BattlefieldView
        allocations={props.allocations}
        isPlayerA={props.isPlayerA}
        committed={props.committed}
        modifiers={props.modifiers}
        opponentAllocations={props.opponentAllocations}
      >
        {props.children}
      </BattlefieldView>
    );
  }

  return (
    <Suspense fallback={<div className="h-full min-h-[320px] animate-pulse bg-[#1a1714] rounded-lg" />}>
      <Battlefield3D {...props} />
    </Suspense>
  );
}
