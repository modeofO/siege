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
