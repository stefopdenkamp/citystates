import type { ResourceType, Talent } from './config';

export type GameStatus = 'open' | 'inProgress' | 'saved' | 'finished';
export type Phase = 'start' | 'born' | 'auction' | 'action' | 'legacy';
export type PoolItem = 'person' | Talent;
export type Characteristic = 'title' | 'personalityTrait' | 'cityState';

export type Player = {
	id: string;
	token: string; // secret kept in the player's localStorage, stripped before sending state
	name: string;
	color: string;
	characteristics: Record<Characteristic, string>;
	isConnected: boolean; // a bot is always connected
	isReadyForGame: boolean;
	bot?: string; // the name of the bot that plays it (see bots in config), missing for a person
	isReadyForNextGeneration: boolean;
	isTurn: boolean;
	center: { x: number; y: number };
	people: number; // regular people
	talents: Talent[];
	resources: Record<ResourceType, number>;
	totalProduced: Record<ResourceType, number>;
	totalBorn?: number; // the people (talents included) received in phase one over all generations (missing in older games)
	cityCentreResource: ResourceType | null; // what the city centre produces, when enabled
	cityCentreTurn: number | null; // stats.nrOfTurns when it was last changed, it can change once per turn
	undeployedUnits?: Unit['type'][]; // bought but not placed yet, in the order bought (missing in older games)
	unlockedPolicies?: string[]; // bought policies (missing in older games)
	policiesInEffect?: (string | null)[]; // the unlocked policy in each of the 3 slots, null when the slot is empty
	unlockedTechnologies?: string[]; // bought technologies, in the order bought (missing in older games)
	technologyGenerations?: Record<string, number>; // stats.nrOfGenerations when each technology was unlocked
	policyGenerations?: Record<string, number>; // stats.nrOfGenerations when each policy in effect was implemented (Bread and circuses counts from it)
	tradedWith?: string[]; // the opponents traded with this turn
	tradeGain?: number; // the resources received through trade this generation (Trade empire)
};

export type Building = {
	id: string;
	type: string;
	ownerId: string;
	x: number;
	y: number;
};

// A unit on a building (or a city centre); it stays with the cell when the building is replaced.
export type Unit = {
	id: string;
	type: 'army' | 'mercenary' | 'spy' | 'missionary' | 'inquisitor' | 'trader'; // a trader is never placed, it is used in a trade
	ownerId: string;
	x: number;
	y: number;
};

export type Auction = {
	queue: Talent[]; // talents still to be auctioned after the current one
	talent: Talent | null; // null while the generation is being born
	deficits: Record<string, number>; // people each player needs to reach their cap
	eligible: string[]; // player ids
	bids: Record<string, number>; // in the talent's own resource
	cultureBids: Record<string, number>; // culture adds to any bid (see cultureWorth)
	history?: { playerId: string; amount: number; culture: number; total: number }[]; // every bid on this talent (missing in older games)
	done: string[];
	won: Record<string, number>; // talents won this generation per player
	regularPeople: number;
};

export type LegacyLine = { before: number; production: number; cap: number; after: number; isCapped: boolean };

export type GameState = {
	id: string;
	name: string;
	lobbyPasswordId: string | null;
	minPlayerCount: number;
	maxPlayerCount: number;
	turnTimer: number | null;
	objectives: number[];
	enabledCharacteristics: Record<Characteristic, boolean>;
	isCityCentreEnabled: boolean;
	isBuildOverFarmsEnabled?: boolean; // F&E can also replace opponents' F&E (missing in older games)
	isReligiousDominanceEnabled?: boolean; // an extra objective (missing in older games)
	isTestMode?: boolean; // buildings, units, technologies and policies cost nothing (missing in older games)
	isTutorialEnabled?: boolean; // every player is shown the tutorial when the game starts (missing in older games)
	winnerIds?: string[]; // set when the game is finished, more than one is a draw
	gameStatus: GameStatus;
	phase: Phase;
	players: Player[]; // in turn order once started
	startPlayerIndex: number;
	turnIndex: number; // index into players during the action phase
	turnsTaken: number; // turns taken in the current action phase
	turnRemainingMs: number | null; // set while the game is saved, to resume the timer
	turnEndsAt: number | null;
	peoplePool: PoolItem[];
	talentsAdded: boolean;
	gridSize: number;
	buildings: Building[];
	units: Unit[];
	auction: Auction | null;
	legacy: Record<string, Record<ResourceType, LegacyLine>> | null;
	// the people born this generation: what was drawn, in the order it was drawn, and how many people each player needed
	// (drawn and deficits are missing in older games)
	lastBorn: { people: number; talents: number; drawn?: PoolItem[]; deficits?: Record<string, number> } | null;
	stats: { nrOfGenerations: number; nrOfTurns: number };
	chatHistory: { playerId: string; name: string; color: string; text: string; at: number }[];
	log: { text: string; at: number }[];
};

export type PublicPlayer = Omit<Player, 'token'>;
export type PublicGameState = Omit<GameState, 'players'> & { players: PublicPlayer[] };

export type LobbyGame = {
	id: string;
	name: string;
	gameStatus: GameStatus;
	playerCount: number;
	connectedCount: number;
	maxPlayerCount: number;
	botCount: number; // a player who joins a full open game takes the place of a bot
	hasPassword: boolean;
	winners: { name: string; color: string }[]; // of a finished game
};

export type GameSettings = {
	name: string;
	minPlayerCount: number;
	maxPlayerCount: number;
	turnTimer: number | null;
	objectives: (number | 'random' | 'none')[]; // 'none' leaves the slot out
	enabledCharacteristics: Record<Characteristic, boolean>;
	isCityCentreEnabled: boolean;
	isBuildOverFarmsEnabled: boolean;
	isReligiousDominanceEnabled: boolean;
	isTestMode: boolean;
	isTutorialEnabled: boolean;
	password: string | null;
};

export type ClientMessage =
	| { type: 'lobby:subscribe' }
	| { type: 'lobby:create'; settings: GameSettings }
	| { type: 'lobby:delete'; gameId: string }
	| { type: 'game:join'; gameId: string; token?: string; password?: string }
	| { type: 'player:update'; name?: string; color?: string; characteristics?: Partial<Record<Characteristic, string>> }
	| { type: 'player:ready'; ready: boolean }
	| { type: 'player:adopt'; playerId: string }
	| { type: 'game:start' }
	| { type: 'bot:add'; bot: string }
	| { type: 'bot:remove'; playerId: string }
	| { type: 'auction:bid'; amount: number; culture: number }
	| { type: 'auction:done' }
	| { type: 'build'; building: string; x: number; y: number; talents?: Talent[] }
	| { type: 'unit:buy'; unit: Unit['type']; talents?: Talent[] }
	| { type: 'deploy'; unit: Unit['type']; x: number; y: number }
	| { type: 'trade'; targetId: string; give: ResourceType[]; take: ResourceType[] }
	| { type: 'policy:unlock'; policy: string }
	| { type: 'technology:unlock'; technology: string }
	| { type: 'policy:implement'; policy: string; slot: number }
	| { type: 'policy:remove'; policy: string }
	| { type: 'talent:retrain'; index: number; talent: Talent }
	| { type: 'talent:indoctrinate'; targetId: string; index: number }
	| { type: 'person:propaganda'; targetId: string }
	| { type: 'unit:bribe'; unitId: string }
	| { type: 'turn:end' }
	| { type: 'cityCentre:set'; resource: ResourceType }
	| { type: 'legacy:next' }
	| { type: 'chat'; text: string };

export type ServerMessage =
	| { type: 'lobby:list'; games: LobbyGame[] }
	| { type: 'lobby:created'; id: string }
	| { type: 'game:joined'; playerId: string | null; token: string | null }
	| { type: 'game:state'; state: PublicGameState }
	| { type: 'game:passwordRequired' }
	| { type: 'error'; message: string };
