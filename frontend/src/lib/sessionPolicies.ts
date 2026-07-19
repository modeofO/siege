"use client";

import type { SessionPolicies, Method } from "@cartridge/presets";
import { RESOURCE_TOKENS } from "@/lib/useResourceBalances";
import {
  ACTIONS_1V1_ADDRESS,
  COMMIT_REVEAL_1V1_ADDRESS,
  RESOLUTION_1V1_ADDRESS,
  CRAFTING_1V1_ADDRESS,
  WORLD_SYSTEM_ADDRESS,
  CONQUEST_ADDRESS,
  MATCHMAKING_ADDRESS,
  ENTRY_TOKEN_ADDRESSES,
  VRF_PROVIDER_ADDRESS,
} from "@/lib/contractAddresses";
import { ABILITY_TOKEN_ADDRESS } from "@/lib/abilityToken";

// Import addresses only from address-only modules (contractAddresses,
// abilityToken, useResourceBalances). Importing contracts1v1 or craftingContracts
// here would form a cycle: those modules import controllerSession, which imports
// this file — under a strict ESM loader that leaves the address exports
// undefined when this module is first evaluated.

// Session policies must cover every user-signed entrypoint. Existing sessions
// keep their approved policy set until the player reconnects or updates it.
export const SESSION_POLICIES: SessionPolicies = {
  contracts: {
    [ACTIONS_1V1_ADDRESS]: {
      methods: [{ name: "Create 1v1 Match", entrypoint: "create_match_1v1" }],
    },
    [COMMIT_REVEAL_1V1_ADDRESS]: {
      methods: [
        { name: "Commit 1v1", entrypoint: "commit" },
        { name: "Reveal 1v1", entrypoint: "reveal" },
        { name: "Force Timeout", entrypoint: "force_timeout" },
      ],
    },
    [RESOLUTION_1V1_ADDRESS]: {
      methods: [
        { name: "Resolve Round", entrypoint: "resolve_round" },
        // Harmless view call used in the force_timeout VRF sandwich to key the
        // seed to resolution_1v1 (the nested consumer). Must be session-approved
        // like any other call in the multicall, or signing fails.
        { name: "Resolution Dojo Name", entrypoint: "dojo_name" },
      ],
    },
    [VRF_PROVIDER_ADDRESS]: {
      methods: [{ name: "Request Random", entrypoint: "request_random" }],
    },

    [CRAFTING_1V1_ADDRESS]: {
      methods: [
        { name: "Craft Ability", entrypoint: "craft_ability" },
        { name: "Craft Ability (T2)", entrypoint: "craft_ability_tier2" },
        { name: "Craft Ability Batch", entrypoint: "craft_ability_batch" },
        { name: "Craft Ability T2 Batch", entrypoint: "craft_ability_tier2_batch" },
      ],
    },
    ...Object.fromEntries(
      Object.values(RESOURCE_TOKENS).map((addr) => [
        addr,
        {
          methods: [
            // Cartridge requires spender + amount on approve session policies
            // (bare approve entries are deprecated and will be rejected).
            // Resource approvals only ever grant crafting_1v1; amounts are raw
            // integers (no decimals), so this cap is far above any craft cost.
            {
              name: "Approve",
              entrypoint: "approve",
              spender: CRAFTING_1V1_ADDRESS,
              amount: "0xffffffff",
            } as Method,
            { name: "Transfer", entrypoint: "transfer" },
          ],
        },
      ]),
    ),

    [WORLD_SYSTEM_ADDRESS]: {
      methods: [
        { name: "Register Hold", entrypoint: "register_player" },
        { name: "Upgrade Hold", entrypoint: "upgrade_kingdom" },
        { name: "Claim Resource Drip", entrypoint: "claim_drip" },
        { name: "Claim Parcel", entrypoint: "claim_parcel" },
        { name: "Create Staked Match", entrypoint: "create_staked_match" },
        { name: "Join Staked Match", entrypoint: "join_staked_match" },
        { name: "Cancel Staked Match", entrypoint: "cancel_staked_match" },
        { name: "Settle Match", entrypoint: "settle_match" },
        { name: "Initiate Pillage", entrypoint: "initiate_pillage" },
        { name: "Claim Pillage Drip", entrypoint: "claim_pillage_drip" },
        { name: "Create Faction", entrypoint: "create_faction" },
        { name: "Invite Member", entrypoint: "invite_member" },
        { name: "Accept Invite", entrypoint: "accept_invite" },
        { name: "Leave Faction", entrypoint: "leave_faction" },
        { name: "Kick Member", entrypoint: "kick_member" },
        { name: "Toggle Reinforcement", entrypoint: "set_faction_reinforcement" },
        { name: "Set Cosmetic", entrypoint: "set_cosmetic" },
      ],
    },

    [CONQUEST_ADDRESS]: {
      methods: [
        { name: "Set Preset Defense", entrypoint: "set_preset_defense" },
        { name: "Initiate Conquest", entrypoint: "initiate_conquest" },
      ],
    },

    // Pre-migrate the manifest has no matchmaking address — an empty key
    // would break the whole policy object, so add it conditionally.
    ...(MATCHMAKING_ADDRESS
      ? {
          [MATCHMAKING_ADDRESS]: {
            methods: [
              { name: "Find Match", entrypoint: "queue_for_match" },
              { name: "Leave Matchmaking Queue", entrypoint: "leave_queue" },
              { name: "Claim Match Pot", entrypoint: "claim_winnings" },
            ],
          },
          // Entry buy-in approvals, scoped to the matchmaking contract.
          // Cartridge requires spender + amount on approve policies. The cap
          // (2^96-1 ≈ 8e10 tokens at 18 decimals) is far above any buy-in.
          ...Object.fromEntries(
            ENTRY_TOKEN_ADDRESSES.map((addr) => [
              addr,
              {
                methods: [
                  {
                    name: "Approve Entry",
                    entrypoint: "approve",
                    spender: MATCHMAKING_ADDRESS,
                    amount: "0xffffffffffffffffffffffff",
                  } as Method,
                ],
              },
            ]),
          ),
        }
      : {}),

    [ABILITY_TOKEN_ADDRESS]: {
      methods: [{ name: "Approve Ability Operator", entrypoint: "set_approval_for_all" }],
    },
  },
};
