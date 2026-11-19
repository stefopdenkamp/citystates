import { describe, expect, test } from 'bun:test';
import { hasBotWork, runBot } from './bot';
import * as game from './logic';
import type { GameSettings, GameState } from './types';

const settings = (objectives: number[]): GameSettings => ({
	name: 'Bots',
	minPlayerCount: 2,
	maxPlayerCount: 3,
	turnTimer: null,
	objectives,
	enabledCharacteristics: { title: false, personalityTrait: false, cityState: false },
	isCityCentreEnabled: true,
	isBuildOverFarmsEnabled: false,
	isReligiousDominanceEnabled: false,
	isTestMode: false,
	isTutorialEnabled: false,
	password: null
});

// One person and one Roda, started.
const withBot = (objectives: number[], name = 'Roda') => {
	const state = game.createGameState(settings(objectives), 'g', null);
	const person = game.addPlayer(state);
	game.updatePlayer(state, person.id, { color: 'red' });
	game.setReady(state, person.id, true);
	const bot = game.addBot(state, name);
	game.startGame(state);
	return { state, personId: person.id, botId: bot.id };
};

// Plays generations: the person only ends turns, finishes bidding and goes on; the bot does what it wants.
const play = (state: GameState, personId: string, generations: number) => {
	for (let step = 0; step < 5000 && state.gameStatus === 'inProgress' && state.stats.nrOfGenerations <= generations; step++) {
		if (hasBotWork(state)) {
			runBot(state, 0);
			continue;
		}
		if (state.phase === 'born') game.finishBorn(state, 0);
		else if (state.phase === 'auction') game.doneBidding(state, personId, 0);
		else if (state.phase === 'action') game.endTurn(state, personId, 0);
		else if (state.phase === 'legacy') game.readyForNextGeneration(state, personId);
	}
};

describe('bots', () => {
	test('a bot fills an empty place, is ready, and a person joining a full game takes its place', () => {
		const state = game.createGameState({ ...settings([0, 1]), maxPlayerCount: 2 }, 'g', null);
		const person = game.addPlayer(state);
		const bot = game.addBot(state, 'Roda');
		expect(bot).toMatchObject({ name: 'Roda', bot: 'Roda', isReadyForGame: true, isConnected: true });
		expect(() => game.addBot(state, 'Roda')).toThrow(); // full
		const joined = game.addPlayer(state);
		expect(state.players.map((p) => p.id)).toEqual([person.id, joined.id]);
		expect(() => game.addPlayer(state)).toThrow(); // full, and no bot left
	});

	test('a game needs a person, and a bot can be taken out before it starts', () => {
		const state = game.createGameState(settings([0, 1]), 'g', null);
		const first = game.addBot(state, 'Roda');
		const second = game.addBot(state, 'Roda');
		expect(second.name).toBe('Roda 2');
		expect(game.canStart(state)).toBe(false);
		game.removeBot(state, first.id);
		expect(state.players).toHaveLength(1);
	});

	test('orange and gray can no longer be chosen', () => {
		const state = game.createGameState(settings([0, 1]), 'g', null);
		const person = game.addPlayer(state);
		expect(() => game.updatePlayer(state, person.id, { color: 'orange' })).toThrow();
		expect(() => game.updatePlayer(state, person.id, { color: 'gray' })).toThrow();
	});

	// knowledge (Scholarly renown) and materials (Standing army)
	test('Roda works towards its objectives over the generations without getting stuck', () => {
		const { state, personId, botId } = withBot([6, 2]);
		play(state, personId, 15);
		const bot = game.getPlayer(state, botId);
		const types = state.buildings.filter((b) => b.ownerId === botId).map((b) => game.getBuildingStats(b.type).resourceType);
		expect(types).toContain('knowledge');
		expect(types).toContain('materials');
		expect((bot.unlockedTechnologies ?? []).length).toBeGreaterThan(0);
		expect((bot.undeployedUnits ?? []).filter((u) => u === 'army').length).toBeGreaterThan(0);
		expect(state.stats.nrOfGenerations).toBeGreaterThan(15);
	});

	test("Roda removes an opponent's army from its farm, also when it goes for Standing army", () => {
		const { state, personId, botId } = withBot([2]);
		const bot = game.getPlayer(state, botId);
		const farm = state.buildings.find((b) => b.ownerId === botId && b.type === 'farm')!;
		state.units = [{ id: 'u', type: 'army', ownerId: personId, x: farm.x, y: farm.y }];
		bot.undeployedUnits = ['army', 'army'];
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		expect(state.units.filter((u) => u.type === 'army')).toHaveLength(0);
		expect((bot.undeployedUnits ?? []).filter((u) => u === 'army').length).toBeGreaterThanOrEqual(1);
	});

	test('Chief builds farms to a people cap of 8, materials up to a factory, Defensive strategies and places armies', () => {
		const { state, personId, botId } = withBot([0, 1], 'Chief');
		// only 6 craftsmen are in the pool, so without more it may wait long
		state.talentsAdded = true;
		state.peoplePool.push(...Array(40).fill('craftsman'));
		const built = () => state.log.map((l) => l.text.match(new RegExp(`^\\{player:${botId}\\} builds a ([a-z' ]+?)(?: over|$)`))?.[1]).filter(Boolean);
		play(state, personId, 1);
		expect(built()[0]).toBe('farm');
		play(state, personId, 30);
		const bot = game.getPlayer(state, botId);
		expect(game.peopleCap(state, botId) + (state.units ?? []).filter((u) => u.ownerId === personId).length).toBeGreaterThanOrEqual(8);
		expect(state.buildings.some((b) => b.ownerId === botId && b.type === 'factory')).toBe(true);
		expect(bot.policiesInEffect).toContain('Defensive strategies');
		const armies = (state.units ?? []).filter((u) => u.ownerId === botId && u.type === 'army');
		expect(armies.length).toBeGreaterThan(0);
		// first on the person's farms and estates, then on its own
		const onPerson = armies.filter((u) => state.buildings.find((b) => b.x === u.x && b.y === u.y)?.ownerId === personId).length;
		expect(onPerson).toBe(state.buildings.filter((b) => b.ownerId === personId && b.type === 'farm').length);
	});

	test("Chief places an army from its stock on its own farm with an opponent's army first", () => {
		const { state, personId, botId } = withBot([0, 1], 'Chief');
		const bot = game.getPlayer(state, botId);
		const farm = state.buildings.find((b) => b.ownerId === botId && b.type === 'farm')!;
		state.units = [{ id: 'u', type: 'army', ownerId: personId, x: farm.x, y: farm.y }];
		bot.undeployedUnits = ['army'];
		bot.people = 0;
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		expect(state.units).toHaveLength(0);
		expect(bot.undeployedUnits).toEqual([]);
	});

	test('Chief plays like Roda once it is built up and has nowhere to put an army', () => {
		const { state, personId, botId } = withBot([6], 'Chief');
		const bot = game.getPlayer(state, botId);
		const cells = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: bot.center.x + dx, y: bot.center.y + dy }))).filter((c) => c.x !== bot.center.x || c.y !== bot.center.y);
		// materials production 8 + 2 + 5 = 15, and a forum
		cells.forEach((cell, i) => state.buildings.push({ id: `b${i}`, type: ['factory', 'forum', 'armoury'][i] ?? 'blacksmith', ownerId: botId, ...cell }));
		state.units = state.buildings
			.filter((b) => game.getBuildingStats(b.type).resourceType === 'people')
			.map((b, i) => ({ id: `u${i}`, type: 'army' as const, ownerId: botId, x: b.x, y: b.y }));
		bot.unlockedPolicies = ['Defensive strategies', 'Grain reserves'];
		bot.policiesInEffect = ['Defensive strategies', 'Grain reserves', null];
		bot.people = 3;
		bot.resources.materials = 2;
		bot.resources.knowledge = 2;
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		expect(bot.undeployedUnits ?? []).toHaveLength(0);
		expect(bot.unlockedTechnologies).toContain('Cryptography');
		expect(personId).toBeTruthy();
	});

	test('Chief implements its policies in order and upgrades its power building when it can', () => {
		const { state, botId } = withBot([6], 'Chief');
		const bot = game.getPlayer(state, botId);
		const cells = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: bot.center.x + dx, y: bot.center.y + dy }))).filter((c) => c.x !== bot.center.x || c.y !== bot.center.y);
		cells.forEach((cell, i) => state.buildings.push({ id: `b${i}`, type: ['factory', 'town council', 'armoury'][i] ?? 'blacksmith', ownerId: botId, ...cell }));
		bot.unlockedPolicies = ['War machine', 'Isolationism', 'Defensive strategies'];
		bot.people = 16; // 12 for 6 farms up to a people cap of 8, 4 for the city hall
		bot.talents = ['politician'];
		bot.resources.power = 4;
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		expect(bot.policiesInEffect).toEqual(['Defensive strategies', 'Isolationism', 'War machine']);
		expect(state.buildings.some((b) => b.ownerId === botId && b.type === 'city hall')).toBe(true);
	});

	test('Chief spends no materials on armies once it has the power for its next policy', () => {
		const armiesWith = (power: number) => {
			const { state, botId } = withBot([6], 'Chief');
			const bot = game.getPlayer(state, botId);
			const cells = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: bot.center.x + dx, y: bot.center.y + dy }))).filter((c) => c.x !== bot.center.x || c.y !== bot.center.y);
			cells.forEach((cell, i) => state.buildings.push({ id: `b${i}`, type: ['factory', 'town council', 'armoury'][i] ?? 'blacksmith', ownerId: botId, ...cell }));
			bot.people = 13; // 12 for 6 farms up to a people cap of 8, 1 for an army
			bot.resources.materials = 2; // Defensive strategies costs 3 materials and 3 power
			bot.resources.power = power;
			state.phase = 'action';
			state.turnIndex = state.players.findIndex((p) => p.id === botId);
			runBot(state, 0);
			return state.units.filter((u) => u.ownerId === botId && u.type === 'army').length;
		};
		expect(armiesWith(3)).toBe(0);
		expect(armiesWith(2)).toBe(1);
	});

	test('Chief builds farms and estates with the people it has left', () => {
		const { state, personId, botId } = withBot([6, 3], 'Chief');
		play(state, personId, 12);
		expect(game.peopleCap(state, botId)).toBeGreaterThan(12);
	});

	test('Rain builds level 4 buildings of every resource, with its policies and Reeducation programs', () => {
		const { state, personId, botId } = withBot([6, 3], 'Rain');
		play(state, personId, 25);
		const bot = game.getPlayer(state, botId);
		const levels4 = state.buildings.filter((b) => b.ownerId === botId && game.getBuildingStats(b.type).level === 4);
		expect(new Set(levels4.map((b) => game.getBuildingStats(b.type).resourceType)).size).toBeGreaterThanOrEqual(2);
		expect(bot.policiesInEffect).toContain('Courtyard gardens');
		expect(bot.unlockedTechnologies).toContain('Reeducation programs');
	});

	test('Rain reeducates a talent it does not need to one its next building needs', () => {
		const { state, botId } = withBot([6, 3], 'Rain');
		const bot = game.getPlayer(state, botId);
		const cells = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: bot.center.x + dx, y: bot.center.y + dy }))).filter((c) => c.x !== bot.center.x || c.y !== bot.center.y);
		// every resource at level 2 and its 2 objective buildings: the next ones need talents
		['armoury', 'shop', 'chapel', 'studiolo', 'library', 'town council', 'scribe\'s chamber', 'stall'].forEach((type, i) =>
			state.buildings.push({ id: `b${i}`, type, ownerId: botId, ...cells[i] })
		);
		bot.unlockedTechnologies = ['Propaganda posters', 'Reeducation programs'];
		bot.unlockedPolicies = ['Courtyard gardens', 'Grain reserves'];
		bot.policiesInEffect = ['Courtyard gardens', 'Grain reserves', null];
		bot.talents = ['merchant', 'merchant'];
		bot.people = 0;
		bot.resources.culture = 7;
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		expect(bot.talents).toContain('merchant');
		expect(bot.talents).toContain('craftsman');
		expect(bot.resources.culture).toBe(0);
	});

	// a person with buildings inside the wall, for missionaries to go on
	const withBuildingsFor = (state: GameState, playerId: string, count: number) => {
		const { center } = game.getPlayer(state, playerId);
		const cells = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: center.x + dx, y: center.y + dy }))).filter((c) => c.x !== center.x || c.y !== center.y);
		cells.slice(0, count).forEach((cell, i) => state.buildings.push({ id: `${playerId}-${i}`, type: 'stall', ownerId: playerId, ...cell }));
		return cells.slice(0, count);
	};

	test('Pope builds farms, faith buildings and the inquisitor technologies, and puts missionaries on all opponent buildings', () => {
		const { state, personId, botId } = withBot([0, 1], 'Pope');
		const cells = withBuildingsFor(state, personId, 4);
		const built = () => state.log.map((l) => l.text.match(new RegExp(`^\\{player:${botId}\\} builds a ([a-z' ]+?)(?: over|$)`))?.[1]).filter(Boolean);
		play(state, personId, 1);
		expect(built()[0]).toBe('farm');
		play(state, personId, 15);
		const bot = game.getPlayer(state, botId);
		expect(bot.unlockedTechnologies).toContain('Inquisition');
		expect(Math.max(...state.buildings.filter((b) => b.ownerId === botId).map((b) => (game.getBuildingStats(b.type).resourceType === 'faith' ? game.getBuildingStats(b.type).level : 0)))).toBeGreaterThanOrEqual(2);
		expect(cells.every((c) => game.faithUnitsAt(state, c.x, c.y).some((u) => u.ownerId === botId))).toBe(true);
	});

	test('Pope buys one missionary a turn while it still saves for its faith buildings, and only while its faith keeps growing', () => {
		const { state, personId, botId } = withBot([0, 1], 'Pope');
		const bot = game.getPlayer(state, botId);
		withBuildingsFor(state, personId, 4);
		const own = withBuildingsFor(state, botId, 8);
		state.buildings.filter((b) => b.ownerId === botId && b.type === 'stall').forEach((b, i) => (b.type = i ? 'blacksmith' : 'chapel'));
		bot.unlockedPolicies = ['Grain reserves'];
		bot.policiesInEffect = ['Grain reserves', null, null];
		bot.cityCentreResource = 'faith';
		bot.people = 3;
		bot.resources.faith = 5; // chapel cap 5, production 2 + 1 from the city centre: 5 - 2 + 3 is back at the cap
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		expect(state.units.filter((u) => u.ownerId === botId && u.type === 'missionary')).toHaveLength(1);
		expect(own).toHaveLength(8);
	});

	test("Pope removes an opponent's missionaries from its buildings with an inquisitor first, then uses inquisitors on theirs", () => {
		const { state, personId, botId } = withBot([0, 1], 'Pope');
		const bot = game.getPlayer(state, botId);
		const [own] = withBuildingsFor(state, botId, 1);
		state.units.push({ id: 'm', type: 'missionary', ownerId: personId, ...own });
		// an inquisitor of the person on their own stall: a missionary cannot go there, an inquisitor can
		const [theirs] = withBuildingsFor(state, personId, 1);
		state.units.push({ id: 'i', type: 'inquisitor', ownerId: personId, ...theirs });
		bot.unlockedTechnologies = ['Inquisition'];
		bot.undeployedUnits = ['inquisitor', 'inquisitor'];
		bot.people = 0;
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		expect(game.faithUnitsAt(state, own.x, own.y)).toHaveLength(0);
		expect(game.faithUnitsAt(state, theirs.x, theirs.y)).toHaveLength(0);
		expect(bot.undeployedUnits).toEqual([]);
	});

	test("Pope finishes covering an opponent's buildings and then takes their city centre", () => {
		const { state, personId, botId } = withBot([0, 1], 'Pope');
		state.isReligiousDominanceEnabled = true;
		const bot = game.getPlayer(state, botId);
		const cells = withBuildingsFor(state, personId, 8);
		cells.slice(1).forEach((c, i) => state.units.push({ id: `m${i}`, type: 'missionary', ownerId: botId, ...c }));
		// built up already: a cathedral and shrines, all faith technologies, a people cap of at least 10
		withBuildingsFor(state, botId, 8).forEach((c, i) => {
			const own = state.buildings.find((b) => b.ownerId === botId && b.x === c.x && b.y === c.y)!;
			own.type = i ? 'shrine' : 'cathedral';
		});
		bot.unlockedTechnologies = ['Inquisition', 'Tithes', 'Persecution', 'Pilgrimage'];
		bot.unlockedPolicies = ['Grain reserves'];
		bot.policiesInEffect = ['Grain reserves', null, null];
		bot.people = 2;
		bot.resources.faith = 4;
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		expect(game.hasReligiousDominance(state, botId, personId)).toBe(true);
	});

	test('for Grand architecture Roda goes for a level 4 building of another resource once it has a factory, and keeps the factory', () => {
		const { state, botId } = withBot([0]);
		const bot = game.getPlayer(state, botId);
		state.buildings.push({ id: 'f', type: 'factory', ownerId: botId, x: bot.center.x, y: bot.center.y - 1 });
		bot.people = 1;
		bot.resources.materials = 9;
		state.phase = 'action';
		state.turnIndex = state.players.findIndex((p) => p.id === botId);
		runBot(state, 0);
		const types = state.buildings.filter((b) => b.ownerId === botId).map((b) => b.type);
		expect(types.filter((t) => t === 'factory')).toHaveLength(1);
		expect(types).toContain('stall');
	});

	test('Roda bids on the talents of its resources once the person is done', () => {
		const { state, personId, botId } = withBot([6, 2]);
		play(state, personId, 1);
		const bot = game.getPlayer(state, botId);
		bot.resources.knowledge = 6;
		state.phase = 'auction';
		state.auction = {
			queue: [],
			talent: 'scientist',
			deficits: { [personId]: 1, [botId]: 1 },
			eligible: [personId, botId],
			bids: { [personId]: 0, [botId]: 0 },
			cultureBids: { [personId]: 0, [botId]: 0 },
			history: [],
			done: [],
			won: { [personId]: 0, [botId]: 0 },
			regularPeople: 0
		};
		game.getPlayer(state, personId).resources.knowledge = 2;
		game.placeBid(state, personId, 2);
		expect(hasBotWork(state)).toBe(false); // waits for the person
		game.doneBidding(state, personId, 0);
		expect(hasBotWork(state)).toBe(true);
		runBot(state, 0);
		expect(bot.talents).toContain('scientist');
		expect(bot.resources.knowledge).toBe(3); // a bid of 3 beats 2
	});
});
