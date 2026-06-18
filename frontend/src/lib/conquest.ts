import { useState } from "react";
import type { AccountInterface } from "starknet";
import { CONQUEST_ADDRESS } from "./contractAddresses";
import { resilientExecute } from "./controllerSession";
import { toriiSql, toNum, sqlAddr } from "./toriiSql";
import { usePoll } from "./usePoll";

const POLL_INTERVAL = 4000;

export { CONQUEST_ADDRESS };

export interface PresetSlot {
  p0: number;
  p1: number;
  p2: number;
  g0: number;
  g1: number;
  g2: number;
}

export interface PresetDefenseData {
  slots: PresetSlot[];
  presetCount: number;
}

export function usePresetDefense(playerAddress: string | null): PresetDefenseData | null {
  const [data, setData] = useState<PresetDefenseData | null>(null);

  usePoll(
    async (alive) => {
      if (!playerAddress) return;
      const rows = await toriiSql<Record<string, number | string>>(
        `SELECT p0_p0, p0_p1, p0_p2, p0_g0, p0_g1, p0_g2, p1_p0, p1_p1, p1_p2, p1_g0, p1_g1, p1_g2, p2_p0, p2_p1, p2_p2, p2_g0, p2_g1, p2_g2, p3_p0, p3_p1, p3_p2, p3_g0, p3_g1, p3_g2, preset_count FROM "siege_dojo-PresetDefense" WHERE player = ${sqlAddr(playerAddress)}`,
      );
      if (!alive()) return;

      const node = rows[0];
      if (!node) {
        setData({ slots: [], presetCount: 0 });
        return;
      }

      const slots: PresetSlot[] = [
        { p0: toNum(node.p0_p0), p1: toNum(node.p0_p1), p2: toNum(node.p0_p2), g0: toNum(node.p0_g0), g1: toNum(node.p0_g1), g2: toNum(node.p0_g2) },
        { p0: toNum(node.p1_p0), p1: toNum(node.p1_p1), p2: toNum(node.p1_p2), g0: toNum(node.p1_g0), g1: toNum(node.p1_g1), g2: toNum(node.p1_g2) },
        { p0: toNum(node.p2_p0), p1: toNum(node.p2_p1), p2: toNum(node.p2_p2), g0: toNum(node.p2_g0), g1: toNum(node.p2_g1), g2: toNum(node.p2_g2) },
        { p0: toNum(node.p3_p0), p1: toNum(node.p3_p1), p2: toNum(node.p3_p2), g0: toNum(node.p3_g0), g1: toNum(node.p3_g1), g2: toNum(node.p3_g2) },
      ];

      setData({ slots, presetCount: toNum(node.preset_count) });
    },
    POLL_INTERVAL,
    [playerAddress],
    !!playerAddress,
  );

  return data;
}

export async function setPresetDefense(
  account: AccountInterface,
  index: number,
  p0: number,
  p1: number,
  p2: number,
  g0: number,
  g1: number,
  g2: number,
): Promise<string> {
  const result = await resilientExecute(account, {
    contractAddress: CONQUEST_ADDRESS,
    entrypoint: "set_preset_defense",
    calldata: [
      index.toString(),
      p0.toString(),
      p1.toString(),
      p2.toString(),
      g0.toString(),
      g1.toString(),
      g2.toString(),
    ],
  });
  return result.transaction_hash;
}

export async function initiateConquest(
  account: AccountInterface,
  targetParcelId: number,
  p0: number,
  p1: number,
  p2: number,
  g0: number,
  g1: number,
  g2: number,
  abilityId: number,
  abilityTarget: number,
): Promise<string> {
  const result = await resilientExecute(account, {
    contractAddress: CONQUEST_ADDRESS,
    entrypoint: "initiate_conquest",
    calldata: [
      targetParcelId.toString(),
      p0.toString(),
      p1.toString(),
      p2.toString(),
      g0.toString(),
      g1.toString(),
      g2.toString(),
      abilityId.toString(),
      abilityTarget.toString(),
    ],
  });
  return result.transaction_hash;
}

export const DEFENDER_BUDGET = 12;
export const ATTACKER_BUDGET = 10;
