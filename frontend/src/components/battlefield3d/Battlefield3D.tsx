"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { NodeOwner, RoundResult1v1 } from "@/lib/gameState1v1";
import type { RoundOutcome } from "@/lib/resolution1v1";
import { deriveAftermath } from "./aftermath";
import { citadelPosition, gatePosition, nodePosition } from "./layout";
import { getSharedTextures } from "./textures";
import { CitadelPiece, GatePiece, NodeMarker } from "./pieces";
import { TroopFormations } from "./TroopFormations";
import Ambient from "./Ambient";
import ResolutionPlayer from "./ResolutionPlayer";

const GATES: Array<0 | 1 | 2> = [0, 1, 2];

// Candlelit-keep atmosphere (design 1a): scene background matches the fog so
// the table dissolves into darkness at the edges.
const FOG_COLOR = "#140d07";
const FOG_DENSITY = 0.052;

/** RoomEnvironment IBL for specular response — procedural, no HDR fetch. */
function RoomEnv({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // The three.js scene graph is imperative by design; this effect is the
    // standard r3f escape hatch for scene-level properties.
    // eslint-disable-next-line react-hooks/immutability
    scene.environment = envTex;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      envTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

/** RenderPass → UnrealBloomPass → OutputPass. Emissives marked toneMapped:false
 * clear the 0.84 threshold and bloom; the candlelit scene itself stays under it. */
function PostFX() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.7, 0.5, 0.84));
    c.addPass(new OutputPass());
    return c;
    // Size changes are handled by the effect below — don't rebuild the composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size.width, size.height]);

  useEffect(() => () => composer.dispose(), [composer]);

  // Positive priority takes over r3f's render loop: the composer draws instead.
  useFrame(() => composer.render(), 1);
  return null;
}

/** Wooden table, dark border frame, and the inked parchment map. */
function TableSurface() {
  const { wood, parchment } = getSharedTextures();
  return (
    <>
      {/* Wooden table: a large box whose top sits flush at y = 0. */}
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <boxGeometry args={[12, 0.6, 8]} />
        <meshStandardMaterial
          map={wood.map}
          bumpMap={wood.bump}
          bumpScale={0.5}
          roughness={0.92}
          metalness={0}
        />
      </mesh>

      {/* Dark border frame peeking out under the parchment. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
        <planeGeometry args={[10.4, 6.4]} />
        <meshStandardMaterial color="#241a10" roughness={0.85} />
      </mesh>

      {/* Inked parchment map plane (10 x 6): terrain, supply routes, glyph
          rings, compass rose — all painted into the canvas texture. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]} receiveShadow>
        <planeGeometry args={[10, 6]} />
        <meshStandardMaterial
          map={parchment.map}
          bumpMap={parchment.bump}
          bumpScale={0.25}
          roughness={0.92}
          metalness={0}
        />
      </mesh>
    </>
  );
}

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
  history,
  outcome,
  onResolutionComplete,
}: Battlefield3DProps) {
  // The viewer always fights from the +Z (player) side, so map the raw A/B
  // vault HP onto player/enemy citadels by which slot the viewer holds.
  const playerHp = isPlayerA ? vaultAHp : vaultBHp;
  const enemyHp = isPlayerA ? vaultBHp : vaultAHp;

  // Persistent aftermath derived from the durable round history: cumulative gate
  // scorch and vault wear that survive reloads (unlike the transient HP tiers).
  // Perspective-adjusted so "my" wear always maps to the viewer's citadel.
  const aftermath = useMemo(() => deriveAftermath(history, isPlayerA), [history, isPlayerA]);

  // Shared mutable display refs — the cross-component signal bus for playback.
  // ResolutionPlayer writes them every frame; CitadelPiece reads the HP refs to
  // retier mid-playback, and TroopFormations reads the lunge refs to shift its
  // attack groups toward the gate during clashes. No setState, no re-renders.
  const playerHpRef = useRef(playerHp);
  const enemyHpRef = useRef(enemyHp);
  const playerLungeRef = useRef<[number, number, number]>([0, 0, 0]);
  const enemyLungeRef = useRef<[number, number, number]>([0, 0, 0]);

  // Fresh-canvas epoch for WebGL context-loss recovery (see Canvas key below).
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const recoveryCount = useRef(0);

  // Enemy cloak state: reveal true formations once opponentAllocations arrive;
  // otherwise show 3 shrouded ghost pawns while they're committed-but-secret;
  // render nothing before they commit.
  const enemyRevealed = opponentAllocations != null;
  const enemyCloaked = !enemyRevealed && opponentCommitted;

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-lg bg-[#140d07]">
      <Canvas
        // Context-loss recovery: React can unmount+remount the Canvas while
        // reusing the same <canvas> element (StrictMode / Suspense effect
        // replay). The stale root's cleanup then calls forceContextLoss() on
        // the context the live root is using, permanently blacking it out —
        // and a genuinely evicted GPU context in a long session looks the
        // same. Keying the Canvas by an epoch makes recovery total: on loss
        // we mount a FRESH canvas element with a fresh context. Retries are
        // capped to avoid a remount loop on hardware that keeps evicting.
        key={canvasEpoch}
        // "percentage" = PCFShadowMap. The boolean default selects
        // PCFSoftShadowMap, which three r185 deprecated (it aliases to PCF
        // anyway) and logs a console warning on every renderer init.
        shadows="percentage"
        dpr={[1, 2]}
        className="absolute inset-0"
        camera={{ fov: 45, position: [0, 6.9, 5.85] }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, 0, -0.15);
          gl.toneMappingExposure = 1.02;
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            if (recoveryCount.current >= 4) return;
            recoveryCount.current += 1;
            setTimeout(() => setCanvasEpoch((n) => n + 1), 250);
          });
        }}
      >
        {/* Candlelit atmosphere: warm fog swallowing the table edges, matching
            background, and a hemisphere base so nothing reads pure black. */}
        <color attach="background" args={[FOG_COLOR]} />
        <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
        <hemisphereLight args={["#4a3820", "#140d06", 0.55]} />
        <RoomEnv intensity={0.35} />

        {/* Candle key light + glow/godray, dust, embers, vault smoke, banners
            all live inside Ambient. Embers also rise from modifier gates. */}
        <Ambient playerHp={playerHp} enemyHp={enemyHp} modifiers={modifiers} />
        {/* Cool directional fill from the far side to model the shadows. */}
        <directionalLight color="#6b8cae" intensity={0.38} position={[-4, 5, -3]} />
        {/* Warm rim from behind the enemy keep so silhouettes catch an edge. */}
        <directionalLight color="#ffab55" intensity={0.5} position={[0, 4, -5.5]} />

        <TableSurface />

        {/* Citadels: viewer's keep on +Z, enemy on −Z. Damage tiers follow the
            ticking display HP via the shared refs during playback. */}
        <CitadelPiece
          side="player"
          hp={playerHp}
          hpRef={playerHpRef}
          wear={aftermath.myVaultWear}
          position={citadelPosition("player")}
        />
        <CitadelPiece
          side="enemy"
          hp={enemyHp}
          hpRef={enemyHpRef}
          wear={aftermath.enemyVaultWear}
          position={citadelPosition("enemy")}
        />

        {/* Gates left→right (data order 0/2/1) with their round modifiers. */}
        {GATES.map((g) => (
          <GatePiece
            key={g}
            gate={g}
            modifier={modifiers[g]}
            scorch={aftermath.gateScorch[g]}
            position={gatePosition(g)}
          />
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
        <TroopFormations
          side="player"
          allocations={allocations}
          committed={committed}
          cloaked={false}
          lungeRef={playerLungeRef}
        />
        <TroopFormations
          side="enemy"
          allocations={enemyRevealed ? opponentAllocations : null}
          committed={opponentCommitted}
          cloaked={enemyCloaked}
          lungeRef={enemyLungeRef}
        />

        {/* Resolution playback: plays the round's choreography timeline on the
            frame clock (clash flashes, sparks, repair glows, ember streaks, trap
            rings), ticks the citadel HP counters to the outcome's final HP, and
            drives the shared HP / lunge refs wired above. */}
        <ResolutionPlayer
          outcome={outcome}
          isPlayerA={isPlayerA}
          vaultAHp={vaultAHp}
          vaultBHp={vaultBHp}
          playerHpRef={playerHpRef}
          enemyHpRef={enemyHpRef}
          playerLungeRef={playerLungeRef}
          enemyLungeRef={enemyLungeRef}
          onResolutionComplete={onResolutionComplete}
        />

        {/* Bloom over the whole scene — replaces r3f's default render. */}
        <PostFX />
      </Canvas>
      {/* DOM overlay: badges etc. render on top of the canvas. The overlay itself
          is pass-through; its own children opt back into pointer events. */}
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}
