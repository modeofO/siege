// Shared helpers for reading Dojo SDK model stores (useModels output).

export function safeNum(v: unknown): number {
  if (v === undefined || v === null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    if (process.env.NODE_ENV === "development") console.warn("[modelUtils] safeNum coerced to 0:", v);
    return 0;
  }
  return n;
}

export function safeBigIntEq(a: unknown, b: bigint): boolean {
  try {
    return BigInt(a as string | number | bigint) === b;
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[modelUtils] safeBigIntEq coercion failed:", a, e);
    return false;
  }
}

/**
 * Parse an address for comparison, or null if it is malformed.
 *
 * Store selectors match on addresses during render, where a bare `BigInt()`
 * throw takes the whole page down — the SQL path could only fail a poll. The
 * value comes from a wallet connector, so it is outside input.
 */
export function toBigIntOrNull(v: string | null | undefined): bigint | null {
  if (!v) return null;
  try {
    return BigInt(v);
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[modelUtils] invalid address:", v, e);
    return null;
  }
}

type EnumLike = { activeVariant?: () => string; variant?: Record<string, unknown> };

/**
 * Variant name of a Cairo enum as it comes out of the SDK store: unit variants
 * arrive as plain strings, data-carrying ones as CairoCustomEnum, and older
 * SDK versions as a bare `variant` record.
 */
export function enumVariant(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e; // SDK returns enums as plain variant strings
  const v = e as EnumLike;
  if (typeof v.activeVariant === "function") return v.activeVariant();
  if (v.variant && typeof v.variant === "object") {
    return Object.keys(v.variant).find((k) => v.variant![k] !== undefined) || "";
  }
  return "";
}

/**
 * `useModels` claims to return `{ [entityId]: ModelData }` but actually returns
 * `Array<{ [entityId]: ModelData }>`. Normalize both shapes to a flat array of
 * model values so callers can just `.find()` / `.filter()`.
 */
export function flatModels<T extends object>(store: unknown): T[] {
  const iter = Array.isArray(store) ? store : Object.values(store as Record<string, unknown>);
  const out: T[] = [];
  for (const entry of iter) {
    if (!entry || typeof entry !== "object") continue;
    for (const v of Object.values(entry as Record<string, unknown>)) {
      if (v && typeof v === "object") out.push(v as T);
    }
  }
  return out;
}
