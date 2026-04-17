"use client";

import React, { useEffect, useState } from "react";
import { init, type SDK } from "@dojoengine/sdk";
import { DojoSdkProvider } from "@dojoengine/sdk/react";
import { dojoConfig, TORII_URL, WORLD_ADDRESS, CHAIN_ID } from "./dojoConfig";
import { setupWorld } from "@/bindings/typescript/contracts.gen";
import type { SchemaType } from "@/bindings/typescript/models.gen";

export function DojoProvider({ children }: { children: React.ReactNode }) {
  const [sdk, setSdk] = useState<SDK<SchemaType> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    init<SchemaType>({
      client: {
        worldAddress: WORLD_ADDRESS,
        toriiUrl: TORII_URL,
      },
      domain: {
        name: "siege_dojo",
        version: "1.0",
        chainId: CHAIN_ID,
        revision: "1",
      },
    })
      .then((s) => {
        if (!cancelled) setSdk(s);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[dojo-sdk] init failed:", e);
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#fbb" }}>
        <div style={{ color: "#f88", fontWeight: "bold", marginBottom: 8 }}>Dojo SDK failed to initialize</div>
        <div>{error.message}</div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
          World: {WORLD_ADDRESS}
          <br />
          Torii: {TORII_URL}
        </div>
      </div>
    );
  }

  if (!sdk) {
    return <div style={{ padding: 24, fontFamily: "monospace", color: "#888" }}>Connecting to Torii…</div>;
  }

  return (
    <DojoSdkProvider sdk={sdk} dojoConfig={dojoConfig} clientFn={setupWorld}>
      {children}
    </DojoSdkProvider>
  );
}
