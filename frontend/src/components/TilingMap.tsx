"use client";

import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { ParcelData, TileAdjacencyData, WorldFoldState } from "@/lib/worldState";

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

function TileMesh({
  parcel,
  isOwned,
  foldState,
  onClick,
}: {
  parcel: ParcelData;
  isOwned: boolean;
  foldState: WorldFoldState;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const position = useMemo(() => {
    const angle = (parcel.sectorId / 8) * Math.PI * 2 + (parcel.tileId * 0.1);
    const radius = parcel.zone === 0 ? 2 : parcel.zone === 1 ? 5 : 8;
    const jitter = (parcel.tileId % 7) * 0.3;
    return new THREE.Vector3(
      (radius + jitter) * Math.cos(angle),
      0,
      (radius + jitter) * Math.sin(angle),
    );
  }, [parcel]);

  const foldedPosition = useMemo(() => {
    if (!foldState.isWorldFolded) return position;
    const bendAmount = Math.abs(position.x) * 0.15;
    return new THREE.Vector3(position.x, bendAmount, position.z);
  }, [position, foldState.isWorldFolded]);

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

  const geometry = useMemo(() => {
    if (parcel.tileShape === 0) {
      return new THREE.BoxGeometry(0.9, 0.1, 0.9);
    }
    // Rhombus: 45° rotated quad
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.lineTo(0.35, 0);
    shape.lineTo(0, 0.5);
    shape.lineTo(-0.35, 0);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  }, [parcel.tileShape]);

  return (
    <mesh
      ref={meshRef}
      position={foldedPosition}
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

export function TilingMap({ parcels, adjacency: _adjacency, foldState, playerAddress, onTileClick }: TilingMapProps) {
  const addr = playerAddress?.toLowerCase();

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

      {parcels.map((parcel) => (
        <TileMesh
          key={parcel.tileId}
          parcel={parcel}
          isOwned={addr ? parcel.owner.toLowerCase() === addr : false}
          foldState={foldState}
          onClick={() => onTileClick?.(parcel.tileId)}
        />
      ))}

      <OrbitControls
        maxPolarAngle={Math.PI / 2.5}
        minDistance={5}
        maxDistance={30}
      />
    </Canvas>
  );
}
