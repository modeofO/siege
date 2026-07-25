"use client";

import { useEffect, useState } from "react";
import { RpcProvider } from "starknet";
import { fetchAbilityMetadata, type AbilityMetadata } from "@/lib/abilityToken";
// RPC follows the active network (see lib/network) — a local copy here would
// keep using the build's endpoint after a switch, and had no katana branch.
import { RPC_URL } from "@/lib/network";


let sharedProvider: RpcProvider | null = null;
function getProvider(): RpcProvider {
  if (!sharedProvider) sharedProvider = new RpcProvider({ nodeUrl: RPC_URL });
  return sharedProvider;
}

interface AbilityIconProps {
  tokenId: number;
  count: number;
  size?: number;
}

export function AbilityIcon({ tokenId, count, size = 40 }: AbilityIconProps) {
  const [meta, setMeta] = useState<AbilityMetadata | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAbilityMetadata(getProvider(), tokenId).then((m) => {
      if (!cancelled) setMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  const tier = tokenId > 5 ? 2 : 1;
  const tierBorder = tier === 2 ? "border-[#c8a44e]/60" : "border-[#3d3428]";

  return (
    <div
      className={`relative rounded bg-[#252019] border ${tierBorder} flex items-center justify-center group`}
      style={{ width: size, height: size }}
      title={meta ? `${meta.name}${meta.description ? " — " + meta.description : ""}` : `Ability #${tokenId}`}
    >
      {meta?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meta.image} alt={meta.name} className="w-full h-full object-contain p-1" />
      ) : (
        <div className="text-[8px] text-[#7a7060] animate-pulse">…</div>
      )}
      {count > 1 && (
        <div className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#daa520] text-[#1a1714] text-[10px] font-bold flex items-center justify-center">
          {count}
        </div>
      )}
    </div>
  );
}
