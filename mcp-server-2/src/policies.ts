/**
 * Cartridge Controller session policies for Siege 1v1.
 *
 * Lists every (contract, entrypoint) pair the session is allowed to sign.
 * The user approves this list once in the browser; subsequent calls are
 * silent. Anything not listed here will fail at sign time.
 */

import type { SiegeContracts } from "./config.js";

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

export function buildPolicies(contracts: SiegeContracts, vrfAddress: string): SessionPolicies {
  return {
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
      [contracts.resolution1v1]: {
        methods: [
          m("resolve_round", "Resolve a round once both players have revealed"),
          ...DOJO_METHODS,
        ],
      },
      [vrfAddress]: {
        methods: [m("request_random", "Cartridge VRF — verifiable randomness request")],
      },
    },
  };
}
