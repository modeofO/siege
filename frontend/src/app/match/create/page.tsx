"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, isDevMode, useDevAccounts } from "@/app/providers";
import { createMatch } from "@/lib/contracts";
import { lookupUsernames } from "@cartridge/controller";
import Link from "next/link";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestMatchId(): Promise<string | null> {
  const res = await fetch(`${TORII_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{
        siegeDojoMatchCounterModels(first: 1) {
          edges {
            node { count }
          }
        }
      }`,
    }),
  });
  const data = await res.json();
  const count = data?.data?.siegeDojoMatchCounterModels?.edges?.[0]?.node?.count;
  if (count == null) return null;
  return String(typeof count === "string" && count.startsWith("0x") ? parseInt(count, 16) : Number(count));
}

const isHexAddress = (s: string) => /^0x[0-9a-fA-F]+$/.test(s);

function AddressInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (addr: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState(value);
  const [resolvedAddr, setResolvedAddr] = useState<string | null>(null);
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = input.trim();
    setResolvedAddr(null);
    setResolvedUsername(null);

    if (!trimmed || isHexAddress(trimmed)) {
      setLookupLoading(false);
      onChange(trimmed);
      return;
    }

    // Non-hex input — clear the resolved address while looking up
    onChange("");
    setLookupLoading(true);

    debounceRef.current = setTimeout(async () => {
      const results = await lookupUsernames([trimmed]);
      const addr = results.get(trimmed);
      if (addr) {
        setResolvedAddr(addr);
        setResolvedUsername(trimmed);
        onChange(addr);
      }
      setLookupLoading(false);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  return (
    <div className="space-y-2">
      <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">{label}</label>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder || "Username or address (0x...)"}
        className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors font-mono"
      />
      {lookupLoading && <div className="text-xs text-[#6a6a7a]">Looking up username...</div>}
      {resolvedUsername && resolvedAddr && (
        <div className="text-xs text-[#33cc66]">
          {resolvedUsername} →{" "}
          <span className="font-mono">
            {resolvedAddr.slice(0, 10)}...{resolvedAddr.slice(-6)}
          </span>
        </div>
      )}
      {!lookupLoading && input.trim() && !isHexAddress(input) && !resolvedAddr && (
        <div className="text-xs text-[#ff3344]">Username not found</div>
      )}
    </div>
  );
}

function DevAccountSelect({
  label,
  value,
  onChange,
  excludeIndices,
  accounts,
}: {
  label: string;
  value: string;
  onChange: (addr: string) => void;
  excludeIndices: number[];
  accounts: { address: string }[];
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors"
      >
        <option value="">Select account...</option>
        {accounts.map((acc, i) => (
          <option key={i} value={acc.address} disabled={excludeIndices.includes(i)}>
            Dev Account {i} ({acc.address.slice(0, 6)}...{acc.address.slice(-4)})
          </option>
        ))}
      </select>
    </div>
  );
}

function DevModeFields({
  teamATeammateAddr,
  setTeamATeammateAddr,
  teamBAttackerAddr,
  setTeamBAttackerAddr,
  teamBDefenderAddr,
  setTeamBDefenderAddr,
  currentAddress,
}: {
  teamATeammateAddr: string;
  setTeamATeammateAddr: (v: string) => void;
  teamBAttackerAddr: string;
  setTeamBAttackerAddr: (v: string) => void;
  teamBDefenderAddr: string;
  setTeamBDefenderAddr: (v: string) => void;
  currentAddress: string;
}) {
  const { accounts } = useDevAccounts();
  const addrToIndex = (addr: string) => accounts.findIndex((a) => a.address === addr);
  const yourIndex = accounts.findIndex((a) => a.address === currentAddress);
  const selectedIndices = [
    addrToIndex(teamATeammateAddr),
    addrToIndex(teamBAttackerAddr),
    addrToIndex(teamBDefenderAddr),
    yourIndex,
  ].filter((i) => i !== -1);

  return (
    <>
      <DevAccountSelect
        label="Team A Teammate Address (AI)"
        value={teamATeammateAddr}
        onChange={setTeamATeammateAddr}
        excludeIndices={selectedIndices.filter((_, j) => j !== 0)}
        accounts={accounts}
      />
      <DevAccountSelect
        label="Team B Attacker Address"
        value={teamBAttackerAddr}
        onChange={setTeamBAttackerAddr}
        excludeIndices={selectedIndices.filter((_, j) => j !== 1)}
        accounts={accounts}
      />
      <DevAccountSelect
        label="Team B Defender Address"
        value={teamBDefenderAddr}
        onChange={setTeamBDefenderAddr}
        excludeIndices={selectedIndices.filter((_, j) => j !== 2)}
        accounts={accounts}
      />
    </>
  );
}

function SepoliaModeFields({
  teamATeammateAddr,
  setTeamATeammateAddr,
  teamBAttackerAddr,
  setTeamBAttackerAddr,
  teamBDefenderAddr,
  setTeamBDefenderAddr,
}: {
  teamATeammateAddr: string;
  setTeamATeammateAddr: (v: string) => void;
  teamBAttackerAddr: string;
  setTeamBAttackerAddr: (v: string) => void;
  teamBDefenderAddr: string;
  setTeamBDefenderAddr: (v: string) => void;
}) {
  return (
    <>
      <AddressInput
        label="Team A Teammate"
        value={teamATeammateAddr}
        onChange={setTeamATeammateAddr}
        placeholder="Username or wallet address"
      />
      <AddressInput
        label="Team B Attacker"
        value={teamBAttackerAddr}
        onChange={setTeamBAttackerAddr}
        placeholder="Username or wallet address"
      />
      <AddressInput
        label="Team B Defender"
        value={teamBDefenderAddr}
        onChange={setTeamBDefenderAddr}
        placeholder="Username or wallet address"
      />
    </>
  );
}

export default function CreateMatchPage() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";

  const [teamATeammateAddr, setTeamATeammateAddr] = useState("");
  const [teamBAttackerAddr, setTeamBAttackerAddr] = useState("");
  const [teamBDefenderAddr, setTeamBDefenderAddr] = useState("");
  const [yourRole, setYourRole] = useState<"attacker" | "defender">("attacker");

  const [matchId, setMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!account || !address || !teamATeammateAddr || !teamBAttackerAddr || !teamBDefenderAddr) return;

    setLoading(true);
    setError("");

    const teamAAttacker = yourRole === "attacker" ? address : teamATeammateAddr;
    const teamADefender = yourRole === "defender" ? address : teamATeammateAddr;

    try {
      const result = await createMatch(account, teamAAttacker, teamADefender, teamBAttackerAddr, teamBDefenderAddr);

      for (let i = 0; i < 6; i++) {
        try {
          const id = await fetchLatestMatchId();
          if (id) {
            setMatchId(id);
            return;
          }
        } catch {
          // Torii may still be syncing after tx confirmation
        }
        await sleep(1200);
      }

      setError(`Transaction submitted (${result.transaction_hash}), but Torii has not indexed the new match yet.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  if (matchId) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-6">
        <div className="text-2xl font-bold text-[#00d4ff]">Match Created</div>
        <div className="text-sm text-[#6a6a7a]">Share this with your opponent:</div>
        <div className="bg-[#12121a] border border-[#2a2a3a] rounded p-4 text-sm break-all">{matchId}</div>
        <Link
          href={`/match/${matchId}`}
          className="inline-block px-6 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded text-sm"
        >
          GO TO MATCH →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-8">
      <h1 className="text-2xl font-bold tracking-wider">CREATE MATCH</h1>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          Connect your wallet to create a match
        </div>
      )}

      {isDevMode() ? (
        <DevModeFields
          teamATeammateAddr={teamATeammateAddr}
          setTeamATeammateAddr={setTeamATeammateAddr}
          teamBAttackerAddr={teamBAttackerAddr}
          setTeamBAttackerAddr={setTeamBAttackerAddr}
          teamBDefenderAddr={teamBDefenderAddr}
          setTeamBDefenderAddr={setTeamBDefenderAddr}
          currentAddress={address || ""}
        />
      ) : (
        <SepoliaModeFields
          teamATeammateAddr={teamATeammateAddr}
          setTeamATeammateAddr={setTeamATeammateAddr}
          teamBAttackerAddr={teamBAttackerAddr}
          setTeamBAttackerAddr={setTeamBAttackerAddr}
          teamBDefenderAddr={teamBDefenderAddr}
          setTeamBDefenderAddr={setTeamBDefenderAddr}
        />
      )}

      <div className="space-y-3">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Your Role on Team A</label>
        <div className="grid grid-cols-2 gap-4">
          {(["attacker", "defender"] as const).map((role) => (
            <button
              key={role}
              onClick={() => setYourRole(role)}
              className={`p-4 rounded border text-center transition-colors ${
                yourRole === role
                  ? role === "attacker"
                    ? "border-[#ff3344] bg-[#ff3344]/10 text-[#ff3344]"
                    : "border-[#00d4ff] bg-[#00d4ff]/10 text-[#00d4ff]"
                  : "border-[#2a2a3a] bg-[#12121a] text-[#6a6a7a]"
              }`}
            >
              <div className="text-sm font-bold uppercase">{role}</div>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-[#ff3344] text-sm break-all">{error}</div>}

      <button
        onClick={handleCreate}
        disabled={!isConnected || !teamATeammateAddr || !teamBAttackerAddr || !teamBDefenderAddr || loading}
        className="w-full py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? "CREATING..." : "CREATE MATCH"}
      </button>
    </div>
  );
}
