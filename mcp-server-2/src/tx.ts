/**
 * Transaction call helpers + revert-reason extraction.
 *
 * `extractTxError` walks the deeply nested error shapes thrown by starknet.js
 * and the Cartridge WASM session to pull out a human-readable reason, e.g.
 * "insufficient budget" instead of the useless "Transaction execution error".
 */

import type { Call } from "starknet";

/** Build a starknet.js Call. */
export function call(contractAddress: string, entrypoint: string, calldata: string[]): Call {
  return { contractAddress, entrypoint, calldata };
}

/**
 * Cartridge VRF request_random call. Source::Nonce(callerContract).
 *
 * `[caller, source_tag=0, nonce_caller]` — the `0` selects the
 * Source::Nonce variant; the trailing address is the contract whose
 * nonce salts the random.
 */
export function vrfRequestRandom(vrfAddress: string, callerContract: string): Call {
  return call(vrfAddress, "request_random", [callerContract, "0", callerContract]);
}

/**
 * Pull a useful error message out of whatever starknet.js / WASM session
 * throws. Returns the original message as a fallback.
 */
export function extractTxError(err: any): string {
  // WASM JsControllerError — methods, not properties
  if (err?.__wbg_ptr) {
    try {
      const data = typeof err.data === "function" ? err.data() : err.data;
      const msg = typeof err.message === "function" ? err.message() : err.message;
      const code = typeof err.code === "function" ? err.code() : err.code;

      let execError: string | undefined;
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          execError = parsed?.execution_error;
        } catch {
          execError = data;
        }
      } else if (typeof data === "object" && data) {
        execError = data.execution_error;
      }

      if (typeof execError === "string" && execError.length > 10) {
        const quotedReasons = [...execError.matchAll(/"([^"]{10,})"/g)].map((match) => match[1]);
        const useful = quotedReasons.filter(
          (r) => !r.startsWith("0x") && !r.includes("class_hash") && !r.includes("contract_address"),
        );
        if (useful.length > 0) return useful[0];

        const feltReason = execError.match(/\('([^']+)'\).*\('ENTRYPOINT_FAILED'\)/);
        if (feltReason) return feltReason[1];

        return execError.length > 300 ? execError.slice(0, 300) + "..." : execError;
      }

      if (msg && msg !== "Transaction execution error") return `${msg} (code ${code})`;
    } catch {
      /* fall through */
    }
  }

  const paths = [
    err?.baseError?.data?.execution_error,
    err?.cause?.baseError?.data?.execution_error,
    err?.cause?.data?.execution_error,
    err?.cause?.message,
    err?.data?.execution_error,
    err?.message,
  ];
  for (const val of paths) {
    if (typeof val === "string" && val.length > 10) {
      const reasonMatch = val.match(/Failure reason:\s*\([^)]*'([^']+)'\)/);
      if (reasonMatch) return reasonMatch[1];
      const quotedMatch = val.match(/"([^"]{5,})"/);
      if (quotedMatch) return quotedMatch[1];
      return val.length > 300 ? val.slice(0, 300) + "..." : val;
    }
  }

  // Deep-search a stringified error for known fields
  const fallback = err?.message ?? String(err);
  try {
    const full = JSON.stringify(err, null, 0);
    const exec = full.match(/"execution_error":"([^"]+)"/);
    if (exec) {
      const decoded = exec[1].replace(/\\n/g, " ").replace(/\\"/g, '"');
      const reason = decoded.match(/Failure reason:\s*\([^)]*'([^']+)'\)/);
      if (reason) return reason[1];
      const quoted = decoded.match(/"([^"]{5,})"/);
      return quoted ? quoted[1] : decoded.slice(0, 300);
    }
    const revert = full.match(/"(?:revert_error|error_message|revert_reason)":"([^"]+)"/);
    if (revert) return revert[1];
    const anyReason = full.match(/Failure reason[^']*'([^']+)'/);
    if (anyReason) return anyReason[1];
  } catch {
    /* circular */
  }

  if (err?.__wbg_ptr && !err?.message) {
    return "Session error (WASM) — session may have expired. Restart the MCP server to re-authenticate.";
  }

  return fallback;
}
