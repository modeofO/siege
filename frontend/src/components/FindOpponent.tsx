"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/app/providers";
import { extractErrorMsg } from "@/lib/contracts1v1";
import {
  queueForMatch,
  leaveQueue,
  fetchQueueStatus,
  fetchEntryTokens,
  ensureEntryAllowance,
  tokenSymbol,
  formatTokenAmount,
  QUEUE_MATCHED,
  SEARCH_EXPIRY_MS,
  POLL_INTERVAL_MS,
  type EntryTokenRow,
} from "@/lib/matchmaking";

type Phase = "idle" | "starting" | "searching" | "matched" | "expired";

export function FindOpponent({ registered }: { registered: boolean }) {
  const { account, address } = useAccount();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [tokens, setTokens] = useState<EntryTokenRow[] | null>(null);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  // Match ids are monotonic — anything newer than what we saw before
  // queueing is OUR pairing, so a stale matched row can't false-positive.
  const prevMatchedRef = useRef(0);
  const searchingRef = useRef(false);

  // Entry token menu from Torii (owner-managed EntryToken rows).
  useEffect(() => {
    let cancelled = false;
    fetchEntryTokens().then((rows) => {
      if (cancelled) return;
      setTokens(rows);
      if (rows.length === 1) setSelectedToken(rows[0].token);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "searching" || !account || !address) return;
    searchingRef.current = true;

    const startedAt = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      // Contract entry expires after its fixed window — no heartbeat txs.
      // Surface that instead of searching forever on a dead entry.
      if (Date.now() - startedAt >= SEARCH_EXPIRY_MS && searchingRef.current) {
        searchingRef.current = false;
        setPhase("expired");
      }
    }, 1000);

    const poll = setInterval(async () => {
      if (!searchingRef.current) return;
      const status = await fetchQueueStatus(address);
      if (
        searchingRef.current &&
        status &&
        status.state === QUEUE_MATCHED &&
        status.matchedMatchId > prevMatchedRef.current
      ) {
        searchingRef.current = false;
        setPhase("matched");
        router.push(`/match-1v1/${status.matchedMatchId}`);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      searchingRef.current = false;
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [phase, account, address, router]);

  const selected = tokens?.find((t) => t.token === selectedToken) ?? null;

  const handleFind = async () => {
    if (!account || !address || !selected) return;
    setError("");
    setPhase("starting");
    try {
      const before = await fetchQueueStatus(address);
      prevMatchedRef.current = before?.matchedMatchId ?? 0;
      // Approval is a separate receipt-awaited tx (VRF wrap constraint).
      await ensureEntryAllowance(account, selected.token, selected.amount);
      await queueForMatch(account, selected.token);
      setPhase("searching");
    } catch (e) {
      setError(extractErrorMsg(e));
      setPhase("idle");
    }
  };

  const handleCancel = async () => {
    searchingRef.current = false;
    setPhase("idle");
    setElapsed(0);
    if (!account) return;
    try {
      await leaveQueue(account);
    } catch (e) {
      console.warn("[FindOpponent] leave_queue failed:", extractErrorMsg(e));
    }
  };

  if (phase === "expired") {
    return (
      <div className="space-y-4 text-center">
        <div className="text-sm text-[#c8a44e] tracking-wider">SEARCH EXPIRED</div>
        <div className="text-xs text-[#6a6a7a]">
          No opponent found within 10 minutes. Nothing was charged. Queue up again when you&apos;re
          ready.
        </div>
        <button
          onClick={handleFind}
          className="px-6 py-2 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded text-sm hover:bg-[#ffd700]/20 transition-colors tracking-wider"
        >
          SEARCH AGAIN
        </button>
      </div>
    );
  }

  if (!registered) {
    return (
      <div className="text-xs text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
        Finding a match requires a Hold in the Marches.
      </div>
    );
  }

  if (phase === "searching" || phase === "matched") {
    return (
      <div className="space-y-4 text-center">
        <div className="text-sm text-[#ffd700] tracking-wider animate-pulse">
          {phase === "matched" ? "OPPONENT FOUND — ENTERING MATCH..." : "SEARCHING FOR OPPONENT..."}
        </div>
        <div className="text-xs text-[#6a6a7a]">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} — first player to queue up
          gets matched with you instantly. Search expires after 10 minutes; your entry is only
          charged when a match is made.
        </div>
        {phase === "searching" && (
          <button
            onClick={handleCancel}
            className="px-6 py-2 border border-[#2a2a3a] text-[#6a6a7a] rounded text-sm hover:border-[#ff3344]/40 hover:text-[#ff3344] transition-colors"
          >
            CANCEL SEARCH
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-[#6a6a7a] leading-relaxed">
        Queue up and get paired with the next player looking for a match. The entry buy-in is
        charged only when a match is made — the winner takes 65% of the pot.
      </div>

      {/* Entry token picker */}
      {tokens === null ? (
        <div className="text-xs text-[#6a6a7a]">Loading entry options...</div>
      ) : tokens.length === 0 ? (
        <div className="text-xs text-[#ff3344] border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          No entry tokens are configured yet. Check back soon.
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Entry buy-in</label>
          <div className="flex gap-2">
            {tokens.map((t) => (
              <button
                key={t.token}
                onClick={() => setSelectedToken(t.token)}
                className={`flex-1 py-2 px-3 border rounded text-sm tracking-wider transition-colors ${
                  selectedToken === t.token
                    ? "border-[#ffd700] bg-[#ffd700]/10 text-[#ffd700]"
                    : "border-[#2a2a3a] text-[#6a6a7a] hover:border-[#4a4a5a]"
                }`}
              >
                {formatTokenAmount(t.amount, t.token)} {tokenSymbol(t.token)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="text-[#ff3344] text-sm break-all">{error}</div>}

      <button
        onClick={handleFind}
        disabled={!account || !selected || phase === "starting"}
        className="w-full py-3 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {phase === "starting" ? "JOINING QUEUE..." : "FIND OPPONENT"}
      </button>
    </div>
  );
}
