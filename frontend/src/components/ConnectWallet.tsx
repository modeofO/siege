"use client";

import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { useEffect, useState } from "react";

export function ConnectWallet() {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { address } = useAccount();
  const controller = connectors[0] as ControllerConnector;
  const [username, setUsername] = useState<string>();

  useEffect(() => {
    if (!address) return;
    controller.username()?.then(setUsername);
  }, [address, controller]);

  if (address) {
    return (
      <div className="flex items-center gap-3">
        {username && (
          <span className="text-sm text-[#e0e0e8]">{username}</span>
        )}
        <span className="text-xs text-[#6a6a7a]">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button
          onClick={() => controller.controller.openProfile("inventory")}
          className="text-xs px-2 py-1 border border-[#c8a44e]/40 rounded text-[#c8a44e] hover:bg-[#c8a44e]/10 transition-colors"
        >
          Profile
        </button>
        <button
          onClick={() => disconnect()}
          className="text-xs px-2 py-1 border border-[#2a2a3a] rounded text-[#6a6a7a] hover:text-[#ff3344] hover:border-[#ff3344]/40 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: controller })}
      className="text-sm px-4 py-1.5 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors"
    >
      Connect
    </button>
  );
}
