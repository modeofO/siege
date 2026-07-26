#!/usr/bin/env bun
/**
 * Check which of Torii's declared gRPC methods a deployment actually serves.
 *
 * Torii sits behind Railway's edge, which does not proxy native gRPC (grpcurl
 * gets RST_STREAM/CANCEL), so server reflection is unavailable. Instead:
 *
 *   1. Read the authoritative RPC list from `world.proto` in dojoengine/torii.
 *   2. POST an empty gRPC-web frame at each declared method and read the
 *      response headers:
 *
 *        grpc-status: 12       -> NOT served (UNIMPLEMENTED)
 *        grpc-status: <other>  -> served; validated and rejected eagerly
 *        no grpc-status header -> served; stream opened, status goes to trailers
 *
 * The proto also says whether each method returns `stream`, so the report can
 * distinguish a streaming RPC that opened its stream from one that rejected the
 * empty request up front. Both mean "served" — it is a validation-timing
 * difference, not a conformance failure.
 *
 * Usage:
 *   bun torii-conformance.ts [toriiUrl] [--proto <path-or-url>]
 *
 * Examples:
 *   bun torii-conformance.ts
 *   bun torii-conformance.ts https://siege-torii-katana-production.up.railway.app
 *   bun torii-conformance.ts http://localhost:8080 --proto ./world.proto
 */

import { readFileSync } from "node:fs";

const DEFAULT_URL = "https://siege-torii-mainnet-production.up.railway.app";
const DEFAULT_PROTO =
  "https://raw.githubusercontent.com/dojoengine/torii/main/crates/proto/proto/world.proto";
const SERVICE = "world.World";
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;

// ── args ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const protoFlag = argv.indexOf("--proto");
const protoSource = protoFlag === -1 ? DEFAULT_PROTO : argv[protoFlag + 1];
const positional = argv.filter((a, i) => !a.startsWith("--") && i !== protoFlag + 1);
const toriiUrl = (positional[0] ?? process.env.TORII_URL ?? DEFAULT_URL).replace(/\/+$/, "");

// ── proto ────────────────────────────────────────────────────────────

interface Rpc {
  name: string;
  streaming: boolean;
}

async function loadProto(source: string): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`GET ${source} -> HTTP ${res.status}`);
    return res.text();
  }
  return readFileSync(source, "utf8");
}

/** Parse `rpc Name (Req) returns (stream Resp);` out of the service block. */
function parseRpcs(proto: string): Rpc[] {
  const out: Rpc[] = [];
  const re = /rpc\s+(\w+)\s*\([^)]*\)\s*returns\s*\(\s*(stream\s+)?[\w.]+\s*\)/g;
  for (const m of proto.matchAll(re)) {
    out.push({ name: m[1], streaming: Boolean(m[2]) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── probe ────────────────────────────────────────────────────────────

const EMPTY_FRAME = new Uint8Array([0, 0, 0, 0, 0]);

const STATUS_NAMES: Record<string, string> = {
  "0": "OK",
  "2": "UNKNOWN",
  "3": "INVALID_ARGUMENT",
  "5": "NOT_FOUND",
  "7": "PERMISSION_DENIED",
  "12": "UNIMPLEMENTED",
  "13": "INTERNAL",
  "14": "UNAVAILABLE",
};

type Served = "yes" | "no" | "unreachable";

interface Result extends Rpc {
  served: Served;
  detail: string;
}

async function probe(rpc: Rpc): Promise<Result> {
  const res = await fetch(`${toriiUrl}/${SERVICE}/${rpc.name}`, {
    method: "POST",
    headers: { "Content-Type": "application/grpc-web+proto", "x-grpc-web": "1" },
    body: EMPTY_FRAME,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: unknown) => err as Error);

  if (res instanceof Error) {
    return { ...rpc, served: "unreachable", detail: res.message };
  }

  // Never read the body — a live subscription would stream indefinitely.
  void res.body?.cancel();

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("grpc")) {
    return { ...rpc, served: "unreachable", detail: `non-gRPC response (HTTP ${res.status}, ${contentType || "no content-type"})` };
  }

  const status = res.headers.get("grpc-status");
  const message = decodeURIComponent(res.headers.get("grpc-message") ?? "");

  if (status === "12") return { ...rpc, served: "no", detail: "UNIMPLEMENTED" };

  if (status === null) {
    // No status in headers: the server accepted the request and will report in
    // trailers. For a streaming RPC that means the stream is open; for a unary
    // one it just means validation is deferred past the header flush.
    return {
      ...rpc,
      served: "yes",
      detail: rpc.streaming ? "stream opened" : "accepted, status deferred to trailers",
    };
  }

  const name = STATUS_NAMES[status] ?? `status ${status}`;
  // A streaming RPC answering in headers validated before opening the stream.
  const prefix = rpc.streaming ? "eager reject: " : "";
  return { ...rpc, served: "yes", detail: `${prefix}${name}${message ? `: ${message}` : ""}` };
}

/** Map with a fixed concurrency ceiling, preserving input order. */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

// ── run ──────────────────────────────────────────────────────────────

console.log(`torii   ${toriiUrl}`);
console.log(`proto   ${protoSource}`);
console.log(`service ${SERVICE}\n`);

const proto = await loadProto(protoSource).catch((err: Error) => {
  console.error(`Could not load proto: ${err.message}`);
  process.exit(1);
});

const rpcs = parseRpcs(proto);
if (rpcs.length === 0) {
  console.error("No rpc declarations found — is that a service proto?");
  process.exit(1);
}
console.log(`probing ${rpcs.length} declared methods...\n`);

const results = await pooled(rpcs, CONCURRENCY, probe);

const width = Math.max(...results.map((r) => r.name.length), 6);
console.log(`${"METHOD".padEnd(width)}  DECLARED  SERVED  DETAIL`);
console.log(`${"-".repeat(width)}  --------  ------  ------`);
for (const r of results) {
  const mark = r.served === "yes" ? "yes" : r.served === "no" ? "NO" : "??";
  console.log(
    `${r.name.padEnd(width)}  ${(r.streaming ? "stream" : "unary").padEnd(8)}  ${mark.padEnd(6)}  ${r.detail}`,
  );
}

const served = results.filter((r) => r.served === "yes");
const missing = results.filter((r) => r.served === "no");
const broken = results.filter((r) => r.served === "unreachable");

console.log(`\n${served.length}/${results.length} declared methods served`);
if (missing.length) console.log(`not served: ${missing.map((r) => r.name).join(", ")}`);
if (broken.length) {
  console.log(`unreachable: ${broken.map((r) => r.name).join(", ")}`);
  process.exit(2); // transport problem, not a conformance answer
}
