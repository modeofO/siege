/**
 * Cartridge Controller session policies for Siege 1v1.
 *
 * Lists every (contract, entrypoint) pair the session is allowed to sign.
 * The user approves this list once in the browser; subsequent calls are
 * silent. Anything not listed here will fail at sign time.
 */

import type { ResourceTokenAddresses, SiegeContracts } from "./config.js";

interface Method {
  name: string;
  entrypoint: string;
  description?: string;
}

interface ContractPolicy {
  methods: Method[];
}

interface SessionPolicies {
  contracts: Record<string, ContractPolicy>;
}

const m = (entrypoint: string, description?: string): Method => ({
  name: entrypoint,
  entrypoint,
  description,
});

const DOJO_METHODS: Method[] = [m("dojo_name"), m("world_dispatcher")];

export function buildPolicies(
  contracts: SiegeContracts,
  vrfAddress: string,
  abilityTokenAddress: string | null = null,
  resourceTokens?: ResourceTokenAddresses,
): SessionPolicies {
  const policies: SessionPolicies = {
    contracts: {
      [contracts.actions1v1]: {
        methods: [
          m("create_match_1v1", "Open a 1v1 arena match between two addresses"),
          ...DOJO_METHODS,
        ],
      },
      [contracts.commitReveal1v1]: {
        methods: [
          m("commit", "Commit a hashed move for the current round"),
          m("reveal", "Reveal the move that was committed"),
          m("force_timeout", "Force timeout once a commit/reveal deadline elapses"),
          ...DOJO_METHODS,
        ],
      },
      [contracts.conquest]: {
        methods: [
          m("set_preset_defense", "Set one preset defense slot for async conquest"),
          m("initiate_conquest", "Attack an adjacent non-home parcel using preset-defense resolution"),
          ...DOJO_METHODS,
        ],
      },
      [contracts.crafting1v1]: {
        methods: [
          m("craft_ability_batch", "Craft T1 abilities (burns ERC-20 resources)"),
          m("craft_ability_tier2_batch", "Craft T2 abilities (burns T1 + ERC-20 resources)"),
          ...DOJO_METHODS,
        ],
      },
      [contracts.resolution1v1]: {
        methods: [
          m("resolve_round", "Resolve a round once both players have revealed"),
          ...DOJO_METHODS,
        ],
      },
      [contracts.worldSystem]: {
        methods: [
          m("register_player", "Register a kingdom and claim three home parcels"),
          m("claim_drip", "Claim resource drip from owned home parcels"),
          m("upgrade_kingdom", "Upgrade kingdom tier after meeting win and resource requirements"),
          m("claim_parcel", "Claim an adjacent parcel after a settled staked-match win"),
          m("create_staked_match", "Create a 1v1 match with ability stakes"),
          m("join_staked_match", "Join a pending staked match with ability stakes"),
          m("cancel_staked_match", "Cancel your own unjoined staked match and refund your stakes"),
          m("settle_match", "Settle a finished staked match and distribute rewards"),
          m("initiate_pillage", "Start pillaging an eligible loser home parcel"),
          m("claim_pillage_drip", "Claim resource drip from an active pillage"),
          m("create_faction", "Create a faction"),
          m("invite_member", "Invite a player to your faction"),
          m("accept_invite", "Accept a faction invite"),
          m("leave_faction", "Leave or dissolve your current faction"),
          m("kick_member", "Kick a member from your faction"),
          m("set_faction_reinforcement", "Toggle faction reinforcement for defending parcels"),
          ...DOJO_METHODS,
        ],
      },
      [vrfAddress]: {
        methods: [m("request_random", "Cartridge VRF — verifiable randomness request")],
      },
    },
  };

  if (abilityTokenAddress) {
    policies.contracts[abilityTokenAddress] = {
      methods: [m("set_approval_for_all", "Approve or revoke world_system as ability-token operator")],
    };
  }

  if (resourceTokens) {
    for (const addr of Object.values(resourceTokens)) {
      policies.contracts[addr] = {
        methods: [m("approve", "Approve crafting contract to spend resource tokens")],
      };
    }
  }

  return policies;
}
