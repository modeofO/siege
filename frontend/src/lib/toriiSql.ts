// Must come from ./network, not process.env directly: this is the default read
// path for world/parcel/match data, so reading the build's env pin would keep
// polling the wrong indexer after a network switch.
import { TORII_URL } from "./network";

// --- Connection health tracking ---
// toriiSql still returns [] on failure so callers stay simple, but failures
// are no longer silent: they update a shared health state (see useToriiHealth)
// so the UI can distinguish "no data" from "Torii unreachable". The tracker is
// shared with the gRPC read path (useActiveBattles) — any periodic Torii read
// may be the page's only liveness signal, so all of them report here.

const UNHEALTHY_AFTER = 2; // consecutive failures before flagging

let consecutiveFailures = 0;
let healthy = true;
const healthListeners = new Set<(healthy: boolean) => void>();

export function reportToriiResult(ok: boolean, detail?: string) {
  consecutiveFailures = ok ? 0 : consecutiveFailures + 1;
  const nowHealthy = consecutiveFailures < UNHEALTHY_AFTER;
  if (!ok && consecutiveFailures === UNHEALTHY_AFTER) {
    console.warn(`[toriiSql] Torii unreachable (${detail ?? "unknown error"})`);
  }
  if (nowHealthy !== healthy) {
    healthy = nowHealthy;
    for (const cb of healthListeners) cb(healthy);
  }
}

export function getToriiHealthy(): boolean {
  return healthy;
}

export function subscribeToriiHealth(cb: (healthy: boolean) => void): () => void {
  healthListeners.add(cb);
  return () => {
    healthListeners.delete(cb);
  };
}

export async function toriiSql<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  try {
    const res = await fetch(`${TORII_URL}/sql?query=${encodeURIComponent(sql)}`);
    if (!res.ok) {
      reportToriiResult(false, `HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as T[];
    reportToriiResult(true);
    return data;
  } catch (e) {
    reportToriiResult(false, e instanceof Error ? e.message : String(e));
    return [];
  }
}

export function sqlHex(v: string): string {
  if (!/^0x[0-9a-fA-F]+$/.test(v)) throw new Error("invalid hex value");
  return `'${v}'`;
}

export function sqlInt(v: number | string): string {
  const n = typeof v === "string" ? parseInt(v, 10) : Math.floor(v);
  if (!Number.isFinite(n)) throw new Error("invalid integer value");
  return String(n);
}

/**
 * Torii stores u64 key columns (e.g. match_id) as zero-padded hex text like
 * "0x0000000000000002" — integer comparisons silently match nothing.
 */
export function sqlU64(v: number | string): string {
  const n = BigInt(v);
  if (n < BigInt(0)) throw new Error("invalid u64 value");
  return `'0x${n.toString(16).padStart(16, "0")}'`;
}

/**
 * Torii stores ContractAddress columns as 0x + 64 zero-padded hex digits.
 * Normalize caller-supplied addresses (often unpadded) before comparing.
 */
export function sqlAddr(v: string): string {
  const n = BigInt(v);
  if (n < BigInt(0)) throw new Error("invalid address");
  return `'0x${n.toString(16).padStart(64, "0")}'`;
}

export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

export function feltToStr(felt: string): string {
  if (!felt || felt === "0x0" || felt === "0") return "";
  const hex = felt.startsWith("0x") ? felt.slice(2) : BigInt(felt).toString(16);
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return String.fromCharCode(...bytes.filter((b) => b > 0));
}
