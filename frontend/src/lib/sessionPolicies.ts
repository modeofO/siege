"use client";

import type { SessionPolicies, Method } from "@cartridge/presets";
import { CONTRACTS_1V1, VRF_PROVIDER_ADDRESS } from "@/lib/contracts1v1";
import { CRAFTING_1V1_ADDRESS } from "@/lib/craftingContracts";
import { RESOURCE_TOKENS } from "@/lib/useResourceBalances";
import { WORLD_SYSTEM_ADDRESS, CONQUEST_ADDRESS } from "@/lib/contractAddresses";
import { ABILITY_TOKEN_ADDRESS } from "@/lib/abilityToken";

// Session policies must cover every user-signed entrypoint. Existing sessions
// keep their approved policy set until the player reconnects or updates it.
export const SESSION_POLICIES: SessionPolicies = {
  contracts: {
    [CONTRACTS_1V1.ACTIONS]: {
      methods: [{ name: "Create 1v1 Match", entrypoint: "create_match_1v1" }],
    },
    [CONTRACTS_1V1.COMMIT_REVEAL]: {
      methods: [
        { name: "Commit 1v1", entrypoint: "commit" },
        { name: "Reveal 1v1", entrypoint: "reveal" },
        { name: "Force Timeout", entrypoint: "force_timeout" },
      ],
    },
    [CONTRACTS_1V1.RESOLUTION]: {
      methods: [{ name: "Resolve Round", entrypoint: "resolve_round" }],
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

    [ABILITY_TOKEN_ADDRESS]: {
      methods: [{ name: "Approve Ability Operator", entrypoint: "set_approval_for_all" }],
    },
  },
};
