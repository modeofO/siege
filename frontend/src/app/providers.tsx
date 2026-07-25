"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { RpcProvider, Account, type AccountInterface } from "starknet";
import { sepolia, mainnet } from "@starknet-react/chains";
import { StarknetConfig, jsonRpcProvider, cartridge, useAccount as useStarknetAccount } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { FeeSource } from "@cartridge/controller";
import { DojoProvider } from "@/lib/dojoSdk";
import { SESSION_POLICIES } from "@/lib/sessionPolicies";

// ---------- Network mode ----------
// Network identity lives in @/lib/network — see that file for why it is a
// build-time constant and must never become a runtime switch.

import { envPin, IS_DEVNET, IS_KATANA, IS_MAINNET } from "@/lib/network";

export function isDevMode() {
  return IS_DEVNET;
}

// Controller-mode chain parameters. "katana" = self-hosted Railway katana
// (chain id short-string "SIEGE"); "mainnet" = Starknet mainnet via Cartridge;
// anything else non-devnet = public sepolia.
const CONTROLLER_RPC_URL = IS_KATANA
  ? envPin(process.env.NEXT_PUBLIC_RPC_URL) || "https://siege-katana-production.up.railway.app"
  : IS_MAINNET
    ? "https://api.cartridge.gg/x/starknet/mainnet"
    : "https://api.cartridge.gg/x/starknet/sepolia";

// ---------- Shared account interface ----------

interface SiegeAccountValue {
  account: AccountInterface | undefined;
  address: string | undefined;
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
}

const SiegeAccountContext = createContext<SiegeAccountValue>({
  account: undefined,
  address: undefined,
  status: "disconnected",
});

export function useAccount(): SiegeAccountValue {
  return useContext(SiegeAccountContext);
}

// ---------- Dev mode (Katana hardcoded accounts) ----------

const DEV_ACCOUNTS = [
  {
    address: "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
    privateKey: "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
  },
  {
    address: "0x13d9ee239f33fea4f8785b9e3870ade909e20a9599ae7cd62c1c292b73af1b7",
    privateKey: "0x1c9053c053edf324aec366a34c6901b1095b07af69495bffec7d7fe21effb1b",
  },
  {
    address: "0x17cc6ca902ed4e8baa8463a7009ff18cc294fa85a94b4ce6ac30a9ebd6057c7",
    privateKey: "0x14d6672dcb4b77ca36a887e9a11cd9d637d5012468175829e9c6e770c61642",
  },
  {
    address: "0x2af9427c5a277474c079a1283c880ee8a6f0f8fbf73ce969c08d88befec1bba",
    privateKey: "0x1800000000300000180000000000030000000000003006001800006600",
  },
];

interface DevAccountContextValue {
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  accounts: typeof DEV_ACCOUNTS;
}

const DevAccountContext = createContext<DevAccountContextValue | null>(null);

export function useDevAccounts() {
  const ctx = useContext(DevAccountContext);
  if (!ctx) throw new Error("useDevAccounts only available in devnet mode");
  return ctx;
}

function DevProvider({ children }: { children: React.ReactNode }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:5050";
  const provider = useMemo(() => new RpcProvider({ nodeUrl: RPC_URL }), [RPC_URL]);

  const account = useMemo(() => {
    const { address, privateKey } = DEV_ACCOUNTS[selectedIndex];
    return new Account({ provider, address, signer: privateKey });
  }, [provider, selectedIndex]);

  return (
    <DevAccountContext.Provider value={{ selectedIndex, setSelectedIndex, accounts: DEV_ACCOUNTS }}>
      <SiegeAccountContext.Provider
        value={{
          account,
          address: DEV_ACCOUNTS[selectedIndex].address,
          status: "connected",
        }}
      >
        {children}
      </SiegeAccountContext.Provider>
    </DevAccountContext.Provider>
  );
}

// ---------- Controller mode (sepolia & mainnet, Cartridge Controller) ----------

// Constructed browser-only: resolving a custom appchain (SIEGE) makes the
// Controller fetch the chain id from the RPC, which crashes Next prerender
// ("Cannot make synchronous HTTP call in Node.js environment").
const controllerConnector = IS_DEVNET || typeof window === "undefined"
  ? null
  : new ControllerConnector({
      policies: SESSION_POLICIES,
      chains: [{ rpcUrl: CONTROLLER_RPC_URL }],
      // "SIEGE" as a Cairo short string; keychain resolves the appchain by it.
      defaultChainId: IS_KATANA ? "0x5349454745" : "0x" + (IS_MAINNET ? mainnet : sepolia).id.toString(16),
      // No `slot`: the Cartridge-hosted torii for siege-dojo was discontinued
      // (indexer moved to Railway). Passing a slot whose torii is gone makes
      // the keychain bootstrap fail (RetrieveContracts 404 → "Transaction
      // failed" on session approval). Keychain torii can't point at Railway.
      feeSource: FeeSource.PAYMASTER,
      propagateSessionErrors: true,
    });

const controllerRpcProvider = jsonRpcProvider({
  rpc: () => ({ nodeUrl: CONTROLLER_RPC_URL }),
});

function CartridgeBridge({ children }: { children: React.ReactNode }) {
  const { account, address, status } = useStarknetAccount();
  return (
    <SiegeAccountContext.Provider
      value={{
        account: account ?? undefined,
        address: address ?? undefined,
        status: status ?? "disconnected",
      }}
    >
      {children}
    </SiegeAccountContext.Provider>
  );
}

// Self-hosted katana chain descriptor for starknet-react (id = "SIEGE").
const siegeKatanaChain = {
  ...sepolia,
  id: BigInt("0x5349454745"),
  network: "siege-katana",
  name: "Siege Katana",
  rpcUrls: {
    default: { http: [CONTROLLER_RPC_URL] },
    public: { http: [CONTROLLER_RPC_URL] },
  },
} as unknown as typeof sepolia;

const controllerChain = IS_KATANA ? siegeKatanaChain : IS_MAINNET ? mainnet : sepolia;

function ControllerProvider({ children }: { children: React.ReactNode }) {
  return (
    <StarknetConfig
      autoConnect
      chains={[controllerChain]}
      defaultChainId={controllerChain.id}
      provider={controllerRpcProvider}
      connectors={controllerConnector ? [controllerConnector] : []}
      explorer={cartridge}
    >
      <CartridgeBridge>{children}</CartridgeBridge>
    </StarknetConfig>
  );
}

// ---------- Exported provider ----------

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  const inner = IS_DEVNET ? <DevProvider>{children}</DevProvider> : <ControllerProvider>{children}</ControllerProvider>;
  return <DojoProvider>{inner}</DojoProvider>;
}
