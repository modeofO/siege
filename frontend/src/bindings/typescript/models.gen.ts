import type { SchemaType as ISchemaType } from "@dojoengine/sdk";

import { CairoCustomEnum, BigNumberish } from 'starknet';

// Type definition for `siege_dojo::models::commitment::Commitment` struct
export interface Commitment {
	match_id: BigNumberish;
	round: BigNumberish;
	role: BigNumberish;
	hash: BigNumberish;
	committed: boolean;
	revealed: boolean;
}

// Type definition for `siege_dojo::models::faction::Faction` struct
export interface Faction {
	faction_id: BigNumberish;
	leader: string;
	name: BigNumberish;
	tag: BigNumberish;
	member_count: BigNumberish;
	created_at: BigNumberish;
	dissolved: boolean;
}

// Type definition for `siege_dojo::models::faction::FactionCounter` struct
export interface FactionCounter {
	id: BigNumberish;
	count: BigNumberish;
}

// Type definition for `siege_dojo::models::faction_invite::FactionInvite` struct
export interface FactionInvite {
	target: string;
	faction_id: BigNumberish;
	invited_by: string;
	invited_at: BigNumberish;
	used: boolean;
}

// Type definition for `siege_dojo::models::faction_member::FactionMember` struct
export interface FactionMember {
	player: string;
	faction_id: BigNumberish;
	joined_at: BigNumberish;
	last_leave_time: BigNumberish;
}

// Type definition for `siege_dojo::models::match_abilities_1v1::MatchAbilities1v1` struct
export interface MatchAbilities1v1 {
	match_id: BigNumberish;
	a_ability_1: BigNumberish;
	a_ability_2: BigNumberish;
	a_ability_3: BigNumberish;
	b_ability_1: BigNumberish;
	b_ability_2: BigNumberish;
	b_ability_3: BigNumberish;
	a_used_1: boolean;
	a_used_2: boolean;
	a_used_3: boolean;
	b_used_1: boolean;
	b_used_2: boolean;
	b_used_3: boolean;
}

// Type definition for `siege_dojo::models::match_counter::MatchCounter` struct
export interface MatchCounter {
	id: BigNumberish;
	count: BigNumberish;
}

// Type definition for `siege_dojo::models::match_record::MatchRecord` struct
export interface MatchRecord {
	player: string;
	opponent: string;
	wins: BigNumberish;
	losses: BigNumberish;
	last_match_id: BigNumberish;
}

// Type definition for `siege_dojo::models::match_stakes_1v1::MatchStakes1v1` struct
export interface MatchStakes1v1 {
	match_id: BigNumberish;
	a_stake_1: BigNumberish;
	a_stake_2: BigNumberish;
	a_stake_3: BigNumberish;
	b_stake_1: BigNumberish;
	b_stake_2: BigNumberish;
	b_stake_3: BigNumberish;
	stake_count: BigNumberish;
	settled: boolean;
}

// Type definition for `siege_dojo::models::match_state::MatchState` struct
export interface MatchState {
	match_id: BigNumberish;
	team_a_attacker: string;
	team_a_defender: string;
	team_b_attacker: string;
	team_b_defender: string;
	vault_a_hp: BigNumberish;
	vault_b_hp: BigNumberish;
	current_round: BigNumberish;
	status: MatchStatusEnum;
}

// Type definition for `siege_dojo::models::match_state_1v1::MatchState1v1` struct
export interface MatchState1v1 {
	match_id: BigNumberish;
	player_a: string;
	player_b: string;
	vault_a_hp: BigNumberish;
	vault_b_hp: BigNumberish;
	current_round: BigNumberish;
	status: MatchStatusEnum;
}

// Type definition for `siege_dojo::models::node_state::NodeState` struct
export interface NodeState {
	match_id: BigNumberish;
	node_index: BigNumberish;
	owner: NodeOwnerEnum;
}

// Type definition for `siege_dojo::models::parcel::Parcel` struct
export interface Parcel {
	parcel_id: BigNumberish;
	col: BigNumberish;
	row: BigNumberish;
	parcel_type: BigNumberish;
	owner: string;
	is_home: boolean;
}

// Type definition for `siege_dojo::models::pillage::Pillage` struct
export interface Pillage {
	home_parcel_id: BigNumberish;
	pillager: string;
	target: string;
	start_time: BigNumberish;
	expires_at: BigNumberish;
	last_claim_time: BigNumberish;
	active: boolean;
}

// Type definition for `siege_dojo::models::pillage_eligibility::PillageEligibility` struct
export interface PillageEligibility {
	winner: string;
	match_id: BigNumberish;
	loser: string;
	granted_at: BigNumberish;
	expires_at: BigNumberish;
	used: boolean;
}

// Type definition for `siege_dojo::models::player_kingdom::PlayerKingdom` struct
export interface PlayerKingdom {
	player: string;
	home_0: BigNumberish;
	home_1: BigNumberish;
	home_2: BigNumberish;
	parcel_count: BigNumberish;
	registered: boolean;
	free_craft_used: boolean;
	last_drip_time: BigNumberish;
	tier: BigNumberish;
	total_wins: BigNumberish;
	faction_reinforcement_enabled: boolean;
}

// Type definition for `siege_dojo::models::player_reputation::PlayerReputation` struct
export interface PlayerReputation {
	player: string;
	total_losses: BigNumberish;
	current_streak: BigNumberish;
	best_streak: BigNumberish;
	bracket: BigNumberish;
}

// Type definition for `siege_dojo::models::preset_defense::PresetDefense` struct
export interface PresetDefense {
	player: string;
	p0_p0: BigNumberish;
	p0_p1: BigNumberish;
	p0_p2: BigNumberish;
	p0_g0: BigNumberish;
	p0_g1: BigNumberish;
	p0_g2: BigNumberish;
	p1_p0: BigNumberish;
	p1_p1: BigNumberish;
	p1_p2: BigNumberish;
	p1_g0: BigNumberish;
	p1_g1: BigNumberish;
	p1_g2: BigNumberish;
	p2_p0: BigNumberish;
	p2_p1: BigNumberish;
	p2_p2: BigNumberish;
	p2_g0: BigNumberish;
	p2_g1: BigNumberish;
	p2_g2: BigNumberish;
	p3_p0: BigNumberish;
	p3_p1: BigNumberish;
	p3_p2: BigNumberish;
	p3_g0: BigNumberish;
	p3_g1: BigNumberish;
	p3_g2: BigNumberish;
	preset_count: BigNumberish;
}

// Type definition for `siege_dojo::models::resource_config::ResourceConfig` struct
export interface ResourceConfig {
	id: BigNumberish;
	iron: string;
	linen: string;
	stone: string;
	wood: string;
	ember: string;
	seeds: string;
	ability_token: string;
	vrf_provider: string;
}

// Type definition for `siege_dojo::models::round_modifiers_1v1::RoundModifiers1v1` struct
export interface RoundModifiers1v1 {
	match_id: BigNumberish;
	round: BigNumberish;
	gate_0: BigNumberish;
	gate_1: BigNumberish;
	gate_2: BigNumberish;
}

// Type definition for `siege_dojo::models::round_moves::RoundMoves` struct
export interface RoundMoves {
	match_id: BigNumberish;
	round: BigNumberish;
	commit_count: BigNumberish;
	reveal_count: BigNumberish;
	commit_deadline: BigNumberish;
	reveal_deadline: BigNumberish;
	ready: boolean;
	atk_a_p0: BigNumberish;
	atk_a_p1: BigNumberish;
	atk_a_p2: BigNumberish;
	atk_a_nc0: BigNumberish;
	atk_a_nc1: BigNumberish;
	atk_a_nc2: BigNumberish;
	def_a_g0: BigNumberish;
	def_a_g1: BigNumberish;
	def_a_g2: BigNumberish;
	def_a_repair: BigNumberish;
	def_a_nc0: BigNumberish;
	def_a_nc1: BigNumberish;
	def_a_nc2: BigNumberish;
	atk_b_p0: BigNumberish;
	atk_b_p1: BigNumberish;
	atk_b_p2: BigNumberish;
	atk_b_nc0: BigNumberish;
	atk_b_nc1: BigNumberish;
	atk_b_nc2: BigNumberish;
	def_b_g0: BigNumberish;
	def_b_g1: BigNumberish;
	def_b_g2: BigNumberish;
	def_b_repair: BigNumberish;
	def_b_nc0: BigNumberish;
	def_b_nc1: BigNumberish;
	def_b_nc2: BigNumberish;
}

// Type definition for `siege_dojo::models::round_moves_1v1::RoundMoves1v1` struct
export interface RoundMoves1v1 {
	match_id: BigNumberish;
	round: BigNumberish;
	commit_count: BigNumberish;
	reveal_count: BigNumberish;
	commit_deadline: BigNumberish;
	reveal_deadline: BigNumberish;
	a_p0: BigNumberish;
	a_p1: BigNumberish;
	a_p2: BigNumberish;
	a_g0: BigNumberish;
	a_g1: BigNumberish;
	a_g2: BigNumberish;
	a_repair: BigNumberish;
	a_nc0: BigNumberish;
	a_nc1: BigNumberish;
	a_nc2: BigNumberish;
	b_p0: BigNumberish;
	b_p1: BigNumberish;
	b_p2: BigNumberish;
	b_g0: BigNumberish;
	b_g1: BigNumberish;
	b_g2: BigNumberish;
	b_repair: BigNumberish;
	b_nc0: BigNumberish;
	b_nc1: BigNumberish;
	b_nc2: BigNumberish;
	a_ability_id: BigNumberish;
	a_ability_target: BigNumberish;
	b_ability_id: BigNumberish;
	b_ability_target: BigNumberish;
}

// Type definition for `siege_dojo::models::round_traps_1v1::RoundTraps1v1` struct
export interface RoundTraps1v1 {
	match_id: BigNumberish;
	round: BigNumberish;
	a_trap0: BigNumberish;
	a_trap1: BigNumberish;
	a_trap2: BigNumberish;
	b_trap0: BigNumberish;
	b_trap1: BigNumberish;
	b_trap2: BigNumberish;
}

// Type definition for `siege_dojo::models::world_config::WorldConfig` struct
export interface WorldConfig {
	id: BigNumberish;
	total_parcels: BigNumberish;
	next_parcel_id: BigNumberish;
	initialized: boolean;
}

// Type definition for `siege_dojo::models::events::MatchCreated` struct
export interface MatchCreated {
	match_id: BigNumberish;
	team_a_attacker: string;
	team_a_defender: string;
	team_b_attacker: string;
	team_b_defender: string;
}

// Type definition for `siege_dojo::models::events::MatchCreated1v1` struct
export interface MatchCreated1v1 {
	match_id: BigNumberish;
	player_a: string;
	player_b: string;
}

// Type definition for `siege_dojo::models::events::MatchFinished` struct
export interface MatchFinished {
	match_id: BigNumberish;
	winner_team: BigNumberish;
}

// Type definition for `siege_dojo::models::events::MoveCommitted` struct
export interface MoveCommitted {
	match_id: BigNumberish;
	round: BigNumberish;
	role: BigNumberish;
}

// Type definition for `siege_dojo::models::events::MoveRevealed` struct
export interface MoveRevealed {
	match_id: BigNumberish;
	round: BigNumberish;
	role: BigNumberish;
}

// Type definition for `siege_dojo::models::events::RoundResolved` struct
export interface RoundResolved {
	match_id: BigNumberish;
	round: BigNumberish;
	vault_a_hp: BigNumberish;
	vault_b_hp: BigNumberish;
}

// Type definition for `siege_dojo::models::match_state::MatchStatus` enum
export const matchStatus = [
	'Pending',
	'Active',
	'Finished',
] as const;
export type MatchStatus = { [key in typeof matchStatus[number]]: string };
export type MatchStatusEnum = CairoCustomEnum;

// Type definition for `siege_dojo::models::node_state::NodeOwner` enum
export const nodeOwner = [
	'None',
	'TeamA',
	'TeamB',
] as const;
export type NodeOwner = { [key in typeof nodeOwner[number]]: string };
export type NodeOwnerEnum = CairoCustomEnum;

export interface SchemaType extends ISchemaType {
	siege_dojo: {
		Commitment: Commitment,
		Faction: Faction,
		FactionCounter: FactionCounter,
		FactionInvite: FactionInvite,
		FactionMember: FactionMember,
		MatchAbilities1v1: MatchAbilities1v1,
		MatchCounter: MatchCounter,
		MatchRecord: MatchRecord,
		MatchStakes1v1: MatchStakes1v1,
		MatchState: MatchState,
		MatchState1v1: MatchState1v1,
		NodeState: NodeState,
		Parcel: Parcel,
		Pillage: Pillage,
		PillageEligibility: PillageEligibility,
		PlayerKingdom: PlayerKingdom,
		PlayerReputation: PlayerReputation,
		PresetDefense: PresetDefense,
		ResourceConfig: ResourceConfig,
		RoundModifiers1v1: RoundModifiers1v1,
		RoundMoves: RoundMoves,
		RoundMoves1v1: RoundMoves1v1,
		RoundTraps1v1: RoundTraps1v1,
		WorldConfig: WorldConfig,
		MatchCreated: MatchCreated,
		MatchCreated1v1: MatchCreated1v1,
		MatchFinished: MatchFinished,
		MoveCommitted: MoveCommitted,
		MoveRevealed: MoveRevealed,
		RoundResolved: RoundResolved,
	},
}
export const schema: SchemaType = {
	siege_dojo: {
		Commitment: {
			match_id: 0,
			round: 0,
			role: 0,
			hash: 0,
			committed: false,
			revealed: false,
		},
		Faction: {
			faction_id: 0,
			leader: "",
			name: 0,
			tag: 0,
			member_count: 0,
			created_at: 0,
			dissolved: false,
		},
		FactionCounter: {
			id: 0,
			count: 0,
		},
		FactionInvite: {
			target: "",
			faction_id: 0,
			invited_by: "",
			invited_at: 0,
			used: false,
		},
		FactionMember: {
			player: "",
			faction_id: 0,
			joined_at: 0,
			last_leave_time: 0,
		},
		MatchAbilities1v1: {
			match_id: 0,
			a_ability_1: 0,
			a_ability_2: 0,
			a_ability_3: 0,
			b_ability_1: 0,
			b_ability_2: 0,
			b_ability_3: 0,
			a_used_1: false,
			a_used_2: false,
			a_used_3: false,
			b_used_1: false,
			b_used_2: false,
			b_used_3: false,
		},
		MatchCounter: {
			id: 0,
			count: 0,
		},
		MatchRecord: {
			player: "",
			opponent: "",
			wins: 0,
			losses: 0,
			last_match_id: 0,
		},
		MatchStakes1v1: {
			match_id: 0,
			a_stake_1: 0,
			a_stake_2: 0,
			a_stake_3: 0,
			b_stake_1: 0,
			b_stake_2: 0,
			b_stake_3: 0,
			stake_count: 0,
			settled: false,
		},
		MatchState: {
			match_id: 0,
			team_a_attacker: "",
			team_a_defender: "",
			team_b_attacker: "",
			team_b_defender: "",
			vault_a_hp: 0,
			vault_b_hp: 0,
			current_round: 0,
		status: new CairoCustomEnum({ 
					Pending: "",
				Active: undefined,
				Finished: undefined, }),
		},
		MatchState1v1: {
			match_id: 0,
			player_a: "",
			player_b: "",
			vault_a_hp: 0,
			vault_b_hp: 0,
			current_round: 0,
		status: new CairoCustomEnum({ 
					Pending: "",
				Active: undefined,
				Finished: undefined, }),
		},
		NodeState: {
			match_id: 0,
			node_index: 0,
		owner: new CairoCustomEnum({ 
					None: "",
				TeamA: undefined,
				TeamB: undefined, }),
		},
		Parcel: {
			parcel_id: 0,
			col: 0,
			row: 0,
			parcel_type: 0,
			owner: "",
			is_home: false,
		},
		Pillage: {
			home_parcel_id: 0,
			pillager: "",
			target: "",
			start_time: 0,
			expires_at: 0,
			last_claim_time: 0,
			active: false,
		},
		PillageEligibility: {
			winner: "",
			match_id: 0,
			loser: "",
			granted_at: 0,
			expires_at: 0,
			used: false,
		},
		PlayerKingdom: {
			player: "",
			home_0: 0,
			home_1: 0,
			home_2: 0,
			parcel_count: 0,
			registered: false,
			free_craft_used: false,
			last_drip_time: 0,
			tier: 0,
			total_wins: 0,
			faction_reinforcement_enabled: false,
		},
		PlayerReputation: {
			player: "",
			total_losses: 0,
			current_streak: 0,
			best_streak: 0,
			bracket: 0,
		},
		PresetDefense: {
			player: "",
			p0_p0: 0,
			p0_p1: 0,
			p0_p2: 0,
			p0_g0: 0,
			p0_g1: 0,
			p0_g2: 0,
			p1_p0: 0,
			p1_p1: 0,
			p1_p2: 0,
			p1_g0: 0,
			p1_g1: 0,
			p1_g2: 0,
			p2_p0: 0,
			p2_p1: 0,
			p2_p2: 0,
			p2_g0: 0,
			p2_g1: 0,
			p2_g2: 0,
			p3_p0: 0,
			p3_p1: 0,
			p3_p2: 0,
			p3_g0: 0,
			p3_g1: 0,
			p3_g2: 0,
			preset_count: 0,
		},
		ResourceConfig: {
			id: 0,
			iron: "",
			linen: "",
			stone: "",
			wood: "",
			ember: "",
			seeds: "",
			ability_token: "",
			vrf_provider: "",
		},
		RoundModifiers1v1: {
			match_id: 0,
			round: 0,
			gate_0: 0,
			gate_1: 0,
			gate_2: 0,
		},
		RoundMoves: {
			match_id: 0,
			round: 0,
			commit_count: 0,
			reveal_count: 0,
			commit_deadline: 0,
			reveal_deadline: 0,
			ready: false,
			atk_a_p0: 0,
			atk_a_p1: 0,
			atk_a_p2: 0,
			atk_a_nc0: 0,
			atk_a_nc1: 0,
			atk_a_nc2: 0,
			def_a_g0: 0,
			def_a_g1: 0,
			def_a_g2: 0,
			def_a_repair: 0,
			def_a_nc0: 0,
			def_a_nc1: 0,
			def_a_nc2: 0,
			atk_b_p0: 0,
			atk_b_p1: 0,
			atk_b_p2: 0,
			atk_b_nc0: 0,
			atk_b_nc1: 0,
			atk_b_nc2: 0,
			def_b_g0: 0,
			def_b_g1: 0,
			def_b_g2: 0,
			def_b_repair: 0,
			def_b_nc0: 0,
			def_b_nc1: 0,
			def_b_nc2: 0,
		},
		RoundMoves1v1: {
			match_id: 0,
			round: 0,
			commit_count: 0,
			reveal_count: 0,
			commit_deadline: 0,
			reveal_deadline: 0,
			a_p0: 0,
			a_p1: 0,
			a_p2: 0,
			a_g0: 0,
			a_g1: 0,
			a_g2: 0,
			a_repair: 0,
			a_nc0: 0,
			a_nc1: 0,
			a_nc2: 0,
			b_p0: 0,
			b_p1: 0,
			b_p2: 0,
			b_g0: 0,
			b_g1: 0,
			b_g2: 0,
			b_repair: 0,
			b_nc0: 0,
			b_nc1: 0,
			b_nc2: 0,
			a_ability_id: 0,
			a_ability_target: 0,
			b_ability_id: 0,
			b_ability_target: 0,
		},
		RoundTraps1v1: {
			match_id: 0,
			round: 0,
			a_trap0: 0,
			a_trap1: 0,
			a_trap2: 0,
			b_trap0: 0,
			b_trap1: 0,
			b_trap2: 0,
		},
		WorldConfig: {
			id: 0,
			total_parcels: 0,
			next_parcel_id: 0,
			initialized: false,
		},
		MatchCreated: {
			match_id: 0,
			team_a_attacker: "",
			team_a_defender: "",
			team_b_attacker: "",
			team_b_defender: "",
		},
		MatchCreated1v1: {
			match_id: 0,
			player_a: "",
			player_b: "",
		},
		MatchFinished: {
			match_id: 0,
			winner_team: 0,
		},
		MoveCommitted: {
			match_id: 0,
			round: 0,
			role: 0,
		},
		MoveRevealed: {
			match_id: 0,
			round: 0,
			role: 0,
		},
		RoundResolved: {
			match_id: 0,
			round: 0,
			vault_a_hp: 0,
			vault_b_hp: 0,
		},
	},
};
export enum ModelsMapping {
	Commitment = 'siege_dojo-Commitment',
	Faction = 'siege_dojo-Faction',
	FactionCounter = 'siege_dojo-FactionCounter',
	FactionInvite = 'siege_dojo-FactionInvite',
	FactionMember = 'siege_dojo-FactionMember',
	MatchAbilities1v1 = 'siege_dojo-MatchAbilities1v1',
	MatchCounter = 'siege_dojo-MatchCounter',
	MatchRecord = 'siege_dojo-MatchRecord',
	MatchStakes1v1 = 'siege_dojo-MatchStakes1v1',
	MatchState = 'siege_dojo-MatchState',
	MatchStatus = 'siege_dojo-MatchStatus',
	MatchState1v1 = 'siege_dojo-MatchState1v1',
	NodeOwner = 'siege_dojo-NodeOwner',
	NodeState = 'siege_dojo-NodeState',
	Parcel = 'siege_dojo-Parcel',
	Pillage = 'siege_dojo-Pillage',
	PillageEligibility = 'siege_dojo-PillageEligibility',
	PlayerKingdom = 'siege_dojo-PlayerKingdom',
	PlayerReputation = 'siege_dojo-PlayerReputation',
	PresetDefense = 'siege_dojo-PresetDefense',
	ResourceConfig = 'siege_dojo-ResourceConfig',
	RoundModifiers1v1 = 'siege_dojo-RoundModifiers1v1',
	RoundMoves = 'siege_dojo-RoundMoves',
	RoundMoves1v1 = 'siege_dojo-RoundMoves1v1',
	RoundTraps1v1 = 'siege_dojo-RoundTraps1v1',
	WorldConfig = 'siege_dojo-WorldConfig',
	MatchCreated = 'siege_dojo-MatchCreated',
	MatchCreated1v1 = 'siege_dojo-MatchCreated1v1',
	MatchFinished = 'siege_dojo-MatchFinished',
	MoveCommitted = 'siege_dojo-MoveCommitted',
	MoveRevealed = 'siege_dojo-MoveRevealed',
	RoundResolved = 'siege_dojo-RoundResolved',
}