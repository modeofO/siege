"use client";

import { Canvas } from "@react-three/fiber";
import type { NodeOwner, RoundResult1v1 } from "@/lib/gameState1v1";
import type { RoundOutcome } from "@/lib/resolution1v1";
import { PALETTE } from "./layout";

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

// Scene foundation: wooden table, parchment map plane with a dark border frame,
// and a warm-key / cool-fill light rig with soft shadows. Real pieces,
// formations, and choreography arrive in later tasks. The map plane is 10 x 6
// world units on XZ; the table surface is y = 0. See layout.ts / the Shared
// Visual Language for the coordinate system.
export default function Battlefield3D({ children }: Battlefield3DProps) {
  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-lg bg-[#1a1714]">
      <Canvas
        shadows
        dpr={[1, 2]}
        className="absolute inset-0"
        camera={{ fov: 45, position: [0, 6.5, 5.2] }}
        onCreated={({ camera }) => camera.lookAt(0, 0, -0.2)}
      >
        {/* Base fill so nothing reads pure black. */}
        <ambientLight intensity={0.25} />
        {/* Warm key light (candle) casting soft shadows across the table. */}
        <pointLight
          color={PALETTE.candle}
          intensity={2.2}
          position={[3.5, 3, 2.5]}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0005}
        />
        {/* Cool directional fill from the far side to model the shadows. */}
        <directionalLight intensity={0.4} position={[-4, 5, -3]} />

        {/* Wooden table: a large box whose top sits flush at y = 0. */}
        <mesh position={[0, -0.3, 0]} receiveShadow>
          <boxGeometry args={[12, 0.6, 8]} />
          <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
        </mesh>

        {/* Dark border frame: a slightly larger dark plane peeking out under
            the parchment as a thin border. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
          <planeGeometry args={[10.4, 6.4]} />
          <meshStandardMaterial color="#241a10" roughness={0.85} />
        </mesh>

        {/* Parchment map plane (10 x 6) slightly above the table + frame. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
          <planeGeometry args={[10, 6]} />
          <meshStandardMaterial color={PALETTE.parchment} roughness={0.8} />
        </mesh>
      </Canvas>
      {/* DOM overlay: badges etc. render on top of the canvas. The overlay itself
          is pass-through; its own children opt back into pointer events. */}
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}
