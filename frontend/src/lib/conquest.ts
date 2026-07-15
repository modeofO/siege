import { useEffect, useState } from "react";
import type { AccountInterface, UniversalDetails } from "starknet";
import { CONQUEST_ADDRESS } from "./contractAddresses";
import { ABILITY_TOKEN_ADDRESS } from "./abilityToken";
import { vrfRequestRandomCall, waitForReceiptOrThrow } from "./contracts1v1";
import { resilientExecute } from "./controllerSession";
import { toriiSql, toNum, sqlAddr, sqlInt } from "./toriiSql";
import { isNeighbor } from "./hex";
import type { ParcelData } from "./worldState";
import { usePoll } from "./usePoll";

const POLL_INTERVAL = 4000;

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

export interface ConquestSubmitResult {
  txHash: string;
  // A non-zero abilityId is CONSUMED by the attack (single-use in conquest —
  // not returned win or lose). Surface this to the player when the attack UI
  // is wired up. There is currently no conquest-attack component consuming
  // this helper, so this is the notification plumbing for that future UI.
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

// Polls the attacker's ConquestCooldown and ticks every second so the countdown
// stays live between Torii polls. remainingSeconds = max(0, last + 3600 - now).
export function useConquestCooldown(playerAddress: string | null): ConquestCooldownData {
  const [lastAttackTime, setLastAttackTime] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  usePoll(
    async (alive) => {
      if (!playerAddress) return;
      const rows = await toriiSql<{ last_attack_time: number | string }>(
        `SELECT last_attack_time FROM "siege_dojo-ConquestCooldown" WHERE player = ${sqlAddr(playerAddress)}`,
      );
      if (!alive()) return;
      setLastAttackTime(rows[0] ? toNum(rows[0].last_attack_time) : 0);
    },
    POLL_INTERVAL,
    [playerAddress],
    !!playerAddress,
  );

  // setState lives in the interval callback, not the effect body — safe under
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);

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

// Torii SQL: map each owner address to its faction id, so ally parcels can be
// greyed out. On failure returns {} — the contract enforces the rule anyway.
export function useOwnerFactionIds(owners: string[]): Record<string, number> {
  const [map, setMap] = useState<Record<string, number>>({});

  // Stable, sorted key so the poll only re-subscribes when the owner set
  // actually changes (parcels.map() produces a fresh array every render).
  const normalized = Array.from(new Set(owners.map(normalizeAddr))).filter(
    (a) => a !== "0x0",
  );
  normalized.sort();
  const key = normalized.join(",");

  usePoll(
    async (alive) => {
      if (normalized.length === 0) {
        if (alive()) setMap({});
        return;
      }
      const inList = normalized.map((a) => sqlAddr(a)).join(",");
      const rows = await toriiSql<{ player: string; faction_id: number | string }>(
        `SELECT player, faction_id FROM "siege_dojo-FactionMember" WHERE player IN (${inList})`,
      );
      if (!alive()) return;
      const next: Record<string, number> = {};
      for (const r of rows) next[normalizeAddr(r.player)] = toNum(r.faction_id);
      setMap(next);
    },
    POLL_INTERVAL,
    [key],
    true,
  );

  return map;
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
