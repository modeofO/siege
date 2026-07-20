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
  // Cartridge requires spender + amount on ERC-20 approve session policies
  // (bare approve entries are deprecated and will be rejected).
  spender?: string;
  amount?: string;
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

  if (contracts.matchmaking) {
    policies.contracts[contracts.matchmaking] = {
      methods: [
        m("queue_for_match", "Join the matchmaking queue (entry buy-in charged on pairing)"),
        m("leave_queue", "Leave the matchmaking queue"),
        m("claim_winnings", "Pay out a finished queue match's entry pot"),
        ...DOJO_METHODS,
      ],
    };
    // Entry buy-in approvals (STRK / ETH / LORDS), scoped to matchmaking.
    // Cartridge requires spender + amount on approve policies, and the amount
    // is SHOWN at session approval — cap at ~20 games worth, not uint-max.
    const entryTokens: Array<[string, string]> = [
      ["0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", "0x1b1ae4d6e2ef500000"], // STRK 500
      ["0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", "0x2386f26fc10000"], // ETH 0.01
      ["0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49", "0x10f0cf064dd59200000"], // LORDS 5000
    ];
    for (const [addr, cap] of entryTokens) {
      const existing = policies.contracts[addr]?.methods ?? [];
      policies.contracts[addr] = {
        methods: [
          ...existing,
          {
            ...m("approve", "Approve matchmaking to pull the entry buy-in"),
            spender: contracts.matchmaking,
            amount: cap,
          },
        ],
      };
    }
  }

  if (abilityTokenAddress) {
    policies.contracts[abilityTokenAddress] = {
      methods: [m("set_approval_for_all", "Approve or revoke world_system as ability-token operator")],
    };
  }

  if (resourceTokens) {
    for (const addr of Object.values(resourceTokens)) {
      policies.contracts[addr] = {
        methods: [
          {
            ...m("approve", "Approve crafting contract to spend resource tokens"),
            // Crafting is the only approve spender; amounts are raw integers
            // (no decimals), so this cap is far above any craft cost.
            spender: contracts.crafting1v1,
            amount: "0xffffffff",
          },
        ],
      };
    }
  }

  return policies;
}
