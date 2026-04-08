# World Map UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/world` page with an SVG hex grid showing all parcels, colored by type and ownership, with a registration flow for new players.

**Architecture:** New page at `/world` with three components: `HexGrid` (SVG hex map), `RegisterKingdom` (registration modal), and a kingdom summary panel. Data fetched from Torii via new hooks in `worldState.ts`. Navbar updated with a WORLD link.

**Tech Stack:** React 19, Next.js 16, SVG, Tailwind 4, Torii GraphQL

---

### Task 1: Data Hooks — worldState.ts

Create hooks to fetch parcel data and player kingdom state from Torii.

**Files:**
- Create: `frontend/src/lib/worldState.ts`

- [ ] **Step 1: Create worldState.ts with both hooks**

```typescript
// frontend/src/lib/worldState.ts
"use client";

import { useEffect, useState } from "react";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
const POLL_INTERVAL = 4000;

type GraphEdges<T> = { edges: Array<{ node: T }> };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

async function toriiQuery<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(`${TORII_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

// --- Parcel data ---

export interface ParcelData {
  parcelId: number;
  col: number;
  row: number;
  parcelType: number; // 0=Forge, 1=Quarry, 2=Grove
  owner: string;      // hex address, "0x0" = unclaimed
  isHome: boolean;
}

export function useWorldParcels(refreshKey?: number) {
  const [parcels, setParcels] = useState<ParcelData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoParcelModels: GraphEdges<{
          parcel_id: string;
          col: string;
          row: string;
          parcel_type: string;
          owner: string;
          is_home: boolean;
        }>;
      }>(`
        query {
          siegeDojoParcelModels(first: 500) {
            edges { node {
              parcel_id col row parcel_type owner is_home
            } }
          }
        }
      `);

      const edges = data?.siegeDojoParcelModels?.edges;
      if (edges) {
        setParcels(
          edges.map((e) => ({
            parcelId: toNum(e.node.parcel_id),
            col: toNum(e.node.col),
            row: toNum(e.node.row),
            parcelType: toNum(e.node.parcel_type),
            owner: e.node.owner || "0x0",
            isHome: !!e.node.is_home,
          })),
        );
      }
      setLoading(false);
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [refreshKey]);

  return { parcels, loading };
}

// --- Player kingdom ---

export interface PlayerKingdomData {
  registered: boolean;
  home0: number;
  home1: number;
  home2: number;
  parcelCount: number;
  freeCraftUsed: boolean;
}

export function usePlayerKingdom(playerAddress: string | null, refreshKey?: number) {
  const [kingdom, setKingdom] = useState<PlayerKingdomData>({
    registered: false,
    home0: 0, home1: 0, home2: 0,
    parcelCount: 0,
    freeCraftUsed: false,
  });

  useEffect(() => {
    if (!playerAddress) return;

    const fetch = async () => {
      const data = await toriiQuery<{
        siegeDojoPlayerKingdomModels: GraphEdges<{
          registered: boolean;
          home_0: string;
          home_1: string;
          home_2: string;
          parcel_count: string;
          free_craft_used: boolean;
        }>;
      }>(`
        query {
          siegeDojoPlayerKingdomModels(where: { player: "${playerAddress}" }) {
            edges { node {
              registered home_0 home_1 home_2 parcel_count free_craft_used
            } }
          }
        }
      `);

      const node = data?.siegeDojoPlayerKingdomModels?.edges?.[0]?.node;
      if (node) {
        setKingdom({
          registered: !!node.registered,
          home0: toNum(node.home_0),
          home1: toNum(node.home_1),
          home2: toNum(node.home_2),
          parcelCount: toNum(node.parcel_count),
          freeCraftUsed: !!node.free_craft_used,
        });
      }
    };

    const t = setTimeout(() => { void fetch(); }, 0);
    const i = setInterval(() => { void fetch(); }, POLL_INTERVAL);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [playerAddress, refreshKey]);

  return kingdom;
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/modeofo/Apps/siege && git add frontend/src/lib/worldState.ts
git commit -m "feat: add world state hooks (useWorldParcels, usePlayerKingdom)"
```

---

### Task 2: HexGrid Component

SVG hex grid that renders all parcels as flat-top hexagon polygons.

**Files:**
- Create: `frontend/src/components/HexGrid.tsx`

- [ ] **Step 1: Create HexGrid component**

```typescript
// frontend/src/components/HexGrid.tsx
"use client";

import { useState } from "react";
import type { ParcelData } from "@/lib/worldState";

interface HexGridProps {
  parcels: ParcelData[];
  playerAddress: string | null;
  homeParcelIds: number[]; // [home0, home1, home2]
}

const PARCEL_TYPE_COLORS: Record<number, string> = {
  0: "#b87333", // Forge — copper
  1: "#8a8a9a", // Quarry — grey
  2: "#4a7c59", // Grove — green
};

const PARCEL_TYPE_NAMES: Record<number, string> = {
  0: "Forge",
  1: "Quarry",
  2: "Grove",
};

const HEX_SIZE = 36; // radius in pixels

// Flat-top hex: width = sqrt(3) * size, height = 2 * size
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

// Even-row offset to pixel position (flat-top hex)
function hexToPixel(col: number, row: number): { x: number; y: number } {
  const x = col * HEX_WIDTH + (row % 2 === 1 ? HEX_WIDTH / 2 : 0);
  const y = row * (HEX_HEIGHT * 0.75);
  return { x, y };
}

// Flat-top hexagon points
function hexPoints(cx: number, cy: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const px = cx + HEX_SIZE * Math.cos(angle);
    const py = cy + HEX_SIZE * Math.sin(angle);
    points.push(`${px},${py}`);
  }
  return points.join(" ");
}

function truncateAddress(addr: string): string {
  if (!addr || addr === "0x0" || addr.length < 10) return "Unclaimed";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function HexGrid({ parcels, playerAddress, homeParcelIds }: HexGridProps) {
  const [hoveredParcel, setHoveredParcel] = useState<ParcelData | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelData | null>(null);

  if (parcels.length === 0) return null;

  // Calculate bounds for SVG viewBox
  const positions = parcels.map((p) => hexToPixel(p.col, p.row));
  const padding = HEX_SIZE * 2;
  const minX = Math.min(...positions.map((p) => p.x)) - padding;
  const minY = Math.min(...positions.map((p) => p.y)) - padding;
  const maxX = Math.max(...positions.map((p) => p.x)) + padding;
  const maxY = Math.max(...positions.map((p) => p.y)) + padding;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  const isOwned = (parcel: ParcelData) =>
    playerAddress && parcel.owner.toLowerCase() === playerAddress.toLowerCase();

  const isUnclaimed = (parcel: ParcelData) =>
    parcel.owner === "0x0" || parcel.owner === "0x0000000000000000000000000000000000000000000000000000000000000000";

  const isHome = (parcel: ParcelData) => homeParcelIds.includes(parcel.parcelId);

  const getStroke = (parcel: ParcelData) => {
    if (selectedParcel?.parcelId === parcel.parcelId) return "#ffffff";
    if (isOwned(parcel)) return "#daa520";
    if (!isUnclaimed(parcel)) return "#c44332";
    return "#3d3428";
  };

  const getStrokeWidth = (parcel: ParcelData) => {
    if (selectedParcel?.parcelId === parcel.parcelId) return 3;
    if (isOwned(parcel)) return 2.5;
    if (!isUnclaimed(parcel)) return 2;
    return 1;
  };

  const getFillOpacity = (parcel: ParcelData) => {
    if (isUnclaimed(parcel)) return 0.3;
    if (isOwned(parcel)) return 0.7;
    return 0.5;
  };

  return (
    <div className="relative">
      <svg
        viewBox={viewBox}
        className="w-full max-h-[60vh]"
        style={{ background: "transparent" }}
      >
        {/* Glow filter for owned parcels */}
        <defs>
          <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#daa520" floodOpacity="0.4" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {parcels.map((parcel) => {
          const { x, y } = hexToPixel(parcel.col, parcel.row);
          const owned = isOwned(parcel);
          const home = isHome(parcel);

          return (
            <g
              key={parcel.parcelId}
              onMouseEnter={() => setHoveredParcel(parcel)}
              onMouseLeave={() => setHoveredParcel(null)}
              onClick={() => setSelectedParcel(
                selectedParcel?.parcelId === parcel.parcelId ? null : parcel,
              )}
              className="cursor-pointer"
              filter={owned ? "url(#glow-gold)" : undefined}
            >
              <polygon
                points={hexPoints(x, y)}
                fill={PARCEL_TYPE_COLORS[parcel.parcelType] || "#555"}
                fillOpacity={getFillOpacity(parcel)}
                stroke={getStroke(parcel)}
                strokeWidth={getStrokeWidth(parcel)}
              />
              {/* Home parcel marker */}
              {home && (
                <text
                  x={x}
                  y={y + 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="14"
                  fill="#daa520"
                >
                  ⛊
                </text>
              )}
              {/* Parcel type label */}
              {!home && (
                <text
                  x={x}
                  y={y + 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="8"
                  fill="#d4cfc6"
                  fillOpacity={0.6}
                >
                  {PARCEL_TYPE_NAMES[parcel.parcelType]?.[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredParcel && (
        <div className="absolute top-2 right-2 bg-[#1a1714] border border-[#3d3428] rounded-lg p-3 text-xs space-y-1 pointer-events-none z-10">
          <div className="font-bold font-serif text-[#d4cfc6]">
            {PARCEL_TYPE_NAMES[hoveredParcel.parcelType] || "Unknown"}
          </div>
          <div className="text-[#7a7060]">
            ({hoveredParcel.col}, {hoveredParcel.row})
          </div>
          <div className={isUnclaimed(hoveredParcel) ? "text-[#7a7060]" : isOwned(hoveredParcel) ? "text-[#daa520]" : "text-[#c44332]"}>
            {isOwned(hoveredParcel) ? "Your parcel" : truncateAddress(hoveredParcel.owner)}
          </div>
          {isHome(hoveredParcel) && (
            <div className="text-[#daa520] text-[10px]">HOME PARCEL</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/modeofo/Apps/siege && git add frontend/src/components/HexGrid.tsx
git commit -m "feat: add HexGrid SVG component"
```

---

### Task 3: RegisterKingdom Component

Registration modal for new players to claim their 3 home parcels.

**Files:**
- Create: `frontend/src/components/RegisterKingdom.tsx`

- [ ] **Step 1: Create RegisterKingdom component**

```typescript
// frontend/src/components/RegisterKingdom.tsx
"use client";

import { useState } from "react";
import type { AccountInterface } from "starknet";

interface RegisterKingdomProps {
  account: AccountInterface;
  worldSystemAddress: string;
  onRegistered: () => void;
}

const PARCEL_TYPES = [
  { id: 0, name: "Forge", resources: "Iron + Linen", color: "#b87333" },
  { id: 1, name: "Quarry", resources: "Stone + Wood", color: "#8a8a9a" },
  { id: 2, name: "Grove", resources: "Ember + Seeds", color: "#4a7c59" },
];

export function RegisterKingdom({ account, worldSystemAddress, onRegistered }: RegisterKingdomProps) {
  const [selections, setSelections] = useState<number[]>([0, 1, 2]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSelect = (slotIndex: number, typeId: number) => {
    const next = [...selections];
    next[slotIndex] = typeId;
    setSelections(next);
  };

  const handleRegister = async () => {
    setSubmitting(true);
    setError("");
    try {
      await account.execute({
        contractAddress: worldSystemAddress,
        entrypoint: "register_player",
        calldata: [
          selections.length.toString(),
          ...selections.map((s) => s.toString()),
        ],
      });
      onRegistered();
    } catch (e) {
      console.error("Registration failed:", e);
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0d0b0a]/90 flex items-center justify-center z-50">
      <div className="bg-[#1a1714] border border-[#3d3428] rounded-lg p-6 max-w-lg w-full mx-4 space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold font-serif text-[#daa520] tracking-wider">
            CLAIM YOUR KINGDOM
          </h2>
          <p className="text-xs text-[#7a7060] mt-2">
            Choose 3 home parcels. These are permanent and cannot be conquered.
          </p>
        </div>

        <div className="space-y-3">
          {[0, 1, 2].map((slotIndex) => (
            <div key={slotIndex} className="space-y-1">
              <div className="text-[10px] text-[#7a7060] tracking-wider uppercase">
                Home Parcel {slotIndex + 1}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PARCEL_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleSelect(slotIndex, type.id)}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      selections[slotIndex] === type.id
                        ? "border-[#daa520] bg-[#daa520]/10"
                        : "border-[#3d3428] bg-[#252019] hover:border-[#7a7060]"
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full mx-auto mb-1"
                      style={{ backgroundColor: type.color }}
                    />
                    <div className="text-xs font-bold text-[#d4cfc6] font-serif">{type.name}</div>
                    <div className="text-[9px] text-[#7a7060]">{type.resources}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleRegister}
          disabled={submitting}
          className="w-full py-3 rounded font-bold tracking-wider text-sm font-serif transition-all bg-[#daa520]/10 border-2 border-[#daa520] text-[#daa520] hover:bg-[#daa520]/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? "CLAIMING..." : "⛊ ESTABLISH KINGDOM ⛊"}
        </button>

        {error && (
          <div className="text-[#ff3344] text-xs text-center">{error}</div>
        )}
      </div>
    </div>
  );
}
```

Note: The `register_player` calldata format uses Cairo array serialization: first element is the array length, followed by the elements. For 3 home types, it's `["3", type0, type1, type2]`.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/modeofo/Apps/siege && git add frontend/src/components/RegisterKingdom.tsx
git commit -m "feat: add RegisterKingdom component"
```

---

### Task 4: World Page + Navbar Link

Create the `/world` page that assembles everything, and add a WORLD link to the navbar.

**Files:**
- Create: `frontend/src/app/world/page.tsx`
- Modify: `frontend/src/components/Navbar.tsx`

- [ ] **Step 1: Create the world page**

```typescript
// frontend/src/app/world/page.tsx
"use client";

import { useState, useCallback } from "react";
import { useAccount } from "@/app/providers";
import { useWorldParcels, usePlayerKingdom } from "@/lib/worldState";
import { HexGrid } from "@/components/HexGrid";
import { RegisterKingdom } from "@/components/RegisterKingdom";
import { fetchAbilityBalances } from "@/lib/abilityToken";
import { useEffect } from "react";

// World system contract address — will need env var for Sepolia
const WORLD_SYSTEM_ADDRESS =
  process.env.NEXT_PUBLIC_WORLD_SYSTEM_ADDRESS || "0x0";

const PARCEL_TYPE_NAMES: Record<number, string> = {
  0: "Forge",
  1: "Quarry",
  2: "Grove",
};

export default function WorldPage() {
  const { account, address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const { parcels, loading } = useWorldParcels(refreshKey);
  const kingdom = usePlayerKingdom(address || null, refreshKey);
  const [abilities, setAbilities] = useState<Record<string, number>>({});

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Fetch ability balances
  useEffect(() => {
    if (!address) return;
    const fetchAb = async () => {
      try {
        const balances = await fetchAbilityBalances(address);
        setAbilities(balances);
      } catch {
        // Ignore — ability token may not be deployed
      }
    };
    void fetchAb();
    const i = setInterval(fetchAb, 8000);
    return () => clearInterval(i);
  }, [address, refreshKey]);

  // Get home parcel types for display
  const homeParcelTypes = kingdom.registered
    ? [kingdom.home0, kingdom.home1, kingdom.home2]
        .map((id) => parcels.find((p) => p.parcelId === id))
        .filter(Boolean)
    : [];

  if (!account || !address) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#7a7060] tracking-wider">Connect wallet to view the world</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#7a7060] tracking-wider animate-pulse">LOADING WORLD...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      {/* Registration overlay */}
      {!kingdom.registered && parcels.length > 0 && (
        <RegisterKingdom
          account={account}
          worldSystemAddress={WORLD_SYSTEM_ADDRESS}
          onRegistered={refresh}
        />
      )}

      {/* Map header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold font-serif text-[#daa520] tracking-wider">
          THE REALM
        </h1>
        {kingdom.registered && (
          <div className="text-xs text-[#7a7060]">
            {kingdom.parcelCount} parcels owned
          </div>
        )}
      </div>

      {/* Hex grid */}
      <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4">
        {parcels.length === 0 ? (
          <div className="text-center text-[#7a7060] py-12">
            World not initialized. No parcels found.
          </div>
        ) : (
          <HexGrid
            parcels={parcels}
            playerAddress={address}
            homeParcelIds={
              kingdom.registered
                ? [kingdom.home0, kingdom.home1, kingdom.home2]
                : []
            }
          />
        )}
      </div>

      {/* Kingdom summary */}
      {kingdom.registered && (
        <div className="border border-[#3d3428] rounded-lg bg-[#1a1714] p-4 space-y-3">
          <div className="text-xs tracking-wider text-[#7a7060] uppercase font-serif">
            Your Kingdom
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Home parcels */}
            <div className="space-y-1">
              <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Home Parcels</div>
              <div className="flex gap-2">
                {homeParcelTypes.map((p, i) => (
                  <div
                    key={i}
                    className="px-2 py-1 rounded text-[10px] font-bold border border-[#daa520]/30"
                    style={{ color: p ? { 0: "#b87333", 1: "#8a8a9a", 2: "#4a7c59" }[p.parcelType] : "#7a7060" }}
                  >
                    {p ? PARCEL_TYPE_NAMES[p.parcelType] : "?"}
                  </div>
                ))}
              </div>
            </div>

            {/* Abilities */}
            <div className="space-y-1">
              <div className="text-[10px] text-[#7a7060] uppercase tracking-wider">Abilities</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(abilities).map(([name, count]) =>
                  count > 0 ? (
                    <div key={name} className="px-2 py-1 rounded text-[10px] bg-[#252019] text-[#d4cfc6]">
                      {name}: {count}
                    </div>
                  ) : null,
                )}
                {Object.values(abilities).every((c) => c === 0) && (
                  <div className="text-[10px] text-[#7a7060]">None</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add WORLD link to Navbar**

In `frontend/src/components/Navbar.tsx`, add a new Link after the FORGE link:

```tsx
          <Link href="/world" className="text-xs text-[#7a7060] hover:text-[#c8a44e] transition-colors tracking-wider">
            WORLD
          </Link>
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/modeofo/Apps/siege && git add frontend/src/app/world/page.tsx frontend/src/components/Navbar.tsx
git commit -m "feat: add /world page with hex map, registration, and kingdom summary"
```
