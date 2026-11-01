import { describe, expect, test } from 'bun:test';
import * as game from './logic';
import { regularPeopleInPool, type Talent } from './config';
import type { GameSettings, GameState } from './types';

const settings: GameSettings = {
	name: 'test',
	minPlayerCount: 1,
	maxPlayerCount: 6,
	turnTimer: null,
	objectives: ['random', 'random', 'random'],
	enabledCharacteristics: { title: false, personalityTrait: false, cityState: false },
	isCityCentreEnabled: false,
	isReligiousDominanceEnabled: false,
	isBuildingLimitEnabled: false,
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
		expect(state.lastBorn).toEqual({ people: 4, talents: 0 });
		toActionPhase(state);
		expect(state.players.map((p) => p.people)).toEqual([2, 2]);
		expect(state.peoplePool).toHaveLength(regularPeopleInPool - 4);
		expect(state.players[0].isTurn).toBe(true);
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
		expect(() => game.build(state, player.id, 'blacksmith', x, y)).toThrow();

		endAllTurns(state);
		expect(state.phase).toBe('legacy');
		expect(player.resources.materials).toBe(1);
		expect(state.legacy![player.id].gold).toEqual({ before: 0, production: 0, cap: 1, after: 0, isCapped: false });

		game.readyForNextGeneration(state, player.id);
		expect(state.stats.nrOfGenerations).toBe(2);
		expect(state.talentsAdded).toBe(true);
		expect(state.phase).toBe('born');
	});

	test('production stops at the highest cap', () => {
		const state = startedGame(1);
		toActionPhase(state);
		const player = state.players[0];
		for (let i = 0; i < 6; i++) state.buildings.push({ id: `b${i}`, type: 'blacksmith', ownerId: player.id, x: 0, y: i });
		player.resources.materials = 2;
		endAllTurns(state);
		expect(state.legacy![player.id].materials).toEqual({ before: 2, production: 6, cap: 4, after: 4, isCapped: true });
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

	test('the starting farms are in the second ring', () => {
		const state = startedGame(2);
		for (const player of state.players) {
			const farms = state.buildings.filter((b) => b.ownerId === player.id);
			expect(farms).toHaveLength(2);
			expect(farms.every((f) => ring(player.center, `${f.x},${f.y}`) === 2)).toBe(true);
		}
	});

	test('farms do not extend where other buildings can go', () => {
		const state = startedGame(1);
		const player = state.players[0];
		const { x, y } = player.center;
		state.buildings = [{ id: 'f', type: 'farm', ownerId: player.id, x: x + 1, y }];
		const cells = game.validCells(state, player.id, 'blacksmith');
		expect(cells.has(`${x + 2},${y}`)).toBe(false);
		expect([...cells].every((c) => ring(player.center, c) === 1)).toBe(true);
	});

	test('farms go up to 2 rings from the center or other buildings, but not from farms', () => {
		const state = startedGame(1);
		const player = state.players[0];
		const { x, y } = player.center;
		state.buildings = [];
		const fromCenter = game.validCells(state, player.id, 'farm');
		expect(fromCenter.size).toBe(24);
		expect(Math.max(...[...fromCenter].map((c) => ring(player.center, c)))).toBe(2);

		state.buildings = [{ id: 'b', type: 'blacksmith', ownerId: player.id, x: x + 1, y }];
		const withBlacksmith = game.validCells(state, player.id, 'farm');
		expect(withBlacksmith.has(`${x + 3},${y}`)).toBe(true);
		expect(withBlacksmith.has(`${x + 4},${y}`)).toBe(false);

		state.buildings = [{ id: 'f', type: 'farm', ownerId: player.id, x: x + 2, y }];
		expect(game.validCells(state, player.id, 'farm').has(`${x + 3},${y}`)).toBe(false);
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
		const farm = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		expect(() => game.deployUnit(state, a.id, 'army', farm.x, farm.y)).toThrow();
		game.buyUnit(state, a.id, 'army');
		game.buyUnit(state, a.id, 'spy');
		expect(a.undeployedUnits).toEqual(['army', 'spy']);
		expect(a.resources.materials).toBe(12);
		game.deployUnit(state, a.id, 'army', farm.x, farm.y);
		game.endTurn(state, a.id, 0);
		expect(a.undeployedUnits).toEqual(['spy']);
	});

	test('your own army removes an opponent army on your farm, but not your own army', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
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
		expect(game.resourceCap(state, b.id, 'materials')).toBe(8);
		expect(game.resourceProduction(state, b.id, 'materials')).toBe(3);
		expect(game.overviewText(state, b.id, 'materials', 'cap')).toBe('Cap 8\n- Armoury 9\n- 1 spy -1');
		expect(game.isLowered(state, b.id, 'materials', 'cap')).toBe(true);
		expect(game.isLowered(state, b.id, 'materials', 'production')).toBe(false);

		// the same buildings are grouped, ordered by level
		state.buildings.push(
			{ id: 'bs1', type: 'blacksmith', ownerId: b.id, x: b.center.x - 1, y: b.center.y },
			{ id: 'bs2', type: 'blacksmith', ownerId: b.id, x: b.center.x, y: b.center.y + 1 }
		);
		expect(game.overviewText(state, b.id, 'materials', 'production')).toBe('Produced +5\n- 2 blacksmiths +2\n- 1 armoury +3');
		expect(game.overviewText(state, b.id, 'people', 'cap')).toBe('Cap 2\n- 2 farms +2');
		expect(game.peopleText({ ...b, people: 3, talents: ['artist', 'scientist', 'scientist'] })).toBe(
			'People 6\n- 3 regular people\n- Artist\n- 2 scientists'
		);
	});

	test('missionaries stack, one per player, and each blocks 1 until nothing is left', () => {
		const { state, order } = threePlayers();
		const [a, b, c] = order;
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
		expect(game.resourceProduction(state, b.id, 'materials')).toBe(2);
		expect(game.resourceProduction(state, a.id, 'materials')).toBe(0); // the owner gets nothing (yet)
		game.endTurn(state, a.id, 0);
		game.endTurn(state, b.id, 0);
		game.buyUnit(state, c.id, 'missionary');
		game.buyUnit(state, c.id, 'missionary');
		game.deployUnit(state, c.id, 'missionary', armoury.x, armoury.y);
		game.deployUnit(state, c.id, 'missionary', stall.x, stall.y);
		expect(game.overviewText(state, b.id, 'materials', 'production')).toBe('Produced +1\n- 1 armoury +3\n- 2 missionaries -2');
		// a stall produces 1, so the second missionary blocks nothing
		expect(game.overviewText(state, b.id, 'gold', 'production')).toBe('Produced +0\n- 1 stall +1\n- 1 missionary -1');
	});

	test('an inquisitor blocks like a missionary, or removes all missionaries and inquisitors, also your own', () => {
		const { state, order } = threePlayers();
		const [a, b, c] = order;
		const armoury = { x: b.center.x + 1, y: b.center.y };
		const stall = { x: b.center.x - 1, y: b.center.y };
		state.buildings.push({ id: 'ar', type: 'armoury', ownerId: b.id, ...armoury }, { id: 'st', type: 'stall', ownerId: b.id, ...stall });
		game.buyUnit(state, a.id, 'inquisitor');
		game.buyUnit(state, a.id, 'missionary');
		game.deployUnit(state, a.id, 'inquisitor', armoury.x, armoury.y);
		game.deployUnit(state, a.id, 'missionary', stall.x, stall.y);
		expect(game.resourceProduction(state, b.id, 'materials')).toBe(2);
		game.endTurn(state, a.id, 0);
		expect(game.unitTargets(state, b.id, 'inquisitor').has(`${armoury.x},${armoury.y}`)).toBe(true); // also on your own building
		expect(game.unitTargets(state, b.id, 'missionary').has(`${armoury.x},${armoury.y}`)).toBe(false);
		game.endTurn(state, b.id, 0);
		game.buyUnit(state, c.id, 'missionary');
		game.buyUnit(state, c.id, 'inquisitor');
		expect(() => game.deployUnit(state, c.id, 'missionary', armoury.x, armoury.y)).toThrow(); // an inquisitor is alone
		game.deployUnit(state, c.id, 'missionary', stall.x, stall.y);
		game.deployUnit(state, c.id, 'inquisitor', stall.x, stall.y); // removes a's missionary and its own
		expect(game.faithUnitsAt(state, stall.x, stall.y)).toHaveLength(0);
		expect(game.resourceProduction(state, b.id, 'gold')).toBe(1);
		expect(c.undeployedUnits).toEqual([]);
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

	test('a trader trades 2 of your resources for 1 of an opponent, and is used up', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		a.resources.gold = 3;
		a.resources.faith = 1;
		b.resources.power = 1;
		expect(game.unitTargets(state, a.id, 'trader')).toEqual(new Set([`${b.center.x},${b.center.y}`, `${order[2].center.x},${order[2].center.y}`]));
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

	test('a unit stays on its cell when the building is upgraded', () => {
		const { state, order } = threePlayers();
		const [a, b] = order;
		const farm = state.buildings.find((x) => x.ownerId === b.id && x.type === 'farm')!;
		game.buyUnit(state, a.id, 'army');
		game.deployUnit(state, a.id, 'army', farm.x, farm.y);
		farm.type = 'estate';
		expect(game.peopleCap(state, b.id)).toBe(1);
	});
});

describe('upgrades', () => {
	test('a better building replaces your building one level lower', () => {
		const state = startedGame(2);
		game.finishBorn(state, 0);
		const player = state.players[state.turnIndex];
		const other = state.players.find((p) => p !== player)!;
		const { x, y } = player.center;
		state.buildings = [
			{ id: 'a', type: 'shrine', ownerId: player.id, x: x + 1, y },
			{ id: 'b', type: 'blacksmith', ownerId: player.id, x: x - 1, y },
			{ id: 'c', type: 'shrine', ownerId: other.id, x: other.center.x + 1, y: other.center.y }
		];
		expect([...game.validCells(state, player.id, 'chapel')]).toEqual([`${x + 1},${y}`]);
		expect(game.hasPlaceFor(state, player.id, 'chapel')).toBe(true);
		expect(game.hasPlaceFor(state, player.id, 'church')).toBe(false);

		player.people = 3;
		player.resources.faith = 3;
		game.build(state, player.id, 'chapel', x + 1, y);
		expect(state.buildings.filter((b) => b.ownerId === player.id).map((b) => b.type).sort()).toEqual(['blacksmith', 'chapel']);
		expect(game.resourceCap(state, player.id, 'faith')).toBe(9);
	});

	test('an estate replaces a farm', () => {
		const state = startedGame(1);
		game.finishBorn(state, 0);
		const player = state.players[0];
		const farms = state.buildings.filter((b) => b.type === 'farm');
		expect(game.validCells(state, player.id, 'estate')).toEqual(new Set(farms.map((f) => `${f.x},${f.y}`)));
		player.people = 5;
		game.build(state, player.id, 'estate', farms[0].x, farms[0].y);
		expect(game.peopleCap(state, player.id)).toBe(5);
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

	test('the 2 highest building levels count, F&E do not', () => {
		const { state, player } = objectiveGame();
		const add = (type: string, x: number) => state.buildings.push({ id: type + x, type, ownerId: player.id, x, y: 0 });
		add('estate', 0);
		add('blacksmith', 1);
		add('armoury', 2);
		add('barracks', 3);
		expect(game.objectiveProgress(state, player.id, 0)).toBe(5 / 8);
	});

	test('people, armies in stock, deployed inquisitors and different talents count', () => {
		const { state, player } = objectiveGame();
		player.people = 8;
		player.talents = ['artist', 'artist', 'scientist'];
		player.undeployedUnits = ['army', 'army', 'mercenary', 'inquisitor'];
		state.units.push({ id: 'i', type: 'inquisitor', ownerId: player.id, x: 0, y: 0 });
		expect(game.objectiveProgress(state, player.id, 1)).toBe(11 / 50);
		expect(game.objectiveProgress(state, player.id, 2)).toBe(2 / 20); // mercenaries do not count
		expect(game.objectiveOverview(state, 2)).toBe('anna has 2/20 armies');
		expect(game.objectiveProgress(state, player.id, 4)).toBe(1 / 10); // only the one on the board
		expect(game.objectiveProgress(state, player.id, 5)).toBe(2 / 6);
	});

	test('the 2 highest technology levels and policy levels in effect count', () => {
		const { state, player } = objectiveGame();
		player.unlockedTechnologies = ['Cryptography', 'Tradecraft', 'Counter intelligence', 'Coinage'];
		player.unlockedPolicies = ['War machine', 'Subsidies', 'Isolationism'];
		player.policiesInEffect = ['Subsidies', 'Isolationism'];
		expect(game.objectiveProgress(state, player.id, 6)).toBe(4 / 8); // 3 + 1, one per column
		expect(game.objectiveProgress(state, player.id, 7)).toBe(4 / 6); // 2 + 2, War machine is not in effect
	});

	test('the resources received through trade count until the next generation', () => {
		const { state, a, b } = twoPlayers();
		a.undeployedUnits = ['trader'];
		game.trade(state, a.id, b.id, ['gold', 'gold'], ['faith']);
		expect(game.objectiveProgress(state, a.id, 3)).toBe(1 / 40);
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
		expect(a.resources.materials).toBe(4);
		expect(a.resources.power).toBe(34);
		game.implementPolicy(state, a.id, 'Defensive strategies', 0);
		expect(a.resources.power).toBe(34);
		game.removePolicy(state, a.id, 'Defensive strategies');
		expect(a.resources.power).toBe(31);
		expect(a.policiesInEffect).toEqual([null, null, null]);
	});

	test('Courtyard gardens adds 4 to the people cap, also without city centre production', () => {
		const { state, a } = twoPlayers();
		expect(state.isCityCentreEnabled).toBe(false);
		expect(game.peopleCap(state, a.id)).toBe(2); // the 2 starting farms
		a.unlockedPolicies = ['Courtyard gardens'];
		game.implementPolicy(state, a.id, 'Courtyard gardens', 0);
		expect(game.peopleCap(state, a.id)).toBe(6);
		expect(game.overviewText(state, a.id, 'people', 'cap')).toContain('- Courtyard gardens +4');
	});

	test('Grain reserves keeps the people cap at least 12, also when armies block the farms', () => {
		const { state, a, b } = twoPlayers();
		const farms = state.buildings.filter((x) => x.ownerId === a.id);
		farms.forEach((farm, i) => state.units.push({ id: `army${i}`, type: 'army', ownerId: b.id, x: farm.x, y: farm.y }));
		expect(game.peopleCap(state, a.id)).toBe(0);
		a.unlockedPolicies = ['Grain reserves'];
		game.implementPolicy(state, a.id, 'Grain reserves', 0);
		expect(game.peopleCap(state, a.id)).toBe(12);
		expect(game.overviewText(state, a.id, 'people', 'cap')).toContain('- Grain reserves +12');
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
		a.resources = { materials: 8, gold: 0, faith: 0, culture: 8, knowledge: 8, power: 8 };
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
		a.unlockedPolicies = ['Defensive strategies', 'Freedom of speech', 'Isolationism', 'Theocracy'];
		a.policiesInEffect = ['Defensive strategies', 'Freedom of speech', 'Isolationism'];
		expect(() => game.implementPolicy(state, a.id, 'Theocracy', 0)).toThrow();
	});
});

describe('technologies', () => {
	test('a column is unlocked from the bottom up, and each opponent who has it makes it 1 knowledge cheaper', () => {
		const { state, a, b } = twoPlayers();
		expect(() => game.buyUnit(state, a.id, 'spy')).toThrow();
		expect(() => game.unlockTechnology(state, a.id, 'Tradecraft')).toThrow(); // Cryptography first
		game.unlockTechnology(state, a.id, 'Cryptography');
		expect([a.resources.materials, a.resources.knowledge]).toEqual([9, 27]);
		expect(() => game.unlockTechnology(state, a.id, 'Cryptography')).toThrow(); // already yours
		game.buyUnit(state, a.id, 'spy');
		expect(game.technologyCost(state, b.id, 'Cryptography')).toEqual([
			{ amount: 1, resourceType: 'materials' },
			{ amount: 2, resourceType: 'knowledge' }
		]);
		expect(game.technologyCost(state, b.id, 'Tradecraft')[1].amount).toBe(8);
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

	test('tradecraft adds what your spies take to your cap, covert operations take the whole cap', () => {
		const { state, a, b, blacksmith } = withBuildings();
		a.unlockedTechnologies = ['Cryptography', 'Tradecraft'];
		game.buyUnit(state, a.id, 'spy');
		game.deployUnit(state, a.id, 'spy', blacksmith.x, blacksmith.y);
		expect(game.overviewText(state, b.id, 'materials', 'cap')).toBe('Cap 8\n- Armoury 9\n- 1 spy -1');
		expect(game.overviewText(state, a.id, 'materials', 'cap')).toBe('Cap 2\n- Standard 1\n- 1 spy +1');
		a.unlockedTechnologies.push('Counter intelligence', 'Covert operations');
		expect(game.resourceCap(state, b.id, 'materials')).toBe(5);
		expect(game.resourceCap(state, a.id, 'materials')).toBe(5);
	});

	test('with counter intelligence your own spy guards your building', () => {
		const { state, a, b, armoury } = withBuildings();
		a.unlockedTechnologies = ['Cryptography'];
		b.unlockedTechnologies = ['Cryptography'];
		expect(game.unitTargets(state, b.id, 'spy').has(`${armoury.x},${armoury.y}`)).toBe(false);
		b.unlockedTechnologies.push('Tradecraft', 'Counter intelligence');
		expect(game.unitTargets(state, b.id, 'spy').has(`${armoury.x},${armoury.y}`)).toBe(true);
		state.units = [{ id: 's', type: 'spy', ownerId: b.id, ...armoury }];
		expect(game.resourceCap(state, b.id, 'materials')).toBe(9); // your own spy takes nothing
		expect(game.unitTargets(state, a.id, 'spy').has(`${armoury.x},${armoury.y}`)).toBe(false);
	});

	test('you trade once with each opponent per turn, unless you have caravans', () => {
		const { state, a, b } = twoPlayers();
		game.buyUnit(state, a.id, 'trader');
		game.buyUnit(state, a.id, 'trader');
		game.trade(state, a.id, b.id, ['gold', 'gold'], ['culture']);
		expect(() => game.trade(state, a.id, b.id, ['gold', 'gold'], ['culture'])).toThrow(game.tradeLimitMessage);
		a.unlockedTechnologies = ['Coinage', 'Caravans'];
		game.trade(state, a.id, b.id, ['gold'], ['culture']); // 1 for 1 with Coinage
		expect([a.resources.gold, a.resources.culture]).toEqual([20 - 4 - 2 - 1, 32]);
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
		expect(game.overviewText(state, b.id, 'materials', 'production')).toBe('Produced +1\n- 1 blacksmith +1\n- 1 armoury +3\n- 1 inquisitor -3');
		expect(game.overviewText(state, a.id, 'materials', 'production')).toBe('Produced +3\n- 1 inquisitor +3');
	});

	test('with persecution your own inquisitor guards your building', () => {
		const { state, a, b, armoury } = withBuildings();
		a.unlockedTechnologies = ['Inquisition'];
		b.unlockedTechnologies = ['Inquisition', 'Tithes', 'Persecution'];
		expect(game.unitTargets(state, b.id, 'inquisitor').has(`${armoury.x},${armoury.y}`)).toBe(true);
		state.units = [{ id: 'i', type: 'inquisitor', ownerId: b.id, ...armoury }];
		expect(game.resourceProduction(state, b.id, 'materials')).toBe(4); // your own inquisitor reduces nothing
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

	test('gothic engineering places level 3 and 4 buildings like level 1, without the building one level lower', () => {
		const { state, a } = twoPlayers();
		const cell = `${a.center.x + 1},${a.center.y}`;
		expect(game.hasPlaceFor(state, a.id, 'barracks')).toBe(false);
		a.unlockedTechnologies = ['Propaganda posters', 'Reeducation programs', 'Fresco paintings', 'Gothic engineering'];
		expect(game.hasPlaceFor(state, a.id, 'barracks')).toBe(true);
		expect(game.validCells(state, a.id, 'factory').has(cell)).toBe(true);
		expect(game.validCells(state, a.id, 'armoury').size).toBe(0); // level 2 still needs a blacksmith
		state.buildings.push({ id: 'ar', type: 'armoury', ownerId: a.id, x: a.center.x - 1, y: a.center.y });
		expect(game.validCells(state, a.id, 'barracks').has(`${a.center.x - 1},${a.center.y}`)).toBe(true); // the upgrade still works
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
		expect(a.resources.culture).toBe(30 - 8 - 12 - 3);
		expect(b.resources.culture).toBe(30);
	});
});

describe('building limit', () => {
	test('only 1 building of each type, farms and estates excepted', () => {
		const { state, a } = twoPlayers();
		state.isBuildingLimitEnabled = true;
		game.build(state, a.id, 'blacksmith', a.center.x + 1, a.center.y);
		expect(game.hasPlaceFor(state, a.id, 'blacksmith')).toBe(false);
		expect(game.validCells(state, a.id, 'blacksmith').size).toBe(0);
		expect(() => game.build(state, a.id, 'blacksmith', a.center.x - 1, a.center.y)).toThrow();
		expect(game.hasPlaceFor(state, a.id, 'stall')).toBe(true);
		expect(game.hasPlaceFor(state, a.id, 'farm')).toBe(true);
		// an armoury replaces the blacksmith, so another blacksmith fits again
		game.build(state, a.id, 'armoury', a.center.x + 1, a.center.y);
		expect(game.hasPlaceFor(state, a.id, 'blacksmith')).toBe(true);
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
		game.build(state, a.id, 'armoury', a.center.x + 1, a.center.y);
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
		expect(game.isUnitUnlocked(a, 'mercenary')).toBe(false);
		game.unlockPolicy(state, a.id, 'Mercenary warfare');
		expect(() => game.buyUnit(state, a.id, 'mercenary')).toThrow(); // unlocked, not in effect yet
		game.implementPolicy(state, a.id, 'Mercenary warfare', 0);
		game.buyUnit(state, a.id, 'mercenary');
		expect(a.undeployedUnits).toEqual(['mercenary']);
		game.removePolicy(state, a.id, 'Mercenary warfare');
		expect(game.isUnitUnlocked(a, 'mercenary')).toBe(false);
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

	test('a General removing an army with their army keeps it there', () => {
		const { state, a, b } = withTitles({ a: 'General' });
		const farm = state.buildings.find((x) => x.ownerId === a.id && x.type === 'farm')!;
		state.units.push({ id: 'b-army', type: 'army', ownerId: b.id, x: farm.x, y: farm.y });
		game.buyUnit(state, a.id, 'army');
		game.deployUnit(state, a.id, 'army', farm.x, farm.y);
		expect(state.units.map((u) => u.ownerId)).toEqual([a.id]);
		expect(game.peopleCap(state, a.id)).toBe(2); // your own army blocks nothing of yours
	});

	test('a Podestà gets 1 gold for each unspent person when a generation begins, within the gold cap', () => {
		const { state, a } = withTitles({ a: 'Podestà' });
		state.buildings.push({ id: 'st', type: 'stall', ownerId: a.id, x: a.center.x + 1, y: a.center.y });
		a.resources.gold = 0;
		game.beginGeneration(state);
		expect(a.resources.gold).toBe(4); // 5 people, but the cap is 4
	});

	test("a Bishop's missionaries cost 1 fewer faith", () => {
		const { state, a, b } = withTitles({ a: 'Bishop' });
		expect(game.unitCost(state, a, 'missionary')).toEqual([{ amount: 1, resourceType: 'people' }, { amount: 1, resourceType: 'faith' }]);
		expect(game.unitCost(state, b, 'missionary')).toEqual(game.getUnitStats('missionary').cost);
	});

	test("a Patron's culture counts 2 in bids", () => {
		const { state, a, b } = withTitles({ a: 'Patron' });
		expect([game.cultureWorth(state, a), game.cultureWorth(state, b)]).toEqual([2, 1]);
	});

	test('a Philosopher may pay a talent with another of its group', () => {
		const player = { id: 'p', people: 0, talents: ['messiah', 'craftsman'] as Talent[], resources: { materials: 0, gold: 0, faith: 0, culture: 0, knowledge: 0, power: 0 } };
		const cost = [{ amount: 1, resourceType: 'scientist' as const }];
		expect(game.talentPayment(player, cost)).toBeNull();
		expect(game.talentPayment(player, cost, true)).toEqual({ required: ['messiah'], choices: 0, options: ['craftsman'] });
		expect(game.talentPayment(player, [{ amount: 1, resourceType: 'merchant' as const }], true)).toBeNull(); // the craftsman has no group
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
