// All game stats live here so they can be edited by hand.
import type { Characteristic } from './types';

// ---- resources and talents ----

export const resourceTypes = ['materials', 'gold', 'faith', 'culture', 'knowledge', 'power'] as const;
export type ResourceType = (typeof resourceTypes)[number];

export const talents = ['craftsman', 'merchant', 'messiah', 'artist', 'scientist', 'politician'] as const;
export type Talent = (typeof talents)[number];

// the resource a talent is bid on with, and shown in
export const talentResource: Record<Talent, ResourceType> = {
	craftsman: 'materials',
	merchant: 'gold',
	messiah: 'faith',
	artist: 'culture',
	scientist: 'knowledge',
	politician: 'power'
};

export type CostType = 'people' | ResourceType | Talent;
export type Cost = { amount: number; resourceType: CostType };

// ---- buildings ----

export type BuildingStats = {
	name: string;
	level: number;
	resourceType: 'people' | ResourceType;
	size?: number; // the square it covers on the board, e.g. 2 for 2×2 cells; 1 when not set
	production?: number;
	cost: Cost[];
	cap: number;
};

export const buildings: BuildingStats[] = [
	{ name: 'farm', level: 1, resourceType: 'people', size: 2, cost: [{ amount: 2, resourceType: 'people' }], cap: 1 },
	{ name: 'estate', level: 2, resourceType: 'people', size: 3, cost: [{ amount: 5, resourceType: 'people' }], cap: 3 },

	{ name: 'blacksmith', level: 1, resourceType: 'materials', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 2 },
	{ name: 'armoury', level: 2, resourceType: 'materials', production: 2, cost: [{ amount: 2, resourceType: 'people' }, { amount: 2, resourceType: 'materials' }], cap: 5 },
	{ name: 'barracks', level: 3, resourceType: 'materials', production: 5, cost: [{ amount: 4, resourceType: 'people' }, { amount: 4, resourceType: 'materials' }, { amount: 1, resourceType: 'craftsman' }], cap: 9 },
	{ name: 'factory', level: 4, resourceType: 'materials', production: 8, cost: [{ amount: 6, resourceType: 'people' }, { amount: 9, resourceType: 'materials' }, { amount: 1, resourceType: 'craftsman' }], cap: 15 },

	{ name: 'stall', level: 1, resourceType: 'gold', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 2 },
	{ name: 'shop', level: 2, resourceType: 'gold', production: 2, cost: [{ amount: 2, resourceType: 'people' }, { amount: 2, resourceType: 'gold' }], cap: 5 },
	{ name: 'market place', level: 3, resourceType: 'gold', production: 5, cost: [{ amount: 4, resourceType: 'people' }, { amount: 4, resourceType: 'gold' }, { amount: 1, resourceType: 'merchant' }], cap: 9 },
	{ name: 'bank', level: 4, resourceType: 'gold', production: 8, cost: [{ amount: 6, resourceType: 'people' }, { amount: 9, resourceType: 'gold' }, { amount: 1, resourceType: 'merchant' }], cap: 15 },

	{ name: 'shrine', level: 1, resourceType: 'faith', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 2 },
	{ name: 'chapel', level: 2, resourceType: 'faith', production: 2, cost: [{ amount: 2, resourceType: 'people' }, { amount: 2, resourceType: 'faith' }], cap: 5 },
	{ name: 'church', level: 3, resourceType: 'faith', production: 5, cost: [{ amount: 4, resourceType: 'people' }, { amount: 4, resourceType: 'faith' }, { amount: 1, resourceType: 'messiah' }], cap: 9 },
	{ name: 'cathedral', level: 4, resourceType: 'faith', production: 8, cost: [{ amount: 6, resourceType: 'people' }, { amount: 9, resourceType: 'faith' }, { amount: 1, resourceType: 'messiah' }], cap: 15 },

	{ name: 'giullare', level: 1, resourceType: 'culture', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 2 },
	{ name: 'studiolo', level: 2, resourceType: 'culture', production: 2, cost: [{ amount: 2, resourceType: 'people' }, { amount: 2, resourceType: 'culture' }], cap: 5 },
	{ name: 'museum', level: 3, resourceType: 'culture', production: 5, cost: [{ amount: 4, resourceType: 'people' }, { amount: 4, resourceType: 'culture' }, { amount: 1, resourceType: 'artist' }], cap: 9 },
	{ name: 'opera house', level: 4, resourceType: 'culture', production: 8, cost: [{ amount: 6, resourceType: 'people' }, { amount: 9, resourceType: 'culture' }, { amount: 1, resourceType: 'artist' }], cap: 15 },

	{ name: "scribe's chamber", level: 1, resourceType: 'knowledge', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 2 },
	{ name: 'library', level: 2, resourceType: 'knowledge', production: 2, cost: [{ amount: 2, resourceType: 'people' }, { amount: 2, resourceType: 'knowledge' }], cap: 5 },
	{ name: 'school', level: 3, resourceType: 'knowledge', production: 5, cost: [{ amount: 4, resourceType: 'people' }, { amount: 4, resourceType: 'knowledge' }, { amount: 1, resourceType: 'scientist' }], cap: 9 },
	{ name: 'university', level: 4, resourceType: 'knowledge', production: 8, cost: [{ amount: 6, resourceType: 'people' }, { amount: 9, resourceType: 'knowledge' }, { amount: 1, resourceType: 'scientist' }], cap: 15 },

	{ name: 'forum', level: 1, resourceType: 'power', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 2 },
	{ name: 'town council', level: 2, resourceType: 'power', production: 2, cost: [{ amount: 2, resourceType: 'people' }, { amount: 2, resourceType: 'power' }], cap: 5 },
	{ name: 'city hall', level: 3, resourceType: 'power', production: 5, cost: [{ amount: 4, resourceType: 'people' }, { amount: 4, resourceType: 'power' }, { amount: 1, resourceType: 'politician' }], cap: 9 },
	{ name: 'parliament', level: 4, resourceType: 'power', production: 8, cost: [{ amount: 6, resourceType: 'people' }, { amount: 9, resourceType: 'power' }, { amount: 1, resourceType: 'politician' }], cap: 15 }
];

// the cap of a resource without a building of it
export const standardCap = 1;

// ---- units ----

export type UnitStats = {
	name: string;
	resourceType: ResourceType; // the color it is shown in
	cost: Cost[];
	description: string;
	image?: string; // the picture in static/images/pieces, when it is not the unit's own name
};

export const units: UnitStats[] = [
	{ name: 'army', resourceType: 'materials', cost: [{ amount: 1, resourceType: 'people' }, { amount: 2, resourceType: 'materials' }], description: 'Place on farms and estates to block the cap' },
	{ name: 'mercenary', resourceType: 'gold', cost: [{ amount: 1, resourceType: 'people' }, { amount: 2, resourceType: 'gold' }], description: 'An army paid with gold. Place on farms and estates to block the cap' },
	{ name: 'spy', resourceType: 'materials', cost: [{ amount: 1, resourceType: 'people' }, { amount: 5, resourceType: 'materials' }], description: 'Place on buildings to lower the cap of their resource by 1' },
	{ name: 'trader', resourceType: 'gold', cost: [{ amount: 1, resourceType: 'people' }, { amount: 1, resourceType: 'gold' }], description: "Place on an opponent's player board to trade 2 of your resources for 1 of theirs" },
	{ name: 'missionary', resourceType: 'faith', cost: [{ amount: 1, resourceType: 'people' }, { amount: 2, resourceType: 'faith' }], description: 'Place on buildings to block 1 of their production' },
	{ name: 'inquisitor', resourceType: 'faith', cost: [{ amount: 1, resourceType: 'people' }, { amount: 5, resourceType: 'faith' }], description: 'Place on buildings to block 1 of their production, removing all other missionaries and inquisitors on it' }
];

// the units a technology or policy unlocks; the others are unlocked by a building of their resource
export const unitEffect: Record<string, Effect> = { spy: 'cryptography', mercenary: 'mercenaryWarfare', inquisitor: 'inquisition' };

// ---- objectives ----

// the unit is what the overview counts ("Anna has 6/8 levels")
export const objectives = [
	{ name: 'Grand architecture', description: 'Build 2 different level 4 buildings', goal: 8, unit: 'levels' },
	{ name: 'Populous', description: 'Have 25 people', goal: 25, unit: 'people' },
	{ name: 'Standing army', description: 'Have 20 undeployed armies', goal: 20, unit: 'armies' },
	{ name: 'Trade empire', description: 'Gain 30 resources through trade in 1 generation', goal: 30, unit: 'traded resources' },
	{ name: 'Holy inquisition', description: 'Have 9 deployed inquisitors', goal: 9, unit: 'inquisitors' },
	{ name: 'Renaissance court', description: 'Have 1 of each talented person', goal: 6, unit: 'different talents' },
	{ name: 'Scholarly renown', description: 'Research a level 4 technology', goal: 4, unit: 'technology levels' },
	{ name: 'Absolute power', description: 'Implement the Centralization policy', goal: 1, unit: 'Centralization in effect' }
];

// ---- characteristics ----

export const characteristicLabels: Record<Characteristic, string> = {
	title: 'Player title',
	cityState: 'Player city state',
	personalityTrait: 'Player trait'
};

export const titles = ['General', 'Podestà', 'Bishop', 'Patron', 'Philosopher', 'Dictator'];
export const titleAbility: Record<string, string> = {
	General: 'When you remove an army from your farm or estate with an army of your own, your army stays to defend',
	Podestà: "For each person you don't spend, get 1 gold next generation",
	Bishop: 'Starts with the Zealots policy implemented',
	Patron: 'Each culture in your auction bids counts as 2',
	Philosopher: 'You may use scientists, artists and messiahs interchangeably, and merchants and politicians interchangeably',
	Dictator: "Opponents' missionaries don't reduce your production, and their spies without Covert operations don't reduce your cap"
};
export const patronCultureWorth = 2;
export const philosopherTalents: Talent[][] = [
	['scientist', 'artist', 'messiah'],
	['merchant', 'politician']
];

export const personalityTraits = ['the Just', 'the Shrewd', 'the Kind', 'the Generous', 'the Wise', 'the Impeccable'];

export const cityStates = ['Pisa', 'Venice', 'Rome', 'Florence', 'Bologna', 'Milan'];
export const cityStateFlavour: Record<string, string> = {
	Pisa: 'Home to great shipyards and arsenals.',
	Venice: 'Enriched by trade across Europe and the Mediterranean.',
	Rome: 'Seat of the papacy and the heart of Catholicism.',
	Florence: 'The cradle of the Renaissance, shaped by artists and Medici patrons.',
	Bologna: 'Home to the oldest continuously operating university.',
	Milan: 'Steadily gaining more influence, challenging emperors.'
};
export const cityStateResource: Record<string, ResourceType> = {
	Pisa: 'materials',
	Venice: 'gold',
	Rome: 'faith',
	Florence: 'culture',
	Bologna: 'knowledge',
	Milan: 'power'
};
export const cityStateProduction = 1;

export const characteristicOptions: Record<Characteristic, string[]> = {
	title: titles,
	personalityTrait: personalityTraits,
	cityState: cityStates
};

// the info icon next to each column header on the start screen
export const characteristicInfo: Record<Characteristic, string> = {
	title: titles.map((t) => `${t}: ${titleAbility[t]}`).join('\n\n'),
	personalityTrait: 'TBD',
	cityState: cityStates
		.map((c) => `${c}: ${cityStateFlavour[c]} +${cityStateProduction} ${cityStateResource[c]} each generation`)
		.join('\n\n')
};

// ---- players and bots ----

export const colors = ['white', 'yellow', 'red', 'pink', 'purple', 'blue', 'azzurro', 'cyan', 'lightGreen', 'green'];

export const bots = ['Roda', 'Chief', 'Pope', 'Rain'];
export const botDelayMs = 800;

// ---- board, people pool and timing ----

// always odd, so the board has a middle cell
export const gridSizeFor = (playerCount: number) => 5 + 4 * playerCount;
// the wall goes around the rings up to this one around your city centre
export const wallRing = 1;

export const regularPeopleInPool = 252;
// how many of each talent are added to the pool after the first generation, by player count: fewer with more players
export const talentsInPoolPerType: Record<number, number> = { 1: 6, 2: 6, 3: 6, 4: 5, 5: 4, 6: 3 };

export const bornPhaseMs = 0;
export const maxTurnTimer = 600;

// ---- city centre ----

export const cityCentreProduction = 1;
export const palazzoCityCentreProduction = 6;

// ---- technologies ----

export type Effect =
	| 'cryptography'
	| 'tradecraft'
	| 'counterIntelligence'
	| 'covertOperations'
	| 'coinage'
	| 'caravans'
	| 'infrastructure'
	| 'interest'
	| 'inquisition'
	| 'tithes'
	| 'persecution'
	| 'pilgrimage'
	| 'propagandaPosters'
	| 'reeducationPrograms'
	| 'frescoPaintings'
	| 'grandPalazzo'
	| 'courtyardGardens'
	| 'grainReserves'
	| 'agrarianReform'
	| 'defensiveStrategies'
	| 'centralizedLogistics'
	| 'warMachine'
	| 'mercenaryWarfare'
	| 'ambassadorBribes'
	| 'taxReformation'
	| 'freedomOfSpeech'
	| 'holySacraments'
	| 'zealots'
	| 'workEthic'
	| 'subsidies'
	| 'breadAndCircuses'
	| 'espionage'
	| 'isolationism'
	| 'centralization';

// The color is that of the resource of its first cost, unless `color` says otherwise. `requires` is a technology you
// need before you can buy it (policies only).
export type InvestmentStats = { name: string; description: string; cost: Cost[]; effect?: Effect; color?: 'people' | ResourceType; requires?: string };

export const technologyDiscount = 1;
export const tradecraftCap = 1;
export const propagandaCost = 3;
export const reeducationCost = 7;
export const frescoCost = 9;

const costs = (resource: ResourceType, amount: number, knowledge: number): Cost[] => [
	{ amount, resourceType: resource },
	{ amount: knowledge, resourceType: 'knowledge' }
];

// 4 columns, each unlocked from the top down
export const technologies: InvestmentStats[][] = [
	[
		{ name: 'Cryptography', description: "Unlock spies: place them on your opponents' buildings to lower the cap of that resource by 1", cost: costs('materials', 1, 2), effect: 'cryptography' },
		{ name: 'Tradecraft', description: 'Each of your spies transfers 1 cap to you', cost: costs('materials', 2, 4), effect: 'tradecraft' },
		{ name: 'Counter intelligence', description: 'Place a spy on your own building to prevent others from placing theirs on it', cost: costs('materials', 4, 8), effect: 'counterIntelligence' },
		{ name: 'Covert operations', description: "The building your spy is on doesn't count for its owner's cap", cost: [...costs('materials', 7, 14), { amount: 1, resourceType: 'craftsman' }], effect: 'covertOperations' }
	],
	[
		{ name: 'Coinage', description: 'Traders can trade 1 for 1', cost: costs('gold', 1, 2), effect: 'coinage' },
		{ name: 'Caravans', description: 'Traders have no trade limit', cost: costs('gold', 2, 4), effect: 'caravans' },
		{ name: 'Infrastructure', description: "Traders can trade 2 of your opponent's resources for 1 of yours", cost: costs('gold', 4, 8), effect: 'infrastructure' },
		{ name: 'Interest', description: 'Upcoming generations receive an additional +1 gold, then +2 gold, etc.', cost: [...costs('gold', 7, 14), { amount: 1, resourceType: 'merchant' }], effect: 'interest' }
	],
	[
		{ name: 'Inquisition', description: 'Unlock inquisitors: they block 1 production of a building, and remove all other missionaries and inquisitors on it', cost: costs('faith', 1, 2), effect: 'inquisition' },
		{ name: 'Tithes', description: 'The production your missionaries and inquisitors reduce is added to your own production', cost: costs('faith', 2, 4), effect: 'tithes' },
		{ name: 'Persecution', description: 'Place an inquisitor on your own building to stop others from placing their missionaries and inquisitors on it', cost: costs('faith', 4, 8), effect: 'persecution' },
		{ name: 'Pilgrimage', description: 'Your inquisitors reduce all production of the building they are on', cost: [...costs('faith', 7, 14), { amount: 1, resourceType: 'messiah' }], effect: 'pilgrimage' }
	],
	[
		{ name: 'Propaganda posters', description: `Click on an opponent's regular person and pay ${propagandaCost} culture to convince them to join you`, cost: costs('culture', 1, 2), effect: 'propagandaPosters' },
		{ name: 'Reeducation programs', description: `Click on one of your talents and pay ${reeducationCost} culture to reeducate them to another talent`, cost: costs('culture', 2, 4), effect: 'reeducationPrograms' },
		{ name: 'Fresco paintings', description: `Click on an opponent's talent and pay ${frescoCost} culture to convince them to join you`, cost: costs('culture', 4, 8), effect: 'frescoPaintings' },
		// without city centre production the description changes, see technologyDescription
		{ name: 'Grand Palazzo', description: `Your city centre produces ${palazzoCityCentreProduction} instead of ${cityCentreProduction}`, cost: [...costs('culture', 7, 14), { amount: 1, resourceType: 'artist' }], effect: 'grandPalazzo' }
	]
];

// ---- policies ----

export const policySlots = 3;
export const policyRemoveCost: Cost[] = [{ amount: 3, resourceType: 'power' }];

export const courtyardPeopleCap = 5;
export const grainReservesPeopleCap = 10;
export const agrarianReformPeopleCap = 1;
export const bribeGold: Record<'army' | 'mercenary' | 'spy' | 'missionary' | 'inquisitor', number> = { mercenary: 3, army: 5, missionary: 5, spy: 8, inquisitor: 8 };
export const taxGold = 1;

// 6 columns of 3
export const policies: InvestmentStats[][] = [
	[
		{
			name: 'Courtyard gardens',
			description: `The city centre adds ${courtyardPeopleCap} to your people cap`,
			cost: [{ amount: 2, resourceType: 'materials' }, { amount: 2, resourceType: 'culture' }, { amount: 2, resourceType: 'knowledge' }, { amount: 2, resourceType: 'power' }],
			effect: 'courtyardGardens',
			color: 'people'
		},
		{
			name: 'Grain reserves',
			description: `Your people cap is at least ${grainReservesPeopleCap}`,
			cost: [{ amount: 4, resourceType: 'people' }, { amount: 4, resourceType: 'materials' }, { amount: 4, resourceType: 'culture' }, { amount: 4, resourceType: 'knowledge' }, { amount: 4, resourceType: 'power' }],
			effect: 'grainReserves',
			color: 'people'
		},
		{
			name: 'Agrarian reform',
			description: `Each farm and estate increases your people cap by ${agrarianReformPeopleCap} more`,
			cost: [{ amount: 8, resourceType: 'people' }, { amount: 8, resourceType: 'materials' }, { amount: 8, resourceType: 'culture' }, { amount: 8, resourceType: 'knowledge' }, { amount: 8, resourceType: 'power' }, { amount: 1, resourceType: 'scientist' }],
			effect: 'agrarianReform',
			color: 'people'
		}
	],
	[
		{ name: 'Defensive strategies', description: 'You can put armies on your own farms and estates', cost: [{ amount: 3, resourceType: 'materials' }, { amount: 3, resourceType: 'power' }], effect: 'defensiveStrategies' },
		{ name: 'Centralized logistics', description: 'The cap your armies reduce will be added to your cap', cost: [{ amount: 9, resourceType: 'materials' }, { amount: 9, resourceType: 'power' }], effect: 'centralizedLogistics' },
		{ name: 'War machine', description: 'Armies cost 1 person and 1 materials', cost: [{ amount: 12, resourceType: 'materials' }, { amount: 11, resourceType: 'power' }, { amount: 1, resourceType: 'craftsman' }], effect: 'warMachine' }
	],
	[
		{ name: 'Mercenary warfare', description: 'Unlock mercenaries: armies you pay with gold', cost: [{ amount: 3, resourceType: 'gold' }, { amount: 3, resourceType: 'power' }], effect: 'mercenaryWarfare' },
		{ name: 'Ambassador bribes', description: `Click on an opponent's unit on one of your buildings to remove it: ${bribeGold.mercenary} gold for a mercenary, ${bribeGold.army} for an army or missionary, ${bribeGold.spy} for a spy or inquisitor`, cost: [{ amount: 9, resourceType: 'gold' }, { amount: 9, resourceType: 'power' }], effect: 'ambassadorBribes' },
		{ name: 'Tax reformation', description: `After each new generation is born, opponents pay you ${taxGold} gold for each of their units on your buildings inside your wall. A unit they cannot pay for returns to their player board`, cost: [{ amount: 12, resourceType: 'gold' }, { amount: 11, resourceType: 'power' }, { amount: 1, resourceType: 'merchant' }], effect: 'taxReformation' }
	],
	[
		{ name: 'Freedom of speech', description: "Opponents can't put missionaries on your buildings", cost: [{ amount: 3, resourceType: 'faith' }, { amount: 3, resourceType: 'power' }], effect: 'freedomOfSpeech' },
		{ name: 'Holy sacraments', description: "Each opponent's missionary and inquisitor on your buildings gives you 1 faith each generation", cost: [{ amount: 9, resourceType: 'faith' }, { amount: 9, resourceType: 'power' }], effect: 'holySacraments' },
		{ name: 'Zealots', description: 'Missionaries cost 1 person and 1 faith', cost: [{ amount: 12, resourceType: 'faith' }, { amount: 11, resourceType: 'power' }, { amount: 1, resourceType: 'messiah' }], effect: 'zealots' }
	],
	[
		{ name: 'Work ethic', description: "When your regular people can't pay a building, 1 talented person pays all of its people cost", cost: [{ amount: 3, resourceType: 'culture' }, { amount: 3, resourceType: 'power' }], effect: 'workEthic' },
		{ name: 'Subsidies', description: "Opponents can't convince your people to leave by paying culture", cost: [{ amount: 9, resourceType: 'culture' }, { amount: 9, resourceType: 'power' }], effect: 'subsidies' },
		{ name: 'Bread and circuses', description: "Each upcoming generation, every opponent's people cap goes down by 1 and yours up by 1 per opponent, unless or until that opponent has an opera house", cost: [{ amount: 12, resourceType: 'culture' }, { amount: 11, resourceType: 'power' }, { amount: 1, resourceType: 'artist' }], effect: 'breadAndCircuses' }
	],
	[
		{ name: 'Espionage', description: 'When an opponent has a technology it costs 0 knowledge', cost: [{ amount: 10, resourceType: 'power' }], effect: 'espionage', requires: 'Tradecraft' },
		{ name: 'Isolationism', description: 'Nobody can trade with you and you cannot trade with anybody else', cost: [{ amount: 10, resourceType: 'power' }], effect: 'isolationism' },
		{ name: 'Centralization', description: "If you don't have enough of a resource you can use power instead", cost: [{ amount: 15, resourceType: 'power' }, { amount: 1, resourceType: 'politician' }], effect: 'centralization' }
	]
];

// ---- tutorial ----

// each step highlights the elements with one of its data-tutorial targets; the text may use <b> and <u>
const stall = buildings.find((b) => b.name === 'stall')!;
export const tutorialSteps: { targets: string[]; text: string; isReligiousDominance?: boolean }[] = [
	{ targets: ['objectives'], text: 'Finish these objectives to win the game.' },
	{
		targets: ['religious-dominance'],
		isReligiousDominance: true,
		text: "Or win by religious dominance: put a missionary or inquisitor on all 8 buildings inside an opponent's wall. Then you can place one on their city centre, which gives you religious dominance over them for good. Have religious dominance over all opponents to win."
	},
	{
		targets: ['people'],
		text: 'At the beginning of each generation (a round) you get people. You get the number of people needed to fill the <b><u>cap</u></b>. The cap is your "capacity limit": you cannot gain more of a resource once you have reached the cap. To increase your people-cap buy farms and estates.'
	},
	{
		targets: ['resources'],
		text: `The other resources work differently. Each building has a cap for its corresponding resource. Only the building with the highest cap counts. Buying a better building increases your cap for that resource. Buildings also produce resources. Buy more buildings to get more resources. For example: a stall has a cap of ${stall.cap} and produces ${stall.production!} gold, so it takes ${Math.ceil(stall.cap / stall.production!)} generations to reach that cap.`
	},
	{ targets: ['materials', 'units'], text: "With materials you can buy armies. Drag an army onto an opponent's farm or estate to block the cap it adds." },
	{
		targets: ['gold', 'units'],
		text: "With gold you can buy traders. Drag the trader onto an opponent's player board. You can then choose which resources you and that opponent will trade."
	},
	{ targets: ['faith', 'units'], text: "With faith you can buy missionaries. Drag a missionary onto an opponent's building. That building's resource production is reduced by 1." },
	{
		targets: ['culture'],
		text: 'With culture you can bid on talented people. You need talented people to buy level 3 and 4 buildings and level 4 technologies. Talented people can be used as regular people too.'
	},
	{ targets: ['knowledge', 'technologies'], text: 'With knowledge you discover technologies: they unlock spies and inquisitors, and improve the other resources.' },
	{ targets: ['power', 'policies'], text: 'With power you can buy and implement policies, which improve your abilities.' },
	{ targets: ['turn'], text: 'Here you see whose turn it is, and here you end your turn.' },
	{ targets: ['board'], text: 'This is the board. Here you place your buildings and units. Around it are the player boards, with the people, resources and unused units of every player. Your own board is below the board: drag your units from there.' },
	{ targets: ['chat'], text: 'Here you can type messages to the other players.' },
	{ targets: ['log'], text: 'Everything that happens in the game is logged here.' },
	{ targets: [], text: "Don't forget: you can hover over most things to get more information." }
];
