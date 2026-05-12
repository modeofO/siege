const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";

export async function toriiSql<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  try {
    const res = await fetch(`${TORII_URL}/sql?query=${encodeURIComponent(sql)}`);
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
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
