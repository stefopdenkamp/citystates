// All game stats live here so they can be edited by hand.

export const resourceTypes = ['materials', 'gold', 'faith', 'culture', 'knowledge', 'power'] as const;
export type ResourceType = (typeof resourceTypes)[number];

export const talents = ['craftsman', 'merchant', 'messiah', 'artist', 'scientist', 'politician'] as const;
export type Talent = (typeof talents)[number];

// The resource a talent is bid on with.
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

export type BuildingStats = {
	name: string;
	level: number; // 1 to 4, a building can only be placed over your building of the same resourceType one level lower
	resourceType: 'people' | ResourceType;
	production?: number;
	cost: Cost[];
	cap: number;
};

export const buildings: BuildingStats[] = [
	{ name: 'farm', level: 1, resourceType: 'people', cost: [{ amount: 2, resourceType: 'people' }], cap: 1 },
	{ name: 'estate', level: 2, resourceType: 'people', cost: [{ amount: 5, resourceType: 'people' }], cap: 4 },

	{ name: 'blacksmith', level: 1, resourceType: 'materials', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 4 },
	{ name: 'armoury', level: 2, resourceType: 'materials', production: 3, cost: [{ amount: 2, resourceType: 'people' }, { amount: 3, resourceType: 'materials' }], cap: 9 },
	{ name: 'barracks', level: 3, resourceType: 'materials', production: 8, cost: [{ amount: 4, resourceType: 'people' }, { amount: 8, resourceType: 'materials' }, { amount: 1, resourceType: 'craftsman' }], cap: 15 },
	{ name: 'factory', level: 4, resourceType: 'materials', production: 15, cost: [{ amount: 6, resourceType: 'people' }, { amount: 15, resourceType: 'materials' }, { amount: 1, resourceType: 'craftsman' }], cap: 25 },

	{ name: 'stall', level: 1, resourceType: 'gold', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 4 },
	{ name: 'shop', level: 2, resourceType: 'gold', production: 3, cost: [{ amount: 2, resourceType: 'people' }, { amount: 3, resourceType: 'gold' }], cap: 9 },
	{ name: 'market place', level: 3, resourceType: 'gold', production: 8, cost: [{ amount: 4, resourceType: 'people' }, { amount: 8, resourceType: 'gold' }, { amount: 1, resourceType: 'merchant' }], cap: 15 },
	{ name: 'bank', level: 4, resourceType: 'gold', production: 15, cost: [{ amount: 6, resourceType: 'people' }, { amount: 15, resourceType: 'gold' }, { amount: 1, resourceType: 'merchant' }], cap: 25 },

	{ name: 'shrine', level: 1, resourceType: 'faith', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 4 },
	{ name: 'chapel', level: 2, resourceType: 'faith', production: 3, cost: [{ amount: 2, resourceType: 'people' }, { amount: 3, resourceType: 'faith' }], cap: 9 },
	{ name: 'church', level: 3, resourceType: 'faith', production: 8, cost: [{ amount: 4, resourceType: 'people' }, { amount: 8, resourceType: 'faith' }, { amount: 1, resourceType: 'messiah' }], cap: 15 },
	{ name: 'cathedral', level: 4, resourceType: 'faith', production: 15, cost: [{ amount: 6, resourceType: 'people' }, { amount: 15, resourceType: 'faith' }, { amount: 1, resourceType: 'messiah' }], cap: 25 },

	{ name: 'giullare', level: 1, resourceType: 'culture', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 4 },
	{ name: 'studiolo', level: 2, resourceType: 'culture', production: 3, cost: [{ amount: 2, resourceType: 'people' }, { amount: 3, resourceType: 'culture' }], cap: 9 },
	{ name: 'museum', level: 3, resourceType: 'culture', production: 8, cost: [{ amount: 4, resourceType: 'people' }, { amount: 8, resourceType: 'culture' }, { amount: 1, resourceType: 'artist' }], cap: 15 },
	{ name: 'opera house', level: 4, resourceType: 'culture', production: 15, cost: [{ amount: 6, resourceType: 'people' }, { amount: 15, resourceType: 'culture' }, { amount: 1, resourceType: 'artist' }], cap: 25 },

	{ name: "scribe's chamber", level: 1, resourceType: 'knowledge', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 4 },
	{ name: 'library', level: 2, resourceType: 'knowledge', production: 3, cost: [{ amount: 2, resourceType: 'people' }, { amount: 3, resourceType: 'knowledge' }], cap: 9 },
	{ name: 'school', level: 3, resourceType: 'knowledge', production: 8, cost: [{ amount: 4, resourceType: 'people' }, { amount: 8, resourceType: 'knowledge' }, { amount: 1, resourceType: 'scientist' }], cap: 15 },
	{ name: 'university', level: 4, resourceType: 'knowledge', production: 15, cost: [{ amount: 6, resourceType: 'people' }, { amount: 15, resourceType: 'knowledge' }, { amount: 1, resourceType: 'scientist' }], cap: 25 },

	{ name: 'forum', level: 1, resourceType: 'power', production: 1, cost: [{ amount: 1, resourceType: 'people' }], cap: 4 },
	{ name: 'town council', level: 2, resourceType: 'power', production: 3, cost: [{ amount: 2, resourceType: 'people' }, { amount: 3, resourceType: 'power' }], cap: 9 },
	{ name: 'city hall', level: 3, resourceType: 'power', production: 8, cost: [{ amount: 4, resourceType: 'people' }, { amount: 8, resourceType: 'power' }, { amount: 1, resourceType: 'politician' }], cap: 15 },
	{ name: 'parliament', level: 4, resourceType: 'power', production: 15, cost: [{ amount: 6, resourceType: 'people' }, { amount: 15, resourceType: 'power' }, { amount: 1, resourceType: 'politician' }], cap: 25 }
];

export type UnitStats = {
	name: string;
	resourceType: ResourceType; // the color it is shown in
	cost: Cost[];
	description?: string; // hover text; units without one cannot be bought yet
	image?: string; // the picture in static/images/pieces, when it is not the unit's own name
};

export const units: UnitStats[] = [
	{ name: 'army', resourceType: 'materials', cost: [{ amount: 1, resourceType: 'people' }, { amount: 2, resourceType: 'materials' }], description: 'Place on farms and estates to block the cap' },
	{ name: 'mercenary', resourceType: 'gold', cost: [{ amount: 1, resourceType: 'people' }, { amount: 2, resourceType: 'gold' }], description: 'An army paid with gold. Place on farms and estates to block the cap' },
	{ name: 'spy', resourceType: 'materials', cost: [{ amount: 1, resourceType: 'people' }, { amount: 6, resourceType: 'materials' }], description: 'Place on buildings to lower the cap of their resource by 1' },
	{ name: 'trader', resourceType: 'gold', cost: [{ amount: 1, resourceType: 'people' }, { amount: 2, resourceType: 'gold' }], description: "Place on an opponent's city centre to trade 2 of your resources for 1 of theirs" },
	{ name: 'missionary', resourceType: 'faith', cost: [{ amount: 1, resourceType: 'people' }, { amount: 2, resourceType: 'faith' }], description: 'Place on buildings to block 1 of their production' },
	{ name: 'inquisitor', resourceType: 'faith', cost: [{ amount: 1, resourceType: 'people' }, { amount: 5, resourceType: 'faith' }], description: 'Place on buildings to block 1 of their production, or to remove all missionaries and inquisitors on it' }
];

// The objectives: the goal completes it, the unit is what its overview counts ("Anna has 6/8 levels").
// The levels are the sum of your 2 highest (building, technology or policy in effect) levels.
export const objectives = [
	{ name: 'Grand architecture', description: 'Build 2 level 4 buildings', goal: 8, unit: 'levels' },
	{ name: 'Populous', description: 'Have 50 people', goal: 50, unit: 'people' },
	{ name: 'Standing army', description: 'Have 20 undeployed armies', goal: 20, unit: 'armies' },
	{ name: 'Trade empire', description: 'Gain 40 resources through trade in 1 generation', goal: 40, unit: 'traded resources' },
	{ name: 'Holy inquisition', description: 'Have 10 deployed inquisitors', goal: 10, unit: 'inquisitors' },
	{ name: 'Renaissance court', description: 'Have 1 of each talented person', goal: 6, unit: 'different talents' },
	{ name: 'Scholarly renown', description: 'Research 2 level 4 technologies', goal: 8, unit: 'technology levels' },
	{ name: 'Absolute power', description: 'Implement 2 level 3 policies', goal: 6, unit: 'policy levels' }
];

export const titles = ['General', 'Podestà', 'Bishop', 'Patron', 'Philosopher', 'Dictator'];
// The ability each title gives, shown in the info icon of the title column.
export const titleAbility: Record<string, string> = {
	General: 'When you remove an army with your army, your army stays to defend',
	Podestà: "For each person you don't spend, get 1 gold next generation",
	Bishop: 'Missionaries cost 1 fewer faith',
	Patron: 'Each culture in your auction bids counts as 2',
	Philosopher: 'You may use scientists, artists and messiahs interchangeably, and merchants and politicians interchangeably',
	Dictator: "Opponents' missionaries don't reduce your production, and their spies without Covert operations don't reduce your cap"
};
// What each culture in an auction bid is worth for a Patron (otherwise 1).
export const patronCultureWorth = 2;
// The faith a Bishop's missionaries cost less.
export const bishopDiscount = 1;
// The talents a Philosopher may use for each other.
export const philosopherTalents: Talent[][] = [
	['scientist', 'artist', 'messiah'],
	['merchant', 'politician']
];
export const personalityTraits = ['the Just', 'the Shrewd', 'the Kind', 'the Generous', 'the Wise', 'the Impeccable'];
export const cityStates = ['Pisa', 'Venice', 'Rome', 'Florence', 'Bologna', 'Milan'];

// A line about each city state, shown with what it produces in the info icon of the city state column.
export const cityStateFlavour: Record<string, string> = {
	Pisa: 'Home to great shipyards and arsenals.',
	Venice: 'Enriched by trade across Europe and the Mediterranean.',
	Rome: 'Seat of the papacy and the heart of Catholicism.',
	Florence: 'The cradle of the Renaissance, shaped by artists and Medici patrons.',
	Bologna: 'Home to the oldest continuously operating university.',
	Milan: 'Steadily gaining more influence, challenging emperors.'
};

export const colors = ['white', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'azzurro', 'cyan', 'lightGreen', 'green', 'gray'];

export const regularPeopleInPool = 252;
export const talentsInPoolPerType = 6;
export const startingFarms = 2;
export const maxTurnTimer = 600;

// The cap of a resource when you have no building of that type.
export const standardCap = 1;

// What the city centre (an option when creating a game) produces of its chosen resource each generation.
export const cityCentreProduction = 1;

// What each city state (a player characteristic, when enabled) produces each generation, besides the buildings.
export const cityStateProduction = 1;
export const cityStateResource: Record<string, ResourceType> = {
	Pisa: 'materials',
	Venice: 'gold',
	Rome: 'faith',
	Florence: 'culture',
	Bologna: 'knowledge',
	Milan: 'power'
};

// The info icon text next to each characteristic column header on the start screen, e.g.
// "Pisa: Home to great shipyards and arsenals. +1 materials each generation".
export const characteristicInfo = {
	title: titles.map((t) => `${t}: ${titleAbility[t]}`).join('\n\n'),
	personalityTrait: 'TBD',
	cityState: cityStates
		.map((c) => `${c}: ${cityStateFlavour[c]} +${cityStateProduction} ${cityStateResource[c]} each generation`)
		.join('\n\n')
};

// Board is 9x9 for 1 player, 13x13 for 2 players, 17x17 for 3 players, etc. The size is always odd, so the board
// has a middle cell and players are spread evenly around it.
export const gridSizeFor = (playerCount: number) => 5 + 4 * playerCount;

// How long the 'A new generation is born' title and then the born message are shown before the game moves on.
// Keep it at least twice --phase-title-speed in app.css.
export const bornPhaseMs = 6000;

// The technology and policy trees: 4 columns of 4, the first of a column at the bottom. Without a cost it cannot be
// bought yet. An effect is what the rules look for once a technology is unlocked. Policies do nothing for now: their
// effects are kept for when they are reworked, but the rules only look at technologies.
export type Effect =
	| 'spies'
	| 'counterIntelligence'
	| 'siphoning'
	| 'covertOperations'
	| 'coinage'
	| 'caravans'
	| 'infrastructure'
	| 'interest'
	| 'bribery'
	| 'mercenaries'
	| 'taxes'
	| 'isolationism'
	| 'inquisitors'
	| 'devotion'
	| 'persecution'
	| 'fervor'
	| 'propaganda'
	| 'indoctrination'
	| 'retraining'
	| 'gothicEngineering'
	| 'courtyardGardens'
	| 'grainReserves'
	| 'agrarianReform';
// The color is the resource color of its first cost, unless `color` says otherwise.
export type InvestmentStats = { name: string; description: string; cost: Cost[]; effect?: Effect; color?: 'people' | ResourceType };

const costs = (resource: ResourceType, amount: number, knowledge: number): Cost[] => [
	{ amount, resourceType: resource },
	{ amount: knowledge, resourceType: 'knowledge' }
];

// A column is unlocked from the top down (the first is shown at the top).
export const technologies: InvestmentStats[][] = [
	[
		{ name: 'Cryptography', description: "Unlock spies: place them on your opponents' buildings to lower the cap of that resource by 1", cost: costs('materials', 1, 3), effect: 'spies' },
		{ name: 'Tradecraft', description: 'The cap your spies lower is added to your own cap', cost: costs('materials', 4, 8), effect: 'siphoning' },
		{ name: 'Counter intelligence', description: 'Place a spy on your own building to stop others from placing theirs on it', cost: costs('materials', 8, 14), effect: 'counterIntelligence' },
		{ name: 'Covert operations', description: 'Your spies take away the whole cap of the building they are on', cost: [...costs('materials', 13, 25), { amount: 1, resourceType: 'craftsman' }], effect: 'covertOperations' }
	],
	[
		{ name: 'Coinage', description: 'Traders can trade 1 for 1', cost: costs('gold', 1, 3), effect: 'coinage' },
		{ name: 'Caravans', description: 'Traders have no trade limit', cost: costs('gold', 4, 8), effect: 'caravans' },
		{ name: 'Infrastructure', description: "Traders can trade 2 of your opponent's resources for 1 of yours", cost: costs('gold', 8, 14), effect: 'infrastructure' },
		{ name: 'Interest', description: 'Upcoming generations receive an additional +1 gold, then +2 gold, etc.', cost: [...costs('gold', 13, 25), { amount: 1, resourceType: 'merchant' }], effect: 'interest' }
	],
	[
		{ name: 'Inquisition', description: 'Unlock inquisitors: they reduce 1 production of a building, or remove all missionaries and inquisitors on it', cost: costs('faith', 1, 3), effect: 'inquisitors' },
		{ name: 'Tithes', description: 'The production your missionaries and inquisitors reduce is added to your own production', cost: costs('faith', 4, 8), effect: 'devotion' },
		{ name: 'Persecution', description: 'Place an inquisitor on your own building to stop others from placing their missionaries and inquisitors on it', cost: costs('faith', 8, 14), effect: 'persecution' },
		{ name: 'Pilgrimage', description: 'Your inquisitors reduce all production of the building they are on', cost: [...costs('faith', 13, 25), { amount: 1, resourceType: 'messiah' }], effect: 'fervor' }
	],
	[
		{ name: 'Propaganda posters', description: "Click on an opponent's regular person and pay 3 culture to convince them to join you", cost: costs('culture', 1, 3), effect: 'propaganda' },
		{ name: 'Reeducation programs', description: 'Click on one of your talents and pay 8 culture to reeducate them to another talent', cost: costs('culture', 4, 8), effect: 'retraining' },
		{ name: 'Fresco paintings', description: "Click on an opponent's talent and pay 12 culture to convince them to join you", cost: costs('culture', 8, 14), effect: 'indoctrination' },
		{ name: 'Gothic engineering', description: 'Build level 3 and 4 buildings directly, without the building one level lower', cost: [...costs('culture', 13, 25), { amount: 1, resourceType: 'artist' }], effect: 'gothicEngineering' }
	]
];

// Each opponent who has unlocked a technology makes its knowledge cost this much lower for you.
export const technologyDiscount = 1;

// What the people policies add: Courtyard gardens to the people cap, Grain reserves as the lowest people cap, and
// Agrarian reform to each farm and estate.
export const courtyardPeopleCap = 4;
export const grainReservesPeopleCap = 12;
export const agrarianReformPeopleCap = 1;

// 6 columns of 3.
export const policies: InvestmentStats[][] = [
	[
		{
			name: 'Courtyard gardens',
			description: `The city centre adds ${courtyardPeopleCap} to your people cap`,
			cost: [{ amount: 3, resourceType: 'materials' }, { amount: 3, resourceType: 'culture' }, { amount: 3, resourceType: 'knowledge' }, { amount: 3, resourceType: 'power' }],
			effect: 'courtyardGardens',
			color: 'people'
		},
		{
			name: 'Grain reserves',
			description: `Your people cap is at least ${grainReservesPeopleCap}`,
			cost: [{ amount: 4, resourceType: 'people' }, { amount: 8, resourceType: 'materials' }, { amount: 8, resourceType: 'culture' }, { amount: 8, resourceType: 'knowledge' }, { amount: 8, resourceType: 'power' }],
			effect: 'grainReserves',
			color: 'people'
		},
		{
			name: 'Agrarian reform',
			description: `Each farm and estate increases your people cap by ${agrarianReformPeopleCap} more`,
			cost: [{ amount: 20, resourceType: 'materials' }, { amount: 18, resourceType: 'power' }, { amount: 1, resourceType: 'scientist' }],
			effect: 'agrarianReform',
			color: 'people'
		}
	],
	[
		{ name: 'Defensive strategies', description: 'You can put armies on your own farms', cost: [{ amount: 6, resourceType: 'materials' }, { amount: 6, resourceType: 'power' }] },
		{ name: 'Centralized logistics', description: 'The cap your armies reduce will be added to your cap', cost: [{ amount: 14, resourceType: 'materials' }, { amount: 16, resourceType: 'power' }] },
		{ name: 'War machine', description: 'Armies cost 1 person and 1 material', cost: [{ amount: 20, resourceType: 'materials' }, { amount: 18, resourceType: 'power' }, { amount: 1, resourceType: 'craftsman' }] }
	],
	[
		{ name: 'Mercenary warfare', description: 'Unlock mercenaries: armies you pay with gold', cost: [{ amount: 6, resourceType: 'gold' }, { amount: 6, resourceType: 'power' }], effect: 'mercenaries' },
		{ name: 'Ambassador bribes', description: "Click on an opponent's unit (except Inquisitors) on one of your buildings and pay 12 gold to remove it", cost: [{ amount: 14, resourceType: 'gold' }, { amount: 16, resourceType: 'power' }], effect: 'bribery' },
		{ name: 'Tax reformation', description: 'Each time an opponent uses a spy, trader, missionary or inquisitor on you, they have to pay you 1 gold', cost: [{ amount: 20, resourceType: 'gold' }, { amount: 18, resourceType: 'power' }, { amount: 1, resourceType: 'merchant' }], effect: 'taxes' }
	],
	[
		{ name: 'Freedom of speech', description: 'Remove missionaries for 8 power', cost: [{ amount: 6, resourceType: 'faith' }, { amount: 6, resourceType: 'power' }] },
		{ name: 'Holy sacraments', description: "Each opponent's missionary on your buildings gives you 1 faith each generation", cost: [{ amount: 14, resourceType: 'faith' }, { amount: 16, resourceType: 'power' }] },
		{ name: 'Theocracy', description: 'Use faith interchangeably with power', cost: [{ amount: 20, resourceType: 'faith' }, { amount: 18, resourceType: 'power' }, { amount: 1, resourceType: 'messiah' }] }
	],
	[
		{ name: 'Work ethic', description: 'Spending a talented person on any building can count as 3 regular people', cost: [{ amount: 6, resourceType: 'culture' }, { amount: 6, resourceType: 'power' }] },
		{ name: 'Subsidies', description: "Opponents can't convince your people to leave", cost: [{ amount: 14, resourceType: 'culture' }, { amount: 16, resourceType: 'power' }] },
		{ name: 'Bread and circuses', description: "Each upcoming generation, every opponent's people cap goes down by 1 and yours up by 1 per opponent, unless or until that opponent has an opera house", cost: [{ amount: 20, resourceType: 'culture' }, { amount: 18, resourceType: 'power' }, { amount: 1, resourceType: 'artist' }] }
	],
	[
		{ name: 'Espionage', description: 'When an opponent has a technology it costs 0 knowledge', cost: [{ amount: 15, resourceType: 'power' }] },
		{ name: 'Isolationism', description: 'Nobody can trade with you and you cannot trade with anybody else', cost: [{ amount: 20, resourceType: 'power' }], effect: 'isolationism' },
		{ name: 'Centralization', description: "If you don't have enough of a resource you can use power instead", cost: [{ amount: 30, resourceType: 'power' }, { amount: 1, resourceType: 'politician' }] }
	]
];

// Each player can have this many policies in effect; implementing one is free, removing one costs power.
export const policySlots = 3;
export const policyRemoveCost: Cost[] = [{ amount: 3, resourceType: 'power' }];

// The culture the technology actions cost: retraining your own talent, indoctrinating an opponent's talent and
// propaganda for an opponent's regular person.
export const retrainCost = 8;
export const indoctrinateCost = 12;
export const propagandaCost = 3;

// The units that need an effect before they can be bought.
export const unitEffect: Record<string, Effect> = { spy: 'spies', mercenary: 'mercenaries', inquisitor: 'inquisitors' };

// The gold an opponent pays you each time they use a spy, trader, missionary or inquisitor on you (Tax reformation).
export const taxGold = 1;

// The gold it costs to remove an opponent's unit from your building (Bribery).
export const bribeGold = 12;

// The tutorial: each step highlights the elements with one of its data-tutorial targets and explains them.
// The text may use <b> and <u>.
export const tutorialSteps: { targets: string[]; text: string }[] = [
	{ targets: ['objectives'], text: 'Finish these objectives to win the game.' },
	{
		targets: ['people'],
		text: 'At the beginning of each generation (a round) you get people. You get the number of people needed to fill the <b><u>cap</u></b>. The cap is your "capacity limit": you cannot gain more of a resource once you have reached the cap. To increase your cap buy farms, and upgrade farms to estates.'
	},
	{
		targets: ['resources'],
		text: 'The other resources work differently. Each building has a cap for its corresponding resource. Only the building with the highest cap counts. Upgrading a building to a better one increases your cap for that resource. Buildings also produce resources. Buy more buildings to get more resources. For example: a stall has a cap of 4 and produces 1 gold, so it will take 4 generations to reach that cap.'
	},
	{ targets: ['materials', 'units'], text: "With materials you can buy armies. Drag an army onto an opponent's farm or estate to block its cap." },
	{
		targets: ['gold', 'units'],
		text: "With gold you can buy traders. Drag the trader onto an opponent's city centre. You can then choose which resources you and that opponent will trade."
	},
	{ targets: ['faith', 'units'], text: "With faith you can buy missionaries. Drag a missionary onto an opponent's building. That building's resource production is reduced by 1." },
	{
		targets: ['culture'],
		text: 'With culture you can bid on talented people. You need talented people to buy level 3 and 4 buildings and level 4 technologies. Talented people can be used as regular people too.'
	},
	{ targets: ['knowledge', 'upgrades'], text: 'With knowledge you discover technologies: they unlock spies and inquisitors, and improve the other resources.' },
	{ targets: ['power', 'upgrades'], text: 'With power you can buy and implement policies, which improve your abilities.' },
	{ targets: ['turn'], text: "Here you see whose turn it is, and here you end your turn." },
	{ targets: ['board'], text: 'This is the board. Here you place your buildings and units.' },
	{ targets: ['chat'], text: 'Here you can type messages to the other players.' },
	{ targets: ['log'], text: 'Everything that happens in the game is logged here.' },
	{ targets: [], text: "Don't forget: you can hover over most things to get more information." }
];
