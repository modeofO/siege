"use client";

import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { ParcelData, TileAdjacencyData, WorldFoldState } from "@/lib/worldState";
import tileGeometry from "@/lib/tileGeometry.json";

const SCALE = 1 / 25;

const TYPE_COLORS: Record<number, string> = {
  0: "#c84a32", // Forge — warm red
  1: "#5a8a5a", // Quarry — green
  2: "#4a6fa5", // Grove — blue
  255: "#2a2a3a", // Untyped
};

interface TilingMapProps {
  parcels: ParcelData[];
  adjacency: TileAdjacencyData[];
  foldState: WorldFoldState;
  playerAddress: string | null;
  onTileClick?: (tileId: number) => void;
}

type TileGeo = (typeof tileGeometry)[number];

function TileMesh({
  parcel,
  geo,
  isOwned,
  foldState,
  onClick,
}: {
  parcel: ParcelData;
  geo: TileGeo;
  isOwned: boolean;
  foldState: WorldFoldState;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const geometry = useMemo(() => {
    const verts = geo.vertices;
    const cx = geo.center[0];
    const cy = geo.center[1];

    const shape = new THREE.Shape();
    shape.moveTo((verts[0][0] - cx) * SCALE, (verts[0][1] - cy) * SCALE);
    for (let i = 1; i < verts.length; i++) {
      shape.lineTo((verts[i][0] - cx) * SCALE, (verts[i][1] - cy) * SCALE);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  }, [geo]);

  const position = useMemo(() => {
    const x = geo.center[0] * SCALE;
    const z = geo.center[1] * SCALE;
    if (!foldState.isWorldFolded) return new THREE.Vector3(x, 0, z);
    const bendAmount = Math.abs(x) * 0.15;
    return new THREE.Vector3(x, bendAmount, z);
  }, [geo, foldState.isWorldFolded]);

  const color = useMemo(() => {
    if (parcel.isStranded) return "#666";
    if (isOwned) return "#e8a43a";
    return TYPE_COLORS[parcel.parcelType] ?? TYPE_COLORS[255];
  }, [parcel, isOwned]);

  useFrame(() => {
    if (meshRef.current && parcel.isStranded) {
      (meshRef.current.material as THREE.MeshStandardMaterial).opacity =
        0.5 + Math.sin(Date.now() * 0.003) * 0.2;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geometry}
      onClick={onClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <meshStandardMaterial
        color={hovered ? "#fff" : color}
        emissive={isOwned ? "#e8a43a" : "#000"}
        emissiveIntensity={isOwned ? 0.3 : 0}
        transparent={parcel.isStranded}
        opacity={parcel.isStranded ? 0.5 : 1}
      />
    </mesh>
  );
}

function AdjacencyLines({
  adjacency,
}: {
  adjacency: TileAdjacencyData[];
}) {
  const geoMap = useMemo(() => {
    const m = new Map<number, TileGeo>();
    for (const g of tileGeometry) m.set(g.id, g);
    return m;
  }, []);

  const lineGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const seen = new Set<string>();

    for (const adj of adjacency) {
      const key =
        adj.tileId < adj.neighborTileId
          ? `${adj.tileId}-${adj.neighborTileId}`
          : `${adj.neighborTileId}-${adj.tileId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const g1 = geoMap.get(adj.tileId);
      const g2 = geoMap.get(adj.neighborTileId);
      if (!g1 || !g2) continue;

      points.push(
        new THREE.Vector3(g1.center[0] * SCALE, 0.01, g1.center[1] * SCALE),
        new THREE.Vector3(g2.center[0] * SCALE, 0.01, g2.center[1] * SCALE),
      );
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [adjacency, geoMap]);

  return (
    <lineSegments geometry={lineGeometry}>
      <lineBasicMaterial color="#555" transparent opacity={0.3} />
    </lineSegments>
  );
}

export function TilingMap({
  parcels,
  adjacency,
  foldState,
  playerAddress,
  onTileClick,
}: TilingMapProps) {
  const addr = playerAddress?.toLowerCase();

  const geoMap = useMemo(() => {
    const m = new Map<number, TileGeo>();
    for (const g of tileGeometry) m.set(g.id, g);
    return m;
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 15, 10], fov: 50 }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={foldState.isWorldFolded ? 0.8 : 0.4} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={foldState.isWorldFolded ? 1.5 : 1}
        color={foldState.isWorldFolded ? "#ffaa44" : "#ffffff"}
      />

      <AdjacencyLines adjacency={adjacency} />

      {parcels.map((parcel) => {
        const geo = geoMap.get(parcel.tileId);
        if (!geo) return null;
        return (
          <TileMesh
            key={parcel.tileId}
            parcel={parcel}
            geo={geo}
            isOwned={addr ? parcel.owner.toLowerCase() === addr : false}
            foldState={foldState}
            onClick={() => onTileClick?.(parcel.tileId)}
          />
        );
      })}

      <OrbitControls
        maxPolarAngle={Math.PI / 2.5}
        minDistance={5}
        maxDistance={30}
      />
    </Canvas>
  );
}
