import { useMemo } from "react";
import type { AccountInterface, UniversalDetails } from "starknet";
import { useModels } from "@dojoengine/sdk/react";
import {
  ModelsMapping,
  type ConquestCooldown as ConquestCooldownModel,
  type FactionMember as FactionMemberModel,
  type PresetDefense as PresetDefenseModel,
} from "@/bindings/typescript/models.gen";
import { CONQUEST_ADDRESS } from "./contractAddresses";
import { ABILITY_TOKEN_ADDRESS } from "./abilityToken";
import { vrfRequestRandomCall, waitForReceiptOrThrow } from "./contracts1v1";
import { resilientExecute } from "./controllerSession";
import { toriiSql, toNum, sqlAddr, sqlInt } from "./toriiSql";
import { safeBigIntEq, safeNum, flatModels, toBigIntOrNull } from "./modelUtils";
import { isNeighbor } from "./hex";
import type { ParcelData } from "./worldState";
import { useNowSeconds } from "./useNow";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const TX_OPTS = IS_DEVNET ? DEVNET_TX_OPTS : undefined;

export { CONQUEST_ADDRESS };

// BigInt-safe address equality — Torii pads addresses, callers often don't.
export function sameAddress(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

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

/**
 * PresetDefense stores its four slots as flattened `p<slot>_<field>` columns
 * rather than an array, so the slots have to be reassembled by name. Exported
 * for tests: a typo in the key template would silently yield an all-zero
 * garrison, which reads as a legitimate "no defenses set".
 */
export function presetSlotsFromModel(model: PresetDefenseModel): PresetSlot[] {
  const row = model as unknown as Record<string, unknown>;
  return [0, 1, 2, 3].map((i) => ({
    p0: safeNum(row[`p${i}_p0`]),
    p1: safeNum(row[`p${i}_p1`]),
    p2: safeNum(row[`p${i}_p2`]),
    g0: safeNum(row[`p${i}_g0`]),
    g1: safeNum(row[`p${i}_g1`]),
    g2: safeNum(row[`p${i}_g2`]),
  }));
}

/** Reads the store populated by `useWorldSubscription` — see worldSubscription.ts. */
export function usePresetDefense(playerAddress: string | null): PresetDefenseData | null {
  const presets = useModels(ModelsMapping.PresetDefense);

  return useMemo(() => {
    // The world subscription is wildcard-keyed (see worldSubscription.ts), so
    // the store holds every player's row — match this player's explicitly.
    const addr = toBigIntOrNull(playerAddress);
    if (addr === null) return null;
    const p = flatModels<PresetDefenseModel>(presets).find((x) => safeBigIntEq(x.player, addr));
    if (!p) return { slots: [], presetCount: 0 };
    return { slots: presetSlotsFromModel(p), presetCount: safeNum(p.preset_count) };
  }, [presets, playerAddress]);
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

export interface ConquestSubmitResult {
  txHash: string;
  // A non-zero abilityId is CONSUMED by the attack (single-use in conquest —
  // not returned win or lose). Surface this to the player.
  abilityConsumed: boolean;
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
): Promise<ConquestSubmitResult> {
  // The conquest contract consumes Cartridge VRF via Source::Nonce(conquest).
  // The Cartridge paymaster VRF wrapping requires request_random as call[0] and
  // the game call as call[1] with nothing between (same shape as stakedMatch).
  const tx = await resilientExecute(
    account,
    [
      vrfRequestRandomCall(CONQUEST_ADDRESS),
      {
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
      },
    ],
    TX_OPTS,
  );
  // Resolution is synchronous in the tx — wait for the receipt so callers know
  // the fight is over before they poll Torii for the outcome.
  await waitForReceiptOrThrow(account, tx.transaction_hash, "Conquest");
  return { txHash: tx.transaction_hash, abilityConsumed: abilityId > 0 };
}

// The conquest contract escrows the ability via safe_transfer_from(attacker →
// conquest), so it must be an approved operator on AbilityToken. Sent as a
// standalone tx before the VRF multicall (mirrors createStakedMatch), only when
// an ability is actually selected.
export async function approveConquestAbilityOperator(account: AccountInterface): Promise<string> {
  const result = await resilientExecute(
    account,
    {
      contractAddress: ABILITY_TOKEN_ADDRESS,
      entrypoint: "set_approval_for_all",
      calldata: [CONQUEST_ADDRESS, "1"],
    },
    TX_OPTS,
  );
  return result.transaction_hash;
}

// Read AbilityToken.is_approved_for_all(owner, conquest) so the modal can skip a
// redundant approval tx when conquest is already an operator. A non-zero felt
// means approved. Callers should treat a throw as "unknown" and fall back to
// sending the approval.
export async function isConquestAbilityOperatorApproved(
  account: AccountInterface,
  owner: string,
): Promise<boolean> {
  const result = await account.callContract({
    contractAddress: ABILITY_TOKEN_ADDRESS,
    entrypoint: "is_approved_for_all",
    calldata: [owner, CONQUEST_ADDRESS],
  });
  return result.length > 0 && BigInt(result[0]) !== BigInt(0);
}

export const DEFENDER_BUDGET = 12;
export const ATTACKER_BUDGET = 10;
// Mirrors CONQUEST_COOLDOWN in src/systems/conquest.cairo — keep in sync.
export const CONQUEST_COOLDOWN_SECONDS = 3600;

// ---------- Cooldown ----------

export interface ConquestCooldownData {
  lastAttackTime: number;
  remainingSeconds: number;
}

/**
 * Reads the store populated by `useWorldSubscription` — see worldSubscription.ts.
 * `lastAttackTime` only moves when this player attacks, but the derived
 * countdown is wall-clock, so it needs its own 1s tick.
 */
export function useConquestCooldown(playerAddress: string | null): ConquestCooldownData {
  const cooldowns = useModels(ModelsMapping.ConquestCooldown);
  const now = useNowSeconds(1000);

  const lastAttackTime = useMemo(() => {
    const addr = toBigIntOrNull(playerAddress);
    if (addr === null) return 0;
    const c = flatModels<ConquestCooldownModel>(cooldowns).find((x) =>
      safeBigIntEq(x.player, addr),
    );
    return c ? safeNum(c.last_attack_time) : 0;
  }, [cooldowns, playerAddress]);

  const remainingSeconds =
    lastAttackTime > 0 ? Math.max(0, lastAttackTime + CONQUEST_COOLDOWN_SECONDS - now) : 0;
  return { lastAttackTime, remainingSeconds };
}

// ---------- Attackability ----------

export interface Attackability {
  attackable: boolean;
  reason?: string;
}

// Pure predicate mirroring the initiate_conquest asserts, for greying out the
// map and the selection bar. The contract still enforces every rule; this is
// UX only. `myParcels` are the caller's parcels; `ownerFactionIds` maps a
// (normalized) owner address to its faction id (0 = none). Every claimed,
// adjacent, non-ally enemy parcel is attackable — a defender with no presets
// simply fights with the fixed default garrison.
export function getAttackability(
  parcel: ParcelData,
  myParcels: ParcelData[],
  myFactionId: number,
  ownerFactionIds: Record<string, number>,
): Attackability {
  const unclaimed =
    !parcel.owner ||
    parcel.owner === "0x0" ||
    parcel.owner === "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (unclaimed) return { attackable: false, reason: "Unclaimed territory" };

  if (myParcels.some((p) => p.parcelId === parcel.parcelId)) {
    return { attackable: false, reason: "Your own parcel" };
  }

  if (parcel.isHome) return { attackable: false, reason: "Home parcels are protected" };

  if (myFactionId !== 0) {
    const ownerFaction = ownerFactionIds[normalizeAddr(parcel.owner)] ?? 0;
    if (ownerFaction !== 0 && ownerFaction === myFactionId) {
      return { attackable: false, reason: "Faction ally" };
    }
  }

  const adjacent = myParcels.some((p) => isNeighbor(p, parcel));
  if (!adjacent) return { attackable: false, reason: "Not adjacent to your holdings" };

  return { attackable: true };
}

function normalizeAddr(a: string): string {
  try {
    return "0x" + BigInt(a).toString(16);
  } catch {
    return a.toLowerCase();
  }
}

// Map each parcel owner to its faction id, so ally parcels can be greyed out.
// The whole FactionMember model is in the store (see worldSubscription.ts);
// the owner list only scopes the result to addresses actually on the map.
export function useOwnerFactionIds(owners: string[]): Record<string, number> {
  const members = useModels(ModelsMapping.FactionMember);

  // Stable, sorted key: parcels.map() produces a fresh array every render, so
  // memoizing on the array identity would recompute constantly.
  const key = useMemo(() => {
    const normalized = Array.from(new Set(owners.map(normalizeAddr))).filter((a) => a !== "0x0");
    normalized.sort();
    return normalized.join(",");
  }, [owners]);

  return useMemo(() => {
    if (!key) return {};
    const wanted = new Set(key.split(","));
    const next: Record<string, number> = {};
    for (const m of flatModels<FactionMemberModel>(members)) {
      const addr = normalizeAddr(m.player);
      if (wanted.has(addr)) next[addr] = safeNum(m.faction_id);
    }
    return next;
  }, [members, key]);
}

// ---------- Outcome polling ----------

export interface ConquestOutcome {
  won: boolean;
  targetParcelId: number;
  // On defeat, the attacker's parcel transferred to the defender (closest to
  // the target). null when nothing was lost (last stand: attacker held only
  // home parcels).
  lostParcel: ParcelData | null;
}

// One poll of the conquest result. Returns null until Torii has indexed this
// attack (proved by ConquestCooldown.last_attack_time advancing past the
// pre-attack baseline). Once indexed: target owner == attacker → victory;
// otherwise defeat, and the lost parcel is the one in `beforeOwned` no longer
// owned by the attacker.
export async function fetchConquestOutcome(
  attacker: string,
  targetParcelId: number,
  prevAttackTime: number,
  beforeOwned: ParcelData[],
): Promise<ConquestOutcome | null> {
  const cdRows = await toriiSql<{ last_attack_time: number | string }>(
    `SELECT last_attack_time FROM "siege_dojo-ConquestCooldown" WHERE player = ${sqlAddr(attacker)}`,
  );
  const lastAttackTime = cdRows[0] ? toNum(cdRows[0].last_attack_time) : 0;
  if (lastAttackTime <= prevAttackTime) return null; // not indexed yet

  const targetRows = await toriiSql<{ owner: string }>(
    `SELECT owner FROM "siege_dojo-Parcel" WHERE parcel_id = ${sqlInt(targetParcelId)}`,
  );
  const targetOwner = targetRows[0]?.owner ?? "0x0";
  if (sameAddress(targetOwner, attacker)) {
    return { won: true, targetParcelId, lostParcel: null };
  }

  const ownedRows = await toriiSql<{ parcel_id: number | string }>(
    `SELECT parcel_id FROM "siege_dojo-Parcel" WHERE owner = ${sqlAddr(attacker)}`,
  );
  const afterIds = new Set(ownedRows.map((r) => toNum(r.parcel_id)));
  const lostParcel = beforeOwned.find((p) => !afterIds.has(p.parcelId)) ?? null;
  return { won: false, targetParcelId, lostParcel };
}
