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
import { PALETTE } from "./layout";
import { getSharedTextures, getPlainParchment, getHoloTexture } from "./textures";
import { VARIANT_TOKENS, type BattlefieldVariant } from "./variants";
import { useBattlefieldVariant } from "@/lib/useBattlefieldVariant";
import { CitadelPiece, GatePiece, NodeMarker } from "./pieces";
import { TroopFormations } from "./TroopFormations";
import Ambient from "./Ambient";
import ResolutionPlayer from "./ResolutionPlayer";

const GATES: Array<0 | 1 | 2> = [0, 1, 2];

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
 * clear the bloom threshold; the tone-mapped scene itself stays under it. */
function PostFX({ variant }: { variant: BattlefieldVariant }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const [strength, radius, threshold] = VARIANT_TOKENS[variant].bloom;
  const exposure = VARIANT_TOKENS[variant].exposure;

  // Variant switches are rare user actions — rebuilding the composer keeps the
  // bloom pass immutable from React's point of view.
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), strength, radius, threshold));
    c.addPass(new OutputPass());
    return c;
    // Size changes are handled by the effect below — don't rebuild the composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, strength, radius, threshold]);

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size.width, size.height]);

  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  useEffect(() => () => composer.dispose(), [composer]);

  // Positive priority takes over r3f's render loop: the composer draws instead.
  useFrame(() => composer.render(), 1);
  return null;
}

// Scrolling scanline shader for the holo overlay (variant 1b).
const SCAN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SCAN_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float scan = sin(vUv.y * 90.0 - uTime * 2.0) * 0.5 + 0.5;
    float a = 0.05 * (0.35 + 0.65 * scan);
    gl_FragColor = vec4(uColor, a);
  }
`;

/** Holo-only: additive teal map-grid plane + a scrolling scanline sheet. */
function HoloOverlay() {
  const holoMat = useRef<THREE.MeshBasicMaterial>(null);
  const scanMat = useRef<THREE.ShaderMaterial>(null);
  const holoTex = getHoloTexture();
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color(PALETTE.holo) } }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (holoMat.current) holoMat.current.opacity = 0.6 + 0.16 * Math.sin(t * 1.6);
    if (scanMat.current) scanMat.current.uniforms.uTime.value = t;
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[10, 6]} />
        <meshBasicMaterial
          ref={holoMat}
          map={holoTex}
          color={PALETTE.holo}
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[10, 6]} />
        <shaderMaterial
          ref={scanMat}
          uniforms={uniforms}
          vertexShader={SCAN_VERT}
          fragmentShader={SCAN_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

/** Wooden table, dark border frame, and the parchment map (inked in warm;
 * plain + holo grid overlay in holo). */
function TableSurface({ variant }: { variant: BattlefieldVariant }) {
  const { wood } = getSharedTextures();
  const tokens = VARIANT_TOKENS[variant];
  const parchment = tokens.parchmentInk ? getSharedTextures().parchment : getPlainParchment();
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

      {/* Parchment map plane (10 x 6). Warm: inked cartography in the texture.
          Holo: plain tinted paper — the glowing grid overlay carries the map. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]} receiveShadow>
        <planeGeometry args={[10, 6]} />
        <meshStandardMaterial
          map={parchment.map}
          bumpMap={parchment.bump}
          bumpScale={0.25}
          color={tokens.parchmentTint}
          roughness={0.92}
          metalness={0}
        />
      </mesh>

      {variant === "holo" ? <HoloOverlay /> : null}
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

  // Player-chosen art direction (persisted): warm Candlelit Keep (default) or
  // the Arcane Holo Table. Same geometry — palette, lighting, and overlays swap.
  const [variant, setVariant] = useBattlefieldVariant();
  const tokens = VARIANT_TOKENS[variant];

  // Enemy cloak state: reveal true formations once opponentAllocations arrive;
  // otherwise show 3 shrouded ghost pawns while they're committed-but-secret;
  // render nothing before they commit.
  const enemyRevealed = opponentAllocations != null;
  const enemyCloaked = !enemyRevealed && opponentCommitted;

  return (
    <div
      className="relative h-full min-h-[320px] w-full overflow-hidden rounded-lg"
      style={{ backgroundColor: tokens.fogColor }}
    >
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
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            if (recoveryCount.current >= 4) return;
            recoveryCount.current += 1;
            setTimeout(() => setCanvasEpoch((n) => n + 1), 250);
          });
        }}
      >
        {/* Atmosphere: fog swallowing the table edges, matching background,
            and a hemisphere base so nothing reads pure black. */}
        <color attach="background" args={[tokens.fogColor]} />
        <fogExp2 attach="fog" args={[tokens.fogColor, tokens.fogDensity]} />
        <hemisphereLight args={[tokens.hemiSky, tokens.hemiGround, tokens.hemiIntensity]} />
        <RoomEnv intensity={tokens.envIntensity} />

        {/* Candle key light + glow/godray, dust, embers, vault smoke, banners
            all live inside Ambient. Embers also rise from modifier gates. */}
        <Ambient playerHp={playerHp} enemyHp={enemyHp} modifiers={modifiers} variant={variant} />
        {/* Cool directional fill from the far side to model the shadows. */}
        <directionalLight color={tokens.fillColor} intensity={tokens.fillIntensity} position={[-4, 5, -3]} />
        {/* Rim from behind the enemy keep so silhouettes catch an edge. */}
        <directionalLight color={tokens.rimColor} intensity={tokens.rimIntensity} position={[0, 4, -5.5]} />

        <TableSurface variant={variant} />

        {/* Citadels: viewer's keep on +Z, enemy on −Z. Damage tiers follow the
            ticking display HP via the shared refs during playback. */}
        <CitadelPiece
          side="player"
          hp={playerHp}
          hpRef={playerHpRef}
          wear={aftermath.myVaultWear}
          position={citadelPosition("player")}
          variant={variant}
        />
        <CitadelPiece
          side="enemy"
          hp={enemyHp}
          hpRef={enemyHpRef}
          wear={aftermath.enemyVaultWear}
          position={citadelPosition("enemy")}
          variant={variant}
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
        <PostFX variant={variant} />
      </Canvas>
      {/* DOM overlay: badges etc. render on top of the canvas. The overlay itself
          is pass-through; its own children opt back into pointer events. */}
      <div className="pointer-events-none absolute inset-0">{children}</div>

      {/* Art-direction toggle: warm Candlelit Keep ↔ Arcane Holo Table. */}
      <div className="pointer-events-auto absolute top-2 right-2 flex gap-0.5 rounded border border-white/10 bg-black/50 p-0.5 font-mono text-[10px] uppercase tracking-widest backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setVariant("warm")}
          aria-pressed={variant === "warm"}
          className={
            variant === "warm"
              ? "rounded-sm bg-[#c8a44e] px-2 py-1 text-[#140d07]"
              : "rounded-sm px-2 py-1 text-[#9a8a62] hover:text-[#e6c268]"
          }
        >
          Candlelit
        </button>
        <button
          type="button"
          onClick={() => setVariant("holo")}
          aria-pressed={variant === "holo"}
          className={
            variant === "holo"
              ? "rounded-sm bg-[#59d8e6] px-2 py-1 text-[#04100f]"
              : "rounded-sm px-2 py-1 text-[#5f8a90] hover:text-[#8fe0ea]"
          }
        >
          Holo
        </button>
      </div>
    </div>
  );
}
