"use client";

import { Canvas } from "@react-three/fiber";
import type { NodeOwner, RoundResult1v1 } from "@/lib/gameState1v1";
import type { RoundOutcome } from "@/lib/resolution1v1";
import { PALETTE, citadelPosition, gatePosition, nodePosition } from "./layout";
import { CitadelPiece, GatePiece, NodeMarker } from "./pieces";
import { TroopFormations } from "./TroopFormations";
import Ambient from "./Ambient";

const GATES: Array<0 | 1 | 2> = [0, 1, 2];

// Remap a node owner into the viewer's perspective so teamA always reads as the
// player (gold) and teamB as the enemy (crimson), whichever slot the viewer is.
function perspectiveOwner(owner: NodeOwner, isPlayerA: boolean): NodeOwner {
  if (owner === "neutral") return "neutral";
  const playerTeam: NodeOwner = isPlayerA ? "teamA" : "teamB";
  return owner === playerTeam ? "teamA" : "teamB";
}

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
export default function Battlefield3D({
  children,
  allocations,
  isPlayerA,
  committed,
  opponentCommitted,
  opponentAllocations,
  modifiers,
  nodes,
  vaultAHp,
  vaultBHp,
}: Battlefield3DProps) {
  // The viewer always fights from the +Z (player) side, so map the raw A/B
  // vault HP onto player/enemy citadels by which slot the viewer holds.
  const playerHp = isPlayerA ? vaultAHp : vaultBHp;
  const enemyHp = isPlayerA ? vaultBHp : vaultAHp;

  // Enemy cloak state: reveal true formations once opponentAllocations arrive;
  // otherwise show 3 shrouded ghost pawns while they're committed-but-secret;
  // render nothing before they commit.
  const enemyRevealed = opponentAllocations != null;
  const enemyCloaked = !enemyRevealed && opponentCommitted;

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
        {/* Warm key light (candle) + dust, holo shimmer, vault smoke, banners.
            The flickering candle point-light lives inside Ambient. */}
        <Ambient playerHp={playerHp} enemyHp={enemyHp} />
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

        {/* Citadels: viewer's keep on +Z, enemy on −Z. */}
        <CitadelPiece side="player" hp={playerHp} position={citadelPosition("player")} />
        <CitadelPiece side="enemy" hp={enemyHp} position={citadelPosition("enemy")} />

        {/* Gates left→right (data order 0/2/1) with their round modifiers. */}
        {GATES.map((g) => (
          <GatePiece key={g} gate={g} modifier={modifiers[g]} scorch={0} position={gatePosition(g)} />
        ))}

        {/* Node markers behind each gate; owner in viewer perspective, trap flag
            from the viewer's own allocation (slots 10–12). */}
        {GATES.map((g) => (
          <NodeMarker
            key={g}
            node={g}
            owner={perspectiveOwner(nodes[g], isPlayerA)}
            trapped={allocations[10 + g] === 1}
            position={nodePosition(g)}
          />
        ))}

        {/* Troop formations bound to allocations. Player pieces come straight
            from the viewer's allocation; enemy pieces are cloaked or revealed
            per the fog-of-war rules above. */}
        <TroopFormations side="player" allocations={allocations} committed={committed} cloaked={false} />
        <TroopFormations
          side="enemy"
          allocations={enemyRevealed ? opponentAllocations : null}
          committed={opponentCommitted}
          cloaked={enemyCloaked}
        />
      </Canvas>
      {/* DOM overlay: badges etc. render on top of the canvas. The overlay itself
          is pass-through; its own children opt back into pointer events. */}
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}
