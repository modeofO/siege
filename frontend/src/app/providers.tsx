"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { RpcProvider, Account, type AccountInterface } from "starknet";
import { sepolia } from "@starknet-react/chains";
import {
  StarknetConfig,
  jsonRpcProvider,
  cartridge,
  useAccount as useStarknetAccount,
} from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import type { SessionPolicies } from "@cartridge/controller";
import { CONTRACTS } from "@/lib/contracts";
import { CONTRACTS_1V1, VRF_PROVIDER_ADDRESS } from "@/lib/contracts1v1";
import { CRAFTING_1V1_ADDRESS } from "@/lib/craftingContracts";
import { RESOURCE_TOKENS } from "@/lib/useResourceBalances";

// ---------- Network mode ----------

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";
export function isDevMode() {
  return IS_DEVNET;
}

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

// ---------- Sepolia mode (Cartridge Controller) ----------

const SESSION_POLICIES: SessionPolicies = {
  contracts: {
    [CONTRACTS.ACTIONS]: {
      methods: [
        { name: "Create Match", entrypoint: "create_match" },
      ],
    },
    [CONTRACTS.COMMIT_REVEAL]: {
      methods: [
        { name: "Commit Move", entrypoint: "commit" },
        { name: "Reveal Attacker", entrypoint: "reveal_attacker" },
        { name: "Reveal Defender", entrypoint: "reveal_defender" },
      ],
    },
    [CONTRACTS_1V1.ACTIONS]: {
      methods: [
        { name: "Create 1v1 Match", entrypoint: "create_match_1v1" },
      ],
    },
    [CONTRACTS_1V1.COMMIT_REVEAL]: {
      methods: [
        { name: "Commit 1v1", entrypoint: "commit" },
        { name: "Reveal 1v1", entrypoint: "reveal" },
      ],
    },
    [VRF_PROVIDER_ADDRESS]: {
      methods: [
        { name: "Request Random", entrypoint: "request_random" },
      ],
    },
    [CRAFTING_1V1_ADDRESS]: {
      methods: [
        { name: "Craft Ability", entrypoint: "craft_ability" },
      ],
    },
    // Approve policies for each resource ERC-20 so crafting can burn them
    ...Object.fromEntries(
      Object.values(RESOURCE_TOKENS).map((addr) => [
        addr,
        { methods: [{ name: "Approve", entrypoint: "approve" }] },
      ]),
    ),
  },
};

const sepoliaConnector = IS_DEVNET
  ? null
  : new ControllerConnector({
      policies: SESSION_POLICIES,
      chains: [{ rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia" }],
      defaultChainId: "0x" + sepolia.id.toString(16),
      slot: "siege-dojo",
    });

const sepoliaRpcProvider = jsonRpcProvider({
  rpc: () => ({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" }),
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

function SepoliaProvider({ children }: { children: React.ReactNode }) {
  return (
    <StarknetConfig
      autoConnect
      chains={[sepolia]}
      defaultChainId={sepolia.id}
      provider={sepoliaRpcProvider}
      connectors={sepoliaConnector ? [sepoliaConnector] : []}
      explorer={cartridge}
    >
      <CartridgeBridge>{children}</CartridgeBridge>
    </StarknetConfig>
  );
}

// ---------- Exported provider ----------

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  if (IS_DEVNET) {
    return <DevProvider>{children}</DevProvider>;
  }
  return <SepoliaProvider>{children}</SepoliaProvider>;
}
