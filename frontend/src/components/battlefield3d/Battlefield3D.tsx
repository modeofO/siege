"use client";

import { Canvas } from "@react-three/fiber";
import type { NodeOwner, RoundResult1v1 } from "@/lib/gameState1v1";
import type { RoundOutcome } from "@/lib/resolution1v1";

export interface Battlefield3DProps {
  allocations: number[]; // 13-slot: [p0..p2, g0..g2, repair, nc0..nc2, trap0..trap2]
  isPlayerA: boolean;
  committed: boolean;
  opponentCommitted: boolean;
  modifiers: [number, number, number];
  opponentAllocations?: number[] | null;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  vaultAHp: number;
  vaultBHp: number;
  history: RoundResult1v1[];
  outcome: RoundOutcome | null; // optimistic or chain-derived; null outside resolution
  onResolutionComplete?: () => void;
  children?: React.ReactNode;
}

// Placeholder scene: camera + lighting basics and a DOM-overlay passthrough for
// `children`. Real pieces, formations, and choreography arrive in later tasks.
export default function Battlefield3D({ children }: Battlefield3DProps) {
  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-lg bg-[#1a1714]">
      <Canvas
        className="absolute inset-0"
        camera={{ fov: 45, position: [0, 6.5, 5.2] }}
        onCreated={({ camera }) => camera.lookAt(0, 0, -0.2)}
      >
        <ambientLight intensity={0.3} />
        {/* Table surface (map plane 12 x 8 on XZ, table wood palette). */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[12, 8]} />
          <meshStandardMaterial color="#3a2b1c" />
        </mesh>
        {/* Placeholder piece at origin. */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#8a8a92" />
        </mesh>
      </Canvas>
      {/* DOM overlay: badges etc. render on top of the canvas. The overlay itself
          is pass-through; its own children opt back into pointer events. */}
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}
