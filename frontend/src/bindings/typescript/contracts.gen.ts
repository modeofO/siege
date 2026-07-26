import { DojoProvider, DojoCall } from "@dojoengine/core";
import { Account, AccountInterface, BigNumberish, CairoOption, CairoCustomEnum } from "starknet";
import * as models from "./models.gen";

export function setupWorld(provider: DojoProvider) {
  const build_actions_1v1_createMatch1V1_calldata = (playerA: string, playerB: string): DojoCall => {
    return {
      contractName: "actions_1v1",
      entrypoint: "create_match_1v1",
      calldata: [playerA, playerB],
    };
  };

  const actions_1v1_createMatch1V1 = async (
    snAccount: Account | AccountInterface,
    playerA: string,
    playerB: string,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_actions_1v1_createMatch1V1_calldata(playerA, playerB),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_actions_1v1_createMatch1V1Delegated_calldata = (
    playerA: string,
    playerB: string,
    randomValue: BigNumberish,
  ): DojoCall => {
    return {
      contractName: "actions_1v1",
      entrypoint: "create_match_1v1_delegated",
      calldata: [playerA, playerB, randomValue],
    };
  };

  const actions_1v1_createMatch1V1Delegated = async (
    snAccount: Account | AccountInterface,
    playerA: string,
    playerB: string,
    randomValue: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_actions_1v1_createMatch1V1Delegated_calldata(playerA, playerB, randomValue),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_actions_1v1_getBudget1V1_calldata = (matchId: BigNumberish, isPlayerA: boolean): DojoCall => {
    return {
      contractName: "actions_1v1",
      entrypoint: "get_budget_1v1",
      calldata: [matchId, isPlayerA],
    };
  };

  const actions_1v1_getBudget1V1 = async (matchId: BigNumberish, isPlayerA: boolean) => {
    try {
      return await provider.call("siege_dojo", build_actions_1v1_getBudget1V1_calldata(matchId, isPlayerA));
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_actions_1v1_setAbilityToken_calldata = (abilityToken: string): DojoCall => {
    return {
      contractName: "actions_1v1",
      entrypoint: "set_ability_token",
      calldata: [abilityToken],
    };
  };

  const actions_1v1_setAbilityToken = async (snAccount: Account | AccountInterface, abilityToken: string) => {
    try {
      return await provider.execute(snAccount, build_actions_1v1_setAbilityToken_calldata(abilityToken), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_actions_1v1_setResourceConfig_calldata = (
    iron: string,
    linen: string,
    stone: string,
    wood: string,
    ember: string,
    seeds: string,
  ): DojoCall => {
    return {
      contractName: "actions_1v1",
      entrypoint: "set_resource_config",
      calldata: [iron, linen, stone, wood, ember, seeds],
    };
  };

  const actions_1v1_setResourceConfig = async (
    snAccount: Account | AccountInterface,
    iron: string,
    linen: string,
    stone: string,
    wood: string,
    ember: string,
    seeds: string,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_actions_1v1_setResourceConfig_calldata(iron, linen, stone, wood, ember, seeds),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_actions_1v1_setVrfProvider_calldata = (vrfProvider: string): DojoCall => {
    return {
      contractName: "actions_1v1",
      entrypoint: "set_vrf_provider",
      calldata: [vrfProvider],
    };
  };

  const actions_1v1_setVrfProvider = async (snAccount: Account | AccountInterface, vrfProvider: string) => {
    try {
      return await provider.execute(snAccount, build_actions_1v1_setVrfProvider_calldata(vrfProvider), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_commit_reveal_1v1_commit_calldata = (matchId: BigNumberish, commitment: BigNumberish): DojoCall => {
    return {
      contractName: "commit_reveal_1v1",
      entrypoint: "commit",
      calldata: [matchId, commitment],
    };
  };

  const commit_reveal_1v1_commit = async (
    snAccount: Account | AccountInterface,
    matchId: BigNumberish,
    commitment: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_commit_reveal_1v1_commit_calldata(matchId, commitment),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_commit_reveal_1v1_forceTimeout_calldata = (matchId: BigNumberish): DojoCall => {
    return {
      contractName: "commit_reveal_1v1",
      entrypoint: "force_timeout",
      calldata: [matchId],
    };
  };

  const commit_reveal_1v1_forceTimeout = async (snAccount: Account | AccountInterface, matchId: BigNumberish) => {
    try {
      return await provider.execute(snAccount, build_commit_reveal_1v1_forceTimeout_calldata(matchId), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_commit_reveal_1v1_reveal_calldata = (
    matchId: BigNumberish,
    salt: BigNumberish,
    p0: BigNumberish,
    p1: BigNumberish,
    p2: BigNumberish,
    g0: BigNumberish,
    g1: BigNumberish,
    g2: BigNumberish,
    repair: BigNumberish,
    nc0: BigNumberish,
    nc1: BigNumberish,
    nc2: BigNumberish,
    trap0: BigNumberish,
    trap1: BigNumberish,
    trap2: BigNumberish,
    abilityId: BigNumberish,
    abilityTarget: BigNumberish,
  ): DojoCall => {
    return {
      contractName: "commit_reveal_1v1",
      entrypoint: "reveal",
      calldata: [
        matchId,
        salt,
        p0,
        p1,
        p2,
        g0,
        g1,
        g2,
        repair,
        nc0,
        nc1,
        nc2,
        trap0,
        trap1,
        trap2,
        abilityId,
        abilityTarget,
      ],
    };
  };

  const commit_reveal_1v1_reveal = async (
    snAccount: Account | AccountInterface,
    matchId: BigNumberish,
    salt: BigNumberish,
    p0: BigNumberish,
    p1: BigNumberish,
    p2: BigNumberish,
    g0: BigNumberish,
    g1: BigNumberish,
    g2: BigNumberish,
    repair: BigNumberish,
    nc0: BigNumberish,
    nc1: BigNumberish,
    nc2: BigNumberish,
    trap0: BigNumberish,
    trap1: BigNumberish,
    trap2: BigNumberish,
    abilityId: BigNumberish,
    abilityTarget: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_commit_reveal_1v1_reveal_calldata(
          matchId,
          salt,
          p0,
          p1,
          p2,
          g0,
          g1,
          g2,
          repair,
          nc0,
          nc1,
          nc2,
          trap0,
          trap1,
          trap2,
          abilityId,
          abilityTarget,
        ),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_conquest_initiateConquest_calldata = (
    targetParcel: BigNumberish,
    p0: BigNumberish,
    p1: BigNumberish,
    p2: BigNumberish,
    g0: BigNumberish,
    g1: BigNumberish,
    g2: BigNumberish,
    abilityId: BigNumberish,
    abilityTarget: BigNumberish,
  ): DojoCall => {
    return {
      contractName: "conquest",
      entrypoint: "initiate_conquest",
      calldata: [targetParcel, p0, p1, p2, g0, g1, g2, abilityId, abilityTarget],
    };
  };

  const conquest_initiateConquest = async (
    snAccount: Account | AccountInterface,
    targetParcel: BigNumberish,
    p0: BigNumberish,
    p1: BigNumberish,
    p2: BigNumberish,
    g0: BigNumberish,
    g1: BigNumberish,
    g2: BigNumberish,
    abilityId: BigNumberish,
    abilityTarget: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_conquest_initiateConquest_calldata(targetParcel, p0, p1, p2, g0, g1, g2, abilityId, abilityTarget),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_conquest_onErc1155BatchReceived_calldata = (
    operator: string,
    from: string,
    tokenIds: Array<BigNumberish>,
    values: Array<BigNumberish>,
    data: Array<BigNumberish>,
  ): DojoCall => {
    return {
      contractName: "conquest",
      entrypoint: "on_erc1155_batch_received",
      calldata: [operator, from, tokenIds, values, data],
    };
  };

  const conquest_onErc1155BatchReceived = async (
    operator: string,
    from: string,
    tokenIds: Array<BigNumberish>,
    values: Array<BigNumberish>,
    data: Array<BigNumberish>,
  ) => {
    try {
      return await provider.call(
        "siege_dojo",
        build_conquest_onErc1155BatchReceived_calldata(operator, from, tokenIds, values, data),
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_conquest_onErc1155Received_calldata = (
    operator: string,
    from: string,
    tokenId: BigNumberish,
    value: BigNumberish,
    data: Array<BigNumberish>,
  ): DojoCall => {
    return {
      contractName: "conquest",
      entrypoint: "on_erc1155_received",
      calldata: [operator, from, tokenId, value, data],
    };
  };

  const conquest_onErc1155Received = async (
    operator: string,
    from: string,
    tokenId: BigNumberish,
    value: BigNumberish,
    data: Array<BigNumberish>,
  ) => {
    try {
      return await provider.call(
        "siege_dojo",
        build_conquest_onErc1155Received_calldata(operator, from, tokenId, value, data),
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_conquest_setPresetDefense_calldata = (
    index: BigNumberish,
    p0: BigNumberish,
    p1: BigNumberish,
    p2: BigNumberish,
    g0: BigNumberish,
    g1: BigNumberish,
    g2: BigNumberish,
  ): DojoCall => {
    return {
      contractName: "conquest",
      entrypoint: "set_preset_defense",
      calldata: [index, p0, p1, p2, g0, g1, g2],
    };
  };

  const conquest_setPresetDefense = async (
    snAccount: Account | AccountInterface,
    index: BigNumberish,
    p0: BigNumberish,
    p1: BigNumberish,
    p2: BigNumberish,
    g0: BigNumberish,
    g1: BigNumberish,
    g2: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_conquest_setPresetDefense_calldata(index, p0, p1, p2, g0, g1, g2),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_conquest_supportsInterface_calldata = (interfaceId: BigNumberish): DojoCall => {
    return {
      contractName: "conquest",
      entrypoint: "supports_interface",
      calldata: [interfaceId],
    };
  };

  const conquest_supportsInterface = async (interfaceId: BigNumberish) => {
    try {
      return await provider.call("siege_dojo", build_conquest_supportsInterface_calldata(interfaceId));
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_crafting_1v1_craftAbility_calldata = (abilityId: BigNumberish): DojoCall => {
    return {
      contractName: "crafting_1v1",
      entrypoint: "craft_ability",
      calldata: [abilityId],
    };
  };

  const crafting_1v1_craftAbility = async (snAccount: Account | AccountInterface, abilityId: BigNumberish) => {
    try {
      return await provider.execute(snAccount, build_crafting_1v1_craftAbility_calldata(abilityId), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_crafting_1v1_craftAbilityBatch_calldata = (abilityId: BigNumberish, quantity: BigNumberish): DojoCall => {
    return {
      contractName: "crafting_1v1",
      entrypoint: "craft_ability_batch",
      calldata: [abilityId, quantity],
    };
  };

  const crafting_1v1_craftAbilityBatch = async (
    snAccount: Account | AccountInterface,
    abilityId: BigNumberish,
    quantity: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_crafting_1v1_craftAbilityBatch_calldata(abilityId, quantity),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_crafting_1v1_craftAbilityTier2_calldata = (abilityType: BigNumberish): DojoCall => {
    return {
      contractName: "crafting_1v1",
      entrypoint: "craft_ability_tier2",
      calldata: [abilityType],
    };
  };

  const crafting_1v1_craftAbilityTier2 = async (snAccount: Account | AccountInterface, abilityType: BigNumberish) => {
    try {
      return await provider.execute(
        snAccount,
        build_crafting_1v1_craftAbilityTier2_calldata(abilityType),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_crafting_1v1_craftAbilityTier2Batch_calldata = (
    abilityType: BigNumberish,
    quantity: BigNumberish,
  ): DojoCall => {
    return {
      contractName: "crafting_1v1",
      entrypoint: "craft_ability_tier2_batch",
      calldata: [abilityType, quantity],
    };
  };

  const crafting_1v1_craftAbilityTier2Batch = async (
    snAccount: Account | AccountInterface,
    abilityType: BigNumberish,
    quantity: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_crafting_1v1_craftAbilityTier2Batch_calldata(abilityType, quantity),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_matchmaking_claimWinnings_calldata = (matchId: BigNumberish): DojoCall => {
    return {
      contractName: "matchmaking",
      entrypoint: "claim_winnings",
      calldata: [matchId],
    };
  };

  const matchmaking_claimWinnings = async (snAccount: Account | AccountInterface, matchId: BigNumberish) => {
    try {
      return await provider.execute(snAccount, build_matchmaking_claimWinnings_calldata(matchId), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_matchmaking_leaveQueue_calldata = (): DojoCall => {
    return {
      contractName: "matchmaking",
      entrypoint: "leave_queue",
      calldata: [],
    };
  };

  const matchmaking_leaveQueue = async (snAccount: Account | AccountInterface) => {
    try {
      return await provider.execute(snAccount, build_matchmaking_leaveQueue_calldata(), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_matchmaking_queueForMatch_calldata = (token: string, abilities: Array<BigNumberish>): DojoCall => {
    return {
      contractName: "matchmaking",
      entrypoint: "queue_for_match",
      calldata: [token, abilities],
    };
  };

  const matchmaking_queueForMatch = async (
    snAccount: Account | AccountInterface,
    token: string,
    abilities: Array<BigNumberish>,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_matchmaking_queueForMatch_calldata(token, abilities),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_matchmaking_setEntryConfig_calldata = (winnerBps: BigNumberish, treasury: string): DojoCall => {
    return {
      contractName: "matchmaking",
      entrypoint: "set_entry_config",
      calldata: [winnerBps, treasury],
    };
  };

  const matchmaking_setEntryConfig = async (
    snAccount: Account | AccountInterface,
    winnerBps: BigNumberish,
    treasury: string,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_matchmaking_setEntryConfig_calldata(winnerBps, treasury),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_matchmaking_setEntryToken_calldata = (
    token: string,
    amount: BigNumberish,
    enabled: boolean,
  ): DojoCall => {
    return {
      contractName: "matchmaking",
      entrypoint: "set_entry_token",
      calldata: [token, amount, enabled],
    };
  };

  const matchmaking_setEntryToken = async (
    snAccount: Account | AccountInterface,
    token: string,
    amount: BigNumberish,
    enabled: boolean,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_matchmaking_setEntryToken_calldata(token, amount, enabled),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_resolution_1v1_resolveRound_calldata = (matchId: BigNumberish): DojoCall => {
    return {
      contractName: "resolution_1v1",
      entrypoint: "resolve_round",
      calldata: [matchId],
    };
  };

  const resolution_1v1_resolveRound = async (snAccount: Account | AccountInterface, matchId: BigNumberish) => {
    try {
      return await provider.execute(snAccount, build_resolution_1v1_resolveRound_calldata(matchId), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_acceptInvite_calldata = (factionId: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "accept_invite",
      calldata: [factionId],
    };
  };

  const world_system_acceptInvite = async (snAccount: Account | AccountInterface, factionId: BigNumberish) => {
    try {
      return await provider.execute(snAccount, build_world_system_acceptInvite_calldata(factionId), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_cancelStakedMatch_calldata = (matchId: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "cancel_staked_match",
      calldata: [matchId],
    };
  };

  const world_system_cancelStakedMatch = async (snAccount: Account | AccountInterface, matchId: BigNumberish) => {
    try {
      return await provider.execute(snAccount, build_world_system_cancelStakedMatch_calldata(matchId), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_claimDrip_calldata = (): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "claim_drip",
      calldata: [],
    };
  };

  const world_system_claimDrip = async (snAccount: Account | AccountInterface) => {
    try {
      return await provider.execute(snAccount, build_world_system_claimDrip_calldata(), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_claimParcel_calldata = (
    matchId: BigNumberish,
    parcelId: BigNumberish,
    parcelType: BigNumberish,
  ): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "claim_parcel",
      calldata: [matchId, parcelId, parcelType],
    };
  };

  const world_system_claimParcel = async (
    snAccount: Account | AccountInterface,
    matchId: BigNumberish,
    parcelId: BigNumberish,
    parcelType: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_world_system_claimParcel_calldata(matchId, parcelId, parcelType),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_claimPillageDrip_calldata = (homeParcelId: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "claim_pillage_drip",
      calldata: [homeParcelId],
    };
  };

  const world_system_claimPillageDrip = async (snAccount: Account | AccountInterface, homeParcelId: BigNumberish) => {
    try {
      return await provider.execute(
        snAccount,
        build_world_system_claimPillageDrip_calldata(homeParcelId),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_createFaction_calldata = (name: BigNumberish, tag: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "create_faction",
      calldata: [name, tag],
    };
  };

  const world_system_createFaction = async (
    snAccount: Account | AccountInterface,
    name: BigNumberish,
    tag: BigNumberish,
  ) => {
    try {
      return await provider.execute(snAccount, build_world_system_createFaction_calldata(name, tag), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_createStakedMatch_calldata = (
    opponent: string,
    abilities: Array<BigNumberish>,
  ): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "create_staked_match",
      calldata: [opponent, abilities],
    };
  };

  const world_system_createStakedMatch = async (
    snAccount: Account | AccountInterface,
    opponent: string,
    abilities: Array<BigNumberish>,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_world_system_createStakedMatch_calldata(opponent, abilities),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_expandWorld_calldata = (newCols: BigNumberish, newRows: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "expand_world",
      calldata: [newCols, newRows],
    };
  };

  const world_system_expandWorld = async (
    snAccount: Account | AccountInterface,
    newCols: BigNumberish,
    newRows: BigNumberish,
  ) => {
    try {
      return await provider.execute(snAccount, build_world_system_expandWorld_calldata(newCols, newRows), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_initializeWorld_calldata = (
    cols: Array<BigNumberish>,
    rows: Array<BigNumberish>,
  ): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "initialize_world",
      calldata: [cols, rows],
    };
  };

  const world_system_initializeWorld = async (
    snAccount: Account | AccountInterface,
    cols: Array<BigNumberish>,
    rows: Array<BigNumberish>,
  ) => {
    try {
      return await provider.execute(snAccount, build_world_system_initializeWorld_calldata(cols, rows), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_initiatePillage_calldata = (matchId: BigNumberish, homeParcelId: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "initiate_pillage",
      calldata: [matchId, homeParcelId],
    };
  };

  const world_system_initiatePillage = async (
    snAccount: Account | AccountInterface,
    matchId: BigNumberish,
    homeParcelId: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_world_system_initiatePillage_calldata(matchId, homeParcelId),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_inviteMember_calldata = (target: string): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "invite_member",
      calldata: [target],
    };
  };

  const world_system_inviteMember = async (snAccount: Account | AccountInterface, target: string) => {
    try {
      return await provider.execute(snAccount, build_world_system_inviteMember_calldata(target), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_joinStakedMatch_calldata = (
    matchId: BigNumberish,
    abilities: Array<BigNumberish>,
  ): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "join_staked_match",
      calldata: [matchId, abilities],
    };
  };

  const world_system_joinStakedMatch = async (
    snAccount: Account | AccountInterface,
    matchId: BigNumberish,
    abilities: Array<BigNumberish>,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_world_system_joinStakedMatch_calldata(matchId, abilities),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_kickMember_calldata = (target: string): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "kick_member",
      calldata: [target],
    };
  };

  const world_system_kickMember = async (snAccount: Account | AccountInterface, target: string) => {
    try {
      return await provider.execute(snAccount, build_world_system_kickMember_calldata(target), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_leaveFaction_calldata = (): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "leave_faction",
      calldata: [],
    };
  };

  const world_system_leaveFaction = async (snAccount: Account | AccountInterface) => {
    try {
      return await provider.execute(snAccount, build_world_system_leaveFaction_calldata(), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_onErc1155BatchReceived_calldata = (
    operator: string,
    from: string,
    tokenIds: Array<BigNumberish>,
    values: Array<BigNumberish>,
    data: Array<BigNumberish>,
  ): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "on_erc1155_batch_received",
      calldata: [operator, from, tokenIds, values, data],
    };
  };

  const world_system_onErc1155BatchReceived = async (
    operator: string,
    from: string,
    tokenIds: Array<BigNumberish>,
    values: Array<BigNumberish>,
    data: Array<BigNumberish>,
  ) => {
    try {
      return await provider.call(
        "siege_dojo",
        build_world_system_onErc1155BatchReceived_calldata(operator, from, tokenIds, values, data),
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_onErc1155Received_calldata = (
    operator: string,
    from: string,
    tokenId: BigNumberish,
    value: BigNumberish,
    data: Array<BigNumberish>,
  ): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "on_erc1155_received",
      calldata: [operator, from, tokenId, value, data],
    };
  };

  const world_system_onErc1155Received = async (
    operator: string,
    from: string,
    tokenId: BigNumberish,
    value: BigNumberish,
    data: Array<BigNumberish>,
  ) => {
    try {
      return await provider.call(
        "siege_dojo",
        build_world_system_onErc1155Received_calldata(operator, from, tokenId, value, data),
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_registerPlayer_calldata = (homeTypes: Array<BigNumberish>): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "register_player",
      calldata: [homeTypes],
    };
  };

  const world_system_registerPlayer = async (snAccount: Account | AccountInterface, homeTypes: Array<BigNumberish>) => {
    try {
      return await provider.execute(snAccount, build_world_system_registerPlayer_calldata(homeTypes), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_setAbilityToken_calldata = (abilityToken: string): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "set_ability_token",
      calldata: [abilityToken],
    };
  };

  const world_system_setAbilityToken = async (snAccount: Account | AccountInterface, abilityToken: string) => {
    try {
      return await provider.execute(snAccount, build_world_system_setAbilityToken_calldata(abilityToken), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_setCosmetic_calldata = (cosmeticType: BigNumberish, circuitKey: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "set_cosmetic",
      calldata: [cosmeticType, circuitKey],
    };
  };

  const world_system_setCosmetic = async (
    snAccount: Account | AccountInterface,
    cosmeticType: BigNumberish,
    circuitKey: BigNumberish,
  ) => {
    try {
      return await provider.execute(
        snAccount,
        build_world_system_setCosmetic_calldata(cosmeticType, circuitKey),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_setFactionReinforcement_calldata = (enabled: boolean): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "set_faction_reinforcement",
      calldata: [enabled],
    };
  };

  const world_system_setFactionReinforcement = async (snAccount: Account | AccountInterface, enabled: boolean) => {
    try {
      return await provider.execute(
        snAccount,
        build_world_system_setFactionReinforcement_calldata(enabled),
        "siege_dojo",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_settleMatch_calldata = (matchId: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "settle_match",
      calldata: [matchId],
    };
  };

  const world_system_settleMatch = async (snAccount: Account | AccountInterface, matchId: BigNumberish) => {
    try {
      return await provider.execute(snAccount, build_world_system_settleMatch_calldata(matchId), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_supportsInterface_calldata = (interfaceId: BigNumberish): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "supports_interface",
      calldata: [interfaceId],
    };
  };

  const world_system_supportsInterface = async (interfaceId: BigNumberish) => {
    try {
      return await provider.call("siege_dojo", build_world_system_supportsInterface_calldata(interfaceId));
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const build_world_system_upgradeKingdom_calldata = (): DojoCall => {
    return {
      contractName: "world_system",
      entrypoint: "upgrade_kingdom",
      calldata: [],
    };
  };

  const world_system_upgradeKingdom = async (snAccount: Account | AccountInterface) => {
    try {
      return await provider.execute(snAccount, build_world_system_upgradeKingdom_calldata(), "siege_dojo");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  return {
    actions_1v1: {
      createMatch1V1: actions_1v1_createMatch1V1,
      buildCreateMatch1V1Calldata: build_actions_1v1_createMatch1V1_calldata,
      createMatch1V1Delegated: actions_1v1_createMatch1V1Delegated,
      buildCreateMatch1V1DelegatedCalldata: build_actions_1v1_createMatch1V1Delegated_calldata,
      getBudget1V1: actions_1v1_getBudget1V1,
      buildGetBudget1V1Calldata: build_actions_1v1_getBudget1V1_calldata,
      setAbilityToken: actions_1v1_setAbilityToken,
      buildSetAbilityTokenCalldata: build_actions_1v1_setAbilityToken_calldata,
      setResourceConfig: actions_1v1_setResourceConfig,
      buildSetResourceConfigCalldata: build_actions_1v1_setResourceConfig_calldata,
      setVrfProvider: actions_1v1_setVrfProvider,
      buildSetVrfProviderCalldata: build_actions_1v1_setVrfProvider_calldata,
    },
    commit_reveal_1v1: {
      commit: commit_reveal_1v1_commit,
      buildCommitCalldata: build_commit_reveal_1v1_commit_calldata,
      forceTimeout: commit_reveal_1v1_forceTimeout,
      buildForceTimeoutCalldata: build_commit_reveal_1v1_forceTimeout_calldata,
      reveal: commit_reveal_1v1_reveal,
      buildRevealCalldata: build_commit_reveal_1v1_reveal_calldata,
    },
    conquest: {
      initiateConquest: conquest_initiateConquest,
      buildInitiateConquestCalldata: build_conquest_initiateConquest_calldata,
      onErc1155BatchReceived: conquest_onErc1155BatchReceived,
      buildOnErc1155BatchReceivedCalldata: build_conquest_onErc1155BatchReceived_calldata,
      onErc1155Received: conquest_onErc1155Received,
      buildOnErc1155ReceivedCalldata: build_conquest_onErc1155Received_calldata,
      setPresetDefense: conquest_setPresetDefense,
      buildSetPresetDefenseCalldata: build_conquest_setPresetDefense_calldata,
      supportsInterface: conquest_supportsInterface,
      buildSupportsInterfaceCalldata: build_conquest_supportsInterface_calldata,
    },
    crafting_1v1: {
      craftAbility: crafting_1v1_craftAbility,
      buildCraftAbilityCalldata: build_crafting_1v1_craftAbility_calldata,
      craftAbilityBatch: crafting_1v1_craftAbilityBatch,
      buildCraftAbilityBatchCalldata: build_crafting_1v1_craftAbilityBatch_calldata,
      craftAbilityTier2: crafting_1v1_craftAbilityTier2,
      buildCraftAbilityTier2Calldata: build_crafting_1v1_craftAbilityTier2_calldata,
      craftAbilityTier2Batch: crafting_1v1_craftAbilityTier2Batch,
      buildCraftAbilityTier2BatchCalldata: build_crafting_1v1_craftAbilityTier2Batch_calldata,
    },
    matchmaking: {
      claimWinnings: matchmaking_claimWinnings,
      buildClaimWinningsCalldata: build_matchmaking_claimWinnings_calldata,
      leaveQueue: matchmaking_leaveQueue,
      buildLeaveQueueCalldata: build_matchmaking_leaveQueue_calldata,
      queueForMatch: matchmaking_queueForMatch,
      buildQueueForMatchCalldata: build_matchmaking_queueForMatch_calldata,
      setEntryConfig: matchmaking_setEntryConfig,
      buildSetEntryConfigCalldata: build_matchmaking_setEntryConfig_calldata,
      setEntryToken: matchmaking_setEntryToken,
      buildSetEntryTokenCalldata: build_matchmaking_setEntryToken_calldata,
    },
    resolution_1v1: {
      resolveRound: resolution_1v1_resolveRound,
      buildResolveRoundCalldata: build_resolution_1v1_resolveRound_calldata,
    },
    world_system: {
      acceptInvite: world_system_acceptInvite,
      buildAcceptInviteCalldata: build_world_system_acceptInvite_calldata,
      cancelStakedMatch: world_system_cancelStakedMatch,
      buildCancelStakedMatchCalldata: build_world_system_cancelStakedMatch_calldata,
      claimDrip: world_system_claimDrip,
      buildClaimDripCalldata: build_world_system_claimDrip_calldata,
      claimParcel: world_system_claimParcel,
      buildClaimParcelCalldata: build_world_system_claimParcel_calldata,
      claimPillageDrip: world_system_claimPillageDrip,
      buildClaimPillageDripCalldata: build_world_system_claimPillageDrip_calldata,
      createFaction: world_system_createFaction,
      buildCreateFactionCalldata: build_world_system_createFaction_calldata,
      createStakedMatch: world_system_createStakedMatch,
      buildCreateStakedMatchCalldata: build_world_system_createStakedMatch_calldata,
      expandWorld: world_system_expandWorld,
      buildExpandWorldCalldata: build_world_system_expandWorld_calldata,
      initializeWorld: world_system_initializeWorld,
      buildInitializeWorldCalldata: build_world_system_initializeWorld_calldata,
      initiatePillage: world_system_initiatePillage,
      buildInitiatePillageCalldata: build_world_system_initiatePillage_calldata,
      inviteMember: world_system_inviteMember,
      buildInviteMemberCalldata: build_world_system_inviteMember_calldata,
      joinStakedMatch: world_system_joinStakedMatch,
      buildJoinStakedMatchCalldata: build_world_system_joinStakedMatch_calldata,
      kickMember: world_system_kickMember,
      buildKickMemberCalldata: build_world_system_kickMember_calldata,
      leaveFaction: world_system_leaveFaction,
      buildLeaveFactionCalldata: build_world_system_leaveFaction_calldata,
      onErc1155BatchReceived: world_system_onErc1155BatchReceived,
      buildOnErc1155BatchReceivedCalldata: build_world_system_onErc1155BatchReceived_calldata,
      onErc1155Received: world_system_onErc1155Received,
      buildOnErc1155ReceivedCalldata: build_world_system_onErc1155Received_calldata,
      registerPlayer: world_system_registerPlayer,
      buildRegisterPlayerCalldata: build_world_system_registerPlayer_calldata,
      setAbilityToken: world_system_setAbilityToken,
      buildSetAbilityTokenCalldata: build_world_system_setAbilityToken_calldata,
      setCosmetic: world_system_setCosmetic,
      buildSetCosmeticCalldata: build_world_system_setCosmetic_calldata,
      setFactionReinforcement: world_system_setFactionReinforcement,
      buildSetFactionReinforcementCalldata: build_world_system_setFactionReinforcement_calldata,
      settleMatch: world_system_settleMatch,
      buildSettleMatchCalldata: build_world_system_settleMatch_calldata,
      supportsInterface: world_system_supportsInterface,
      buildSupportsInterfaceCalldata: build_world_system_supportsInterface_calldata,
      upgradeKingdom: world_system_upgradeKingdom,
      buildUpgradeKingdomCalldata: build_world_system_upgradeKingdom_calldata,
    },
  };
}
