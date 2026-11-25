// The bots: players run by the server. A bot acts through the same rule functions as a player, so it can do
// nothing a player cannot. Every function here is wrapped so that a rule that refuses an action just skips it.
//
// Roda focuses on the resources of the objectives (not religious dominance). It first removes opponents' armies from
// its farms and estates with its own. Then, for each objective it has not met yet, in order, it first tries to buy
// what the objective asks for (a technology, an army, a trader, ...), then to upgrade a building of that resource,
// then to build the other resources that purchase needs. Only when none of that is possible it builds farms and
// estates. In auctions it bids on the talents it needs, after the human players are done. Chief, Pope and Rain: see below.
import { buildings, policySlots, reeducationCost, resourceTypes, talentResource, talents, technologies, type Cost, type ResourceType, type Talent } from './config';
import * as game from './logic';
import type { GameState, Player } from './types';

const objectiveResource: (ResourceType | 'people' | null)[] = [
	null, // Grand architecture: any resource, see focusResources
	'people', // Populous
	'materials', // Standing army
	'gold', // Trade empire
	'faith', // Holy inquisition
	'culture', // Renaissance court
	'knowledge', // Scholarly renown
	'power' // Absolute power
];

const attempt = (action: () => void) => {
	try {
		action();
		return true;
	} catch {
		return false;
	}
};

const isBot = (player: Pick<Player, 'bot'>) => !!player.bot;

// The objectives the bot has not met yet, in the order of the game.
const openObjectives = (state: GameState, bot: Player) => state.objectives.filter((o) => game.objectiveProgress(state, bot.id, o) < 1);

// The resource each open objective needs. Grand architecture takes the resource of another objective, or materials;
// once that has a level 4 building, the next resource without one (it asks for 2 different level 4 buildings).
const focusOf = (state: GameState, bot: Player, objective: number): ResourceType | 'people' => {
	const resource = objectiveResource[objective];
	if (resource) return resource;
	const other = state.objectives.map((o) => objectiveResource[o]).find((r): r is ResourceType => !!r && r !== 'people');
	const order = [...new Set([other ?? 'materials', ...resourceTypes])];
	return order.find((r) => highestLevel(state, bot, r) < 4) ?? order[0];
};

const focusResources = (state: GameState, bot: Player) => [...new Set(openObjectives(state, bot).map((o) => focusOf(state, bot, o)))];

// ---- buildings ----

const inWall = (state: GameState, bot: Player) => state.buildings.filter((b) => b.ownerId === bot.id && game.getBuildingStats(b.type).resourceType !== 'people');

const highestLevel = (state: GameState, bot: Player, resource: ResourceType) =>
	Math.max(0, ...inWall(state, bot).filter((b) => game.getBuildingStats(b.type).resourceType === resource).map((b) => game.getBuildingStats(b.type).level));

// Regular people must pay the people of a cost, so talents are kept for what asks for them.
const canPayWithoutSpendingTalents = (state: GameState, bot: Player, cost: Cost[]) =>
	game.canPay(state, bot, cost) && cost.filter((c) => c.resourceType === 'people').reduce((sum, c) => sum + c.amount, 0) <= bot.people;

// What Chief and Pope never build over when they play like Roda.
const keptResources: Record<string, string[]> = { Chief: ['materials', 'power'], Pope: ['faith', 'knowledge'] };

// Where a new building of a level goes inside the wall: an empty cell, else over the least useful building that is
// lower than it (not of a resource the bot needs, then the lowest level). A level 4 building is kept, for Grand
// architecture, and so are the buildings of the resources Chief and Pope keep.
const cellFor = (state: GameState, bot: Player, level: number, needed: string[]) => {
	const kept = keptResources[bot.bot ?? ''] ?? [];
	const cells = [...game.validCells(state, bot.id, 'blacksmith')];
	const taken = new Map(inWall(state, bot).map((b) => [`${b.x},${b.y}`, b]));
	const empty = cells.find((c) => !taken.has(c));
	if (empty) return empty;
	const candidates = cells
		.map((c) => ({ cell: c, stats: game.getBuildingStats(taken.get(c)!.type) }))
		.filter(({ stats }) => stats.level < 4 && !kept.includes(stats.resourceType) && (stats.level < level || !needed.includes(stats.resourceType)))
		.sort((a, b) => Number(needed.includes(a.stats.resourceType)) - Number(needed.includes(b.stats.resourceType)) || a.stats.level - b.stats.level);
	return candidates[0]?.cell ?? null;
};

const buildAt = (state: GameState, bot: Player, type: string, cell: string) => {
	const [x, y] = cell.split(',').map(Number);
	return attempt(() => game.build(state, bot.id, type, x, y));
};

// Builds a building of the resource at this level, when it can be paid with regular people.
const buildLevel = (state: GameState, bot: Player, resource: ResourceType, level: number, needed: string[]) => {
	const stats = buildings.find((b) => b.resourceType === resource && b.level === level);
	if (!stats || !canPayWithoutSpendingTalents(state, bot, stats.cost)) return false;
	const cell = cellFor(state, bot, level, needed);
	return !!cell && buildAt(state, bot, stats.name, cell);
};

// Upgrades the resource: a building one level higher than its highest, or a second building of it on an empty cell
// for more production.
const upgrade = (state: GameState, bot: Player, resource: ResourceType, needed: string[]) => {
	const level = highestLevel(state, bot, resource);
	if (level < 4 && buildLevel(state, bot, resource, level + 1, needed)) return true;
	const count = inWall(state, bot).filter((b) => game.getBuildingStats(b.type).resourceType === resource).length;
	const hasEmptyCell = inWall(state, bot).length < 8;
	return count === 1 && hasEmptyCell && [level, 1].some((l) => l > 0 && buildLevel(state, bot, resource, l, needed));
};

// Makes a cost payable: for each resource the cap is too low for, or that nothing produces, it builds one.
const buildFor = (state: GameState, bot: Player, cost: Cost[], needed: string[]) =>
	cost.some(({ amount, resourceType }) => {
		if (!(resourceTypes as readonly string[]).includes(resourceType)) return false;
		const resource = resourceType as ResourceType;
		if (bot.resources[resource] >= amount) return false;
		if (game.resourceCap(state, bot.id, resource) >= amount && game.resourceProduction(state, bot.id, resource) > 0) return false;
		return upgrade(state, bot, resource, needed);
	});

// Farms and estates, the estate when it can be paid, never over other farms and estates. Talents may pay for
// them: without more people the bot would be stuck.
const buildFarmland = (state: GameState, bot: Player) =>
	['estate', 'farm'].some((type) => {
		const stats = game.getBuildingStats(type);
		if (!game.canPay(state, bot, stats.cost)) return false;
		const cells = [...game.validCells(state, bot.id, type)].filter((cell) => {
			const [x, y] = cell.split(',').map(Number);
			return game.replacedBuildings(state, bot.id, type, x, y).length === 0;
		});
		const cell = cells[Math.floor(Math.random() * cells.length)];
		return !!cell && buildAt(state, bot, type, cell);
	});

// ---- what each objective asks for ----

// The column of technologies to research for Scholarly renown: the one furthest along, else one of a needed resource.
const technologyColumn = (bot: Player, needed: string[]) => {
	const unlocked = bot.unlockedTechnologies ?? [];
	const progress = technologies.map((column) => column.filter((t) => unlocked.includes(t.name)).length);
	return technologies
		.map((column, i) => ({ column, i }))
		.filter(({ column }) => progress[technologies.indexOf(column)] < column.length)
		.sort((a, b) => progress[b.i] - progress[a.i] || Number(needed.includes(b.column[0].cost[0].resourceType)) - Number(needed.includes(a.column[0].cost[0].resourceType)))[0]?.column;
};

const nextTechnology = (bot: Player, needed: string[]) => technologyColumn(bot, needed)?.find((t) => game.isNextTechnology(bot, t.name));

const unlockTechnology = (state: GameState, bot: Player, name: string) =>
	game.canPay(state, bot, game.technologyCost(state, bot.id, name)) && attempt(() => game.unlockTechnology(state, bot.id, name));

const buyUnit = (state: GameState, bot: Player, type: 'army' | 'trader' | 'inquisitor') =>
	game.isUnitUnlocked(state, bot, type) &&
	canPayWithoutSpendingTalents(state, bot, game.unitCost(state, bot, type)) &&
	attempt(() => game.buyUnit(state, bot.id, type));

// Trades with every opponent it has not traded with this turn: the resources they have most of for the ones it
// has most of that it does not need.
const tradeAll = (state: GameState, bot: Player, needed: string[]) => {
	let traded = false;
	for (const targetId of game.traderTargets(state, bot.id)) {
		const target = game.getPlayer(state, targetId);
		const ratio = game.tradeRatio(bot);
		// a trader only when both sides have enough to trade
		const total = (p: Player) => resourceTypes.reduce((sum, r) => sum + p.resources[r], 0);
		if (game.hasTradedWith(bot, targetId) || total(target) < ratio.take || total(bot) < ratio.give) continue;
		if (!(bot.undeployedUnits ?? []).includes('trader') && !buyUnit(state, bot, 'trader')) break;
		const pick = (owner: Player, count: number, order: (a: ResourceType, b: ResourceType) => number) => {
			const left = { ...owner.resources };
			const picked: ResourceType[] = [];
			for (let i = 0; i < count; i++) {
				const resource = [...resourceTypes].filter((r) => left[r] > 0).sort(order)[0];
				if (!resource) return null;
				left[resource]--;
				picked.push(resource);
			}
			return picked;
		};
		const take = pick(target, ratio.take, (a, b) => Number(needed.includes(b)) - Number(needed.includes(a)) || target.resources[b] - target.resources[a]);
		const give = pick(bot, ratio.give, (a, b) => Number(needed.includes(a)) - Number(needed.includes(b)) || bot.resources[b] - bot.resources[a]);
		if (take && give && attempt(() => game.trade(state, bot.id, targetId, give, take))) traded = true;
	}
	return traded;
};

// An opponent's building without missionaries or inquisitors, where an inquisitor stays.
const inquisitorTarget = (state: GameState, bot: Player) =>
	[...game.unitTargets(state, bot.id, 'inquisitor')].find((key) => {
		const [x, y] = key.split(',').map(Number);
		const building = state.buildings.find((b) => b.x === x && b.y === y);
		return building && building.ownerId !== bot.id && game.faithUnitsAt(state, x, y).length === 0;
	});

// Puts its inquisitors on opponents' buildings without missionaries or inquisitors, where they stay.
const deployInquisitors = (state: GameState, bot: Player) => {
	let deployed = false;
	while ((bot.undeployedUnits ?? []).includes('inquisitor')) {
		const cell = inquisitorTarget(state, bot);
		if (!cell) break;
		const [x, y] = cell.split(',').map(Number);
		if (!attempt(() => game.deployUnit(state, bot.id, 'inquisitor', x, y))) break;
		deployed = true;
	}
	return deployed;
};

// Removes opponents' armies from its farms and estates with its own (from its stock, else bought), also when it
// keeps armies for Standing army: a blocked cap costs it people.
const defend = (state: GameState, bot: Player) => {
	const blocked = () =>
		[...game.unitTargets(state, bot.id, 'army')].find((key) => {
			const [x, y] = key.split(',').map(Number);
			const isOwn = state.buildings.find((b) => b.x === x && b.y === y)?.ownerId === bot.id;
			return isOwn && (state.units ?? []).some((u) => u.x === x && u.y === y && (u.type === 'army' || u.type === 'mercenary') && u.ownerId !== bot.id);
		});
	for (let cell = blocked(); cell; cell = blocked()) {
		if (!(bot.undeployedUnits ?? []).includes('army') && !buyUnit(state, bot, 'army')) return;
		const [x, y] = cell.split(',').map(Number);
		if (!attempt(() => game.deployUnit(state, bot.id, 'army', x, y))) return;
	}
};

// Implements a policy in a free slot, else in place of the first one.
const implement = (state: GameState, bot: Player, name: string) => {
	const inEffect = bot.policiesInEffect ?? [];
	if (inEffect.includes(name)) return false;
	let slot = Array.from({ length: policySlots }, (_, i) => i).find((i) => !inEffect[i]);
	if (slot === undefined) {
		if (!attempt(() => game.removePolicy(state, bot.id, inEffect[0]!))) return false;
		slot = 0;
	}
	return attempt(() => game.implementPolicy(state, bot.id, name, slot));
};

// What the objective asks for, when it can be bought now; otherwise the cost to work towards (or null).
const objectivePurchase = (state: GameState, bot: Player, objective: number, needed: string[]): { done: boolean; cost: Cost[] | null } => {
	const resource = focusOf(state, bot, objective);
	switch (objective) {
		case 0: {
			// Grand architecture: the next level of its resource
			const level = Math.min(4, highestLevel(state, bot, resource as ResourceType) + 1);
			const stats = buildings.find((b) => b.resourceType === resource && b.level === level)!;
			return { done: buildLevel(state, bot, resource as ResourceType, level, needed), cost: stats.cost };
		}
		case 1:
			return { done: buildFarmland(state, bot), cost: game.getBuildingStats('farm').cost };
		case 2:
			return { done: buyUnit(state, bot, 'army'), cost: game.unitCost(state, bot, 'army') };
		case 3:
			return { done: tradeAll(state, bot, needed), cost: game.unitCost(state, bot, 'trader') };
		case 4: {
			if (!(bot.unlockedTechnologies ?? []).includes('Inquisition')) {
				return { done: unlockTechnology(state, bot, 'Inquisition'), cost: game.technologyCost(state, bot.id, 'Inquisition') };
			}
			// only bought when there is a building to put it on
			const done = deployInquisitors(state, bot) || (!!inquisitorTarget(state, bot) && buyUnit(state, bot, 'inquisitor') && deployInquisitors(state, bot));
			return { done, cost: game.unitCost(state, bot, 'inquisitor') };
		}
		case 5:
			// Renaissance court: the talents come from the auctions, culture pays for the bids
			return { done: false, cost: null };
		case 6: {
			const technology = nextTechnology(bot, needed);
			if (!technology) return { done: false, cost: null };
			return { done: unlockTechnology(state, bot, technology.name), cost: game.technologyCost(state, bot.id, technology.name) };
		}
		case 7: {
			if ((bot.unlockedPolicies ?? []).includes('Centralization')) return { done: implement(state, bot, 'Centralization'), cost: null };
			const cost = game.getPolicy('Centralization').cost;
			const done = game.canPay(state, bot, cost) && attempt(() => game.unlockPolicy(state, bot.id, 'Centralization')) && (implement(state, bot, 'Centralization') || true);
			return { done, cost };
		}
	}
	return { done: false, cost: null };
};

// One action towards the open objectives: first what any objective asks for, then upgrading the resource of one,
// then building the other resources their purchases need. Every stage goes through the objectives in order, so
// one objective does not take all the people.
const towardsObjectives = (state: GameState, bot: Player) => {
	const needed = focusResources(state, bot);
	const open = openObjectives(state, bot);
	const costs = [];
	for (const objective of open) {
		const { done, cost } = objectivePurchase(state, bot, objective, needed);
		if (done) return true;
		if (cost) costs.push(cost);
	}
	for (const objective of open) {
		const resource = focusOf(state, bot, objective);
		if (resource !== 'people' && upgrade(state, bot, resource, needed)) return true;
	}
	return costs.some((cost) => buildFor(state, bot, cost, needed));
};

// The city centre produces the first needed resource.
const chooseCityCentre = (state: GameState, bot: Player) => {
	if (!game.canSetCityCentre(state, bot.id)) return;
	const resource = focusResources(state, bot).find((r): r is ResourceType => r !== 'people') ?? 'materials';
	if (bot.cityCentreResource !== resource) attempt(() => game.setCityCentre(state, bot.id, resource));
};

const takeTurn = (state: GameState, bot: Player, now: number) => {
	chooseCityCentre(state, bot);
	defend(state, bot);
	for (let i = 0; i < 30; i++) {
		if (towardsObjectives(state, bot)) continue;
		if (buildFarmland(state, bot)) continue;
		break;
	}
	game.endTurn(state, bot.id, now);
};

// ---- auctions ----

// The talents it needs: those of its needed resources (for level 3 and 4 buildings and level 4 technologies), every
// talent it does not have yet for Renaissance court, and a politician for Absolute power.
const wantsTalent = (state: GameState, bot: Player, talent: Talent) => {
	const open = openObjectives(state, bot);
	if (open.includes(5) && !bot.talents.includes(talent)) return true;
	if (open.includes(7) && talent === 'politician' && !bot.talents.includes('politician')) return true;
	return focusResources(state, bot).includes(talentResource[talent]);
};

// Bids once every human who can bid is done: just enough to win (ties go to the earliest in turn order), with at
// most half of the talent's resource and of its culture (all of its culture when it does not need culture).
const bid = (state: GameState, bot: Player, wants: boolean, needsCulture: boolean) => {
	const auction = state.auction!;
	const talent = auction.talent!;
	const resource = talentResource[talent];
	if (wants) {
		const rivals = auction.eligible.filter((id) => id !== bot.id);
		const best = Math.max(0, ...rivals.map((id) => game.bidTotal(state, id)));
		const winsTies = (id: string) => auction.eligible.indexOf(bot.id) < auction.eligible.indexOf(id);
		const leader = rivals.find((id) => game.bidTotal(state, id) === best);
		const target = best === 0 ? 0 : leader && winsTies(leader) ? best : best + 1;
		const worth = game.cultureWorth(state, bot);
		const maxResource = Math.floor(bot.resources[resource] / 2);
		const maxCulture = resource === 'culture' ? 0 : needsCulture ? Math.floor(bot.resources.culture / 2) : bot.resources.culture;
		const isArtist = resource === 'culture';
		const total = (amount: number, culture: number) => (isArtist ? amount * worth : amount) + culture * worth;
		// the resource first, then culture
		let amount = Math.min(maxResource, isArtist ? Math.ceil(target / worth) : target);
		let culture = Math.max(0, Math.min(maxCulture, Math.ceil((target - total(amount, 0)) / worth)));
		if (target > 0 && total(amount, culture) >= target && total(amount, culture) > game.bidTotal(state, bot.id)) {
			amount = Math.max(amount, auction.bids[bot.id] ?? 0);
			culture = Math.max(culture, auction.cultureBids?.[bot.id] ?? 0);
			attempt(() => game.placeBid(state, bot.id, amount, culture));
		}
	}
	game.doneBidding(state, bot.id, Date.now());
};

const rodaBid = (state: GameState, bot: Player) =>
	bid(state, bot, wantsTalent(state, bot, state.auction!.talent!), focusResources(state, bot).includes('culture'));

// ---- what Chief, Pope and Rain share ----

const peopleCapGoal = 8;

// The talents it keeps for its next building, technology or policy; the others pay like regular people.
const keptTalents = (state: GameState, bot: Player): Talent[] =>
	bot.bot === 'Pope' ? popeTalents(state, bot) : bot.bot === 'Rain' ? rainTalents(state, bot) : chiefTalents(state, bot);

// Regular people pay first, then talents, except the ones it keeps.
const spareTalents = (state: GameState, bot: Player) => {
	const spare = [...bot.talents];
	for (const talent of keptTalents(state, bot)) if (spare.includes(talent)) spare.splice(spare.indexOf(talent), 1);
	return spare;
};
const canPaySparing = (state: GameState, bot: Player, cost: Cost[]) =>
	game.canPay(state, bot, cost) && cost.filter((c) => c.resourceType === 'people').reduce((sum, c) => sum + c.amount, 0) <= bot.people + spareTalents(state, bot).length;

const buildOn = (state: GameState, bot: Player, type: string, cell: string | undefined) => {
	if (!cell || !canPaySparing(state, bot, game.getBuildingStats(type).cost)) return false;
	const [x, y] = cell.split(',').map(Number);
	return attempt(() => game.build(state, bot.id, type, x, y, spareTalents(state, bot)));
};

const cellOf = (b: { x: number; y: number }) => `${b.x},${b.y}`;
const emptyWallCell = (state: GameState, bot: Player) => {
	const taken = new Set(inWall(state, bot).map(cellOf));
	return [...game.validCells(state, bot.id, 'blacksmith')].find((cell) => !taken.has(cell));
};
// its lowest building of a resource below a level
const lowestOf = (state: GameState, bot: Player, resource: ResourceType, below: number) =>
	inWall(state, bot)
		.map((b) => ({ b, stats: game.getBuildingStats(b.type) }))
		.filter(({ stats }) => stats.resourceType === resource && stats.level < below)
		.sort((a, c) => a.stats.level - c.stats.level)[0];
const buildingAt = (resource: ResourceType, level: number) => buildings.find((b) => b.resourceType === resource && b.level === level)!.name;
const talentOf = (resource: ResourceType) => talents.find((t) => talentResource[t] === resource)!;

// a random place for a farm or estate, not over other farms and estates
const farmlandCell = (state: GameState, bot: Player, type: string) => {
	const cells = [...game.validCells(state, bot.id, type)].filter((cell) => {
		const [x, y] = cell.split(',').map(Number);
		return game.replacedBuildings(state, bot.id, type, x, y).length === 0;
	});
	return cells[Math.floor(Math.random() * cells.length)];
};
const farm = (state: GameState, bot: Player) => buildOn(state, bot, 'farm', farmlandCell(state, bot, 'farm'));
// with the people it has left: an estate when it can pay one, else a farm
const farmland = (state: GameState, bot: Player) => ['estate', 'farm'].some((type) => buildOn(state, bot, type, farmlandCell(state, bot, type)));

// the next level of a resource's building, until level 4: on an empty cell, else over its lowest building of it
const nextLevel = (state: GameState, bot: Player, resource: ResourceType) => {
	const level = highestLevel(state, bot, resource);
	if (level >= 4) return false;
	const lowest = lowestOf(state, bot, resource, level + 1);
	return buildOn(state, bot, buildingAt(resource, level + 1), emptyWallCell(state, bot) ?? (lowest && cellOf(lowest.b)));
};

const setCityCentre = (state: GameState, bot: Player, resource: ResourceType) => {
	if (game.canSetCityCentre(state, bot.id) && bot.cityCentreResource !== resource) attempt(() => game.setCityCentre(state, bot.id, resource));
};

// the first of these policies that is not in effect yet
const nextPolicy = (bot: Player, names: string[]) => names.find((name) => !(bot.policiesInEffect ?? []).includes(name));

// That policy: implemented when it is unlocked, else bought.
const policyInOrder = (state: GameState, bot: Player, names: string[]) => {
	const name = nextPolicy(bot, names);
	if (!name) return false;
	if ((bot.unlockedPolicies ?? []).includes(name)) return implement(state, bot, name);
	return canPaySparing(state, bot, game.getPolicy(name).cost) && attempt(() => game.unlockPolicy(state, bot.id, name));
};

// ---- Chief ----
//
// Chief does not care about the objectives. Each action it does the first of these it can:
// 1. farms, until its people cap is 8
// 2. the next level of materials building, until it has a factory
// 3. a blacksmith on every empty cell inside its wall
// 4. once a turn an army, while it produces at least 5 materials, except while it saves for its next policy
// 5. with a factory but less than 15 materials production: its lowest materials building one level up, up to barracks
// 6. the policies Defensive strategies, Isolationism and War machine, in that order; then its power building one level
//    up (the first, a forum, goes over its lowest blacksmith)
// 7. once all of that is done: armies, except while it saves for its next policy
// 8. with the people it has left: farms and estates
// It saves for its next policy (spends no materials on armies) once it has the power and the talent that policy costs.
// While its next materials building waits for a craftsman it goes on with 6 and 7, so it spends its people and new
// people (maybe a craftsman) can be born for it.
// An army goes on its own farm or estate with an opponent's army first (removing both), else on a random opponent's
// farm or estate without an army, else on its own without one; it is only bought when it has somewhere to go. With
// nowhere to put an army it plays like Roda. It only bids on the craftsmen and politicians it still needs.

const armyProductionGoal = 5;
const materialsProductionGoal = 15;
const chiefPolicies = ['Defensive strategies', 'Isolationism', 'War machine'];

const lowestMaterials = (state: GameState, bot: Player, below: number) => lowestOf(state, bot, 'materials', below);

const moreProduction = (state: GameState, bot: Player) => {
	const lowest = lowestMaterials(state, bot, 3);
	return !!lowest && buildOn(state, bot, buildingAt('materials', lowest.stats.level + 1), cellOf(lowest.b));
};

const powerBuilding = (state: GameState, bot: Player) => inWall(state, bot).find((b) => game.getBuildingStats(b.type).resourceType === 'power');

// its one power building: a forum over its lowest blacksmith, then one level up whenever it can
const upgradePower = (state: GameState, bot: Player) => {
	const power = powerBuilding(state, bot);
	if (!power) {
		const lowest = lowestMaterials(state, bot, 2);
		return buildOn(state, bot, 'forum', emptyWallCell(state, bot) ?? (lowest && cellOf(lowest.b)));
	}
	const level = game.getBuildingStats(power.type).level;
	return level < 4 && buildOn(state, bot, buildingAt('power', level + 1), cellOf(power));
};

// It saves its materials for its next policy once it has the power and the talent that policy costs.
const savesForPolicy = (state: GameState, bot: Player) => {
	const name = nextPolicy(bot, chiefPolicies);
	if (!name || (bot.unlockedPolicies ?? []).includes(name)) return false;
	return game.getPolicy(name).cost.every(({ amount, resourceType }) => {
		if (resourceType === 'power') return bot.resources.power >= amount;
		if ((talents as readonly string[]).includes(resourceType)) return bot.talents.filter((t) => t === resourceType).length >= amount;
		return true;
	});
};

// Where an army goes: its own farms and estates with an opponent's army (defensive), opponents' farms and estates
// without an army (offensive), and with Defensive strategies its own without an army.
const armyTargets = (state: GameState, bot: Player) => {
	const targets = [...game.unitTargets(state, bot.id, 'army')].map((key) => {
		const [x, y] = key.split(',').map(Number);
		const building = state.buildings.find((b) => b.x === x && b.y === y);
		const army = (state.units ?? []).find((u) => u.x === x && u.y === y && (u.type === 'army' || u.type === 'mercenary'));
		return { x, y, isOwn: building?.ownerId === bot.id, army };
	});
	const offensive = targets.filter((t) => !t.isOwn && !t.army);
	return [
		...targets.filter((t) => t.isOwn && t.army),
		...(offensive.length ? [offensive[Math.floor(Math.random() * offensive.length)]] : []),
		...targets.filter((t) => t.isOwn && !t.army)
	];
};

const placeArmy = (state: GameState, bot: Player) => {
	const [target] = armyTargets(state, bot);
	return !!target && attempt(() => game.deployUnit(state, bot.id, 'army', target.x, target.y));
};

const army = (state: GameState, bot: Player) =>
	armyTargets(state, bot).length > 0 &&
	game.isUnitUnlocked(state, bot, 'army') &&
	canPaySparing(state, bot, game.unitCost(state, bot, 'army')) &&
	attempt(() => game.buyUnit(state, bot.id, 'army', spareTalents(state, bot))) &&
	placeArmy(state, bot);

const materialsProduction = (state: GameState, bot: Player) => game.resourceProduction(state, bot.id, 'materials');

// everything before the armies is done
const isBuiltUp = (state: GameState, bot: Player) =>
	game.peopleCap(state, bot.id) >= peopleCapGoal &&
	!emptyWallCell(state, bot) &&
	(needsCraftsman(state, bot) ||
		(highestLevel(state, bot, 'materials') === 4 && (materialsProduction(state, bot) >= materialsProductionGoal || !lowestMaterials(state, bot, 3)))) &&
	game.hasEffect(bot, 'defensiveStrategies');

const playsLikeRoda = (state: GameState, bot: Player) => isBuiltUp(state, bot) && armyTargets(state, bot).length === 0;

const chiefTurn = (state: GameState, bot: Player, now: number) => {
	if (playsLikeRoda(state, bot)) chooseCityCentre(state, bot);
	else setCityCentre(state, bot, 'materials');
	// armies left in its stock from an earlier turn
	while ((bot.undeployedUnits ?? []).includes('army') && placeArmy(state, bot));
	let hasBoughtArmy = false;
	for (let i = 0; i < 60; i++) {
		if (game.peopleCap(state, bot.id) < peopleCapGoal && farm(state, bot)) continue;
		if (nextLevel(state, bot, 'materials')) continue;
		if (buildOn(state, bot, 'blacksmith', emptyWallCell(state, bot))) continue;
		const hasFactory = highestLevel(state, bot, 'materials') === 4;
		// the policies come once it has a factory, or while it waits for a craftsman
		const isPolicyTime = hasFactory || needsCraftsman(state, bot);
		const saves = isPolicyTime && savesForPolicy(state, bot);
		if (!hasBoughtArmy && !saves && materialsProduction(state, bot) >= armyProductionGoal && army(state, bot)) {
			hasBoughtArmy = true;
			continue;
		}
		if (hasFactory && materialsProduction(state, bot) < materialsProductionGoal && moreProduction(state, bot)) continue;
		if (isPolicyTime && (policyInOrder(state, bot, chiefPolicies) || upgradePower(state, bot))) continue;
		if (isBuiltUp(state, bot) && !saves && army(state, bot)) continue;
		if (playsLikeRoda(state, bot) && towardsObjectives(state, bot)) continue;
		if (farmland(state, bot)) continue;
		break;
	}
	game.endTurn(state, bot.id, now);
};

// A craftsman for its next materials building, once that is a barracks or factory, and for War machine. Not earlier:
// a craftsman it keeps fills its people cap.
const craftsmenNeeded = (state: GameState, bot: Player) => {
	const level = highestLevel(state, bot, 'materials');
	if (level >= 2 && level < 4) return 1;
	if (level === 4 && materialsProduction(state, bot) < materialsProductionGoal && lowestMaterials(state, bot, 3)?.stats.level === 2) return 1;
	return nextPolicy(bot, chiefPolicies) === 'War machine' && !(bot.unlockedPolicies ?? []).includes('War machine') ? 1 : 0;
};
const craftsmen = (bot: Player) => bot.talents.filter((t) => t === 'craftsman').length;
// its next materials building needs a craftsman it does not have
const needsCraftsman = (state: GameState, bot: Player) => highestLevel(state, bot, 'materials') >= 2 && craftsmen(bot) === 0 && craftsmenNeeded(state, bot) > 0;

// a politician for a city hall or parliament
const needsPolitician = (state: GameState, bot: Player) => {
	const power = powerBuilding(state, bot);
	return !!power && [2, 3].includes(game.getBuildingStats(power.type).level);
};

const chiefTalents = (state: GameState, bot: Player): Talent[] => [
	...(craftsmenNeeded(state, bot) > 0 ? ['craftsman' as const] : []),
	...(needsPolitician(state, bot) ? ['politician' as const] : [])
];

const chiefBid = (state: GameState, bot: Player) => {
	if (playsLikeRoda(state, bot)) return rodaBid(state, bot);
	const talent = state.auction!.talent!;
	const wants = talent === 'craftsman' ? craftsmen(bot) < craftsmenNeeded(state, bot) : talent === 'politician' && needsPolitician(state, bot) && !bot.talents.includes('politician');
	bid(state, bot, wants, false);
};

// ---- Pope ----
//
// Pope builds up faith and goes for religious dominance (also when that is not part of the game), with the inquisitor
// technologies. At the start of its turn it removes opponents' missionaries and inquisitors from its buildings with an
// inquisitor (from its stock, else bought). Each action it does the first of these it can:
// 1. farms, until its people cap is 8
// 2. the next level of faith building, until it has a cathedral
// 3. the next technology of the faith column (Inquisition, Tithes, Persecution, Pilgrimage); when its knowledge cap
//    is too low for it, or nothing produces knowledge, the next knowledge building (on an empty cell, else over its
//    lowest knowledge building, else over a shrine)
// 4. a shrine on every empty cell inside its wall
// 5. once a turn a missionary or inquisitor, when its faith next turn is still more than now (or back at its cap), so it
//    keeps getting closer to its next faith building or technology
// 6. once it has a cathedral and all faith technologies: missionaries and inquisitors
// 7. like Roda
// Its missionaries and inquisitors go towards religious dominance: on an opponent's city centre when it can, else on a
// building inside the wall of the opponent it has covered most, where it has none yet (a missionary where it can, else
// an inquisitor, which removes the missionaries and inquisitors there and stays).
// It keeps the messiah and scientist its next faith building or technology needs, and only bids on those; when it needs
// none, it bids like Roda.

const faithColumn = technologies.find((column) => column[0].effect === 'inquisition')!;
const nextFaithTechnology = (bot: Player) => faithColumn.find((t) => game.isNextTechnology(bot, t.name));

const faithTechnology = (state: GameState, bot: Player) => {
	const technology = nextFaithTechnology(bot);
	if (!technology) return false;
	const cost = game.technologyCost(state, bot.id, technology.name);
	if (game.canPay(state, bot, cost)) return attempt(() => game.unlockTechnology(state, bot.id, technology.name));
	const knowledge = cost.find((c) => c.resourceType === 'knowledge')?.amount ?? 0;
	if (game.resourceCap(state, bot.id, 'knowledge') >= knowledge && game.resourceProduction(state, bot.id, 'knowledge') > 0) return false;
	const level = highestLevel(state, bot, 'knowledge');
	if (level >= 4) return false;
	const over = lowestOf(state, bot, 'knowledge', level + 1) ?? lowestOf(state, bot, 'faith', 2);
	return buildOn(state, bot, buildingAt('knowledge', level + 1), emptyWallCell(state, bot) ?? (over && cellOf(over.b)));
};

const hasFaithUnitOn = (state: GameState, bot: Player, x: number, y: number) => game.faithUnitsAt(state, x, y).some((u) => u.ownerId === bot.id);

const placeFaithUnit = (state: GameState, bot: Player, type: 'missionary' | 'inquisitor', x: number, y: number) =>
	((bot.undeployedUnits ?? []).includes(type) ||
		(canPaySparing(state, bot, game.unitCost(state, bot, type)) && attempt(() => game.buyUnit(state, bot.id, type, spareTalents(state, bot))))) &&
	attempt(() => game.deployUnit(state, bot.id, type, x, y));

// Removes opponents' missionaries and inquisitors from its buildings with an inquisitor.
const defendFaith = (state: GameState, bot: Player) => {
	if (!game.isUnitUnlocked(state, bot, 'inquisitor')) return;
	const targets = game.unitTargets(state, bot.id, 'inquisitor');
	for (const b of inWall(state, bot)) {
		const isTaken = game.faithUnitsAt(state, b.x, b.y).some((u) => u.ownerId !== bot.id);
		if (isTaken && targets.has(cellOf(b)) && !placeFaithUnit(state, bot, 'inquisitor', b.x, b.y)) return;
	}
};

// allowed: the units it may use, and whether it may buy one now
const towardsDominance = (state: GameState, bot: Player, allowed: ('missionary' | 'inquisitor')[], mayBuy = (_type: 'missionary' | 'inquisitor') => true) => {
	const types = allowed.filter((type) => game.isUnitUnlocked(state, bot, type) && ((bot.undeployedUnits ?? []).includes(type) || mayBuy(type)));
	const targets = types.map((type) => ({ type, cells: game.unitTargets(state, bot.id, type) }));
	const typeFor = (cell: string) => targets.find(({ cells }) => cells.has(cell))?.type;
	const covered = (opponent: Player) => inWall(state, opponent).filter((b) => hasFaithUnitOn(state, bot, b.x, b.y)).length;
	const opponents = state.players.filter((p) => p.id !== bot.id).sort((a, b) => covered(b) - covered(a));
	for (const opponent of opponents) {
		const type = typeFor(cellOf(opponent.center));
		if (type && placeFaithUnit(state, bot, type, opponent.center.x, opponent.center.y)) return true;
	}
	for (const opponent of opponents) {
		for (const b of inWall(state, opponent).filter((b) => !hasFaithUnitOn(state, bot, b.x, b.y))) {
			const type = typeFor(cellOf(b));
			if (type && placeFaithUnit(state, bot, type, b.x, b.y)) return true;
		}
	}
	return false;
};

// the talents its next faith building, faith technology and the knowledge building for that technology need
const popeTalents = (state: GameState, bot: Player): Talent[] => {
	const costs: Cost[][] = [];
	const level = highestLevel(state, bot, 'faith');
	if (level < 4) costs.push(game.getBuildingStats(buildingAt('faith', level + 1)).cost);
	const technology = nextFaithTechnology(bot);
	if (technology) {
		const cost = game.technologyCost(state, bot.id, technology.name);
		costs.push(cost);
		const knowledge = cost.find((c) => c.resourceType === 'knowledge')?.amount ?? 0;
		const knowledgeLevel = highestLevel(state, bot, 'knowledge');
		if (game.resourceCap(state, bot.id, 'knowledge') < knowledge && knowledgeLevel < 4) costs.push(game.getBuildingStats(buildingAt('knowledge', knowledgeLevel + 1)).cost);
	}
	return [...new Set(costs.flat().map((c) => c.resourceType).filter((t): t is Talent => (talents as readonly string[]).includes(t)))];
};

// After paying for a missionary, its faith next turn is still more than now, or back at its cap.
const keepsGrowingFaith = (state: GameState, bot: Player, type: 'missionary' | 'inquisitor') => {
	const cost = game.unitCost(state, bot, type).find((c) => c.resourceType === 'faith')?.amount ?? 0;
	const faith = bot.resources.faith;
	const cap = game.resourceCap(state, bot.id, 'faith');
	const next = Math.min(cap, faith - cost + game.resourceProduction(state, bot.id, 'faith'));
	return next > faith || next >= cap;
};

const popeTurn = (state: GameState, bot: Player, now: number) => {
	setCityCentre(state, bot, 'faith');
	defendFaith(state, bot);
	let hasBoughtMissionary = false;
	for (let i = 0; i < 60; i++) {
		if (game.peopleCap(state, bot.id) < peopleCapGoal && farm(state, bot)) continue;
		if (nextLevel(state, bot, 'faith')) continue;
		if (faithTechnology(state, bot)) continue;
		if (buildOn(state, bot, 'shrine', emptyWallCell(state, bot))) continue;
		const hasFaithGoals = highestLevel(state, bot, 'faith') < 4 || !!nextFaithTechnology(bot);
		if (hasFaithGoals && !hasBoughtMissionary && towardsDominance(state, bot, ['missionary', 'inquisitor'], (type) => keepsGrowingFaith(state, bot, type))) {
			hasBoughtMissionary = true;
			continue;
		}
		if (!hasFaithGoals && towardsDominance(state, bot, ['missionary', 'inquisitor'])) continue;
		if (towardsObjectives(state, bot) || buildFarmland(state, bot)) continue;
		break;
	}
	game.endTurn(state, bot.id, now);
};

const popeBid = (state: GameState, bot: Player) => {
	const needed = popeTalents(state, bot);
	if (!needed.length) return rodaBid(state, bot);
	const talent = state.auction!.talent!;
	bid(state, bot, needed.includes(talent) && !bot.talents.includes(talent), false);
};

// ---- Rain ----
//
// Rain builds a level 4 building of every resource, and on the other 2 cells inside its wall a building of the resource
// of each of the first two objectives (when they have one). Each action it does the first of these it can:
// 1. the policies Courtyard gardens, Grain reserves and Centralization, in that order
// 2. the technologies Propaganda posters and Reeducation programs
// 3. with Reeducation programs: a talent it does not need reeducated to one its next buildings need
// 4. its lowest building one level up (the 2 for the objectives only to level 1); a resource without one first
// 5. farms and estates, only when there is nothing else to do or save for
// Once it has all 6 level 4 buildings it plays like Roda. Its city centre produces the resource of its lowest
// building. It keeps the talents its next level 3 and 4 buildings and Centralization need, and only bids on those;
// when it needs none, it bids like Roda.

const rainPolicies = ['Courtyard gardens', 'Grain reserves', 'Centralization'];
const rainTechnologies = ['Propaganda posters', 'Reeducation programs'];

// Its 8 cells: a building of each resource (up to level 4), then one for each of the first two objectives (level 1).
// Each slot has its highest building of that resource that is not in an earlier slot; the rest are spare.
const rainSlots = (state: GameState, bot: Player) => {
	const objectiveResources = state.objectives
		.slice(0, 2)
		.map((o) => objectiveResource[o])
		.filter((r): r is ResourceType => !!r && r !== 'people');
	const left = inWall(state, bot)
		.map((b) => ({ b, stats: game.getBuildingStats(b.type) }))
		.sort((a, c) => c.stats.level - a.stats.level);
	const slots = [...resourceTypes, ...objectiveResources].map((resource, i) => {
		const index = left.findIndex(({ stats }) => stats.resourceType === resource);
		const building = index >= 0 ? left.splice(index, 1)[0] : undefined;
		return { resource, building, level: building?.stats.level ?? 0, goal: i < resourceTypes.length ? 4 : 1 };
	});
	return { slots, spare: left.reverse() };
};

const rainIsDone = (state: GameState, bot: Player) => resourceTypes.every((r) => highestLevel(state, bot, r) === 4);

// the lowest slots first, a resource without a building before the others
const rainBuild = (state: GameState, bot: Player) => {
	const { slots, spare } = rainSlots(state, bot);
	return slots
		.filter((slot) => slot.level < slot.goal)
		.sort((a, c) => a.level - c.level)
		.some((slot) => {
			const cell = slot.building ? cellOf(slot.building.b) : (emptyWallCell(state, bot) ?? (spare[0] && cellOf(spare[0].b)));
			return buildOn(state, bot, buildingAt(slot.resource, slot.level + 1), cell);
		});
};

const rainTalents = (state: GameState, bot: Player): Talent[] => {
	const needed = rainSlots(state, bot)
		.slots.filter((slot) => slot.level < slot.goal && slot.level + 1 >= 3)
		.map((slot) => talentOf(slot.resource));
	const policy = nextPolicy(bot, rainPolicies);
	if (policy === 'Centralization' && !(bot.unlockedPolicies ?? []).includes(policy)) needed.push('politician');
	return needed;
};

// A talent it does not keep becomes one it needs and does not have.
const reeducate = (state: GameState, bot: Player) => {
	if (!game.hasEffect(bot, 'reeducationPrograms')) return false;
	const missing = rainTalents(state, bot).find((t) => !bot.talents.includes(t));
	const [spare] = spareTalents(state, bot);
	if (!missing || !spare || !game.canSpend(state, bot, [{ amount: reeducationCost, resourceType: 'culture' }])) return false;
	return attempt(() => game.retrainTalent(state, bot.id, bot.talents.indexOf(spare), missing));
};

// It saves for something once it has the talents it costs and its caps can hold the rest. The talents it keeps fill
// part of its people cap, so only the rest of it is born as people to pay with.
const canSaveFor = (state: GameState, bot: Player, cost: Cost[]) =>
	cost.every(({ amount, resourceType }) => {
		if (resourceType === 'people') return game.peopleCap(state, bot.id) - (bot.talents.length - spareTalents(state, bot).length) >= amount;
		if ((talents as readonly string[]).includes(resourceType)) return bot.talents.filter((t) => t === resourceType).length >= amount;
		return game.resourceCap(state, bot.id, resourceType as ResourceType) >= amount;
	});

// what it still wants: its next policy and technology, and the next level of its buildings
const rainSavesFor = (state: GameState, bot: Player) => {
	const costs: Cost[][] = [];
	const policy = nextPolicy(bot, rainPolicies);
	if (policy && !(bot.unlockedPolicies ?? []).includes(policy)) costs.push(game.getPolicy(policy).cost);
	const technology = rainTechnologies.find((name) => !(bot.unlockedTechnologies ?? []).includes(name));
	if (technology) costs.push(game.technologyCost(state, bot.id, technology));
	for (const slot of rainSlots(state, bot).slots) if (slot.level < slot.goal) costs.push(game.getBuildingStats(buildingAt(slot.resource, slot.level + 1)).cost);
	return costs.some((cost) => canSaveFor(state, bot, cost));
};

const rainTurn = (state: GameState, bot: Player, now: number) => {
	if (rainIsDone(state, bot)) return takeTurn(state, bot, now);
	const lowest = rainSlots(state, bot).slots.filter((slot) => slot.goal === 4).sort((a, c) => a.level - c.level)[0];
	setCityCentre(state, bot, lowest.resource);
	for (let i = 0; i < 60; i++) {
		if (policyInOrder(state, bot, rainPolicies)) continue;
		if (rainTechnologies.some((name) => !(bot.unlockedTechnologies ?? []).includes(name) && unlockTechnology(state, bot, name))) continue;
		if (reeducate(state, bot)) continue;
		if (rainBuild(state, bot)) continue;
		if (rainIsDone(state, bot) && towardsObjectives(state, bot)) continue;
		if (!rainSavesFor(state, bot) && farmland(state, bot)) continue;
		break;
	}
	game.endTurn(state, bot.id, now);
};

const rainBid = (state: GameState, bot: Player) => {
	if (rainIsDone(state, bot)) return rodaBid(state, bot);
	const needed = rainTalents(state, bot);
	if (!needed.length) return rodaBid(state, bot);
	const talent = state.auction!.talent!;
	bid(state, bot, needed.includes(talent) && !bot.talents.includes(talent), false);
};

// ---- what the server calls ----

// The bot that has something to do now, if any: its turn, an auction it can bid in once the humans are done, or the
// legacy dialog.
const botToAct = (state: GameState) => {
	if (state.gameStatus !== 'inProgress') return null;
	if (state.phase === 'action') {
		const player = state.players[state.turnIndex];
		return player && isBot(player) ? player : null;
	}
	if (state.phase === 'auction' && state.auction) {
		const { eligible, done } = state.auction;
		const humansDone = eligible.every((id) => done.includes(id) || isBot(game.getPlayer(state, id)));
		if (!humansDone) return null;
		return state.players.find((p) => isBot(p) && eligible.includes(p.id) && !done.includes(p.id)) ?? null;
	}
	if (state.phase === 'legacy') return state.players.find((p) => isBot(p) && !p.isReadyForNextGeneration) ?? null;
	return null;
};

export const hasBotWork = (state: GameState) => botToAct(state) !== null;

// Lets one bot do what it has to do now. Returns whether anything changed.
export const runBot = (state: GameState, now: number) => {
	const bot = botToAct(state);
	if (!bot) return false;
	const plays = { Chief: { turn: chiefTurn, bid: chiefBid }, Pope: { turn: popeTurn, bid: popeBid }, Rain: { turn: rainTurn, bid: rainBid } };
	const play = plays[bot.bot as keyof typeof plays] ?? { turn: takeTurn, bid: rodaBid };
	if (state.phase === 'action') play.turn(state, bot, now);
	else if (state.phase === 'auction') play.bid(state, bot);
	else if (state.phase === 'legacy') game.readyForNextGeneration(state, bot.id);
	return true;
};
