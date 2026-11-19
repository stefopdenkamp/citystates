import {
	buildings as buildingStats,
	units as unitStats,
	agrarianReformPeopleCap,
	cityCentreProduction,
	palazzoCityCentreProduction,
	tradecraftCap,
	courtyardPeopleCap,
	grainReservesPeopleCap,
	cityStateProduction,
	cityStateResource,
	standardCap,
	bots,
	characteristicOptions,
	colors,
	gridSizeFor,
	objectives as objectiveList,
	regularPeopleInPool,
	resourceTypes,
	wallRing,
	talentResource,
	talents,
	talentsInPoolPerType,
	maxTurnTimer,
	policies as policyTree,
	technologies as technologyTree,
	technologyDiscount,
	policyRemoveCost,
	policySlots,
	reeducationCost,
	frescoCost,
	propagandaCost,
	unitEffect,
	taxGold,
	bribeGold,
	patronCultureWorth,
	philosopherTalents,
	type Effect,
	type BuildingStats,
	type Cost,
	type ResourceType,
	type Talent
} from './config';
import type { Building, Characteristic, GameSettings, GameState, LegacyLine, Player, PoolItem, PublicGameState, PublicPlayer, Unit } from './types';

const emptyResources = () =>
	Object.fromEntries(resourceTypes.map((r) => [r, 0])) as Record<ResourceType, number>;

const shuffle = <T>(items: T[]) => {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
};

const fail = (message: string): never => {
	throw new Error(message);
};

export const getBuildingStats = (type: string) =>
	buildingStats.find((b) => b.name === type) ?? fail(`Unknown building ${type}`);

export const getPlayer = <S extends GameState | PublicGameState>(state: S, playerId: string): S['players'][number] =>
	(state.players as S['players'][number][]).find((p) => p.id === playerId) ?? fail('Unknown player');

export const toPublic = (state: GameState): PublicGameState => ({
	...state,
	players: state.players.map(({ token: _token, ...player }) => player)
});

// The game log shows a player's name in their color; log text refers to players with this tag.
export const playerTag = (player: { id: string }) => `{player:${player.id}}`;

export const addLog = (state: GameState, text: string) => {
	state.log.push({ text, at: Date.now() });
};

// title + name + personalityTrait + cityState, leaving out disabled characteristics
export const fullName = (state: GameState | PublicGameState, player: Omit<Player, 'token'>) => {
	const { title, personalityTrait, cityState } = player.characteristics;
	const enabled = state.enabledCharacteristics;
	return [
		player.name,
		enabled.personalityTrait && personalityTrait,
		enabled.title && title,
		enabled.cityState && cityState && `of ${cityState}`
	]
		.filter(Boolean)
		.join(' ');
};

export const bornMessage = (people: number, talents: number, talented = 'talented') =>
	`${people} people are born, ${talents} of them ${talents === 1 ? 'is' : 'are'} ${talented}`;

// The full name in apostrophes, as used in the phase two title.
export const quotedName = (state: GameState | PublicGameState, player: Omit<Player, 'token'>) =>
	`'${fullName(state, player)}'`;

// Turn order starting from the first player of this generation.
const playersFromStart = <T extends { id: string }>(state: { players: T[]; startPlayerIndex: number }) =>
	state.players.map((_, i) => state.players[(state.startPlayerIndex + i) % state.players.length]);

// ---- caps, costs and placement (also used by the client) ----

type PlayerLike = Pick<Player, 'id' | 'people' | 'talents' | 'resources'>;

// The unit of a type on a cell, if any.
export const unitAt = (state: GameState | PublicGameState, x: number, y: number, type: Unit['type']) =>
	(state.units ?? []).find((u) => u.x === x && u.y === y && u.type === type);

// A mercenary is an army paid with gold; on the board they are the same kind of unit.
const isArmy = (type: Unit['type']) => type === 'army' || type === 'mercenary';
const armyAt = (state: GameState | PublicGameState, x: number, y: number) =>
	(state.units ?? []).find((u) => u.x === x && u.y === y && isArmy(u.type));

// The missionaries and inquisitors on a cell, in the order they were placed (at most one per player).
export const faithUnitsAt = (state: GameState | PublicGameState, x: number, y: number) =>
	(state.units ?? []).filter((u) => u.x === x && u.y === y && (u.type === 'missionary' || u.type === 'inquisitor'));

// Whether you have a missionary or inquisitor on a cell.
const hasFaithUnitOn = (state: GameState | PublicGameState, playerId: string, x: number, y: number) =>
	faithUnitsAt(state, x, y).some((u) => u.ownerId === playerId);

// Religious dominance over an opponent by their buildings: they have a building on all 8 cells inside their wall, and
// you have a missionary or inquisitor on each.
const isDominantByBuildings = (state: GameState | PublicGameState, playerId: string, targetId: string) => {
	const inWall = state.buildings.filter((b) => b.ownerId === targetId && !isPeopleBuilding(b.type));
	return inWall.length === (2 * wallRing + 1) ** 2 - 1 && inWall.every((b) => hasFaithUnitOn(state, playerId, b.x, b.y));
};

// Religious dominance over an opponent: your missionary or inquisitor on their city centre. It can only be put there
// once you have one on all 8 of their buildings inside the wall (see unitTargets), and stays for good.
export const hasReligiousDominance = (state: GameState | PublicGameState, playerId: string, targetId: string) => {
	const { center } = getPlayer(state, targetId);
	return hasFaithUnitOn(state, playerId, center.x, center.y);
};

// Over how many opponents you have religious dominance.
export const religiousDominanceCount = (state: GameState | PublicGameState, playerId: string) =>
	state.players.filter((p) => p.id !== playerId && hasReligiousDominance(state, playerId, p.id)).length;

// The steps towards religious dominance over an opponent: 9, the 8 buildings inside their wall and their city centre.
const dominanceSteps = (2 * wallRing + 1) ** 2;

// How far you are: per opponent each of their buildings inside the wall with your missionary or inquisitor, and their
// city centre; all 9 once you are on their city centre.
export const religiousDominanceAmount = (state: GameState | PublicGameState, playerId: string) =>
	state.players
		.filter((p) => p.id !== playerId)
		.reduce((sum, p) => {
			if (hasReligiousDominance(state, playerId, p.id)) return sum + dominanceSteps;
			const inWall = state.buildings.filter((b) => b.ownerId === p.id && !isPeopleBuilding(b.type));
			return sum + inWall.filter((b) => hasFaithUnitOn(state, playerId, b.x, b.y)).length;
		}, 0);

export const religiousDominanceGoal = (state: GameState | PublicGameState) => dominanceSteps * (state.players.length - 1);

// From 0 to 1, how far a player is towards religious dominance over all opponents.
export const religiousDominanceProgress = (state: GameState | PublicGameState, playerId: string) => {
	const goal = religiousDominanceGoal(state);
	return goal ? religiousDominanceAmount(state, playerId) / goal : 0;
};

// The hover text of religious dominance: a line per player, e.g. "Anna converted 11 buildings and 1 city centre".
// A city centre counts with all 8 buildings of that opponent, like the progress.
export const religiousDominanceOverview = (state: GameState | PublicGameState) =>
	state.players
		.map((p) => {
			const centres = religiousDominanceCount(state, p.id);
			const buildings = religiousDominanceAmount(state, p.id) - centres;
			const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
			return `${p.name} converted ${plural(buildings, 'building')} and ${plural(centres, 'city centre')}`;
		})
		.join('\n');

export type OverviewLine = { source: string; amount: number };

// The cap lines Tradecraft adds on top of the highest cap: your spies on opponents' buildings.
const isFromTradecraft = (line: OverviewLine) => line.source === 'spy' && line.amount > 0;

type PlacedBuilding = GameState['buildings'][number];

// An opponent's spy on a building: without Covert operations it lowers the cap of that resource by 1, with it the
// building no longer counts for the cap (see resourceOverview). Your own spy on your own building (Counter
// intelligence) does nothing.
const spyOn = (state: GameState | PublicGameState, b: PlacedBuilding) => {
	const spy = unitAt(state, b.x, b.y, 'spy');
	if (!spy || spy.ownerId === b.ownerId) return null;
	return { spy, isCovert: hasEffect(getPlayer(state, spy.ownerId), 'covertOperations') };
};

// Covert operations: the buildings with such a spy do not count for the cap, so it becomes the highest cap of the
// others (0 when none are left). Shown as a line per spy, from the highest building down: how much lower the cap
// gets without its building (nothing for a building below one that still counts).
const covertSpyLines = (state: GameState | PublicGameState, playerId: string, resource: ResourceType) => {
	const capOf = (b: PlacedBuilding) => getBuildingStats(b.type).cap;
	let left = state.buildings.filter((b) => b.ownerId === playerId && getBuildingStats(b.type).resourceType === resource);
	const spied = left.filter((b) => spyOn(state, b)?.isCovert).sort((a, b) => capOf(b) - capOf(a));
	const lines: OverviewLine[] = [];
	for (const b of spied) {
		const before = Math.max(0, ...left.map(capOf));
		left = left.filter((o) => o !== b);
		const drop = before - Math.max(0, ...left.map(capOf));
		if (drop) lines.push({ source: 'spy', amount: -drop });
	}
	return lines;
};

// What a player's city centre produces of its chosen resource: 1 with city centre production on, more with Grand
// Palazzo (also when it is off), otherwise nothing.
export const cityCentreAmount = (state: GameState | PublicGameState, player: EffectHolder) =>
	hasEffect(player, 'grandPalazzo') ? palazzoCityCentreProduction : state.isCityCentreEnabled ? cityCentreProduction : 0;

// What each opponent's missionary or inquisitor on a building blocks of its production, in the order they were
// placed: 1 each until nothing is left, an inquisitor with Pilgrimage everything that is left.
const blockedBy = (state: GameState | PublicGameState, b: PlacedBuilding) => {
	let left = getBuildingStats(b.type).production ?? 0;
	return faithUnitsAt(state, b.x, b.y)
		.filter((unit) => unit.ownerId !== b.ownerId)
		.map((unit) => {
			const isFervent = unit.type === 'inquisitor' && hasEffect(getPlayer(state, unit.ownerId), 'pilgrimage');
			const amount = Math.min(left, isFervent ? left : 1);
			left -= amount;
			return { unit, amount };
		})
		.filter(({ amount }) => amount > 0);
};

// Where a resource's production and cap come from, one line per source. The production lines add up; the cap
// lines add up for people (farms and estates), otherwise the highest cap counts, lowered by the negative lines and
// raised by Tradecraft. Technologies and policies that change production or caps go here too, as extra lines.
export const resourceOverview = (state: GameState | PublicGameState, playerId: string, resource: ResourceType | 'people') => {
	const production: OverviewLine[] = [];
	const cap: OverviewLine[] = resource === 'people' ? [] : [{ source: 'standard', amount: standardCap }];
	const player = getPlayer(state, playerId);
	for (const b of state.buildings) {
		const stats = getBuildingStats(b.type);
		if (stats.resourceType !== resource) continue;
		const spied = spyOn(state, b);
		if (b.ownerId !== playerId) {
			// with Tradecraft each of your spies on an opponent's building gives you 1 cap (whatever it takes from them)
			if (spied?.spy.ownerId === playerId && hasEffect(player, 'tradecraft')) cap.push({ source: 'spy', amount: tradecraftCap });
			// with Centralized logistics the cap your army blocks on an opponent's farm or estate is added to yours
			const blocking = resource === 'people' ? armyAt(state, b.x, b.y) : undefined;
			if (blocking?.ownerId === playerId && hasEffect(player, 'centralizedLogistics')) {
				const extra = hasEffect(getPlayer(state, b.ownerId), 'agrarianReform') ? agrarianReformPeopleCap : 0;
				cap.push({ source: blocking.type, amount: stats.cap + extra });
			}
			// with Tithes you get what your missionaries and inquisitors take
			if (!hasEffect(player, 'tithes')) continue;
			for (const { unit, amount } of blockedBy(state, b)) {
				if (unit.ownerId === playerId) production.push({ source: unit.type, amount });
			}
			continue;
		}
		cap.push({ source: b.type, amount: stats.cap });
		// Agrarian reform: each farm and estate adds a bit more
		const extra = resource === 'people' && hasEffect(player, 'agrarianReform') ? agrarianReformPeopleCap : 0;
		if (extra) cap.push({ source: 'Agrarian reform', amount: extra });
		// an army on a farm or estate blocks its cap (Agrarian reform's too), a spy on another building lowers the cap
		const army = armyAt(state, b.x, b.y);
		if (army && army.ownerId !== playerId) cap.push({ source: army.type, amount: -(stats.cap + extra) });
		if (spied && !spied.isCovert) cap.push({ source: 'spy', amount: -1 });
		if (!stats.production) continue;
		production.push({ source: b.type, amount: stats.production });
		for (const { unit, amount } of blockedBy(state, b)) production.push({ source: unit.type, amount: -amount });
	}
	if (resource !== 'people') cap.push(...covertSpyLines(state, playerId, resource));
	const centre = cityCentreAmount(state, player);
	if (centre && resource !== 'people' && player.cityCentreResource === resource) production.push({ source: 'city centre', amount: centre });
	const cityState = player.characteristics.cityState;
	if (state.enabledCharacteristics.cityState && cityStateResource[cityState] === resource) {
		production.push({ source: cityState, amount: cityStateProduction });
	}
	// Interest: +1 gold the first generation after unlocking it, +2 the next, etc.
	const interest = resource === 'gold' ? generationsSince(state, player, 'interest') : 0;
	if (interest) production.push({ source: 'Interest', amount: interest });
	// Holy sacraments: 1 faith for each opponent's missionary and inquisitor on your buildings
	if (resource === 'faith' && hasEffect(player, 'holySacraments')) {
		for (const unit of state.units ?? []) {
			const isOnYours = state.buildings.some((b) => b.x === unit.x && b.y === unit.y && b.ownerId === playerId);
			if (isOnYours && unit.ownerId !== playerId && (unit.type === 'missionary' || unit.type === 'inquisitor')) production.push({ source: unit.type, amount: 1 });
		}
	}
	// Bread and circuses: 1 people cap per upcoming generation from each opponent without an opera house to you
	if (resource === 'people') {
		const opponents = state.players.filter((p) => p.id !== playerId);
		const unprotected = opponents.filter((p) => !hasOperaHouse(state, p.id)).length;
		const own = breadAndCircusesCount(state, player);
		if (own && unprotected) cap.push({ source: 'Bread and circuses', amount: own * unprotected });
		if (!hasOperaHouse(state, playerId)) {
			for (const opponent of opponents) {
				const count = breadAndCircusesCount(state, opponent);
				if (count) cap.push({ source: `Bread and circuses of ${opponent.name}`, amount: -count });
			}
		}
	}
	// Courtyard gardens: the city centre adds to the people cap, also when city centre production is off.
	if (resource === 'people' && hasEffect(player, 'courtyardGardens')) cap.push({ source: 'Courtyard gardens', amount: courtyardPeopleCap });
	// Grain reserves: a line that tops the people cap up to its lowest value
	const shortfall = grainReservesPeopleCap - sum(cap);
	if (resource === 'people' && hasEffect(player, 'grainReserves') && shortfall > 0) cap.push({ source: 'Grain reserves', amount: shortfall });
	return { production, cap };
};

const hasOperaHouse = (state: GameState | PublicGameState, playerId: string) => state.buildings.some((b) => b.ownerId === playerId && b.type === 'opera house');

// How many upcoming generations Bread and circuses has been in effect for the player (0 when it is not).
const breadAndCircusesCount = (state: GameState | PublicGameState, player: Player | PublicPlayer) => {
	const name = policyTree.flat().find((p) => p.effect === 'breadAndCircuses')!.name;
	const since = hasEffect(player, 'breadAndCircuses') ? player.policyGenerations?.[name] : undefined;
	return since === undefined ? 0 : state.stats.nrOfGenerations - since;
};

const sum = (lines: OverviewLine[]) => lines.reduce((total, line) => total + line.amount, 0);

// Farms and estates add up; one with an army on it does not count. Never below 0.
export const peopleCap = (state: GameState | PublicGameState, playerId: string) =>
	Math.max(0, sum(resourceOverview(state, playerId, 'people').cap));

export const peopleCount = (player: PlayerLike) => player.people + player.talents.length;

// Highest cap of your buildings of that type, at least the standard cap, minus what spies take; never below 0.
// What your own spies siphon off comes on top.
export const resourceCap = (state: GameState | PublicGameState, playerId: string, resource: ResourceType) => {
	const { cap } = resourceOverview(state, playerId, resource);
	const highest = Math.max(...cap.filter((line) => line.amount > 0 && !isFromTradecraft(line)).map((line) => line.amount));
	return Math.max(0, highest + sum(cap.filter((line) => line.amount < 0))) + sum(cap.filter(isFromTradecraft));
};

// What your buildings, and your city centre when enabled, produce of a resource each generation.
export const resourceProduction = (state: GameState | PublicGameState, playerId: string, resource: ResourceType) =>
	sum(resourceOverview(state, playerId, resource).production);

// "blacksmith" -> "blacksmiths", "factory" -> "factories", "church" -> "churches", "barracks" stays.
const plural = (name: string) =>
	name.endsWith('s') ? name : /[^aeiou]y$/.test(name) ? `${name.slice(0, -1)}ies` : name.endsWith('ch') ? `${name}es` : `${name}s`;

// The hover text of a resource overview, e.g. "Produced +4\n- 2 blacksmiths +2\n- 1 armoury +3\n- 1 missionary -1".
// The same sources are grouped and ordered by building level, with units and the city centre after the buildings.
// A cap that does not add up only shows where the highest cap comes from and what lowers it, e.g.
// "Cap 8\n- Armoury 9\n- 1 spy -1".
export const overviewText = (state: GameState | PublicGameState, playerId: string, resource: ResourceType | 'people', part: 'production' | 'cap') => {
	const isHighest = part === 'cap' && resource !== 'people';
	const all = resourceOverview(state, playerId, resource)[part];
	const highest = all
		.filter((line) => !isFromTradecraft(line))
		.reduce<OverviewLine | undefined>((max, line) => (!max || line.amount > max.amount ? line : max), undefined);
	const lines = isHighest
		? [...(highest ? [highest] : []), ...all.filter((line) => line.amount < 0 || isFromTradecraft(line))]
		: all;
	const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);
	const header =
		part === 'production'
			? `Produced ${signed(sum(lines))}`
			: `Cap ${isHighest ? resourceCap(state, playerId, resource as ResourceType) : sum(lines)}`;

	// your units on opponents' buildings (Tradecraft, Tithes) are grouped apart from opponents' units on yours
	const groups = new Map<string, { source: string; count: number; amount: number }>();
	for (const { source, amount } of lines) {
		const key = `${source}${amount < 0 ? '-' : '+'}`;
		const group = groups.get(key) ?? { source, count: 0, amount: 0 };
		groups.set(key, { source, count: group.count + 1, amount: group.amount + amount });
	}
	const rank = (source: string) => (source === 'standard' ? 0 : (buildingStats.find((b) => b.name === source)?.level ?? 5));
	const items = [...groups.values()]
		.sort((a, b) => rank(a.source) - rank(b.source))
		.map(({ source, count, amount }) => {
			// only buildings and units are counted, e.g. "1 blacksmith +1", but not the highest cap ("Armoury 9")
			const isCounted = [...buildingStats, ...unitStats].some((b) => b.name === source);
			if ((isHighest && amount > 0 && source !== 'spy') || !isCounted) {
				return `- ${source[0].toUpperCase() + source.slice(1)} ${isHighest ? amount : signed(amount)}`;
			}
			return `- ${count} ${count > 1 ? plural(source) : source} ${signed(amount)}`;
		});
	return [header, ...(items.length ? items : ['- Nothing yet'])].join('\n');
};

// Whether something lowers a resource's production or cap, e.g. an opponent's army, spy or missionary.
export const isLowered = (state: GameState | PublicGameState, playerId: string, resource: ResourceType | 'people', part: 'production' | 'cap') =>
	resourceOverview(state, playerId, resource)[part].some((line) => line.amount < 0);

// The hover text of the people you have, e.g. "People 4\n- 3 regular people\n- Artist".
export const peopleText = (player: PlayerLike) => {
	const counts = new Map<string, number>();
	for (const talent of player.talents) counts.set(talent, (counts.get(talent) ?? 0) + 1);
	const items = [
		...(player.people ? [`- ${player.people} regular ${player.people === 1 ? 'person' : 'people'}`] : []),
		...[...counts].map(([talent, count]) => `- ${count > 1 ? `${count} ${talent}s` : talent[0].toUpperCase() + talent.slice(1)}`)
	];
	return [`People ${peopleCount(player)}`, ...(items.length ? items : ['- Nobody yet'])].join('\n');
};

// Whether you may (re)choose your city centre's resource now: during your turn, once per turn.
export const canSetCityCentre = (state: GameState | PublicGameState, playerId: string) =>
	cityCentreAmount(state, getPlayer(state, playerId)) > 0 &&
	state.gameStatus === 'inProgress' &&
	state.phase === 'action' &&
	state.players[state.turnIndex]?.id === playerId &&
	getPlayer(state, playerId).cityCentreTurn !== state.stats.nrOfTurns;

// Whether the player has this title (only when titles are enabled).
export const hasTitle = (state: GameState | PublicGameState, player: Pick<Player, 'characteristics'>, title: string) =>
	state.enabledCharacteristics.title && player.characteristics.title === title;

const isTalent = (type: string): type is Talent => (talents as readonly string[]).includes(type);

// What changes how a cost is paid:
// - substitutes: a Philosopher may pay a specific talent with another one of its philosopherTalents group
// - workEthic: Work ethic, for a building: when the regular people cannot pay its people cost, 1 talent pays all of it
// - centralization: Centralization, what you lack of a resource is paid with power
export type PaymentRules = { substitutes?: boolean; workEthic?: boolean; centralization?: boolean };

export const paymentRules = (state: GameState | PublicGameState, player: EffectHolder & Pick<Player, 'characteristics'>, isBuilding = false): PaymentRules => ({
	substitutes: hasTitle(state, player, 'Philosopher'),
	workEthic: isBuilding && hasEffect(player, 'workEthic'),
	centralization: hasEffect(player, 'centralization')
});

// Works out which people, talents and resources pay for a cost: specific talents first, then generic people from
// regular people, then from talents: the chosen ones first, otherwise any.
const planPayment = (player: PlayerLike, cost: Cost[], chosenTalents: Talent[] = [], rules: PaymentRules = {}) => {
	const { substitutes = false } = rules;
	const talentsLeft = [...player.talents];
	const spentTalents: Talent[] = [];
	const required: Talent[] = [];
	const chosen = [...chosenTalents];
	let spentPeople = 0;
	const take = (talent: Talent) => {
		const index = talentsLeft.indexOf(talent);
		if (index === -1) return false;
		spentTalents.push(...talentsLeft.splice(index, 1));
		return true;
	};
	for (const { amount, resourceType } of cost.filter((c) => isTalent(c.resourceType))) {
		const group = (substitutes && philosopherTalents.find((g) => g.includes(resourceType as Talent))) || [];
		for (let i = 0; i < amount; i++) {
			if (!take(resourceType as Talent) && !group.some(take)) return null;
			required.push(spentTalents.at(-1)!);
		}
	}
	const people = cost.filter((c) => c.resourceType === 'people').reduce((total, c) => total + c.amount, 0);
	const payWithTalent = () => {
		if (chosen.length) return take(chosen.shift()!);
		if (!talentsLeft.length) return false;
		spentTalents.push(talentsLeft.pop()!);
		return true;
	};
	if (rules.workEthic && people > player.people) {
		// Work ethic: 1 talent pays all of it, no regular people are spent
		if (!payWithTalent()) return null;
	} else {
		for (let i = 0; i < people; i++) {
			if (spentPeople < player.people) spentPeople++;
			else if (!payWithTalent()) return null;
		}
	}
	// the resources: what you have, with Centralization what you lack in power (after power the cost asks for itself)
	const left = { ...player.resources };
	const spentResources = Object.fromEntries(resourceTypes.map((r) => [r, 0])) as Record<ResourceType, number>;
	const resourceCosts = cost.filter((c) => (resourceTypes as readonly string[]).includes(c.resourceType));
	for (const { amount, resourceType } of resourceCosts.toSorted((a, b) => Number(b.resourceType === 'power') - Number(a.resourceType === 'power'))) {
		const resource = resourceType as ResourceType;
		const own = Math.min(amount, left[resource]);
		const lacking = amount - own;
		if (lacking > 0 && (!rules.centralization || resource === 'power' || left.power < lacking)) return null;
		left[resource] -= own;
		spentResources[resource] += own;
		left.power -= lacking;
		spentResources.power += lacking;
	}
	return { spentPeople, spentTalents, required, spentResources };
};

export const canAfford = (player: PlayerLike, cost: Cost[], rules: PaymentRules = {}) => planPayment(player, cost, [], rules) !== null;

// Spending resources outside a purchase (bids, bribes, taxes, the culture actions): with Centralization power pays what
// you lack. Test mode does not make these free.
export const canSpend = (state: GameState | PublicGameState, player: PlayerLike & EffectHolder & Pick<Player, 'characteristics'>, cost: Cost[]) =>
	canAfford(player, cost, paymentRules(state, player));

const spend = (state: GameState, player: Player, cost: Cost[]) => {
	const payment = planPayment(player, cost, [], paymentRules(state, player)) ?? fail(`That costs ${costLabel(cost)}`);
	for (const resource of resourceTypes) player.resources[resource] -= payment.spentResources[resource];
};

// In test mode everything that is paid with pay() is free. isBuilding: Work ethic only works for buildings.
export const canPay = (state: GameState | PublicGameState, player: PlayerLike & EffectHolder & Pick<Player, 'characteristics'>, cost: Cost[], isBuilding = false) =>
	!!state.isTestMode || canAfford(player, cost, paymentRules(state, player, isBuilding));

export const costLabel = (cost: Cost[]) =>
	cost.map(({ amount, resourceType }) => `${amount} ${resourceType === 'people' && amount === 1 ? 'person' : resourceType}`).join(' · ');

// Which talents a cost needs: `required` are fixed by the cost, `choices` is how many people have to be
// paid with a talent the player picks from `options`. Null when no talents are involved or it is unaffordable.
export const talentPayment = (player: PlayerLike, cost: Cost[], rules: PaymentRules = {}) => {
	const payment = planPayment(player, cost, [], rules);
	if (!payment || payment.spentTalents.length === 0) return null;
	const { required } = payment;
	const options = [...player.talents];
	for (const talent of required) options.splice(options.indexOf(talent), 1);
	return { required, choices: payment.spentTalents.length - required.length, options };
};

const cellKey = (x: number, y: number) => `${x},${y}`;

const isPeopleBuilding = (type: string) => getBuildingStats(type).resourceType === 'people';

// The ring around the center a cell is in; the 8 cells around the center are ring 1.
const ringOf = (center: { x: number; y: number }, x: number, y: number) =>
	Math.max(Math.abs(x - center.x), Math.abs(y - center.y));

// The cells a building covers: a square of its size (farms 2×2, estates 3×3, the others 1 cell) from x, y, the
// corner with the lowest x and y.
export const buildingSize = (type: string) => getBuildingStats(type).size ?? 1;

export const footprint = (x: number, y: number, size: number) =>
	Array.from({ length: size * size }, (_, i) => ({ x: x + (i % size), y: y + Math.floor(i / size) }));

const coveredCells = (buildings: Building[]) =>
	buildings.flatMap((b) => footprint(b.x, b.y, buildingSize(b.type)).map((c) => cellKey(c.x, c.y)));

// The buildings a building of this type placed at x, y replaces: inside the wall your one on its cell, outside it
// the farms and estates it overlaps: your own, and with "Build over farms" also those of opponents.
const canReplace = (state: GameState | PublicGameState, playerId: string, b: Building) =>
	b.ownerId === playerId || (!!state.isBuildOverFarmsEnabled && isPeopleBuilding(b.type));

export const replacedBuildings = (state: GameState | PublicGameState, playerId: string, type: string, x: number, y: number) => {
	const cells = new Set(footprint(x, y, buildingSize(type)).map((c) => cellKey(c.x, c.y)));
	return state.buildings.filter(
		(b) => canReplace(state, playerId, b) && isPeopleBuilding(b.type) === isPeopleBuilding(type) && coveredCells([b]).some((c) => cells.has(c))
	);
};

// Where a building of this type may be placed, as the cell of its corner with the lowest x and y.
// Inside the wall (the rings up to wallRing around your city centre) any building but F&E goes on any cell, also over
// one of your buildings, which it replaces. F&E go outside every wall on cells without a city centre or another
// player's building, also over your own F&E, which they replace, unless an opponent's army is on one of those. At
// least one of their cells borders your wall (the ring just outside it) or shares a side with one of your F&E that
// stays.
export const validCells = (state: GameState | PublicGameState, playerId: string, type: string) => {
	const { center } = getPlayer(state, playerId);
	const cells = new Set<string>();
	if (!isPeopleBuilding(type)) {
		for (const c of footprint(center.x - wallRing, center.y - wallRing, 2 * wallRing + 1)) {
			if (ringOf(center, c.x, c.y) > 0) cells.add(cellKey(c.x, c.y));
		}
		return cells;
	}
	const ownFarmland = state.buildings.filter((b) => b.ownerId === playerId && isPeopleBuilding(b.type));
	const others = state.buildings.filter((b) => !(isPeopleBuilding(b.type) && canReplace(state, playerId, b)));
	const occupied = new Set([...coveredCells(others), ...state.players.map((p) => cellKey(p.center.x, p.center.y))]);
	const fits = (c: { x: number; y: number }) =>
		c.x >= 0 &&
		c.y >= 0 &&
		c.x < state.gridSize &&
		c.y < state.gridSize &&
		!occupied.has(cellKey(c.x, c.y)) &&
		state.players.every((p) => ringOf(p.center, c.x, c.y) > wallRing);
	const size = buildingSize(type);
	for (let x = 0; x < state.gridSize; x++) {
		for (let y = 0; y < state.gridSize; y++) {
			const cover = footprint(x, y, size);
			if (!cover.every(fits)) continue;
			const replaced = replacedBuildings(state, playerId, type, x, y);
			if (replaced.some((b) => (armyAt(state, b.x, b.y)?.ownerId ?? playerId) !== playerId)) continue;
			const farmland = new Set(coveredCells(ownFarmland.filter((b) => !replaced.includes(b))));
			const borders = (c: { x: number; y: number }) =>
				ringOf(center, c.x, c.y) === wallRing + 1 ||
				[[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => farmland.has(cellKey(c.x + dx, c.y + dy)));
			if (cover.some(borders)) cells.add(cellKey(x, y));
		}
	}
	return cells;
};

// Whether you have somewhere to put a building of this type.
export const hasPlaceFor = (state: GameState | PublicGameState, playerId: string, type: string) => validCells(state, playerId, type).size > 0;

// ---- lobby and start screen ----

export const createGameState = (settings: GameSettings, id: string, lobbyPasswordId: string | null): GameState => {
	const name = settings.name.trim() || fail('A game needs a name');
	const minPlayerCount = Math.max(1, Math.min(6, Math.floor(settings.minPlayerCount || 1)));
	const maxPlayerCount = Math.max(minPlayerCount, Math.min(6, Math.floor(settings.maxPlayerCount || 6)));
	const turnTimer = settings.turnTimer ? Math.max(1, Math.min(maxTurnTimer, Math.floor(settings.turnTimer))) : null;

	const picked = settings.objectives.slice(0, 3).filter((o) => o !== 'none');
	if (picked.length === 0) fail('A game needs an objective');
	const chosen = picked.filter((o): o is number => o !== 'random');
	if (new Set(chosen).size !== chosen.length) fail('Objectives must be different');
	if (chosen.some((o) => !objectiveList[o])) fail('Unknown objective');
	const remaining = shuffle(objectiveList.map((_, i) => i).filter((i) => !chosen.includes(i)));
	const objectives = picked.map((o) => (o === 'random' ? remaining.pop()! : o));

	return {
		id,
		name,
		lobbyPasswordId,
		minPlayerCount,
		maxPlayerCount,
		turnTimer,
		objectives,
		enabledCharacteristics: { ...settings.enabledCharacteristics },
		isCityCentreEnabled: !!settings.isCityCentreEnabled,
		isBuildOverFarmsEnabled: !!settings.isBuildOverFarmsEnabled,
		isReligiousDominanceEnabled: !!settings.isReligiousDominanceEnabled,
		isTestMode: !!settings.isTestMode,
		isTutorialEnabled: !!settings.isTutorialEnabled,
		gameStatus: 'open',
		phase: 'start',
		players: [],
		startPlayerIndex: 0,
		turnIndex: 0,
		turnsTaken: 0,
		turnRemainingMs: null,
		turnEndsAt: null,
		peoplePool: [],
		talentsAdded: false,
		gridSize: 0,
		buildings: [],
		units: [],
		auction: null,
		legacy: null,
		lastBorn: null,
		stats: { nrOfGenerations: 0, nrOfTurns: 0 },
		chatHistory: [],
		log: []
	};
};

export const addPlayer = (state: GameState): Player => {
	if (state.gameStatus !== 'open') fail('This game has already started');
	// a player who joins a full game takes the place of the last bot
	const bot = state.players.findLast((p) => p.bot);
	if (state.players.length >= state.maxPlayerCount && bot) state.players = state.players.filter((p) => p !== bot);
	if (state.players.length >= state.maxPlayerCount) fail('This game is full');
	// a free default name ("Player 1", "Player 2", ...), a random free color and a random choice in each enabled
	// characteristic dropdown
	let number = 1;
	while (state.players.some((p) => p.name === `Player ${number}`)) number++;
	const pick = (key: Characteristic, taken: string[] = []) => {
		const free = characteristicOptions[key].filter((option) => !taken.includes(option));
		return state.enabledCharacteristics[key] ? (free[Math.floor(Math.random() * free.length)] ?? '') : '';
	};
	const freeColors = colors.filter((color) => !state.players.some((p) => p.color === color));
	const player: Player = {
		id: crypto.randomUUID(),
		token: crypto.randomUUID(),
		name: `Player ${number}`,
		color: freeColors[Math.floor(Math.random() * freeColors.length)] ?? '',
		characteristics: {
			title: pick('title'),
			personalityTrait: pick('personalityTrait'),
			cityState: pick('cityState', state.players.map((p) => p.characteristics.cityState))
		},
		isConnected: true,
		isReadyForGame: false,
		isReadyForNextGeneration: false,
		isTurn: false,
		center: { x: 0, y: 0 },
		people: 0,
		talents: [],
		resources: emptyResources(),
		totalProduced: emptyResources(),
		totalBorn: 0,
		cityCentreResource: null,
		cityCentreTurn: null,
		undeployedUnits: [],
		unlockedPolicies: [],
		policiesInEffect: [],
		unlockedTechnologies: []
	};
	state.players.push(player);
	return player;
};

// A bot in an empty place of an open game, with a random free color and characteristics, always connected and ready.
export const addBot = (state: GameState, bot: string) => {
	if (!bots.includes(bot)) fail('Unknown bot');
	if (state.players.length >= state.maxPlayerCount) fail('This game is full');
	const player = addPlayer(state);
	let number = 1;
	const nameFor = (n: number) => (n === 1 ? bot : `${bot} ${n}`);
	while (state.players.some((p) => p.name === nameFor(number))) number++;
	player.name = nameFor(number);
	player.bot = bot;
	player.isReadyForGame = true;
	return player;
};

export const removeBot = (state: GameState, playerId: string) => {
	if (state.gameStatus !== 'open') fail('Players can only be changed before the game starts');
	if (!getPlayer(state, playerId).bot) fail('That is not a bot');
	state.players = state.players.filter((p) => p.id !== playerId);
};

export const updatePlayer = (
	state: GameState,
	playerId: string,
	patch: { name?: string; color?: string; characteristics?: Partial<Record<Characteristic, string>> }
) => {
	if (state.gameStatus !== 'open') fail('Players can only be changed before the game starts');
	const player = getPlayer(state, playerId);
	if (patch.name !== undefined) player.name = patch.name.slice(0, 30);
	if (patch.color !== undefined) {
		if (patch.color && !colors.includes(patch.color)) fail('Unknown color');
		if (patch.color && state.players.some((p) => p !== player && p.color === patch.color)) fail('That color is taken');
		player.color = patch.color;
	}
	for (const [key, value] of Object.entries(patch.characteristics ?? {}) as [Characteristic, string][]) {
		if (value && !characteristicOptions[key].includes(value)) fail(`Unknown ${key}`);
		if (key === 'cityState' && value && state.players.some((p) => p !== player && p.characteristics.cityState === value)) {
			fail('That city state is taken');
		}
		player.characteristics[key] = value;
	}
	if (!canBeReady(state, player)) player.isReadyForGame = false;
};

export const canBeReady = (state: GameState | PublicGameState, player: Omit<Player, 'token'>) =>
	player.name.trim() !== '' &&
	player.color !== '' &&
	(Object.keys(characteristicOptions) as Characteristic[]).every(
		(key) => !state.enabledCharacteristics[key] || player.characteristics[key] !== ''
	);

export const setReady = (state: GameState, playerId: string, ready: boolean) => {
	const player = getPlayer(state, playerId);
	if (state.gameStatus === 'inProgress' || state.gameStatus === 'finished') fail('The game is already running');
	if (ready && !canBeReady(state, player)) fail('Choose a name, color and characteristics first');
	player.isReadyForGame = ready;
};

// A test game ignores the minimum player count.
export const canStart = (state: GameState | PublicGameState) =>
	state.gameStatus === 'open' &&
	state.players.length >= (state.isTestMode ? 1 : state.minPlayerCount) &&
	state.players.some((p) => !p.bot) &&
	state.players.every((p) => p.isReadyForGame);

// ---- connections and saving ----

export const allPresent = (state: GameState) => state.players.every((p) => p.isConnected && p.isReadyForGame);

export const disconnectPlayer = (state: GameState, playerId: string, now: number) => {
	const player = getPlayer(state, playerId);
	if (state.gameStatus === 'open') {
		state.players = state.players.filter((p) => p !== player);
		return;
	}
	player.isConnected = false;
	player.isReadyForGame = false;
	if (state.gameStatus === 'inProgress') {
		state.gameStatus = 'saved';
		if (state.turnEndsAt) state.turnRemainingMs = Math.max(0, state.turnEndsAt - now);
		state.turnEndsAt = null;
		addLog(state, `${playerTag(player)} has left, the game is paused`);
	}
};

// Resumes a saved game once every player is connected and ready again.
export const resumeIfPossible = (state: GameState, now: number) => {
	if (state.gameStatus !== 'saved' || !allPresent(state)) return false;
	state.gameStatus = 'inProgress';
	if (state.turnRemainingMs !== null) state.turnEndsAt = now + state.turnRemainingMs;
	state.turnRemainingMs = null;
	addLog(state, 'The game continues');
	return true;
};

// ---- starting the game ----

const startPositions = (count: number, size: number) => {
	const middle = Math.floor(size / 2);
	if (count === 1) return [{ x: middle, y: middle }];
	// Players are spread evenly along a square ring h cells from the middle, so each centre is just as far from
	// its nearest edge. It starts at the top middle and goes clockwise.
	const h = Math.round(size * 0.3);
	// Halves round toward the middle, so opposite players are placed alike.
	const offset = (value: number) => Math.sign(value) * Math.ceil(Math.abs(value) - 0.5);
	const along = (s: number) => {
		if (s < h) return { dx: s, dy: -h };
		if (s < 3 * h) return { dx: h, dy: s - 2 * h };
		if (s < 5 * h) return { dx: 4 * h - s, dy: h };
		if (s < 7 * h) return { dx: -h, dy: 6 * h - s };
		return { dx: s - 8 * h, dy: -h };
	};
	return Array.from({ length: count }, (_, i) => {
		const { dx, dy } = along((8 * h * i) / count);
		return { x: middle + offset(dx), y: middle + offset(dy) };
	});
};

export const startGame = (state: GameState) => {
	if (!canStart(state)) fail('Not everyone is ready yet');
	shuffle(state.players);
	state.gameStatus = 'inProgress';
	state.gridSize = gridSizeFor(state.players.length);
	state.peoplePool = Array.from({ length: regularPeopleInPool }, () => 'person' as const);
	const positions = startPositions(state.players.length, state.gridSize);
	state.players.forEach((player, i) => (player.center = positions[i]));
	// In test mode everyone starts without farms, with all technologies and policies unlocked.
	if (state.isTestMode) {
		for (const player of state.players) {
			player.unlockedTechnologies = technologyTree.flat().map((t) => t.name);
			player.technologyGenerations = Object.fromEntries(player.unlockedTechnologies.map((name) => [name, state.stats.nrOfGenerations]));
			player.unlockedPolicies = policyTree.flat().map((p) => p.name);
		}
	}
	// A Bishop starts with Zealots unlocked and in effect.
	for (const player of state.players.filter((p) => hasTitle(state, p, 'Bishop'))) {
		player.unlockedPolicies = [...new Set([...(player.unlockedPolicies ?? []), 'Zealots'])];
		player.policiesInEffect = ['Zealots', null, null];
	}
	// The 2 starting farms go on opposite sides of the wall, each touching it with 2 cells, staggered: one is shifted
	// a cell along the wall from the other. A random layout of those that fit on the board.
	for (const player of state.isTestMode ? [] : state.players) {
		const { x: cx, y: cy } = player.center;
		const near = -wallRing - buildingSize('farm');
		const far = wallRing + 1;
		const layouts = [-wallRing, -wallRing + 1].flatMap((a) => {
			const b = -2 * wallRing + 1 - a;
			return [
				[{ x: cx + a, y: cy + near }, { x: cx + b, y: cy + far }],
				[{ x: cx + near, y: cy + a }, { x: cx + far, y: cy + b }]
			];
		});
		const free = validCells(state, player.id, 'farm');
		const fits = layouts.filter((farms) =>
			farms.every(({ x, y }) => free.has(`${x},${y}`) && replacedBuildings(state, player.id, 'farm', x, y).length === 0)
		);
		const [farms] = shuffle(fits);
		for (const { x, y } of farms) state.buildings.push({ id: crypto.randomUUID(), type: 'farm', ownerId: player.id, x, y });
	}
	addLog(state, `The game has started. Turn order: ${state.players.map(playerTag).join(', ')}`);
	beginGeneration(state);
};

// ---- phase one: a new generation is born ----

const drawFromPool = (state: GameState, count: number) => {
	const drawn: PoolItem[] = [];
	for (let i = 0; i < count && state.peoplePool.length; i++) {
		const index = Math.floor(Math.random() * state.peoplePool.length);
		drawn.push(...state.peoplePool.splice(index, 1));
	}
	return drawn;
};

export const beginGeneration = (state: GameState) => {
	state.stats.nrOfGenerations++;
	state.phase = 'born';
	state.legacy = null;
	state.players.forEach((p) => {
		p.isTurn = false;
		p.tradeGain = 0;
	});
	if (state.stats.nrOfGenerations > 1 && !state.talentsAdded) {
		for (const talent of talents) {
			for (let i = 0; i < talentsInPoolPerType; i++) state.peoplePool.push(talent);
		}
		state.talentsAdded = true;
	}

	// Podestà: each person still unspent gives 1 gold, within the gold cap
	for (const player of state.players.filter((p) => hasTitle(state, p, 'Podestà'))) {
		const before = player.resources.gold;
		player.resources.gold = Math.max(before, Math.min(before + peopleCount(player), resourceCap(state, player.id, 'gold')));
		if (player.resources.gold > before) addLog(state, `${playerTag(player)} gets ${player.resources.gold - before} gold for unspent people`);
	}

	const deficits = Object.fromEntries(
		state.players.map((p) => [p.id, Math.max(0, peopleCap(state, p.id) - peopleCount(p))])
	);
	const drawn = drawFromPool(state, Object.values(deficits).reduce((a, b) => a + b, 0));
	const drawnTalents = drawn.filter((d): d is Talent => d !== 'person');
	state.lastBorn = {
		people: drawn.length,
		talents: drawnTalents.length,
		drawn,
		deficits
	};
	state.auction = {
		queue: drawnTalents,
		talent: null,
		deficits,
		eligible: [],
		bids: {},
		cultureBids: {},
		done: [],
		won: Object.fromEntries(state.players.map((p) => [p.id, 0])),
		regularPeople: drawn.length - drawnTalents.length
	};
	addLog(
		state,
		`Generation ${state.stats.nrOfGenerations}: ${bornMessage(drawn.length, drawnTalents.length)}`
	);
	collectTaxes(state);
};

// Called right after the generation is born (by a timer on the server, see bornPhaseMs).
export const finishBorn = (state: GameState, now: number) => {
	if (state.phase !== 'born' || !state.auction) return;
	nextAuction(state, now);
};

const nextAuction = (state: GameState, now: number) => {
	const auction = state.auction!;
	while (auction.queue.length) {
		const talent = auction.queue.shift()!;
		const eligible = playersFromStart(state)
			.filter((p) => auction.deficits[p.id] - auction.won[p.id] > 0)
			.map((p) => p.id);
		if (eligible.length === 0) {
			state.peoplePool.push(talent);
			continue;
		}
		// With one player there is nobody to bid against.
		if (state.players.length === 1) {
			awardTalent(state, eligible[0], talent, 0, 0);
			continue;
		}
		auction.talent = talent;
		auction.eligible = eligible;
		auction.bids = Object.fromEntries(eligible.map((id) => [id, 0]));
		auction.cultureBids = Object.fromEntries(eligible.map((id) => [id, 0]));
		auction.history = [];
		auction.done = [];
		state.phase = 'auction';
		return;
	}
	allocatePeople(state);
	startActionPhase(state, now);
};

// What 1 culture is worth in your auction bids: 1, or more for a Patron.
export const cultureWorth = (state: GameState | PublicGameState, player: Pick<Player, 'characteristics'>) =>
	hasTitle(state, player, 'Patron') ? patronCultureWorth : 1;

// A bid is worth its own resource plus culture, 1 for 1 (for an artist the whole bid is culture).
export const bidTotal = (state: GameState | PublicGameState, playerId: string) => {
	const auction = state.auction!;
	const worth = cultureWorth(state, getPlayer(state, playerId));
	const amount = auction.bids[playerId] ?? 0;
	const isArtist = talentResource[auction.talent!] === 'culture';
	return (isArtist ? amount * worth : amount) + (auction.cultureBids?.[playerId] ?? 0) * worth;
};

// "1 gold and 2 culture", leaving out zero parts
export const bidLabel = (resource: ResourceType, amount: number, culture: number) =>
	[amount && `${amount} ${resource}`, culture && `${culture} culture`].filter(Boolean).join(' and ');

const bidCost = (resource: ResourceType, amount: number, culture: number): Cost[] => [
	{ amount, resourceType: resource },
	{ amount: culture, resourceType: 'culture' }
];

const awardTalent = (state: GameState, playerId: string, talent: Talent, bid: number, culture: number) => {
	const player = getPlayer(state, playerId);
	const resource = talentResource[talent];
	spend(state, player, bidCost(resource, bid, culture));
	player.talents.push(talent);
	state.auction!.won[playerId]++;
	const paid = bidLabel(resource, bid, culture);
	addLog(state, `${playerTag(player)} wins the ${talent}${paid ? ` for ${paid}` : ''}`);
};

// You bid with the talent's own resource and culture; neither part can be lowered.
// For an artist the own resource is culture, so there is only one part.
export const placeBid = (state: GameState, playerId: string, amount: number, culture = 0) => {
	const auction = state.auction;
	if (state.phase !== 'auction' || !auction) fail('There is no auction');
	if (!auction!.eligible.includes(playerId)) fail('You cannot bid on this talent');
	if (auction!.done.includes(playerId)) fail('You are done bidding');
	const resource = talentResource[auction!.talent!];
	if (resource === 'culture' && culture) fail('Bid on an artist with culture only once');
	const previousCulture = auction!.cultureBids?.[playerId] ?? 0;
	if (!Number.isInteger(amount) || !Number.isInteger(culture)) fail('Bids are whole numbers');
	if (amount < auction!.bids[playerId] || culture < previousCulture) fail('You cannot lower your bid');
	const player = getPlayer(state, playerId);
	if (!canSpend(state, player, bidCost(resource, amount, culture))) fail('You do not have enough to bid that');
	auction!.bids[playerId] = amount;
	auction!.cultureBids = { ...auction!.cultureBids, [playerId]: culture };
	auction!.history = [...(auction!.history ?? []), { playerId, amount, culture, total: bidTotal(state, playerId) }];
};

export const doneBidding = (state: GameState, playerId: string, now: number) => {
	const auction = state.auction;
	if (state.phase !== 'auction' || !auction) fail('There is no auction');
	if (!auction!.eligible.includes(playerId)) fail('You cannot bid on this talent');
	if (!auction!.done.includes(playerId)) auction!.done.push(playerId);
	if (auction!.done.length < auction!.eligible.length) return;

	// eligible is in turn order from the first player, so the first highest bid wins ties
	const winner = auction!.eligible.reduce((best, id) => (bidTotal(state, id) > bidTotal(state, best) ? id : best));
	awardTalent(state, winner, auction!.talent!, auction!.bids[winner], auction!.cultureBids?.[winner] ?? 0);
	nextAuction(state, now);
};

const allocatePeople = (state: GameState) => {
	const { deficits, won } = state.auction!;
	for (const player of state.players) {
		const regular = Math.max(0, deficits[player.id] - won[player.id]);
		player.people += regular;
		player.totalBorn = (player.totalBorn ?? 0) + regular + won[player.id];
	}
	state.auction = null;
};

// ---- phase two: each generation takes action ----

const startTurn = (state: GameState, now: number) => {
	state.players.forEach((p, i) => {
		p.isTurn = i === state.turnIndex;
		p.tradedWith = [];
	});
	state.turnEndsAt = state.turnTimer ? now + state.turnTimer * 1000 : null;
	state.turnRemainingMs = null;
};

const startActionPhase = (state: GameState, now: number) => {
	state.phase = 'action';
	state.turnIndex = state.startPlayerIndex;
	state.turnsTaken = 0;
	startTurn(state, now);
};

const assertTurn = (state: GameState, playerId: string) => {
	if (state.gameStatus !== 'inProgress') fail('The game is paused');
	if (state.phase !== 'action' || state.players[state.turnIndex]?.id !== playerId) fail('It is not your turn');
};

// Pays a purchase: people and talents go back to the pool, resources are spent. Nothing is paid in test mode.
const pay = (state: GameState, player: Player, cost: Cost[], chosenTalents: Talent[], what: string, isBuilding = false) => {
	if (state.isTestMode) return;
	const payment = planPayment(player, cost, chosenTalents, paymentRules(state, player, isBuilding)) ?? fail(`You cannot afford a ${what}`);
	player.people -= payment.spentPeople;
	for (let i = 0; i < payment.spentPeople; i++) state.peoplePool.push('person');
	for (const talent of payment.spentTalents) {
		player.talents.splice(player.talents.indexOf(talent), 1);
		state.peoplePool.push(talent);
	}
	for (const resource of resourceTypes) player.resources[resource] -= payment.spentResources[resource];
};

export const getUnitStats = (type: string) => unitStats.find((u) => u.name === type) ?? fail(`Unknown unit ${type}`);

// What a unit costs you: with Zealots a missionary costs 1 person and 1 faith, with War machine an army 1 person and
// 1 materials.
export const unitCost = (state: GameState | PublicGameState, player: EffectHolder, type: string): Cost[] => {
	if (type === 'missionary' && hasEffect(player, 'zealots')) return [{ amount: 1, resourceType: 'people' }, { amount: 1, resourceType: 'faith' }];
	if (type === 'army' && hasEffect(player, 'warMachine')) return [{ amount: 1, resourceType: 'people' }, { amount: 1, resourceType: 'materials' }];
	return getUnitStats(type).cost;
};

// The picture of a building or unit in static/images/pieces as a CSS url, e.g. "scribe's chamber" -> scribes-chamber.jpg
export const pieceImage = (name: string) => `url('/games/citystates/images/pieces/${name.replace(/'/g, '').replace(/\s+/g, '-')}.jpg')`;

// The name of a unit's picture in static/images/pieces (a mercenary looks like an army).
export const unitImage = (type: string) => getUnitStats(type).image ?? type;

// Cells a unit can be placed on: an army or mercenary on a farm or estate, the other units on other buildings.
// - An army or spy goes on an opponent's building without your own of that kind, or on a building (also your own)
//   with an opponent's army or spy there, which removes both. Armies and mercenaries count as the same kind.
// - With Counter intelligence in effect your spy also goes on your own building, and keeps other spies out.
// - Missionaries stack on an opponent's building, one per player, but never where an inquisitor is.
// - An inquisitor goes where you have no inquisitor yet. It removes all missionaries and inquisitors there (also
//   your own, and also on your own building) and itself; otherwise it stays and blocks like a missionary.
// - With Persecution in effect your inquisitor also goes on your own building, stays there and keeps other
//   missionaries and inquisitors out.
// - A trader goes on no cell but on an opponent's player board (see traderTargets).
// - A Dictator's buildings are no target for opponents' missionaries, nor for their spies without Covert operations.
export const unitTargets = (state: GameState | PublicGameState, playerId: string, type: Unit['type']) => {
	const player = getPlayer(state, playerId);
	if (type === 'trader') return new Set<string>(); // a trader goes on a player board, see traderTargets
	// religious dominance: with your missionary or inquisitor on all 8 buildings inside an opponent's wall, one goes on
	// their city centre (one per player), where it stays for good
	const centres =
		state.isReligiousDominanceEnabled && (type === 'missionary' || type === 'inquisitor')
			? state.players
					.filter((p) => p !== player && !(type === 'missionary' && (hasTitle(state, p, 'Dictator') || hasEffect(p, 'freedomOfSpeech'))))
					.filter((p) => isDominantByBuildings(state, playerId, p.id) && !hasFaithUnitOn(state, playerId, p.center.x, p.center.y))
					.map((p) => cellKey(p.center.x, p.center.y))
			: [];
	return new Set([
		...centres,
		...state.buildings
			.filter((b) => isPeopleBuilding(b.type) === isArmy(type))
			.filter((b) => {
				const owner = getPlayer(state, b.ownerId);
				const isOwn = owner === player;
				const isDictatorProof = type === 'missionary' || (type === 'spy' && !hasEffect(player, 'covertOperations'));
				if (!isOwn && isDictatorProof && hasTitle(state, owner, 'Dictator')) return false;
				// Freedom of speech: no new missionaries of opponents (those already there stay, inquisitors still come)
				if (!isOwn && type === 'missionary' && hasEffect(owner, 'freedomOfSpeech')) return false;
				if (isArmy(type) || type === 'spy') {
					const unit = type === 'spy' ? unitAt(state, b.x, b.y, 'spy') : armyAt(state, b.x, b.y);
					// on your own building only a spy with Counter intelligence, or an army with Defensive strategies
					if (!unit) return !isOwn || (type === 'spy' ? hasEffect(player, 'counterIntelligence') : hasEffect(player, 'defensiveStrategies'));
					const isGuarded = type === 'spy' && unit.ownerId === owner.id && hasEffect(owner, 'counterIntelligence');
					return unit.ownerId !== playerId && !isGuarded;
				}
				const faithUnits = faithUnitsAt(state, b.x, b.y);
				const inquisitor = faithUnits.find((u) => u.type === 'inquisitor');
				if (type === 'missionary') return !isOwn && !inquisitor && !faithUnits.some((u) => u.ownerId === playerId);
				if (isOwn) return faithUnits.some((u) => u.ownerId !== playerId) || (hasEffect(player, 'persecution') && !inquisitor);
				const isGuarded = inquisitor?.ownerId === owner.id && hasEffect(owner, 'persecution');
				return inquisitor?.ownerId !== playerId && !isGuarded;
			})
			.map((b) => cellKey(b.x, b.y))
	]);
};

// A bought unit waits in your stock until you place it.
export const buyUnit = (state: GameState, playerId: string, type: Unit['type'], chosenTalents: Talent[] = []) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	if (!isUnitUnlocked(state, player, type)) fail(`You need ${unitUnlockText(type)} to buy a ${type}`);
	pay(state, player, unitCost(state, player, type), chosenTalents, type);
	player.undeployedUnits = [...(player.undeployedUnits ?? []), type];
	addLog(state, `${playerTag(player)} buys a ${type}`);
};

// The opponents whose player board a trader can go on, to trade with them (see trade). Not with Isolationism (yours
// or theirs).
export const traderTargets = (state: GameState | PublicGameState, playerId: string) => {
	const player = getPlayer(state, playerId);
	if (hasEffect(player, 'isolationism')) return new Set<string>();
	return new Set(
		state.players
			.filter((p) => p.id !== playerId && !hasEffect(p, 'isolationism'))
			.map((p) => p.id)
	);
};

// Placing a unit from your stock on units it removes (see unitTargets) removes them and itself.
export const deployUnit = (state: GameState, playerId: string, type: Unit['type'], x: number, y: number) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	const stock = player.undeployedUnits ?? [];
	if (!stock.includes(type)) fail(`You have no ${type} to place`);
	if (type === 'trader') fail('A trader is used in a trade');
	if (!unitTargets(state, playerId, type).has(cellKey(x, y))) fail(`You cannot place a ${type} there`);
	stock.splice(stock.indexOf(type), 1);
	player.undeployedUnits = stock;

	state.units ??= [];
	const centreOwner = state.players.find((p) => p.center.x === x && p.center.y === y);
	if (centreOwner) {
		state.units.push({ id: crypto.randomUUID(), type, ownerId: playerId, x, y });
		addLog(state, `${playerTag(player)} places a ${type} on ${playerTag(centreOwner)}'s city centre and has religious dominance over them for good`);
		return;
	}
	const building = state.buildings.find((b) => b.x === x && b.y === y)!;
	const target = getPlayer(state, building.ownerId);
	const existing = isArmy(type) ? armyAt(state, x, y) : type === 'spy' ? unitAt(state, x, y, type) : undefined;
	const faithUnits = type === 'inquisitor' ? faithUnitsAt(state, x, y) : [];
	if (existing) {
		state.units = state.units.filter((u) => u !== existing);
		const other = getPlayer(state, existing.ownerId);
		// a General's army stays to defend their own farm or estate
		if (isArmy(type) && hasTitle(state, player, 'General') && target === player) {
			state.units.push({ id: crypto.randomUUID(), type, ownerId: playerId, x, y });
			addLog(state, `${playerTag(player)}'s ${type} removes ${playerTag(other)}'s ${existing.type} from ${playerTag(target)}'s ${building.type} and stays`);
		} else {
			addLog(state, `${playerTag(player)}'s ${type} and ${playerTag(other)}'s ${existing.type} remove each other from ${playerTag(target)}'s ${building.type}`);
		}
	} else if (faithUnits.length) {
		state.units = state.units.filter((u) => !faithUnits.includes(u));
		addLog(state, `${playerTag(player)}'s inquisitor removes the missionaries and inquisitors from ${playerTag(target)}'s ${building.type}`);
		// with Persecution in effect it stays to guard your own building
		if (target === player && hasEffect(player, 'persecution')) state.units.push({ id: crypto.randomUUID(), type, ownerId: playerId, x, y });
	} else {
		state.units.push({ id: crypto.randomUUID(), type, ownerId: playerId, x, y });
		addLog(state, `${playerTag(player)} places a ${type} on ${playerTag(target)}'s ${building.type}`);
	}
};

// How many of your resources a trade gives for how many of theirs: 2 for 1, 1 for 1 with Coinage, 1 for 2 with
// Infrastructure.
export const tradeRatio = (player: EffectHolder) =>
	hasEffect(player, 'infrastructure') ? { give: 1, take: 2 } : hasEffect(player, 'coinage') ? { give: 1, take: 1 } : { give: 2, take: 1 };

export const tradeLimitMessage = "You can trade only once with each opponent (unless you unlock the 'Caravans' technology)";

// Whether you already traded with that opponent this turn, and Caravans does not lift the limit.
export const hasTradedWith = (player: Pick<Player, 'tradedWith' | 'unlockedTechnologies'>, targetId: string) =>
	!hasEffect(player, 'caravans') && (player.tradedWith ?? []).includes(targetId);

// How many traders you can use in one trade: with Caravans all the traders in your stock, otherwise 1.
export const maxTraders = (player: Pick<Player, 'undeployedUnits' | 'unlockedTechnologies'>) => {
	const traders = (player.undeployedUnits ?? []).filter((u) => u === 'trader').length;
	return hasEffect(player, 'caravans') ? traders : Math.min(1, traders);
};

// A trader trades your resources (any mix) for an opponent's (see tradeRatio), without their consent and regardless
// of caps; the trader is used up. Once per opponent each turn. People and talents cannot be traded. With Caravans
// several traders trade at once, e.g. 2 traders with Coinage trade 2 for 2.
export const trade = (state: GameState, playerId: string, targetId: string, give: ResourceType[], take: ResourceType[]) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	const target = getPlayer(state, targetId);
	const stock = player.undeployedUnits ?? [];
	if (!stock.includes('trader')) fail('You have no trader');
	if (target === player) fail('You cannot trade with yourself');
	if (hasEffect(player, 'isolationism') || hasEffect(target, 'isolationism')) fail('Isolationism: no trade is possible');
	if (hasTradedWith(player, targetId)) fail(tradeLimitMessage);
	const ratio = tradeRatio(player);
	const count = give.length / ratio.give;
	const isValid = [...give, ...take].every((r) => (resourceTypes as readonly string[]).includes(r));
	if (!Number.isInteger(count) || count < 1 || count > maxTraders(player) || take.length !== count * ratio.take || !isValid) {
		fail(`Each trader trades ${ratio.give} of your resources for ${ratio.take} of theirs`);
	}
	if (give.some((r) => player.resources[r] < give.filter((g) => g === r).length)) fail('You do not have those resources');
	if (take.some((r) => target.resources[r] < take.filter((g) => g === r).length)) fail(`${target.name} does not have those resources`);

	for (let i = 0; i < count; i++) stock.splice(stock.indexOf('trader'), 1);
	player.undeployedUnits = stock;
	player.tradedWith = [...(player.tradedWith ?? []), targetId];
	for (const r of give) {
		player.resources[r] -= 1;
		target.resources[r] += 1;
	}
	for (const r of take) {
		target.resources[r] -= 1;
		player.resources[r] += 1;
	}
	player.tradeGain = (player.tradeGain ?? 0) + take.length;
	// counted per resource, e.g. ["gold", "gold", "faith"] -> "2 gold and 1 faith"
	const counted = (resources: ResourceType[]) =>
		[...new Set(resources)].map((r) => `${resources.filter((x) => x === r).length} ${r}`).join(' and ');
	addLog(state, `${playerTag(player)} trades ${counted(give)} for ${counted(take)}`);
};

export const build = (state: GameState, playerId: string, type: string, x: number, y: number, chosenTalents: Talent[] = []) => {
	assertTurn(state, playerId);
	const stats: BuildingStats = getBuildingStats(type);
	const player = getPlayer(state, playerId);
	if (!validCells(state, playerId, type).has(cellKey(x, y))) fail('You cannot build there');
	pay(state, player, stats.cost, chosenTalents, type, true);
	// Inside the wall a building replaces the one on its cell, and units on it stay. Outside it F&E replace the F&E
	// they overlap (never with an opponent's army on it), and your armies on those go back to your stock.
	const replaced = replacedBuildings(state, playerId, type, x, y);
	state.buildings = state.buildings.filter((b) => !replaced.includes(b));
	if (isPeopleBuilding(type)) {
		for (const b of replaced) {
			for (const unit of (state.units ?? []).filter((u) => u.x === b.x && u.y === b.y)) {
				const owner = getPlayer(state, unit.ownerId);
				owner.undeployedUnits = [...(owner.undeployedUnits ?? []), unit.type];
				state.units = state.units!.filter((u) => u !== unit);
			}
		}
	}
	state.buildings.push({ id: crypto.randomUUID(), type, ownerId: playerId, x, y });
	const whose = (b: Building) => (b.ownerId === playerId ? 'the' : `${playerTag(getPlayer(state, b.ownerId))}'s`);
	addLog(state, `${playerTag(player)} builds a ${type}${replaced.length ? ` over ${replaced.map((b) => `${whose(b)} ${b.type}`).join(' and ')}` : ''}`);
};

export const setCityCentre = (state: GameState, playerId: string, resource: ResourceType) => {
	assertTurn(state, playerId);
	if (!cityCentreAmount(state, getPlayer(state, playerId))) fail('Your city centre produces nothing');
	if (!(resourceTypes as readonly string[]).includes(resource)) fail('Unknown resource');
	if (!canSetCityCentre(state, playerId)) fail('You can change your city centre once each turn');
	const player = getPlayer(state, playerId);
	player.cityCentreResource = resource;
	player.cityCentreTurn = state.stats.nrOfTurns;
	addLog(state, `${playerTag(player)}'s city centre now produces ${resource}`);
};

export const endTurn = (state: GameState, playerId: string | null, now: number) => {
	if (playerId) assertTurn(state, playerId);
	else if (state.phase !== 'action' || state.gameStatus !== 'inProgress') return;
	state.stats.nrOfTurns++;
	state.turnsTaken++;
	if (state.turnsTaken >= state.players.length) {
		if (!checkObjectives(state)) produce(state);
		return;
	}
	state.turnIndex = (state.turnIndex + 1) % state.players.length;
	startTurn(state, now);
};

// ---- phase three: the legacy of a generation ----

const produce = (state: GameState) => {
	state.phase = 'legacy';
	state.turnEndsAt = null;
	state.legacy = {};
	for (const player of state.players) {
		player.isTurn = false;
		player.isReadyForNextGeneration = false;
		const lines = {} as Record<ResourceType, LegacyLine>;
		for (const resource of resourceTypes) {
			const before = player.resources[resource];
			const production = resourceProduction(state, player.id, resource);
			const cap = resourceCap(state, player.id, resource);
			const after = Math.max(before, Math.min(before + production, cap));
			lines[resource] = { before, production, cap, after, isCapped: before + production > cap };
			player.resources[resource] = after;
			player.totalProduced[resource] += after - before;
		}
		state.legacy[player.id] = lines;
	}
	addLog(state, 'The legacy of a generation: all buildings produce');
};

export const readyForNextGeneration = (state: GameState, playerId: string) => {
	if (state.gameStatus !== 'inProgress') fail('The game is paused');
	if (state.phase !== 'legacy') fail('The generation is not over yet');
	getPlayer(state, playerId).isReadyForNextGeneration = true;
	if (!state.players.every((p) => p.isReadyForNextGeneration)) return;
	state.startPlayerIndex = (state.startPlayerIndex + 1) % state.players.length;
	beginGeneration(state);
};

// ---- objectives ----

// The sum of the 2 highest levels.
const twoHighest = (levels: number[]) =>
	levels
		.sort((a, b) => b - a)
		.slice(0, 2)
		.reduce((sum, level) => sum + level, 0);

// The policies in a player's slots, without the empty ones.
const policiesIn = (player: Pick<Player, 'policiesInEffect'>) => (player.policiesInEffect ?? []).filter((p) => p !== null);

// The level of a technology is its row in its column, starting at 1.
const levelsIn = (tree: { name: string }[][], names: string[]) =>
	names.map((name) => tree.find((c) => c.some((t) => t.name === name))?.findIndex((t) => t.name === name) ?? -1).map((i) => i + 1);

// What a player has towards an objective, e.g. 6 levels of the 8.
export const objectiveAmount = (state: GameState | PublicGameState, playerId: string, objective: number) => {
	const player = getPlayer(state, playerId);
	const stock = player.undeployedUnits ?? [];
	const amounts = [
		// the highest level of each resource, of the 2 best resources (so 2 different level 4 buildings); F&E do not count
		() =>
			twoHighest(
				resourceTypes.map((resource) =>
					Math.max(0, ...state.buildings.filter((b) => b.ownerId === playerId && getBuildingStats(b.type).resourceType === resource).map((b) => getBuildingStats(b.type).level))
				)
			),
		() => peopleCount(player),
		// mercenaries do not count
		() => stock.filter((u) => u === 'army').length,
		() => player.tradeGain ?? 0,
		() => (state.units ?? []).filter((u) => u.ownerId === playerId && u.type === 'inquisitor').length,
		() => new Set(player.talents).size,
		// the highest level of your technologies
		() => Math.max(0, ...levelsIn(technologyTree, player.unlockedTechnologies ?? [])),
		() => (policiesIn(player).includes('Centralization') ? 1 : 0)
	];
	return amounts[objective]?.() ?? 0;
};

// How far a player is towards an objective, from 0 to 1.
export const objectiveProgress = (state: GameState | PublicGameState, playerId: string, objective: number) =>
	Math.min(1, objectiveAmount(state, playerId, objective) / objectiveList[objective].goal);

// The hover text of an objective: a line per player, e.g. "Anna has 6/8 levels".
export const objectiveOverview = (state: GameState | PublicGameState, objective: number) => {
	const { goal, unit } = objectiveList[objective];
	return state.players
		.map((p) => `${p.name} has ${objectiveAmount(state, p.id, objective)}/${goal} ${unit}`)
		.join('\n');
};

// Checked at the end of phase two: the game ends once a player has completed all objectives, or (when enabled) has
// religious dominance over all opponents. When several players have, it is a draw between them.
const isReligiouslyDominant = (state: GameState, playerId: string) =>
	state.isReligiousDominanceEnabled && state.players.length > 1 && religiousDominanceCount(state, playerId) === state.players.length - 1;

export const checkObjectives = (state: GameState) => {
	const winners = state.players.filter(
		(p) => state.objectives.every((o) => objectiveProgress(state, p.id, o) >= 1) || isReligiouslyDominant(state, p.id)
	);
	if (!winners.length) return false;
	state.gameStatus = 'finished';
	state.winnerIds = winners.map((p) => p.id);
	state.turnEndsAt = null;
	for (const player of state.players) player.isTurn = false;
	const names = winners.map(playerTag).join(' and ');
	const how = winners.every((p) => isReligiouslyDominant(state, p.id)) ? 'religious dominance over all players' : 'completed all objectives';
	addLog(state, winners.length > 1 ? `A draw: ${names} have ${how}` : `${names} has ${how} and wins the game`);
	return true;
};

// ---- technologies ----

type EffectHolder = Pick<Player, 'unlockedTechnologies' | 'policiesInEffect'>;

export const getTechnology = (name: string) =>
	technologyTree.flat().find((t) => t.name === name) ?? fail(`Unknown technology ${name}`);

// Without city centre production you first have to choose what the city centre produces with Grand Palazzo.
export const technologyDescription = (state: GameState | PublicGameState, technology: { description: string; effect?: string }) =>
	technology.effect === 'grandPalazzo' && !state.isCityCentreEnabled
		? `Click on your city centre to choose a resource: it produces ${palazzoCityCentreProduction} of it each generation`
		: technology.description;

// Whether the player has unlocked a technology with this effect, or has a policy with it in effect.
export const hasEffect = (player: EffectHolder, effect: Effect) =>
	(player.unlockedTechnologies ?? []).some((name) => technologyTree.flat().find((t) => t.name === name)?.effect === effect) ||
	(player.policiesInEffect ?? []).some((name) => policyTree.flat().find((p) => p.name === name)?.effect === effect);

// How many generations have started since the player unlocked the technology with this effect (0 when not unlocked).
const generationsSince = (state: GameState | PublicGameState, player: Player | PublicPlayer, effect: Effect) => {
	const name = (player.unlockedTechnologies ?? []).find((n) => getTechnology(n).effect === effect);
	const unlockedAt = name === undefined ? undefined : player.technologyGenerations?.[name];
	return unlockedAt === undefined ? 0 : state.stats.nrOfGenerations - unlockedAt;
};

// A technology's cost for you: its knowledge is 1 lower for each opponent who has already unlocked it.
// With Espionage it costs no knowledge once an opponent has it.
export const technologyCost = (state: GameState | PublicGameState, playerId: string, name: string): Cost[] => {
	const others = state.players.filter((p) => p.id !== playerId && (p.unlockedTechnologies ?? []).includes(name)).length;
	const isSpiedOn = others > 0 && hasEffect(getPlayer(state, playerId), 'espionage');
	return getTechnology(name).cost.map((c) =>
		c.resourceType === 'knowledge' ? { ...c, amount: isSpiedOn ? 0 : Math.max(0, c.amount - others * technologyDiscount) } : c
	);
};

// A column is unlocked from the top down: a technology needs the one above it first.
export const isNextTechnology = (player: EffectHolder, name: string) => {
	const column = technologyTree.find((c) => c.some((t) => t.name === name)) ?? fail(`Unknown technology ${name}`);
	const index = column.findIndex((t) => t.name === name);
	const unlocked = player.unlockedTechnologies ?? [];
	return !unlocked.includes(name) && (index === 0 || unlocked.includes(column[index - 1].name));
};

export const unlockTechnology = (state: GameState, playerId: string, name: string) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	if ((player.unlockedTechnologies ?? []).includes(name)) fail('You already have that technology');
	if (!isNextTechnology(player, name)) fail('Unlock the technology above it first');
	pay(state, player, technologyCost(state, playerId, name), [], name);
	player.unlockedTechnologies = [...(player.unlockedTechnologies ?? []), name];
	player.technologyGenerations = { ...player.technologyGenerations, [name]: state.stats.nrOfGenerations };
	addLog(state, `${playerTag(player)} unlocks the '${name}' technology`);
};

// ---- policies ----

export const getPolicy = (name: string) => policyTree.flat().find((p) => p.name === name) ?? fail(`Unknown policy ${name}`);

// Tax reformation: once a generation is born, each opponent pays you taxGold for each of their units on your
// buildings inside your wall (whatever your gold cap): inquisitors first, then spies and missionaries. Armies on farms
// and estates pay nothing. A unit they cannot pay for returns to their stock, so when their gold runs out missionaries
// return first.
const taxOrder: Unit['type'][] = ['inquisitor', 'spy', 'missionary'];
const collectTaxes = (state: GameState) => {
	for (const taxer of state.players.filter((p) => hasEffect(p, 'taxReformation'))) {
		const paid = new Map<Player, number>();
		const taxed = (state.units ?? []).filter((u) => taxOrder.includes(u.type));
		for (const unit of taxed.toSorted((a, b) => taxOrder.indexOf(a.type) - taxOrder.indexOf(b.type))) {
			const building = state.buildings.find((b) => b.x === unit.x && b.y === unit.y);
			if (building?.ownerId !== taxer.id || unit.ownerId === taxer.id) continue;
			const owner = getPlayer(state, unit.ownerId);
			const tax: Cost[] = [{ amount: taxGold, resourceType: 'gold' }];
			if (canSpend(state, owner, tax)) {
				spend(state, owner, tax);
				taxer.resources.gold += taxGold;
				paid.set(owner, (paid.get(owner) ?? 0) + taxGold);
			} else {
				state.units = state.units!.filter((u) => u !== unit);
				owner.undeployedUnits = [...(owner.undeployedUnits ?? []), unit.type];
				addLog(state, `${playerTag(owner)} cannot pay ${playerTag(taxer)}'s taxes: their ${unit.type} returns to their player board`);
			}
		}
		for (const [owner, gold] of paid) addLog(state, `${playerTag(owner)} pays ${playerTag(taxer)} ${gold} gold in taxes`);
	}
};

// Units already in stock stay usable. Spies, inquisitors and mercenaries are unlocked by their technology or policy, the other units by having a
// building of their resource (also when an opponent's unit is on it).
export const isUnitUnlocked = (state: GameState | PublicGameState, player: EffectHolder & Pick<Player, 'id'>, type: string) =>
	unitEffect[type]
		? hasEffect(player, unitEffect[type])
		: state.buildings.some((b) => b.ownerId === player.id && getBuildingStats(b.type).resourceType === getUnitStats(type).resourceType);

// What unlocks a unit, for its hover text: "Cryptography", or "a materials building".
export const unitUnlockText = (type: string) => {
	const effect = unitEffect[type];
	if (!effect) return `a ${getUnitStats(type).resourceType} building`;
	return [...technologyTree.flat(), ...policyTree.flat()].find((i) => i.effect === effect)?.name ?? effect;
};

// Whether you have the technology a policy needs before you can buy it (Espionage: Tradecraft).
export const meetsRequirement = (player: EffectHolder, policy: { requires?: string }) =>
	!policy.requires || (player.unlockedTechnologies ?? []).includes(policy.requires);

// Buying a policy unlocks it; it works once it is implemented in one of your slots.
export const unlockPolicy = (state: GameState, playerId: string, name: string) => {
	assertTurn(state, playerId);
	const policy = getPolicy(name);
	const player = getPlayer(state, playerId);
	if (!policy.cost.length) fail('That policy cannot be bought yet');
	if ((player.unlockedPolicies ?? []).includes(name)) fail('You already have that policy');
	if (!meetsRequirement(player, policy)) fail(`Unlock '${policy.requires}' first`);
	pay(state, player, policy.cost, [], name);
	player.unlockedPolicies = [...(player.unlockedPolicies ?? []), name];
	addLog(state, `${playerTag(player)} unlocks the '${name}' policy`);
};

// A policy goes in the slot it was put in; the slots keep their place, an empty one is null.
export const implementPolicy = (state: GameState, playerId: string, name: string, slot: number) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	const inEffect = player.policiesInEffect ?? [];
	if (!(player.unlockedPolicies ?? []).includes(name)) fail('Unlock that policy first');
	if (inEffect.includes(name)) fail('That policy is already in effect');
	if (!Number.isInteger(slot) || slot < 0 || slot >= policySlots || inEffect[slot]) fail('That policy slot is not empty');
	player.policiesInEffect = Array.from({ length: policySlots }, (_, i) => (i === slot ? name : (inEffect[i] ?? null)));
	player.policyGenerations = { ...player.policyGenerations, [name]: state.stats.nrOfGenerations };
	addLog(state, `${playerTag(player)} implements the '${name}' policy`);
};

export const removePolicy = (state: GameState, playerId: string, name: string) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	if (!(player.policiesInEffect ?? []).includes(name)) fail('That policy is not in effect');
	pay(state, player, policyRemoveCost, [], 'policy removal');
	player.policiesInEffect = player.policiesInEffect!.map((p) => (p === name ? null : p));
	delete player.policyGenerations?.[name];
	addLog(state, `${playerTag(player)} removes the '${name}' policy`);
};

const payCulture = (state: GameState, player: Player, amount: number) => spend(state, player, [{ amount, resourceType: 'culture' }]);

// Ambassador bribes: an opponent's unit on one of your buildings is removed for gold. The gold goes nowhere.
export const bribe = (state: GameState, playerId: string, unitId: string) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	if (!hasEffect(player, 'ambassadorBribes')) fail('Ambassador bribes is not in effect');
	const unit = (state.units ?? []).find((u) => u.id === unitId) ?? fail('That unit is not on the board');
	const building = state.buildings.find((b) => b.x === unit.x && b.y === unit.y);
	if (building?.ownerId !== playerId || unit.ownerId === playerId) fail("You can only bribe an opponent's unit on your own building");
	const price = bribeGold[unit.type as keyof typeof bribeGold] ?? fail(`A ${unit.type} cannot be bribed`);
	spend(state, player, [{ amount: price, resourceType: 'gold' }]);
	state.units = state.units!.filter((u) => u !== unit);
	addLog(state, `${playerTag(player)} bribes ${playerTag(getPlayer(state, unit.ownerId))}'s ${unit.type} away from their ${building!.type}`);
};

// ---- the actions of the culture technologies ----

// Reeducation programs: one of your talents becomes another talent. The people cap does not matter.
export const retrainTalent = (state: GameState, playerId: string, index: number, talent: Talent) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	if (!hasEffect(player, 'reeducationPrograms')) fail("Unlock the 'Reeducation programs' technology first");
	const from = player.talents[index] ?? fail('You do not have that talent');
	if (!isTalent(talent) || talent === from) fail('Choose another talent');
	payCulture(state, player, reeducationCost);
	player.talents[index] = talent;
	addLog(state, `${playerTag(player)} reeducates a ${from} to a ${talent}`);
};

// Fresco paintings: an opponent's talent joins you. The culture is spent, the opponent gets nothing.
export const indoctrinate = (state: GameState, playerId: string, targetId: string, index: number) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	const target = getPlayer(state, targetId);
	if (!hasEffect(player, 'frescoPaintings')) fail("Unlock the 'Fresco paintings' technology first");
	if (target === player) fail('That is your own talent');
	if (hasEffect(target, 'subsidies')) fail(`${target.name} has Subsidies: their people cannot be convinced to leave`);
	const talent = target.talents[index] ?? fail(`${target.name} does not have that talent`);
	payCulture(state, player, frescoCost);
	target.talents.splice(index, 1);
	player.talents.push(talent);
	addLog(state, `${playerTag(player)} indoctrinates ${playerTag(target)}'s ${talent}`);
};

// Propaganda posters: one of an opponent's regular people joins you. The culture is spent, the opponent gets nothing.
export const propaganda = (state: GameState, playerId: string, targetId: string) => {
	assertTurn(state, playerId);
	const player = getPlayer(state, playerId);
	const target = getPlayer(state, targetId);
	if (!hasEffect(player, 'propagandaPosters')) fail("Unlock the 'Propaganda posters' technology first");
	if (target === player) fail('That is your own person');
	if (hasEffect(target, 'subsidies')) fail(`${target.name} has Subsidies: their people cannot be convinced to leave`);
	if (target.people < 1) fail(`${target.name} has no regular people`);
	payCulture(state, player, propagandaCost);
	target.people -= 1;
	player.people += 1;
	addLog(state, `${playerTag(player)}'s propaganda wins over one of ${playerTag(target)}'s people`);
};
