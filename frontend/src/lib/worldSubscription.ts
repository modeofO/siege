// frontend/src/lib/worldSubscription.ts
"use client";

import { useEntityQuery } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder, KeysClause, MemberClause } from "@dojoengine/sdk";
import { ModelsMapping, type SchemaType } from "@/bindings/typescript/models.gen";

/**
 * Single world-scoped subscription, mirroring `useMatchState1v1`: one place
 * opens the stream, and every world hook reads from the store it populates —
 * no per-hook subscription, no polling.
 *
 * Call this exactly once, from the /world page. The Dojo store is global, so
 * the selector hooks (useWorldParcels, usePlayerFaction, usePresetDefense, …)
 * return empty data on any page that has NOT called this first.
 *
 * PlayerKingdom keeps its own subscription in worldState.ts::usePlayerKingdom
 * because it is also read outside /world.
 *
 * ── Torii query semantics, measured (see frontend/CLAUDE.md "Reads") ──
 *
 *  1. `withEntityModels` is required. Dropping it turns this query into the
 *     whole world — 360 entities across 22 models, including every Commitment
 *     and RoundMoves1v1 row from every match ever played.
 *
 *  2. The KeysClause key binding filters on torii >= 1.8.4 (PR #366) and is
 *     vacuous — matches everything — on <= 1.8.3. Both deployments run
 *     1.8.16, but this hook is deliberately wildcard-keyed either way: it
 *     wants every row of these models (ally shading needs every owner's
 *     faction), and selectors re-filter by address client-side, which is
 *     correct on both behaviors.
 *
 *  3. A model whose key is not the clause key NEVER matches on >= 1.8.4:
 *     PlayerCosmetics (keyed by player) in a match-id-keyed clause silently
 *     returns nothing. Group models by key shape — never ride a differently
 *     keyed model on someone else's clause (see useMatchState1v1).
 *
 *  4. Entity ids collide across models on small integer keys (parcel 5 and
 *     match 5 hash the same). Harmless for reads, but keys alone cannot
 *     isolate a model — the models filter does that.
 */

// The SDK's default pagination limit is 100 AND `useEntityQuery` merges only
// the first page (`processInitialData(page.getItems())` — it never follows
// next_cursor). Past the limit, rows are dropped silently: measured against
// mainnet, the default returns 7 of 96 parcels. The limit therefore has to
// clear the real entity count with room to grow — mainnet sits at 96 parcels
// against that default of 100, and `expand_world` can raise it further.
const WORLD_ENTITY_LIMIT = 10_000;

const WORLD_MODELS = [
  ModelsMapping.Parcel,
  ModelsMapping.Faction,
  ModelsMapping.FactionMember,
  ModelsMapping.FactionInvite,
  ModelsMapping.PresetDefense,
  ModelsMapping.PlayerCosmetics,
  ModelsMapping.ConquestCooldown,
] as const;

export function useWorldSubscription() {
  useEntityQuery(
    new ToriiQueryBuilder<SchemaType>()
      // Wildcard clause: per finding 2 a bound key would not narrow anything,
      // and per finding 3 it could not isolate a model even if it did.
      .withClause(KeysClause<SchemaType>([...WORLD_MODELS], [undefined], "VariableLen").build())
      .withEntityModels([...WORLD_MODELS])
      .withLimit(WORLD_ENTITY_LIMIT)
      .includeHashedKeys(),
  );

  // Live Battles panel: a member-clause subscription instead of a poll.
  // Requires torii >= 1.8.12/1.8.15 (deployed: 1.8.16) — those releases fixed
  // clause matching against BOTH old and new entity state, so a match flipping
  // Active -> Finished is still broadcast and leaves the panel. The seed fetch
  // honors order_by+limit (top 20 by match_id desc; the field must be
  // model-qualified); the stream then pushes every status change, and
  // useActiveBattles re-derives the window client-side. Steady-state Torii
  // traffic on /world is therefore zero.
  useEntityQuery(
    new ToriiQueryBuilder<SchemaType>()
      .withClause(MemberClause(ModelsMapping.MatchState1v1, "status", "Eq", "Active").build())
      .addOrderBy(`${ModelsMapping.MatchState1v1}.match_id`, "Desc")
      .withLimit(20)
      .withEntityModels([ModelsMapping.MatchState1v1])
      .includeHashedKeys(),
  );
}
