"use client";

import { useEffect, useRef } from "react";
import { useDojoSDK } from "@dojoengine/sdk/react";
import type { ToriiQueryBuilder } from "@dojoengine/sdk";
import type { SchemaType } from "@/bindings/typescript/models.gen";

/**
 * Re-run a subscription's seed fetch when the tab becomes visible again.
 *
 * Why this exists (measured 2026-07-26 against the deployed Railway toriis):
 * Railway's edge (hikari) kills an idle streaming response after exactly 300s
 * — h2 streams get RST_STREAM(CANCEL), h1 sockets are terminated. torii's
 * gRPC h2 PING keepalives don't traverse the edge's client connection, so
 * every quiet subscription dies on this timer. @dojoengine/grpc auto
 * -resubscribes, but replays only the last message it had already seen — any
 * event emitted while the stream was down is lost until that entity next
 * changes.
 *
 * This hook closes the gap without reintroducing polling: one extra
 * RetrieveEntities per query at the moment the user comes back to the tab —
 * the exact moment staleness would be visible. Steady-state traffic stays
 * zero. Each subscription entry point pairs itself with a reseed of its own
 * queries.
 */
export function useVisibilityReseed(buildQueries: () => ToriiQueryBuilder<SchemaType>[]) {
  const { sdk, useDojoStore } = useDojoSDK();
  // Select only the action — selecting whole state would re-render this hook
  // on every store write.
  const mergeEntities = useDojoStore((s) => s.mergeEntities);

  // Latest factory without retriggering the effect (queries may close over
  // route params). Synced in an effect — ref writes during render are flagged
  // by the strict react-hooks lint.
  const buildRef = useRef(buildQueries);
  useEffect(() => {
    buildRef.current = buildQueries;
  }, [buildQueries]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      for (const query of buildRef.current()) {
        sdk
          .getEntities({ query })
          .then((res) => mergeEntities(res.getItems()))
          .catch((e: unknown) => {
            console.warn("[useVisibilityReseed] reseed fetch failed:", e);
          });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sdk, mergeEntities]);
}
