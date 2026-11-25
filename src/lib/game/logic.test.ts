import { describe, expect, test } from 'bun:test';
import * as game from './logic';
import { objectives as objectiveList, regularPeopleInPool, type Talent } from './config';
import type { GameSettings, GameState } from './types';

const settings: GameSettings = {
	name: 'test',
	minPlayerCount: 1,
	maxPlayerCount: 6,
	turnTimer: null,
	objectives: ['random', 'random', 'random'],
	enabledCharacteristics: { title: false, personalityTrait: false, cityState: false },
	isCityCentreEnabled: false,
	isBuildOverFarmsEnabled: false,
	isReligiousDominanceEnabled: false,
	isTestMode: false,
	isTutorialEnabled: false,
	password: null
};

const colors = ['red', 'blue', 'yellow'];

const startedGame = (playerCount: number) => {
	const state = game.createGameState(settings, 'g1', null);
	for (let i = 0; i < playerCount; i++) {
		const player = game.addPlayer(state);
		game.updatePlayer(state, player.id, { name: `player${i + 1}`, color: colors[i] });
		game.setReady(state, player.id, true);
	}
	game.startGame(state);
	return state;
};

const toActionPhase = (state: GameState) => {
	game.finishBorn(state, 0);
	expect(state.phase).toBe('action');
};

// Armies, traders and missionaries need a building of their resource: a blacksmith, stall and shrine inside the wall.
// Pass the building types first to give only those.
const unlockBasicUnits = (state: GameState, ...args: (GameState['players'][number] | string[])[]) => {
	const types = Array.isArray(args[0]) ? (args.shift() as string[]) : ['blacksmith', 'stall', 'shrine'];
	for (const p of args as GameState['players']) {
		types.forEach((type, i) => state.buildings.push({ id: `${type}-${p.id}`, type, ownerId: p.id, x: p.center.x - 1 + i, y: p.center.y - 1 }));
	}
};

const endAllTurns = (state: GameState) => {
	for (let i = 0; i < state.players.length; i++) game.endTurn(state, state.players[state.turnIndex].id, 0);
};

describe('creating a game', () => {
	test('random objectives are filled in without duplicates', () => {
		const state = game.createGameState({ ...settings, objectives: [2, 'random', 'random'] }, 'g', null);
		expect(state.objectives[0]).toBe(2);
		expect(new Set(state.objectives).size).toBe(3);
	});

	test('an objective set to none is left out', () => {
		const state = game.createGameState({ ...settings, objectives: ['random', 3, 'none'] }, 'g', null);
		expect(state.objectives).toHaveLength(2);
		expect(state.objectives[1]).toBe(3);
		expect(() => game.createGameState({ ...settings, objectives: ['none', 'none', 'none'] }, 'g', null)).toThrow();
	});

	test('duplicate objectives are refused', () => {
		expect(() => game.createGameState({ ...settings, objectives: [1, 1, 'random'] }, 'g', null)).toThrow();
	});

	test('a new player gets a free default name and a choice in each enabled dropdown', () => {
		const enabledCharacteristics = { title: true, personalityTrait: true, cityState: true };
		const state = game.createGameState({ ...settings, enabledCharacteristics }, 'g', null);
		const a = game.addPlayer(state);
		const b = game.addPlayer(state);
		expect([a.name, b.name]).toEqual(['Player 1', 'Player 2']);
		expect(Object.values(a.characteristics).every(Boolean)).toBe(true);
		expect(a.characteristics.cityState).not.toBe(b.characteristics.cityState);
		game.updatePlayer(state, b.id, { characteristics: { cityState: '' } }); // so Bologna is free
		game.updatePlayer(state, a.id, { name: 'Anna', characteristics: { personalityTrait: 'the Wise', title: 'Patron', cityState: 'Bologna' } });
		expect(game.fullName(state, a)).toBe('Anna the Wise Patron of Bologna');
		expect(game.addPlayer(state).name).toBe('Player 1'); // Anna renamed hers
	});

	test('colors are unique and ready needs a name and color', () => {
		const state = game.createGameState(settings, 'g', null);
		const a = game.addPlayer(state);
		const b = game.addPlayer(state);
		expect(a.color).not.toBe(b.color); // each starts with a random free color
		expect(() => game.updatePlayer(state, b.id, { color: a.color })).toThrow();
		game.updatePlayer(state, a.id, { color: '' });
		expect(() => game.setReady(state, a.id, true)).toThrow();
		game.updatePlayer(state, a.id, { name: 'a', color: b.color === 'red' ? 'blue' : 'red' });
		game.updatePlayer(state, a.id, { characteristics: { cityState: 'Pisa' } });
		expect(() => game.updatePlayer(state, b.id, { characteristics: { cityState: 'Pisa' } })).toThrow();
		game.updatePlayer(state, b.id, { characteristics: { cityState: 'Rome' } });
		game.setReady(state, a.id, true);
		expect(game.canStart(state)).toBe(false);
	});
});

describe('a generation', () => {
	test('the first generation fills the people cap of 2 farms', () => {
		const state = startedGame(2);
		expect(state.buildings.filter((b) => b.type === 'farm')).toHaveLength(4);
		expect(state.lastBorn).toMatchObject({ people: 4, talents: 0 });
		toActionPhase(state);
		expect(state.players.map((p) => p.people)).toEqual([2, 2]);
		expect(state.peoplePool).toHaveLength(regularPeopleInPool - 4);
		expect(state.players[0].isTurn).toBe(true);
	});

	test('what was drawn and what each player needed are kept for the born dialog', () => {
		const state = startedGame(2);
		toActionPhase(state);
		expect(state.lastBorn?.drawn).toEqual(['person', 'person', 'person', 'person']);
		for (const player of state.players) expect(state.lastBorn?.deficits?.[player.id]).toBe(2);
	});

	test('building, producing and the cap', () => {
		const state = startedGame(1);
		toActionPhase(state);
		const player = state.players[0];
		const [cell] = game.validCells(state, player.id, 'blacksmith');
		const [x, y] = cell.split(',').map(Number);
		game.build(state, player.id, 'blacksmith', x, y);
		expect(player.people).toBe(1);
		expect(state.peoplePool).toHaveLength(regularPeopleInPool - 2 + 1);
		game.build(state, player.id, 'blacksmith', x, y); // over the first one
		expect(state.buildings.filter((b) => b.type === 'blacksmith')).toHaveLength(1);

		endAllTurns(state);
		expect(state.phase).toBe('legacy');
		expect(player.resources.materials).toBe(1);
		expect(state.legacy![player.id].gold).toEqual({ before: 0, production: 0, cap: 1, after: 0, isCapped: false });

		game.readyForNextGeneration(state, player.id);
		expect(state.stats.nrOfGenerations).toBe(2);
		expect(state.talentsAdded).toBe(true);
		expect(state.phase).toBe('born');
	});

	test('fewer of each talent go into the pool with 4 to 6 players', () => {
		for (const [playerCount, perType] of [[3, 6], [4, 5], [5, 4], [6, 3]]) {
			const state = startedGame(playerCount);
			toActionPhase(state);
			endAllTurns(state);
			for (const player of state.players) game.readyForNextGeneration(state, player.id);
			expect(state.talentsAdded).toBe(true);
			// in the pool, or drawn this generation
			const scientists = [...state.peoplePool, ...(state.lastBorn?.drawn ?? [])].filter((p) => p === 'scientist');
			expect([playerCount, scientists.length]).toEqual([playerCount, perType]);
		}
	});

	test('production stops at the highest cap', () => {
		const state = startedGame(1);
		toActionPhase(state);
		const player = state.players[0];
		for (let i = 0; i < 6; i++) state.buildings.push({ id: `b${i}`, type: 'blacksmith', ownerId: player.id, x: 0, y: i });
		player.resources.materials = 1;
		endAllTurns(state);
		expect(state.legacy![player.id].materials).toEqual({ before: 1, production: 6, cap: 2, after: 2, isCapped: true });
	});

	test('the start player rotates every generation', () => {
		const state = startedGame(2);
		toActionPhase(state);
		const first = state.players[state.turnIndex].id;
		endAllTurns(state);
		state.players.forEach((p) => game.readyForNextGeneration(state, p.id));
		game.finishBorn(state, 0);
		expect(state.players[state.turnIndex].id).not.toBe(first);
	});

	test('the people born each generation add up', () => {
		const state = startedGame(1);
		toActionPhase(state);
		const player = state.players[0];
		const born = player.people + player.talents.length;
		expect(player.totalBorn).toBe(born);
		player.people = 0;
		player.talents = [];
		endAllTurns(state);
		game.readyForNextGeneration(state, player.id);
		game.finishBorn(state, 0);
		expect(player.totalBorn).toBe(born + player.people + player.talents.length);
	});
});

describe('paying with talents', () => {
	const playerWith = (people: number, talents: Talent[]) => ({
		id: 'p',
		people,
		talents,
		resources: { materials: 20, gold: 0, faith: 0, culture: 0, knowledge: 0, power: 0 }
	});
	const barracks = [{ amount: 7, resourceType: 'materials' as const }, { amount: 2, resourceType: 'craftsman' as const }];
	const armoury = [{ amount: 3, resourceType: 'materials' as const }, { amount: 1, resourceType: 'people' as const }];

	test('no dialog when regular people pay', () => {
		expect(game.talentPayment(playerWith(1, ['artist']), armoury)).toBeNull();
	});

	test('fixed talents and talents used as people', () => {
		expect(game.talentPayment(playerWith(0, ['craftsman', 'craftsman', 'artist']), barracks)).toEqual({
			required: ['craftsman', 'craftsman'],
			choices: 0,
			options: ['artist']
		});
		expect(game.talentPayment(playerWith(0, ['artist', 'scientist']), armoury)).toEqual({
			required: [],
			choices: 1,
			options: ['artist', 'scientist']
		});
	});

	test('the chosen talent is spent', () => {
		const state = startedGame(1);
		game.finishBorn(state, 0);
		const player = state.players[0];
		player.people = 1;
		player.talents = ['artist', 'scientist'];
		player.resources.materials = 3;
		state.buildings.push({ id: 'b', type: 'blacksmith', ownerId: player.id, x: player.center.x + 1, y: player.center.y });
		const [cell] = game.validCells(state, player.id, 'armoury');
		const [x, y] = cell.split(',').map(Number);
		expect(() => game.build(state, player.id, 'armoury', x, y, ['messiah'])).toThrow();
		game.build(state, player.id, 'armoury', x, y, ['scientist']);
		expect(player.talents).toEqual(['artist']);
		expect(state.peoplePool).toContain('scientist');
	});
});

describe('placement', () => {
	const ring = (center: { x: number; y: number }, cell: string) => {
		const [x, y] = cell.split(',').map(Number);
		return Math.max(Math.abs(x - center.x), Math.abs(y - center.y));
	};

	test('two players start just as far from the edge', () => {
		const state = startedGame(2);
		const rows = state.players.map((p) => p.center.y).sort((a, b) => a - b);
		expect(rows).toEqual([2, state.gridSize - 1 - 2]);
	});

	test('every city centre is just as far from its nearest edge', () => {
		for (const count of [2, 3, 4, 5, 6]) {
			const state = startedGame(count);
			const last = state.gridSize - 1;
			const distances = state.players.map(({ center: { x, y } }) => Math.min(x, y, last - x, last - y));
			expect(new Set(distances).size).toBe(1);
			expect(new Set(state.players.map((p) => `${p.center.x},${p.center.y}`)).size).toBe(count);
		}
	});

	test('the starting farms are on opposite sides of the wall, each touching it with 2 cells, staggered', () => {
		for (let i = 0; i < 20; i++) {
			const state = startedGame(1 + (i % 6));
			for (const player of state.players) {
				const { x: cx, y: cy } = player.center;
				const farms = state.buildings.filter((b) => b.ownerId === player.id).map((b) => ({ dx: b.x - cx, dy: b.y - cy }));
				expect(farms).toHaveLength(2);
				const layout = farms.map(({ dx, dy }) => `${dx},${dy}`).sort().join(' ');
				expect(['-1,-3 0,2', '-1,2 0,-3', '-3,-1 2,0', '-3,0 2,-1']).toContain(layout);
			}
		}
	});

	test('buildings go on the 8 cells inside the wall, also over another building', () => {
		const state = startedGame(1);
		const player = state.players[0];
		const { x, y } = player.center;
		const cells = game.validCells(state, player.id, 'blacksmith');
		expect(cells.size).toBe(8);
		expect([...cells].every((c) => ring(player.center, c) === 1)).toBe(true);
		state.buildings.push({ id: 'b', type: 'stall', ownerId: player.id, x: x + 1, y });
		expect(game.validCells(state, player.id, 'bank').has(`${x + 1},${y}`)).toBe(true);
	});

	test('farms and estates go outside the wall, bordering it or your other F&E', () => {
		const state = startedGame(1);
		const player = state.players[0];
		state.gridSize = 21;
		player.center = { x: 10, y: 10 };
		const { x, y } = player.center;
		state.buildings = [];
		const farms = game.validCells(state, player.id, 'farm');
		expect(farms.has(`${x + 2},${y}`)).toBe(true); // bordering the wall
		expect(farms.has(`${x + 2},${y - 3}`)).toBe(true); // only 1 cell borders, at the corner
		expect(farms.has(`${x + 1},${y}`)).toBe(false); // inside the wall
		expect(farms.has(`${x + 3},${y}`)).toBe(false); // not bordering
		state.buildings = [{ id: 'f', type: 'farm', ownerId: player.id, x: x + 2, y }];
		const estates = game.validCells(state, player.id, 'estate');
		expect(estates.has(`${x + 4},${y}`)).toBe(true); // next to the farm
		expect(estates.has(`${x + 3},${y}`)).toBe(false); // over the farm
		expect(estates.has(`${x + 5},${y}`)).toBe(false); // too far
	});

	test('farms and estates can go over your own farms and estates, which they replace', () => {
		const state = startedGame(1);
		game.finishBorn(state, 0);
		const player = state.players[0];
		state.gridSize = 21;
		player.center = { x: 10, y: 10 };
		const { x, y } = player.center;
		state.buildings = [
			{ id: 'f1', type: 'farm', ownerId: player.id, x: x + 2, y }, // bordering the wall
			{ id: 'f2', type: 'farm', ownerId: player.id, x: x + 4, y } // bordering f1
		];
		// an estate over both farms, still bordering the wall
		expect(game.replacedBuildings(state, player.id, 'estate', x + 2, y).map((b) => b.id)).toEqual(['f1', 'f2']);
		expect(game.validCells(state, player.id, 'estate').has(`${x + 2},${y}`)).toBe(true);
		// an estate over f2 only, bordering nothing once f2 is gone, is not allowed
		expect(game.validCells(state, player.id, 'estate').has(`${x + 5},${y - 1}`)).toBe(false);
		// not over a farm with an opponent's army on it
		state.units = [{ id: 'e', type: 'army', ownerId: 'opponent', x: x + 4, y }];
		expect(game.validCells(state, player.id, 'estate').has(`${x + 2},${y}`)).toBe(false);
		// your own army on a replaced farm goes back to your stock
		state.units = [{ id: 'a', type: 'army', ownerId: player.id, x: x + 4, y }];
		player.people = 5;
		game.build(state, player.id, 'estate', x + 2, y);
		expect(state.buildings.map((b) => b.type)).toEqual(['estate']);
		expect(state.units).toEqual([]);
		expect(player.undeployedUnits).toEqual(['army']);
		expect(state.log.at(-1)?.text).toEndWith('builds a estate over the farm and the farm');
	});

	test("with Build over farms F&E can replace opponents' F&E without an army of someone else on them", () => {
		const { state, a, b } = twoPlayers();
		const { x, y } = a.center;
		state.buildings = [{ id: 'theirs', type: 'farm', ownerId: b.id, x: x + 2, y }]; // bordering a's wall
		state.units = [];
		expect(game.validCells(state, a.id, 'farm').has(`${x + 2},${y}`)).toBe(false);
		state.isBuildOverFarmsEnabled = true;
		expect(game.validCells(state, a.id, 'farm').has(`${x + 2},${y}`)).toBe(true);
		// not with an army of an opponent on it, also the owner's own (Defensive strategies)
		state.units = [{ id: 'd', type: 'army', ownerId: b.id, x: x + 2, y }];
		expect(game.validCells(state, a.id, 'farm').has(`${x + 2},${y}`)).toBe(false);
		// your own army on it goes back to your stock
		state.units = [{ id: 'm', type: 'army', ownerId: a.id, x: x + 2, y }];
		a.undeployedUnits = [];
		game.build(state, a.id, 'farm', x + 2, y);
		expect(state.buildings.map((b) => [b.type, b.ownerId])).toEqual([['farm', a.id]]);
		expect(a.undeployedUnits).toEqual(['army']);
		expect(state.log.at(-1)?.text).toEndWith(`builds a farm over {player:${b.id}}'s farm`);
	});
});

describe('city centre', () => {
	const withCityCentre = () => {
		const state = game.createGameState({ ...settings, isCityCentreEnabled: true }, 'g', null);
		const player = game.addPlayer(state);
		game.updatePlayer(state, player.id, { name: 'a', color: 'red' });
		game.setReady(state, player.id, true);
		game.startGame(state);
		game.finishBorn(state, 0);
		return { state, player: state.players[0] };
	};

	test('it produces 1 of the chosen resource, within the standard cap of 1', () => {
		const { state, player } = withCityCentre();
		game.setCityCentre(state, player.id, 'gold');
		expect(game.resourceProduction(state, player.id, 'gold')).toBe(1);
		game.endTurn(state, player.id, 0);
		expect(state.legacy![player.id].gold).toEqual({ before: 0, production: 1, cap: 1, after: 1, isCapped: false });
	});

	test('it can change once per turn and keeps its resource', () => {
		const { state, player } = withCityCentre();
		game.setCityCentre(state, player.id, 'gold');
		expect(() => game.setCityCentre(state, player.id, 'faith')).toThrow();
		game.endTurn(state, player.id, 0);
		game.readyForNextGeneration(state, player.id);
		game.finishBorn(state, 0);
		expect(player.cityCentreResource).toBe('gold');
		game.setCityCentre(state, player.id, 'faith');
		expect(player.cityCentreResource).toBe('faith');
	});

	test('it is refused when the city centre is disabled', () => {
		const state = startedGame(1);
		game.finishBorn(state, 0);
		expect(() => game.setCityCentre(state, state.players[0].id, 'gold')).toThrow();
	});

	test('with Grand Palazzo it produces 6, also when city centre production is off', () => {
		const state = startedGame(1);
		game.finishBorn(state, 0);
		const player = state.players[0];
		player.unlockedTechnologies = ['Grand Palazzo'];
		game.setCityCentre(state, player.id, 'gold');
		expect(game.resourceProduction(state, player.id, 'gold')).toBe(6);
		expect(game.technologyDescription(state, game.getTechnology('Grand Palazzo'))).toStartWith('Click on your city centre to');
		const { state: enabled, player: other } = withCityCentre();
		other.unlockedTechnologies = ['Grand Palazzo'];
		game.setCityCentre(enabled, other.id, 'faith');
		expect(game.resourceProduction(enabled, other.id, 'faith')).toBe(6);
		expect(game.technologyDescription(enabled, game.getTechnology('Grand Palazzo'))).toBe('Your city centre produces 6 instead of 1');
	});
});

describe('army and spy', () => {
	// three players in action phase; returns the active player, the next and the one after that
	const threePlayers = () => {
		const state = startedGame(3);
		game.finishBorn(state, 0);
		const order = [0, 1, 2].map((i) => state.players[(state.turnIndex + i) % 3]);
		order.forEach((p) => {
			p.people = 5;
			p.resources.materials = 20;
			p.resources.faith = 20;
			p.unlockedTechnologies = ['Cryptography', 'Inquisition'];
		});
		return { state, order };
	};

	test('an army on a farm blocks its cap, a second army removes both', () => {
		const { state, order } = threePlayers();
		const [a, b, c] = order;
		unlockBasicUnits(state, ...order);
		const farm = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		expect(game.unitTargets(state, a.id, 'army').has(`${farm.x},${farm.y}`)).toBe(true);
		expect(game.unitTargets(state, a.id, 'army').size).toBe(4); // the farms of b and c, not your own
		game.buyUnit(state, a.id, 'army');
		game.deployUnit(state, a.id, 'army', farm.x, farm.y);
		expect(game.peopleCap(state, b.id)).toBe(1);
		expect(game.overviewText(state, b.id, 'people', 'cap')).toBe('Cap 1\n- 2 farms +2\n- 1 army -1');
		expect(a.resources.materials).toBe(18);

		game.endTurn(state, a.id, 0);
		game.endTurn(state, b.id, 0);
		game.buyUnit(state, c.id, 'army');
		game.deployUnit(state, c.id, 'army', farm.x, farm.y);
		expect(state.units).toHaveLength(0);
		expect(game.peopleCap(state, b.id)).toBe(2);
	});

	test('bought units wait in your stock until placed', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		unlockBasicUnits(state, ...order);
		const farm = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		expect(() => game.deployUnit(state, a.id, 'army', farm.x, farm.y)).toThrow();
		game.buyUnit(state, a.id, 'army');
		game.buyUnit(state, a.id, 'spy');
		expect(a.undeployedUnits).toEqual(['army', 'spy']);
		expect(a.resources.materials).toBe(13);
		game.deployUnit(state, a.id, 'army', farm.x, farm.y);
		game.endTurn(state, a.id, 0);
		expect(a.undeployedUnits).toEqual(['spy']);
	});

	test('your own army removes an opponent army on your farm, but not your own army', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		unlockBasicUnits(state, ...order);
		const farm = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		const ownFarm = state.buildings.find((x) => x.ownerId === b.id && x !== farm && x.type === 'farm')!;
		game.buyUnit(state, a.id, 'army');
		game.buyUnit(state, a.id, 'army');
		game.deployUnit(state, a.id, 'army', farm.x, farm.y);
		expect(game.unitTargets(state, a.id, 'army').has(`${farm.x},${farm.y}`)).toBe(false);
		expect(() => game.deployUnit(state, a.id, 'army', farm.x, farm.y)).toThrow();
		game.endTurn(state, a.id, 0);
		expect(game.unitTargets(state, b.id, 'army').has(`${farm.x},${farm.y}`)).toBe(true);
		expect(game.unitTargets(state, b.id, 'army').has(`${ownFarm.x},${ownFarm.y}`)).toBe(false);
		game.buyUnit(state, b.id, 'army');
		game.deployUnit(state, b.id, 'army', farm.x, farm.y);
		expect(state.units).toHaveLength(0);
		expect(game.peopleCap(state, b.id)).toBe(2);
	});

	test('a spy lowers the cap by 1 and only goes on other buildings', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		state.buildings.push({ id: 'ar', type: 'armoury', ownerId: b.id, x: b.center.x + 1, y: b.center.y });
		const farm = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		game.buyUnit(state, a.id, 'spy');
		expect(() => game.deployUnit(state, a.id, 'spy', farm.x, farm.y)).toThrow();
		game.deployUnit(state, a.id, 'spy', b.center.x + 1, b.center.y);
		expect(game.resourceCap(state, b.id, 'materials')).toBe(4);
		expect(game.resourceProduction(state, b.id, 'materials')).toBe(2);
		expect(game.overviewText(state, b.id, 'materials', 'cap')).toBe('Cap 4\n- Armoury 5\n- 1 spy -1');
		expect(game.isLowered(state, b.id, 'materials', 'cap')).toBe(true);
		expect(game.isLowered(state, b.id, 'materials', 'production')).toBe(false);

		// the same buildings are grouped, ordered by level
		state.buildings.push(
			{ id: 'bs1', type: 'blacksmith', ownerId: b.id, x: b.center.x - 1, y: b.center.y },
			{ id: 'bs2', type: 'blacksmith', ownerId: b.id, x: b.center.x, y: b.center.y + 1 }
		);
		expect(game.overviewText(state, b.id, 'materials', 'production')).toBe('Produced +4\n- 2 blacksmiths +2\n- 1 armoury +2');
		expect(game.overviewText(state, b.id, 'people', 'cap')).toBe('Cap 2\n- 2 farms +2');
		expect(game.peopleText({ ...b, people: 3, talents: ['artist', 'scientist', 'scientist'] })).toBe(
			'People 6\n- 3 regular people\n- Artist\n- 2 scientists'
		);
	});

	test('missionaries stack, one per player, and each blocks 1 until nothing is left', () => {
		const { state, order } = threePlayers();
		const [a, b, c] = order;
		unlockBasicUnits(state, ['shrine'], a, c);
		const armoury = { x: b.center.x + 1, y: b.center.y };
		const stall = { x: b.center.x - 1, y: b.center.y };
		state.buildings.push({ id: 'ar', type: 'armoury', ownerId: b.id, ...armoury }, { id: 'st', type: 'stall', ownerId: b.id, ...stall });
		const farm = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		expect(game.unitTargets(state, a.id, 'missionary').has(`${farm.x},${farm.y}`)).toBe(false);
		game.buyUnit(state, a.id, 'missionary');
		game.buyUnit(state, a.id, 'missionary');
		game.buyUnit(state, a.id, 'missionary');
		expect(a.resources.faith).toBe(14);
		game.deployUnit(state, a.id, 'missionary', armoury.x, armoury.y);
		game.deployUnit(state, a.id, 'missionary', stall.x, stall.y);
		expect(() => game.deployUnit(state, a.id, 'missionary', armoury.x, armoury.y)).toThrow(); // one per player
		expect(game.resourceProduction(state, b.id, 'materials')).toBe(1);
		expect(game.resourceProduction(state, a.id, 'materials')).toBe(0); // the owner gets nothing (yet)
		game.endTurn(state, a.id, 0);
		game.endTurn(state, b.id, 0);
		game.buyUnit(state, c.id, 'missionary');
		game.buyUnit(state, c.id, 'missionary');
		game.deployUnit(state, c.id, 'missionary', armoury.x, armoury.y);
		game.deployUnit(state, c.id, 'missionary', stall.x, stall.y);
		expect(game.overviewText(state, b.id, 'materials', 'production')).toBe('Produced +0\n- 1 armoury +2\n- 2 missionaries -2');
		// a stall produces 1, so the second missionary blocks nothing
		expect(game.overviewText(state, b.id, 'gold', 'production')).toBe('Produced +0\n- 1 stall +1\n- 1 missionary -1');
	});

	test('an inquisitor blocks like a missionary, or removes all other missionaries and inquisitors (also your own) and stays', () => {
		const { state, order } = threePlayers();
		const [a, b, c] = order;
		unlockBasicUnits(state, ['shrine'], a, c);
		const armoury = { x: b.center.x + 1, y: b.center.y };
		const stall = { x: b.center.x - 1, y: b.center.y };
		state.buildings.push({ id: 'ar', type: 'armoury', ownerId: b.id, ...armoury }, { id: 'st', type: 'stall', ownerId: b.id, ...stall });
		game.buyUnit(state, a.id, 'inquisitor');
		game.buyUnit(state, a.id, 'missionary');
		game.deployUnit(state, a.id, 'inquisitor', armoury.x, armoury.y);
		game.deployUnit(state, a.id, 'missionary', stall.x, stall.y);
		expect(game.resourceProduction(state, b.id, 'materials')).toBe(1);
		game.endTurn(state, a.id, 0);
		expect(game.unitTargets(state, b.id, 'inquisitor').has(`${armoury.x},${armoury.y}`)).toBe(true); // also on your own building
		expect(game.unitTargets(state, b.id, 'missionary').has(`${armoury.x},${armoury.y}`)).toBe(false);
		game.endTurn(state, b.id, 0);
		game.buyUnit(state, c.id, 'missionary');
		game.buyUnit(state, c.id, 'inquisitor');
		expect(() => game.deployUnit(state, c.id, 'missionary', armoury.x, armoury.y)).toThrow(); // an inquisitor is alone
		game.deployUnit(state, c.id, 'missionary', stall.x, stall.y);
		game.deployUnit(state, c.id, 'inquisitor', stall.x, stall.y); // removes a's missionary and its own, and stays
		expect(game.faithUnitsAt(state, stall.x, stall.y).map((u) => [u.type, u.ownerId])).toEqual([['inquisitor', c.id]]);
		expect(game.resourceProduction(state, b.id, 'gold')).toBe(0);
		expect(state.log.at(-1)?.text).toEndWith("'s stall and stays");
		expect(c.undeployedUnits).toEqual([]);
	});

	test('an inquisitor can replace your own missionary on an opponent\'s building', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		unlockBasicUnits(state, ['shrine'], a);
		const stall = { x: b.center.x - 1, y: b.center.y };
		state.buildings.push({ id: 'st', type: 'stall', ownerId: b.id, ...stall });
		state.units.push({ id: 'm', type: 'missionary', ownerId: a.id, ...stall });
		a.undeployedUnits = ['inquisitor'];
		expect(game.unitTargets(state, a.id, 'inquisitor').has(`${stall.x},${stall.y}`)).toBe(true);
		game.deployUnit(state, a.id, 'inquisitor', stall.x, stall.y);
		expect(game.faithUnitsAt(state, stall.x, stall.y).map((u) => [u.type, u.ownerId])).toEqual([['inquisitor', a.id]]);
	});

	test('on your own building an inquisitor removes the others, and only stays with Persecution', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		unlockBasicUnits(state, ['shrine'], a, b);
		const stall = { x: b.center.x - 1, y: b.center.y };
		const armoury = { x: b.center.x + 1, y: b.center.y };
		state.buildings.push({ id: 'st', type: 'stall', ownerId: b.id, ...stall }, { id: 'ar', type: 'armoury', ownerId: b.id, ...armoury });
		state.units.push(
			{ id: 'm', type: 'missionary', ownerId: a.id, ...stall },
			{ id: 'i', type: 'inquisitor', ownerId: a.id, ...armoury }
		);
		b.undeployedUnits = ['inquisitor', 'inquisitor'];
		state.turnIndex = order.indexOf(b);
		game.deployUnit(state, b.id, 'inquisitor', stall.x, stall.y);
		expect(game.faithUnitsAt(state, stall.x, stall.y)).toHaveLength(0);
		b.unlockedTechnologies = [...(b.unlockedTechnologies ?? []), 'Persecution'];
		game.deployUnit(state, b.id, 'inquisitor', armoury.x, armoury.y);
		expect(game.faithUnitsAt(state, armoury.x, armoury.y).map((u) => [u.type, u.ownerId])).toEqual([['inquisitor', b.id]]);
	});

	test('a city state produces 1 of its resource, when city states are enabled', () => {
		const { state, order } = threePlayers();
		const [, b] = order;
		b.characteristics.cityState = 'Bologna';
		expect(game.resourceProduction(state, b.id, 'knowledge')).toBe(0);
		state.enabledCharacteristics.cityState = true;
		expect(game.resourceProduction(state, b.id, 'knowledge')).toBe(1);
		expect(game.overviewText(state, b.id, 'knowledge', 'production')).toBe('Produced +1\n- Bologna +1');
	});

	test('armies, traders and missionaries need a building of their resource, also when it is spied on', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		expect(['army', 'trader', 'missionary'].map((u) => game.isUnitUnlocked(state, a, u))).toEqual([false, false, false]);
		expect(() => game.buyUnit(state, a.id, 'army')).toThrow('You need a materials building to buy a army');
		unlockBasicUnits(state, ['blacksmith'], a);
		state.units = [{ id: 's', type: 'spy', ownerId: b.id, x: a.center.x - 1, y: a.center.y - 1 }];
		expect(game.isUnitUnlocked(state, a, 'army')).toBe(true);
		expect(game.isUnitUnlocked(state, a, 'trader')).toBe(false);
		a.unlockedTechnologies = [];
		expect(game.isUnitUnlocked(state, a, 'spy')).toBe(false); // needs Cryptography
		expect(game.unitUnlockText('spy')).toBe('Cryptography');
		expect(game.unitUnlockText('mercenary')).toBe('Mercenary warfare');
	});

	test('a trader trades 2 of your resources for 1 of an opponent, and is used up', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		unlockBasicUnits(state, ...order);
		a.resources.gold = 2;
		a.resources.faith = 1;
		b.resources.power = 1;
		expect(game.traderTargets(state, a.id)).toEqual(new Set([b.id, order[2].id]));
		expect(() => game.trade(state, a.id, b.id, ['gold', 'faith'], ['power'])).toThrow(); // no trader yet
		game.buyUnit(state, a.id, 'trader');
		expect(a.resources.gold).toBe(1);
		expect(() => game.deployUnit(state, a.id, 'trader', b.center.x, b.center.y)).toThrow();
		expect(() => game.trade(state, a.id, b.id, ['gold', 'gold'], ['power'])).toThrow(); // only 1 gold left
		expect(() => game.trade(state, a.id, b.id, ['gold'], ['power'])).toThrow();
		expect(() => game.trade(state, a.id, b.id, ['gold', 'faith'], ['knowledge'])).toThrow(); // b has none
		game.trade(state, a.id, b.id, ['gold', 'faith'], ['power']);
		expect([a.resources.gold, a.resources.faith, a.resources.power]).toEqual([0, 0, 1]);
		expect([b.resources.gold, b.resources.faith, b.resources.power]).toEqual([1, 21, 0]);
		expect(a.undeployedUnits).toEqual([]);
		expect(state.log.at(-1)?.text).toEndWith(' trades 1 gold and 1 faith for 1 power');
	});

});

describe('any level', () => {
	test('a building of any level is placed directly', () => {
		const state = startedGame(2);
		game.finishBorn(state, 0);
		const player = state.players[state.turnIndex];
		const { x, y } = player.center;
		expect(game.hasPlaceFor(state, player.id, 'chapel')).toBe(true);
		expect(game.validCells(state, player.id, 'cathedral').has(`${x + 1},${y}`)).toBe(true);
		player.people = 3;
		player.resources.faith = 2;
		const before = state.buildings.length;
		game.build(state, player.id, 'chapel', x + 1, y);
		expect(state.buildings).toHaveLength(before + 1);
		expect(game.resourceCap(state, player.id, 'faith')).toBe(5);
	});
});

describe('auctions', () => {
	const withTalent = (state: GameState) => {
		// Force the next draw to be talents only.
		state.peoplePool = ['craftsman', 'craftsman'];
		state.talentsAdded = true;
		state.players.forEach((p) => (p.people = 1));
		state.phase = 'legacy';
		state.players.forEach((p) => game.readyForNextGeneration(state, p.id));
		game.finishBorn(state, 0);
	};

	test('the highest bidder wins and pays', () => {
		const state = startedGame(2);
		toActionPhase(state);
		state.players.forEach((p) => (p.resources.materials = 5));
		withTalent(state);
		expect(state.phase).toBe('auction');
		const [first, second] = state.auction!.eligible;
		game.placeBid(state, second, 3);
		expect(() => game.placeBid(state, second, 2)).toThrow();
		expect(() => game.placeBid(state, first, 6)).toThrow();
		game.doneBidding(state, first, 0);
		game.doneBidding(state, second, 0);
		expect(game.getPlayer(state, second).talents).toEqual(['craftsman']);
		expect(game.getPlayer(state, second).resources.materials).toBe(2);
	});

	test('culture adds to a bid, 1 for 1, and the winner pays both', () => {
		const state = startedGame(2);
		toActionPhase(state);
		state.players.forEach((p) => {
			p.resources.materials = 5;
			p.resources.culture = 5;
		});
		withTalent(state);
		const [first, second] = state.auction!.eligible;
		game.placeBid(state, first, 2);
		game.placeBid(state, second, 1, 2);
		expect(game.bidTotal(state, second)).toBe(3);
		expect(state.auction!.history).toEqual([
			{ playerId: first, amount: 2, culture: 0, total: 2 },
			{ playerId: second, amount: 1, culture: 2, total: 3 }
		]);
		expect(() => game.placeBid(state, second, 2, 1)).toThrow();
		expect(() => game.placeBid(state, second, 1, 6)).toThrow();
		game.doneBidding(state, first, 0);
		game.doneBidding(state, second, 0);
		const winner = game.getPlayer(state, second);
		expect(winner.talents).toEqual(['craftsman']);
		expect(winner.resources).toMatchObject({ materials: 4, culture: 3 });
		expect(game.getPlayer(state, first).resources).toMatchObject({ materials: 5, culture: 5 });
	});

	test('the first player wins ties and players at their cap drop out', () => {
		const state = startedGame(2);
		toActionPhase(state);
		withTalent(state);
		const [first, second] = state.auction!.eligible;
		game.doneBidding(state, first, 0);
		game.doneBidding(state, second, 0);
		// first won without bids and is now at the cap, so only second can take the next talent
		expect(game.getPlayer(state, first).talents).toEqual(['craftsman']);
		expect(state.phase).toBe('auction');
		expect(state.auction!.eligible).toEqual([second]);
		game.doneBidding(state, second, 0);
		expect(game.getPlayer(state, second).talents).toEqual(['craftsman']);
		expect(state.phase).toBe('action');
		expect(state.players.every((p) => game.peopleCount(p) === 2)).toBe(true);
	});
});

describe('saving', () => {
	test('a disconnect pauses the game and the timer until everyone is back and ready', () => {
		const state = startedGame(2);
		state.turnTimer = 60;
		game.finishBorn(state, 1000);
		expect(state.turnEndsAt).toBe(61000);
		const [a] = state.players;
		game.disconnectPlayer(state, a.id, 11000);
		expect(state.gameStatus).toBe('saved');
		expect(state.turnRemainingMs).toBe(50000);
		a.isConnected = true;
		expect(game.resumeIfPossible(state, 20000)).toBe(false);
		game.setReady(state, a.id, true);
		expect(game.resumeIfPossible(state, 20000)).toBe(true);
		expect(state.turnEndsAt).toBe(70000);
	});
});

describe('objectives', () => {
	const objectiveGame = () => {
		const state = game.createGameState({ ...settings, objectives: [0, 1, 2] }, 'g', null);
		const player = game.addPlayer(state);
		game.updatePlayer(state, player.id, { name: 'anna', color: 'red' });
		game.setReady(state, player.id, true);
		game.startGame(state);
		return { state, player: state.players[0] };
	};

	test('the highest levels of the 2 best resources count, F&E do not', () => {
		const { state, player } = objectiveGame();
		const add = (type: string, x: number) => state.buildings.push({ id: type + x, type, ownerId: player.id, x, y: 0 });
		add('estate', 0);
		add('blacksmith', 1);
		add('armoury', 2);
		add('barracks', 3);
		expect(game.objectiveProgress(state, player.id, 0)).toBe(3 / 8); // all materials
		add('shop', 4);
		expect(game.objectiveProgress(state, player.id, 0)).toBe(5 / 8);
		add('factory', 5);
		add('factory', 6);
		expect(game.objectiveProgress(state, player.id, 0)).toBe(6 / 8); // 2 factories are not 2 different ones
		add('bank', 7);
		expect(game.objectiveProgress(state, player.id, 0)).toBe(1);
	});

	test('people, armies in stock, deployed inquisitors and different talents count', () => {
		const { state, player } = objectiveGame();
		player.people = 8;
		player.talents = ['artist', 'artist', 'scientist'];
		player.undeployedUnits = ['army', 'army', 'mercenary', 'inquisitor'];
		state.units.push({ id: 'i', type: 'inquisitor', ownerId: player.id, x: 0, y: 0 });
		expect(game.objectiveProgress(state, player.id, 1)).toBe(11 / 25);
		expect(game.objectiveProgress(state, player.id, 2)).toBe(2 / 20); // mercenaries do not count
		expect(game.objectiveOverview(state, 2)).toBe('anna has 2/20 armies');
		expect(game.objectiveProgress(state, player.id, 4)).toBe(1 / 9); // only the one on the board
		expect(game.objectiveProgress(state, player.id, 5)).toBe(2 / 6);
		// the counter goes above the goal, the progress stays full
		player.undeployedUnits = Array(25).fill('army');
		expect(game.objectiveOverview(state, 2)).toBe('anna has 25/20 armies');
		expect(game.objectiveProgress(state, player.id, 2)).toBe(1);
		for (let i = 0; i < 11; i++) state.units.push({ id: 'i' + i, type: 'inquisitor', ownerId: player.id, x: i + 1, y: 0 });
		expect(game.objectiveOverview(state, 4)).toBe('anna has 12/9 inquisitors');
		expect(game.objectiveProgress(state, player.id, 4)).toBe(1);
	});

	test('the highest technology level counts, and whether Centralization is in effect', () => {
		const { state, player } = objectiveGame();
		player.unlockedTechnologies = ['Cryptography', 'Tradecraft', 'Counter intelligence', 'Coinage'];
		player.unlockedPolicies = ['War machine', 'Subsidies', 'Isolationism'];
		player.policiesInEffect = ['Subsidies', 'Isolationism'];
		expect(game.objectiveProgress(state, player.id, 6)).toBe(3 / 4); // Counter intelligence
		expect(game.objectiveProgress(state, player.id, 7)).toBe(0);
		player.policiesInEffect = ['Subsidies', 'Centralization'];
		expect(game.objectiveProgress(state, player.id, 7)).toBe(1);
	});

	test('the resources received through trade count until the next generation', () => {
		const { state, a, b } = twoPlayers();
		a.undeployedUnits = ['trader'];
		game.trade(state, a.id, b.id, ['gold', 'gold'], ['faith']);
		expect(game.objectiveProgress(state, a.id, 3)).toBe(1 / 30);
		game.beginGeneration(state);
		expect(game.objectiveProgress(state, a.id, 3)).toBe(0);
	});

	const complete = (state: GameState, playerId: string) => {
		const player = game.getPlayer(state, playerId);
		player.people = 50;
		player.undeployedUnits = Array.from({ length: 20 }, () => 'army' as const);
		state.buildings.push(
			{ id: 'f' + playerId, type: 'factory', ownerId: playerId, x: 0, y: 0 },
			{ id: 'b' + playerId, type: 'bank', ownerId: playerId, x: 1, y: 0 }
		);
	};

	test('the game ends at the end of phase two, not before', () => {
		const { state, player } = objectiveGame();
		toActionPhase(state);
		complete(state, player.id);
		expect(state.gameStatus).toBe('inProgress');
		game.endTurn(state, player.id, 0);
		expect(state.gameStatus).toBe('finished');
		expect(state.phase).toBe('action');
		expect(state.winnerIds).toEqual([player.id]);
	});

	test('players completing the objectives at the same time draw', () => {
		const state = game.createGameState({ ...settings, objectives: [0, 1, 2] }, 'g', null);
		for (const color of ['red', 'blue']) {
			const p = game.addPlayer(state);
			game.updatePlayer(state, p.id, { name: color, color });
			game.setReady(state, p.id, true);
		}
		game.startGame(state);
		toActionPhase(state);
		for (const p of state.players) complete(state, p.id);
		endAllTurns(state);
		expect(state.gameStatus).toBe('finished');
		expect(state.winnerIds?.length).toBe(2);
	});
});

const twoPlayers = () => {
	const state = startedGame(2);
	game.finishBorn(state, 0);
	const order = [0, 1].map((i) => state.players[(state.turnIndex + i) % 2]);
	for (const p of order) {
		p.people = 5;
		p.resources = { materials: 10, gold: 20, faith: 10, culture: 30, knowledge: 30, power: 40 };
	}
	return { state, a: order[0], b: order[1] };
};

// b gets an armoury (cap 9, production 3) and a blacksmith (cap 4)
const withBuildings = () => {
	const players = twoPlayers();
	const { state, b } = players;
	const armoury = { x: b.center.x + 1, y: b.center.y };
	const blacksmith = { x: b.center.x - 1, y: b.center.y };
	state.buildings.push({ id: 'ar', type: 'armoury', ownerId: b.id, ...armoury }, { id: 'bs', type: 'blacksmith', ownerId: b.id, ...blacksmith });
	return { ...players, armoury, blacksmith };
};

describe('policies', () => {
	test('a policy is unlocked by buying it, implemented in a slot for free and removed for 3 power', () => {
		const { state, a } = twoPlayers();
		expect(() => game.implementPolicy(state, a.id, 'Defensive strategies', 0)).toThrow(); // not unlocked yet
		game.unlockPolicy(state, a.id, 'Defensive strategies');
		expect(a.resources.materials).toBe(7);
		expect(a.resources.power).toBe(37);
		game.implementPolicy(state, a.id, 'Defensive strategies', 0);
		expect(a.resources.power).toBe(37);
		game.removePolicy(state, a.id, 'Defensive strategies');
		expect(a.resources.power).toBe(34);
		expect(a.policiesInEffect).toEqual([null, null, null]);
	});

	test('Courtyard gardens adds 5 to the people cap, also without city centre production', () => {
		const { state, a } = twoPlayers();
		expect(state.isCityCentreEnabled).toBe(false);
		expect(game.peopleCap(state, a.id)).toBe(2); // the 2 starting farms
		a.unlockedPolicies = ['Courtyard gardens'];
		game.implementPolicy(state, a.id, 'Courtyard gardens', 0);
		expect(game.peopleCap(state, a.id)).toBe(7);
		expect(game.overviewText(state, a.id, 'people', 'cap')).toContain('- Courtyard gardens +5');
	});

	test('Grain reserves keeps the people cap at least 10, also when armies block the farms', () => {
		const { state, a, b } = twoPlayers();
		const farms = state.buildings.filter((x) => x.ownerId === a.id);
		farms.forEach((farm, i) => state.units.push({ id: `army${i}`, type: 'army', ownerId: b.id, x: farm.x, y: farm.y }));
		expect(game.peopleCap(state, a.id)).toBe(0);
		a.unlockedPolicies = ['Grain reserves'];
		game.implementPolicy(state, a.id, 'Grain reserves', 0);
		expect(game.peopleCap(state, a.id)).toBe(10);
		expect(game.overviewText(state, a.id, 'people', 'cap')).toContain('- Grain reserves +10');
	});

	test('Agrarian reform adds 1 to each farm and estate, which an army blocks too', () => {
		const { state, a, b } = twoPlayers();
		a.unlockedPolicies = ['Agrarian reform'];
		game.implementPolicy(state, a.id, 'Agrarian reform', 0);
		expect(game.peopleCap(state, a.id)).toBe(4);
		const farm = state.buildings.find((x) => x.ownerId === a.id)!;
		state.units.push({ id: 'army', type: 'army', ownerId: b.id, x: farm.x, y: farm.y });
		expect(game.peopleCap(state, a.id)).toBe(2);
	});

	test('a policy can cost people', () => {
		const { state, a } = twoPlayers();
		a.resources = { materials: 4, gold: 0, faith: 0, culture: 4, knowledge: 4, power: 4 };
		game.unlockPolicy(state, a.id, 'Grain reserves');
		expect(a.people).toBe(1);
		expect(a.resources).toEqual({ materials: 0, gold: 0, faith: 0, culture: 0, knowledge: 0, power: 0 });
	});

	test('a policy goes in the slot it was put in, and the others keep their place', () => {
		const { state, a } = twoPlayers();
		a.unlockedPolicies = ['Defensive strategies', 'Freedom of speech'];
		game.implementPolicy(state, a.id, 'Defensive strategies', 2);
		expect(a.policiesInEffect).toEqual([null, null, 'Defensive strategies']);
		expect(() => game.implementPolicy(state, a.id, 'Freedom of speech', 2)).toThrow(); // taken
		game.implementPolicy(state, a.id, 'Freedom of speech', 0);
		game.removePolicy(state, a.id, 'Defensive strategies');
		expect(a.policiesInEffect).toEqual(['Freedom of speech', null, null]);
	});

	test('at most 3 policies are in effect', () => {
		const { state, a } = twoPlayers();
		a.unlockedPolicies = ['Defensive strategies', 'Freedom of speech', 'Isolationism', 'Zealots'];
		a.policiesInEffect = ['Defensive strategies', 'Freedom of speech', 'Isolationism'];
		expect(() => game.implementPolicy(state, a.id, 'Zealots', 0)).toThrow();
	});
});

describe('technologies', () => {
	test('a column is unlocked from the top down, and each opponent who has it makes it 1 knowledge cheaper', () => {
		const { state, a, b } = twoPlayers();
		expect(() => game.buyUnit(state, a.id, 'spy')).toThrow();
		expect(() => game.unlockTechnology(state, a.id, 'Tradecraft')).toThrow(); // Cryptography first
		game.unlockTechnology(state, a.id, 'Cryptography');
		expect([a.resources.materials, a.resources.knowledge]).toEqual([9, 28]);
		expect(() => game.unlockTechnology(state, a.id, 'Cryptography')).toThrow(); // already yours
		game.buyUnit(state, a.id, 'spy');
		expect(game.technologyCost(state, b.id, 'Cryptography')).toEqual([
			{ amount: 1, resourceType: 'materials' },
			{ amount: 1, resourceType: 'knowledge' }
		]);
		expect(game.technologyCost(state, b.id, 'Tradecraft')[1].amount).toBe(4);
	});

	test('a level 4 technology also costs the talent of its column', () => {
		const { state, a } = twoPlayers();
		a.unlockedTechnologies = ['Cryptography', 'Tradecraft', 'Counter intelligence'];
		a.resources.materials = 13;
		a.resources.knowledge = 25;
		a.talents = [];
		expect(() => game.unlockTechnology(state, a.id, 'Covert operations')).toThrow();
		a.talents = ['craftsman'];
		game.unlockTechnology(state, a.id, 'Covert operations');
		expect(a.talents).toEqual([]);
		expect(state.peoplePool).toContain('craftsman');
	});

	test('tradecraft adds what your spies take to your cap', () => {
		const { state, a, b, blacksmith } = withBuildings();
		a.unlockedTechnologies = ['Cryptography', 'Tradecraft'];
		game.buyUnit(state, a.id, 'spy');
		game.deployUnit(state, a.id, 'spy', blacksmith.x, blacksmith.y);
		expect(game.overviewText(state, b.id, 'materials', 'cap')).toBe('Cap 4\n- Armoury 5\n- 1 spy -1');
		expect(game.overviewText(state, a.id, 'materials', 'cap')).toBe('Cap 2\n- Standard 1\n- 1 spy +1');
	});

	test('with covert operations a spied building does not count for the cap, tradecraft still gives you 1', () => {
		const { state, a, b, blacksmith, armoury } = withBuildings();
		a.unlockedTechnologies = ['Cryptography', 'Tradecraft', 'Counter intelligence', 'Covert operations'];
		// on the blacksmith (cap 2), below the armoury that still counts: nothing changes
		state.units = [{ id: 's', type: 'spy', ownerId: a.id, ...blacksmith }];
		expect(game.resourceCap(state, b.id, 'materials')).toBe(5);
		expect(game.isLowered(state, b.id, 'materials', 'cap')).toBe(false);
		expect(game.resourceCap(state, a.id, 'materials')).toBe(2);
		// on the armoury (cap 5): the blacksmith's 2 is left
		state.units = [{ id: 's', type: 'spy', ownerId: a.id, ...armoury }];
		expect(game.resourceCap(state, b.id, 'materials')).toBe(2);
		expect(game.overviewText(state, b.id, 'materials', 'cap')).toBe('Cap 2\n- Armoury 5\n- 1 spy -3');
		expect(game.resourceCap(state, a.id, 'materials')).toBe(2);
		// without another building: 0
		state.buildings = state.buildings.filter((x) => x.id !== 'bs');
		expect(game.resourceCap(state, b.id, 'materials')).toBe(0);
		expect(game.resourceCap(state, a.id, 'materials')).toBe(2);
	});

	test('covert operations spies of two opponents on both buildings bring the cap to 0, without it 1 each', () => {
		const state = startedGame(3);
		game.finishBorn(state, 0);
		const [a, b, c] = state.players;
		const bank = { x: b.center.x + 1, y: b.center.y };
		const shop = { x: b.center.x - 1, y: b.center.y };
		state.buildings.push({ id: 'bank', type: 'bank', ownerId: b.id, ...bank }, { id: 'shop', type: 'shop', ownerId: b.id, ...shop });
		state.units = [
			{ id: 'sa', type: 'spy', ownerId: a.id, ...bank },
			{ id: 'sc', type: 'spy', ownerId: c.id, ...shop }
		];
		for (const p of [a, c]) p.unlockedTechnologies = ['Cryptography', 'Tradecraft'];
		expect(game.resourceCap(state, b.id, 'gold')).toBe(13); // 15 - 1 - 1
		for (const p of [a, c]) p.unlockedTechnologies.push('Counter intelligence', 'Covert operations');
		expect(game.resourceCap(state, b.id, 'gold')).toBe(0);
		expect(game.overviewText(state, b.id, 'gold', 'cap')).toBe('Cap 0\n- Bank 15\n- 2 spies -15');
		expect([game.resourceCap(state, a.id, 'gold'), game.resourceCap(state, c.id, 'gold')]).toEqual([2, 2]);
		// only one with Covert operations: the bank does not count, the shop's 5 is lowered by 1
		c.unlockedTechnologies = ['Cryptography', 'Tradecraft'];
		expect(game.resourceCap(state, b.id, 'gold')).toBe(4);
	});

	test('with defensive strategies your own army guards your farm, until an opponent removes it with theirs', () => {
		const { state, a, b } = twoPlayers();
		unlockBasicUnits(state, a, b);
		const farm = state.buildings.find((x) => x.ownerId === a.id && x.type === 'farm')!;
		const key = `${farm.x},${farm.y}`;
		expect(game.unitTargets(state, a.id, 'army').has(key)).toBe(false);
		a.unlockedPolicies = ['Defensive strategies'];
		a.policiesInEffect = ['Defensive strategies', null, null];
		expect(game.unitTargets(state, a.id, 'army').has(key)).toBe(true);
		const cap = game.peopleCap(state, a.id);
		game.buyUnit(state, a.id, 'army');
		game.deployUnit(state, a.id, 'army', farm.x, farm.y);
		expect(game.peopleCap(state, a.id)).toBe(cap); // your own army lowers nothing
		expect(game.unitTargets(state, a.id, 'army').has(key)).toBe(false); // already guarded
		expect(game.unitTargets(state, b.id, 'army').has(key)).toBe(true); // both go when b places theirs
	});

	test('with counter intelligence your own spy guards your building', () => {
		const { state, a, b, armoury } = withBuildings();
		a.unlockedTechnologies = ['Cryptography'];
		b.unlockedTechnologies = ['Cryptography'];
		expect(game.unitTargets(state, b.id, 'spy').has(`${armoury.x},${armoury.y}`)).toBe(false);
		b.unlockedTechnologies.push('Tradecraft', 'Counter intelligence');
		expect(game.unitTargets(state, b.id, 'spy').has(`${armoury.x},${armoury.y}`)).toBe(true);
		state.units = [{ id: 's', type: 'spy', ownerId: b.id, ...armoury }];
		expect(game.resourceCap(state, b.id, 'materials')).toBe(5); // your own spy takes nothing
		expect(game.unitTargets(state, a.id, 'spy').has(`${armoury.x},${armoury.y}`)).toBe(false);
	});

	test('you trade once with each opponent per turn, unless you have caravans', () => {
		const { state, a, b } = twoPlayers();
		unlockBasicUnits(state, a, b);
		game.buyUnit(state, a.id, 'trader');
		game.buyUnit(state, a.id, 'trader');
		game.trade(state, a.id, b.id, ['gold', 'gold'], ['culture']);
		expect(() => game.trade(state, a.id, b.id, ['gold', 'gold'], ['culture'])).toThrow(game.tradeLimitMessage);
		a.unlockedTechnologies = ['Coinage', 'Caravans'];
		game.trade(state, a.id, b.id, ['gold'], ['culture']); // 1 for 1 with Coinage
		expect([a.resources.gold, a.resources.culture]).toEqual([20 - 2 - 2 - 1, 32]);
		expect(a.undeployedUnits).toEqual([]);
	});

	test('with caravans several traders trade at once', () => {
		const { state, a, b } = twoPlayers();
		a.undeployedUnits = ['trader', 'trader'];
		expect(game.maxTraders(a)).toBe(1);
		expect(() => game.trade(state, a.id, b.id, ['gold', 'gold', 'gold', 'gold'], ['culture', 'power'])).toThrow();
		a.unlockedTechnologies = ['Coinage', 'Caravans'];
		expect(game.maxTraders(a)).toBe(2);
		expect(() => game.trade(state, a.id, b.id, ['gold', 'gold', 'gold'], ['culture', 'power', 'power'])).toThrow(); // only 2 traders
		game.trade(state, a.id, b.id, ['gold', 'gold'], ['culture', 'power']);
		expect([a.resources.gold, a.resources.culture, a.resources.power]).toEqual([18, 31, 41]);
		expect(a.undeployedUnits).toEqual([]);
	});

	test('infrastructure trades 1 of yours for 2 of theirs, and the limit starts over each turn', () => {
		const { state, a, b } = twoPlayers();
		unlockBasicUnits(state, a, b);
		a.unlockedTechnologies = ['Coinage', 'Caravans', 'Infrastructure'];
		game.buyUnit(state, a.id, 'trader');
		expect(() => game.trade(state, a.id, b.id, ['gold', 'gold'], ['culture'])).toThrow();
		game.trade(state, a.id, b.id, ['gold'], ['culture', 'power']);
		expect([a.resources.culture, a.resources.power, b.resources.gold]).toEqual([31, 41, 21]);
		a.tradedWith = [b.id];
		game.endTurn(state, a.id, 0);
		expect(a.tradedWith).toEqual([]);
	});

	test('tithes give you what your inquisitors reduce, pilgrimage reduces all production', () => {
		const { state, a, b, armoury } = withBuildings();
		a.unlockedTechnologies = ['Inquisition', 'Tithes', 'Persecution', 'Pilgrimage'];
		game.buyUnit(state, a.id, 'inquisitor');
		game.deployUnit(state, a.id, 'inquisitor', armoury.x, armoury.y);
		expect(game.overviewText(state, b.id, 'materials', 'production')).toBe('Produced +1\n- 1 blacksmith +1\n- 1 armoury +2\n- 1 inquisitor -2');
		expect(game.overviewText(state, a.id, 'materials', 'production')).toBe('Produced +2\n- 1 inquisitor +2');
	});

	test('with persecution your own inquisitor guards your building', () => {
		const { state, a, b, armoury } = withBuildings();
		a.unlockedTechnologies = ['Inquisition'];
		b.unlockedTechnologies = ['Inquisition', 'Tithes', 'Persecution'];
		expect(game.unitTargets(state, b.id, 'inquisitor').has(`${armoury.x},${armoury.y}`)).toBe(true);
		state.units = [{ id: 'i', type: 'inquisitor', ownerId: b.id, ...armoury }];
		expect(game.resourceProduction(state, b.id, 'materials')).toBe(3); // your own inquisitor reduces nothing
		expect(game.unitTargets(state, a.id, 'inquisitor').has(`${armoury.x},${armoury.y}`)).toBe(false);
		expect(game.unitTargets(state, a.id, 'missionary').has(`${armoury.x},${armoury.y}`)).toBe(false);
	});

	test('interest gives +1 gold the first generation after unlocking it, then +2, etc.', () => {
		const { state, a } = twoPlayers();
		a.unlockedTechnologies = ['Coinage', 'Caravans', 'Infrastructure', 'Interest'];
		a.technologyGenerations = { Interest: state.stats.nrOfGenerations };
		expect(game.resourceProduction(state, a.id, 'gold')).toBe(0);
		state.stats.nrOfGenerations += 2;
		expect(game.overviewText(state, a.id, 'gold', 'production')).toBe('Produced +2\n- Interest +2');
	});

	test('retraining, indoctrination and propaganda cost culture', () => {
		const { state, a, b } = twoPlayers();
		a.talents = ['craftsman'];
		b.talents = ['artist'];
		expect(() => game.retrainTalent(state, a.id, 0, 'merchant')).toThrow();
		a.unlockedTechnologies = ['Propaganda posters', 'Reeducation programs', 'Fresco paintings'];
		game.retrainTalent(state, a.id, 0, 'merchant');
		expect(a.talents).toEqual(['merchant']);
		game.indoctrinate(state, a.id, b.id, 0);
		expect(a.talents).toEqual(['merchant', 'artist']);
		expect(b.talents).toEqual([]);
		game.propaganda(state, a.id, b.id);
		expect(a.people).toBe(6);
		expect(b.people).toBe(4);
		expect(a.resources.culture).toBe(30 - 7 - 9 - 3);
		expect(b.resources.culture).toBe(30);
	});

	test('with Subsidies in effect your people cannot be won over', () => {
		const { state, a, b } = twoPlayers();
		b.talents = ['artist'];
		a.unlockedTechnologies = ['Propaganda posters', 'Fresco paintings'];
		b.policiesInEffect = ['Subsidies'];
		expect(() => game.propaganda(state, a.id, b.id)).toThrow();
		expect(() => game.indoctrinate(state, a.id, b.id, 0)).toThrow();
		expect(b.talents).toEqual(['artist']);
	});
});

describe('test mode', () => {
	test('buildings, units, technologies and policies cost nothing', () => {
		const { state, a } = twoPlayers();
		state.isTestMode = true;
		a.people = 0;
		a.resources = { materials: 0, gold: 0, faith: 0, culture: 0, knowledge: 0, power: 0 };
		expect(game.canPay(state, a, game.getUnitStats('army').cost)).toBe(true);
		game.build(state, a.id, 'blacksmith', a.center.x + 1, a.center.y);
		game.build(state, a.id, 'armoury', a.center.x - 1, a.center.y);
		game.buyUnit(state, a.id, 'army');
		game.unlockTechnology(state, a.id, 'Cryptography');
		game.unlockPolicy(state, a.id, 'Defensive strategies');
		game.implementPolicy(state, a.id, 'Defensive strategies', 0);
		expect(a.people).toBe(0);
		expect(Object.values(a.resources).every((amount) => amount === 0)).toBe(true);
		expect(a.undeployedUnits).toEqual(['army']);
	});
});

describe('test mode start', () => {
	test('a test game can start below the minimum player count', () => {
		const state = game.createGameState({ ...settings, minPlayerCount: 3, isTestMode: true }, 'g1', null);
		const player = game.addPlayer(state);
		game.updatePlayer(state, player.id, { name: 'player1', color: 'red' });
		game.setReady(state, player.id, true);
		expect(game.canStart(state)).toBe(true);
		state.isTestMode = false;
		expect(game.canStart(state)).toBe(false);
	});

	test('no farms, all technologies and policies unlocked', () => {
		const state = game.createGameState({ ...settings, isTestMode: true }, 'g1', null);
		const player = game.addPlayer(state);
		game.updatePlayer(state, player.id, { name: 'player1', color: 'red' });
		game.setReady(state, player.id, true);
		game.startGame(state);
		expect(state.buildings).toEqual([]);
		expect(player.unlockedTechnologies).toHaveLength(16);
		expect(player.unlockedPolicies).toHaveLength(18);
		expect(player.policiesInEffect).toEqual([]);
	});
});

describe('mercenary warfare', () => {
	test('mercenaries can be bought while the policy is in effect', () => {
		const { state, a } = twoPlayers();
		expect(game.isUnitUnlocked(state, a, 'mercenary')).toBe(false);
		game.unlockPolicy(state, a.id, 'Mercenary warfare');
		expect(() => game.buyUnit(state, a.id, 'mercenary')).toThrow(); // unlocked, not in effect yet
		game.implementPolicy(state, a.id, 'Mercenary warfare', 0);
		game.buyUnit(state, a.id, 'mercenary');
		expect(a.undeployedUnits).toEqual(['mercenary']);
		game.removePolicy(state, a.id, 'Mercenary warfare');
		expect(game.isUnitUnlocked(state, a, 'mercenary')).toBe(false);
		expect(a.undeployedUnits).toEqual(['mercenary']); // stays in stock
	});
});

describe('titles', () => {
	const withTitles = (titles: { a?: string; b?: string }) => {
		const players = withBuildings();
		players.state.enabledCharacteristics.title = true;
		players.a.characteristics.title = titles.a ?? '';
		players.b.characteristics.title = titles.b ?? '';
		return players;
	};

	test('a General removing an army from their own farm with their army keeps it there, not on an opponent\'s', () => {
		const { state, a, b } = withTitles({ a: 'General' });
		unlockBasicUnits(state, a, b);
		const farm = state.buildings.find((x) => x.ownerId === a.id && x.type === 'farm')!;
		state.units.push({ id: 'b-army', type: 'army', ownerId: b.id, x: farm.x, y: farm.y });
		game.buyUnit(state, a.id, 'army');
		game.deployUnit(state, a.id, 'army', farm.x, farm.y);
		expect(state.units.map((u) => u.ownerId)).toEqual([a.id]);
		expect(game.peopleCap(state, a.id)).toBe(2); // your own army blocks nothing of yours
		// on an opponent's farm (here their own army, with Defensive strategies) both go, as usual
		const theirs = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		state.units.push({ id: 'b-guard', type: 'army', ownerId: b.id, x: theirs.x, y: theirs.y });
		game.buyUnit(state, a.id, 'army');
		game.deployUnit(state, a.id, 'army', theirs.x, theirs.y);
		expect(state.units.filter((u) => u.x === theirs.x && u.y === theirs.y)).toHaveLength(0);
	});

	test('a Podestà gets 1 gold for each unspent person when a generation begins, within the gold cap', () => {
		const { state, a } = withTitles({ a: 'Podestà' });
		state.buildings.push({ id: 'st', type: 'stall', ownerId: a.id, x: a.center.x + 1, y: a.center.y });
		a.resources.gold = 0;
		game.beginGeneration(state);
		expect(a.resources.gold).toBe(2); // 5 people, but the cap is 2
	});

	test('with Zealots a missionary costs 1 person and 1 faith', () => {
		const { state, a, b } = withBuildings();
		a.unlockedPolicies = ['Zealots'];
		a.policiesInEffect = ['Zealots', null, null];
		expect(game.unitCost(state, a, 'missionary')).toEqual([{ amount: 1, resourceType: 'people' }, { amount: 1, resourceType: 'faith' }]);
		expect(game.unitCost(state, b, 'missionary')).toEqual(game.getUnitStats('missionary').cost);
	});

	test('a Bishop starts with Zealots unlocked and in effect', () => {
		const state = game.createGameState(settings, 'g1', null);
		state.enabledCharacteristics.title = true;
		const [bishop, other] = [0, 1].map((i) => {
			const player = game.addPlayer(state);
			player.characteristics.title = i === 0 ? 'Bishop' : 'General';
			game.updatePlayer(state, player.id, { color: colors[i] });
			player.isReadyForGame = true;
			return player;
		});
		game.startGame(state);
		expect(bishop.unlockedPolicies).toEqual(['Zealots']);
		expect(bishop.policiesInEffect).toEqual(['Zealots', null, null]);
		expect(other.policiesInEffect).toEqual([]);
		expect(game.unitCost(state, bishop, 'missionary')).toEqual([{ amount: 1, resourceType: 'people' }, { amount: 1, resourceType: 'faith' }]);
	});

	test("with Freedom of speech opponents' missionaries can't be put on your buildings, the ones there stay and inquisitors still can", () => {
		const { state, a, b } = withBuildings();
		const shop = { id: 'sh', type: 'shop', ownerId: b.id, x: b.center.x + 1, y: b.center.y };
		state.buildings.push(shop);
		a.unlockedTechnologies = ['Inquisition'];
		const key = `${shop.x},${shop.y}`;
		expect(game.unitTargets(state, a.id, 'missionary').has(key)).toBe(true);
		b.unlockedPolicies = ['Freedom of speech'];
		b.policiesInEffect = ['Freedom of speech', null, null];
		expect(game.unitTargets(state, a.id, 'missionary').has(key)).toBe(false);
		expect(game.unitTargets(state, a.id, 'inquisitor').has(key)).toBe(true);
		state.units.push({ id: 'm', type: 'missionary', ownerId: a.id, x: shop.x, y: shop.y });
		expect(game.resourceProduction(state, b.id, 'gold')).toBe(1); // still blocks 1
	});

	test("a Patron's culture counts 2 in bids", () => {
		const { state, a, b } = withTitles({ a: 'Patron' });
		expect([game.cultureWorth(state, a), game.cultureWorth(state, b)]).toEqual([2, 1]);
	});

	test('a Philosopher may pay a talent with another of its group', () => {
		const player = { id: 'p', people: 0, talents: ['messiah', 'craftsman'] as Talent[], resources: { materials: 0, gold: 0, faith: 0, culture: 0, knowledge: 0, power: 0 } };
		const cost = [{ amount: 1, resourceType: 'scientist' as const }];
		expect(game.talentPayment(player, cost)).toBeNull();
		expect(game.talentPayment(player, cost, { substitutes: true })).toEqual({ required: ['messiah'], choices: 0, options: ['craftsman'] });
		expect(game.talentPayment(player, [{ amount: 1, resourceType: 'merchant' as const }], { substitutes: true })).toBeNull(); // the craftsman has no group
	});

	test("a Dictator's buildings are no target for missionaries, nor for spies without Covert operations", () => {
		const { state, a, armoury } = withTitles({ b: 'Dictator' });
		const cell = `${armoury.x},${armoury.y}`;
		expect(game.unitTargets(state, a.id, 'missionary').has(cell)).toBe(false);
		expect(game.unitTargets(state, a.id, 'spy').has(cell)).toBe(false);
		expect(game.unitTargets(state, a.id, 'inquisitor').has(cell)).toBe(true);
		a.unlockedTechnologies = ['Cryptography', 'Tradecraft', 'Counter intelligence', 'Covert operations'];
		expect(game.unitTargets(state, a.id, 'spy').has(cell)).toBe(true);
	});
});

describe('religious dominance', () => {
	// b has a building on all 8 cells inside the wall, a has a missionary on 7 of them
	const dominance = () => {
		const players = twoPlayers();
		const { state, a, b } = players;
		state.isReligiousDominanceEnabled = true;
		const cells = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: b.center.x + dx, y: b.center.y + dy }))).filter((c) => c.x !== b.center.x || c.y !== b.center.y);
		cells.forEach((c, i) => state.buildings.push({ id: `s${i}`, type: 'shrine', ownerId: b.id, ...c }));
		cells.slice(0, 7).forEach((c, i) => state.units.push({ id: `m${i}`, type: 'missionary', ownerId: a.id, ...c }));
		a.undeployedUnits = ['missionary', 'missionary'];
		return { ...players, last: cells[7], centre: `${b.center.x},${b.center.y}` };
	};

	test('a missionary on all 8 buildings inside the wall opens the city centre, which gives dominance', () => {
		const { state, a, b, last, centre } = dominance();
		expect(game.religiousDominanceProgress(state, a.id)).toBe(7 / 9);
		expect(game.unitTargets(state, a.id, 'missionary').has(centre)).toBe(false);
		game.deployUnit(state, a.id, 'missionary', last.x, last.y);
		expect(game.religiousDominanceProgress(state, a.id)).toBe(8 / 9);
		expect(game.hasReligiousDominance(state, a.id, b.id)).toBe(false);
		expect(game.unitTargets(state, a.id, 'missionary').has(centre)).toBe(true);
		game.deployUnit(state, a.id, 'missionary', b.center.x, b.center.y);
		expect(game.hasReligiousDominance(state, a.id, b.id)).toBe(true);
		expect(game.religiousDominanceOverview(state)).toContain(`${a.name} converted 8 buildings and 1 city centre`);
		expect(game.unitTargets(state, b.id, 'missionary').has(`${a.center.x},${a.center.y}`)).toBe(false);
	});

	test('the missionary on the city centre keeps dominance for good', () => {
		const { state, a, b, last, centre } = dominance();
		game.deployUnit(state, a.id, 'missionary', last.x, last.y);
		game.deployUnit(state, a.id, 'missionary', b.center.x, b.center.y);
		expect(game.unitTargets(state, a.id, 'missionary').has(centre)).toBe(false); // one per player
		state.units = state.units.filter((u) => u.x !== last.x || u.y !== last.y);
		expect(game.hasReligiousDominance(state, a.id, b.id)).toBe(true);
		// nothing on the city centre can be targeted or bribed away
		expect(game.unitTargets(state, b.id, 'inquisitor').has(centre)).toBe(false);
		const unit = state.units.find((u) => u.x === b.center.x && u.y === b.center.y)!;
		b.policiesInEffect = ['Ambassador bribes', null, null];
		expect(() => game.bribe(state, b.id, unit.id)).toThrow();
	});

	test('dominance over all opponents wins at the end of phase two, only when enabled', () => {
		const { state, a, b, last } = dominance();
		game.deployUnit(state, a.id, 'missionary', last.x, last.y);
		expect(game.checkObjectives(state)).toBe(false); // the 8 buildings alone are not enough
		game.deployUnit(state, a.id, 'missionary', b.center.x, b.center.y);
		expect(game.checkObjectives(state)).toBe(true);
		expect(state.winnerIds).toEqual([a.id]);

		const other = dominance();
		other.state.isReligiousDominanceEnabled = false;
		other.state.units.push({ id: 'm7', type: 'missionary', ownerId: other.a.id, ...other.last });
		other.state.units.push({ id: 'mc', type: 'missionary', ownerId: other.a.id, ...other.b.center });
		expect(game.checkObjectives(other.state)).toBe(false);
	});

	test('a draw between religious dominance and the objectives says how each won', () => {
		const { state, a, b, last } = dominance();
		game.deployUnit(state, a.id, 'missionary', last.x, last.y);
		game.deployUnit(state, a.id, 'missionary', b.center.x, b.center.y);
		// b meets the only objective: Absolute power, Centralization in effect
		state.objectives = [objectiveList.findIndex((o) => o.name === 'Absolute power')];
		b.policiesInEffect = ['Centralization', null, null];
		expect(game.checkObjectives(state)).toBe(true);
		expect([...(state.winnerIds ?? [])].sort()).toEqual([a.id, b.id].sort());
		expect(state.log.at(-1)?.text).toMatch(/^A draw: .+ has religious dominance over all players and .+ has completed all objectives$|^A draw: .+ has completed all objectives and .+ has religious dominance over all players$/);
	});
});

describe('the policies at work', () => {
	const put = (player: GameState['players'][number], name: string) => {
		player.unlockedPolicies = [...(player.unlockedPolicies ?? []), name];
		player.policiesInEffect = [name, null, null];
	};

	test('War machine: an army costs 1 person and 1 materials, a mercenary the same as before', () => {
		const { state, a } = twoPlayers();
		put(a, 'War machine');
		expect(game.unitCost(state, a, 'army')).toEqual([{ amount: 1, resourceType: 'people' }, { amount: 1, resourceType: 'materials' }]);
		expect(game.unitCost(state, a, 'mercenary')).toEqual(game.getUnitStats('mercenary').cost);
	});

	test('Centralized logistics: the cap your army blocks is added to yours', () => {
		const { state, a, b } = twoPlayers();
		const farm = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		state.units.push({ id: 'u', type: 'army', ownerId: a.id, x: farm.x, y: farm.y });
		const before = game.peopleCap(state, a.id);
		put(a, 'Centralized logistics');
		expect(game.peopleCap(state, a.id)).toBe(before + 1);
		expect(game.overviewText(state, a.id, 'people', 'cap')).toContain('- 1 army +1');
	});

	test('Ambassador bribes: each unit has its own price, inquisitors can be bribed too', () => {
		const { state, a, b } = twoPlayers();
		const farm = state.buildings.find((x) => x.ownerId === a.id && x.type === 'farm')!;
		state.buildings.push({ id: 'sh', type: 'shop', ownerId: a.id, x: a.center.x + 1, y: a.center.y });
		state.units.push({ id: 'm', type: 'mercenary', ownerId: b.id, x: farm.x, y: farm.y }, { id: 'i', type: 'inquisitor', ownerId: b.id, x: a.center.x + 1, y: a.center.y });
		put(a, 'Ambassador bribes');
		a.resources.gold = 11;
		game.bribe(state, a.id, 'm');
		expect(a.resources.gold).toBe(8);
		game.bribe(state, a.id, 'i');
		expect(a.resources.gold).toBe(0);
		expect(state.units).toHaveLength(0);
	});

	test('Tax reformation: once a generation is born, opponents pay 1 gold per unit inside your wall, or the unit returns; armies pay nothing', () => {
		const { state, a, b } = twoPlayers();
		const farm = state.buildings.find((x) => x.ownerId === a.id && x.type === 'farm')!;
		const cells = [-1, 1].map((dx) => ({ x: a.center.x + dx, y: a.center.y }));
		cells.forEach((cell, i) => state.buildings.push({ id: `b${i}`, type: 'shop', ownerId: a.id, ...cell }));
		state.units.push(
			{ id: 'army', type: 'army', ownerId: b.id, x: farm.x, y: farm.y },
			...cells.map((cell, i) => ({ id: `spy${i}`, type: 'spy' as const, ownerId: b.id, ...cell }))
		);
		put(a, 'Tax reformation');
		a.resources.gold = 0;
		b.resources.gold = 1;
		b.undeployedUnits = [];
		game.beginGeneration(state);
		expect(a.resources.gold).toBe(1);
		expect(b.resources.gold).toBe(0);
		expect(state.units.map((u) => u.id)).toEqual(['army', 'spy0']);
		expect(b.undeployedUnits).toEqual(['spy']);
	});

	test('Tax reformation: inquisitors are paid for first, then spies and missionaries', () => {
		const { state, a, b } = twoPlayers();
		const farm = state.buildings.find((x) => x.ownerId === a.id && x.type === 'farm')!;
		const cells = [-1, 0, 1].map((dx) => ({ x: a.center.x + dx, y: a.center.y - 1 }));
		cells.forEach((cell, i) => state.buildings.push({ id: `b${i}`, type: 'shop', ownerId: a.id, ...cell }));
		state.units.push(
			{ id: 'army', type: 'army', ownerId: b.id, x: farm.x, y: farm.y },
			{ id: 'inquisitor', type: 'inquisitor', ownerId: b.id, ...cells[0] },
			{ id: 'spy', type: 'spy', ownerId: b.id, ...cells[1] },
			{ id: 'missionary', type: 'missionary', ownerId: b.id, ...cells[2] }
		);
		put(a, 'Tax reformation');
		b.resources.gold = 2;
		b.undeployedUnits = [];
		game.beginGeneration(state);
		expect(state.units.map((u) => u.id).sort()).toEqual(['army', 'inquisitor', 'spy']);
		expect(b.undeployedUnits).toEqual(['missionary']);
	});

	test("Holy sacraments: 1 faith for each opponent's missionary and inquisitor on your buildings", () => {
		const { state, a, b } = twoPlayers();
		const cells = [a.center.x + 1, a.center.x - 1].map((x) => ({ x, y: a.center.y }));
		state.buildings.push({ id: 'sh', type: 'shrine', ownerId: a.id, ...cells[0] }, { id: 'st', type: 'stall', ownerId: a.id, ...cells[1] });
		state.units.push({ id: 'm', type: 'missionary', ownerId: b.id, ...cells[0] }, { id: 'i', type: 'inquisitor', ownerId: b.id, ...cells[1] });
		const before = game.resourceProduction(state, a.id, 'faith');
		put(a, 'Holy sacraments');
		expect(game.resourceProduction(state, a.id, 'faith')).toBe(before + 2);
	});

	test("Work ethic: when the regular people can't pay a building, 1 talent pays all of its people", () => {
		const { state, a } = twoPlayers();
		a.people = 1;
		a.talents = ['craftsman', 'artist', 'scientist'];
		a.resources.materials = 4;
		put(a, 'Work ethic');
		game.build(state, a.id, 'barracks', a.center.x + 1, a.center.y, ['artist']);
		expect(a.people).toBe(1); // the regular person is not spent
		expect(a.talents).toEqual(['scientist']);
		// when the regular people can pay, they do
		a.people = 2;
		a.resources.materials = 2;
		game.build(state, a.id, 'armoury', a.center.x - 1, a.center.y);
		expect(a.people).toBe(0);
		expect(a.talents).toEqual(['scientist']);
		// units cost the same as before
		expect(game.canPay(state, a, game.unitCost(state, a, 'trader'))).toBe(true);
		a.talents = [];
		expect(game.canPay(state, a, game.unitCost(state, a, 'trader'))).toBe(false);
	});

	test('Bread and circuses: each upcoming generation 1 people cap per opponent without an opera house', () => {
		const { state, a, b } = twoPlayers();
		const [capA, capB] = [game.peopleCap(state, a.id), game.peopleCap(state, b.id)];
		a.unlockedPolicies = ['Bread and circuses'];
		game.implementPolicy(state, a.id, 'Bread and circuses', 0);
		expect([game.peopleCap(state, a.id), game.peopleCap(state, b.id)]).toEqual([capA, capB]); // from the next generation
		state.stats.nrOfGenerations += 1;
		expect([game.peopleCap(state, a.id), game.peopleCap(state, b.id)]).toEqual([capA + 1, capB - 1]);
		expect(game.overviewText(state, a.id, 'people', 'cap')).toContain('- Bread and circuses +1');
		expect(game.overviewText(state, b.id, 'people', 'cap')).toContain(`- Bread and circuses of ${a.name} -1`);
		state.stats.nrOfGenerations += 5;
		expect([game.peopleCap(state, a.id), game.peopleCap(state, b.id)]).toEqual([capA + 6, 0]); // never below 0
		// an opera house reverts it for that opponent
		state.buildings.push({ id: 'oh', type: 'opera house', ownerId: b.id, x: b.center.x + 1, y: b.center.y });
		expect([game.peopleCap(state, a.id), game.peopleCap(state, b.id)]).toEqual([capA, capB]);
		state.buildings.pop();
		// removing it reverts all of it, implementing it again starts at 0
		game.removePolicy(state, a.id, 'Bread and circuses');
		expect([game.peopleCap(state, a.id), game.peopleCap(state, b.id)]).toEqual([capA, capB]);
		game.implementPolicy(state, a.id, 'Bread and circuses', 1);
		expect([game.peopleCap(state, a.id), game.peopleCap(state, b.id)]).toEqual([capA, capB]);
	});

	test('Espionage: a technology an opponent has costs no knowledge', () => {
		const { state, a, b } = twoPlayers();
		b.unlockedTechnologies = ['Cryptography'];
		const knowledge = (name: string) => game.technologyCost(state, a.id, name).find((c) => c.resourceType === 'knowledge')!.amount;
		expect(knowledge('Cryptography')).toBe(1);
		expect(() => game.unlockPolicy(state, a.id, 'Espionage')).toThrow(); // needs Tradecraft
		a.unlockedTechnologies = ['Cryptography', 'Tradecraft'];
		game.unlockPolicy(state, a.id, 'Espionage');
		game.implementPolicy(state, a.id, 'Espionage', 0);
		expect(knowledge('Cryptography')).toBe(0);
		expect(knowledge('Coinage')).toBe(2);
	});

	test('Isolationism: nobody trades with you and you trade with nobody', () => {
		const { state, a, b } = twoPlayers();
		expect(game.traderTargets(state, a.id).has(b.id)).toBe(true);
		put(b, 'Isolationism');
		expect(game.traderTargets(state, a.id).has(b.id)).toBe(false);
		expect(game.traderTargets(state, b.id).size).toBe(0);
	});

	test('Centralization: what you lack of a resource is paid with power, never people', () => {
		const { state, a } = twoPlayers();
		a.resources.gold = 1;
		a.resources.power = 5;
		const shop = game.getBuildingStats('shop').cost;
		expect(game.canPay(state, a, shop, true)).toBe(false);
		put(a, 'Centralization');
		game.build(state, a.id, 'shop', a.center.x + 1, a.center.y);
		expect([a.resources.gold, a.resources.power]).toEqual([0, 4]);
		a.people = 0;
		a.talents = [];
		expect(game.canPay(state, a, [{ amount: 1, resourceType: 'people' }])).toBe(false);
		// power the cost asks for itself comes first
		expect(game.canPay(state, a, [{ amount: 1, resourceType: 'gold' }, { amount: 4, resourceType: 'power' }])).toBe(false);
		expect(game.canPay(state, a, [{ amount: 1, resourceType: 'gold' }, { amount: 3, resourceType: 'power' }])).toBe(true);
	});

	test('Centralization also pays bribes, the culture actions and bids', () => {
		const { state, a, b } = twoPlayers();
		put(a, 'Centralization');
		a.unlockedPolicies = ['Centralization', 'Ambassador bribes'];
		a.policiesInEffect = ['Centralization', 'Ambassador bribes', null];
		a.unlockedTechnologies = ['Propaganda posters'];
		// a bribe: 3 gold and 2 power for an army
		const farm = state.buildings.find((x) => x.ownerId === a.id && x.type === 'farm')!;
		state.units.push({ id: 'u', type: 'army', ownerId: b.id, x: farm.x, y: farm.y });
		a.resources.gold = 3;
		a.resources.power = 10;
		game.bribe(state, a.id, 'u');
		expect([a.resources.gold, a.resources.power]).toEqual([0, 8]);
		// propaganda: 1 culture and 2 power
		a.resources.culture = 1;
		game.propaganda(state, a.id, b.id);
		expect([a.resources.culture, a.resources.power]).toEqual([0, 6]);
		// a bid of more gold than you have
		state.phase = 'auction';
		state.auction = { queue: [], talent: 'merchant', deficits: { [a.id]: 1, [b.id]: 1 }, eligible: [a.id, b.id], bids: { [a.id]: 0, [b.id]: 0 }, cultureBids: {}, done: [], won: { [a.id]: 0, [b.id]: 0 }, regularPeople: 0 };
		game.placeBid(state, a.id, 4, 0);
		expect(() => game.placeBid(state, a.id, 7, 0)).toThrow();
	});
});
