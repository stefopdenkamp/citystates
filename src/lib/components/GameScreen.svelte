<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { bribeGold, buildings, objectives, reeducationCost, units, type Talent } from '#lib/game/config.ts';
	import { canSpend, cityCentreAmount, fullName, getPlayer, replacedBuildings, hasEffect, hasTradedWith, objectiveOverview, objectiveProgress, paymentRules, quotedName, religiousDominanceOverview, religiousDominanceProgress, talentPayment, tradeLimitMessage, traderTargets, unitCost } from '#lib/game/logic.ts';
	import type { ClientMessage, PublicGameState, PublicPlayer, Unit } from '#lib/game/types.ts';
	import ActionSelector from './ActionSelector.svelte';
	import AuctionDialog from './AuctionDialog.svelte';
	import Board from './Board.svelte';
	import BornDialog from './BornDialog.svelte';
	import LegacyDialog from './LegacyDialog.svelte';
	import PlayerBoard from './PlayerBoard.svelte';
	import PoliciesDialog from './PoliciesDialog.svelte';
	import RetrainDialog from './RetrainDialog.svelte';
	import SavedOverlay from './SavedOverlay.svelte';
	import TalentDialog from './TalentDialog.svelte';
	import Sidebar from './Sidebar.svelte';
	import StatisticsDialog from './StatisticsDialog.svelte';
	import TechnologiesDialog from './TechnologiesDialog.svelte';
	import TradeDialog from './TradeDialog.svelte';
	import Tutorial from './Tutorial.svelte';
	import { alertPopup, confirmPopup } from '#lib/client/popup.svelte.ts';

	let {
		game,
		playerId,
		send
	}: { game: PublicGameState; playerId: string | null; send: (message: ClientMessage) => void } = $props();

	let selectedBuilding = $state<string | null>(null);
	let openInvestment = $state<'technology' | 'policy' | null>(null);
	// the generation whose born dialog you closed
	let closedBornGeneration = $state<number | null>(null);
	// the index of your talent being retrained (Reeducation programs)
	let retrainIndex = $state<number | null>(null);
	// A trader put on an opponent's player board opens the trade dialog; the trader stays in stock until traded.
	let tradePlayerId = $state<string | null>(null);
	const tradePlayer = $derived(game.players.find((p) => p.id === tradePlayerId) ?? null);

	const me = $derived(game.players.find((p) => p.id === playerId) ?? null);
	const isMyTurn = $derived(game.gameStatus === 'inProgress' && game.phase === 'action' && !!me?.isTurn);

	// The phase title fades in and out whenever it changes.
	const phaseTitle = $derived.by(() => {
		if (game.phase === 'legacy') return { key: `legacy-${game.stats.nrOfGenerations}`, text: 'The legacy of a generation' };
		if (game.phase === 'action') {
			const player = game.players[game.turnIndex];
			return { key: `action-${game.stats.nrOfGenerations}-${game.turnsTaken}`, text: `${quotedName(game, player)} takes action` };
		}
		return null;
	});

	$effect(() => {
		if (!isMyTurn) {
			selectedBuilding = null;
			tradePlayerId = null;
		}
	});

	// A purchase where you choose which talent pays for a regular person waits for the talent dialog. Talents the
	// cost itself asks for (level 3 and 4 buildings) leave no choice, so those are spent without asking.
	let pendingBuy = $state<{
		name: string;
		payment: NonNullable<ReturnType<typeof talentPayment>>;
		buy: (talents: Talent[]) => void;
	} | null>(null);

	const pay = (name: string, buy: (talents: Talent[]) => void) => {
		if (!me) return;
		if (game.isTestMode) return buy([]); // nothing is paid, so no talent to choose
		const isUnit = units.some((u) => u.name === name);
		const cost = isUnit ? unitCost(game, me, name) : buildings.find((b) => b.name === name)!.cost;
		const payment = talentPayment(me, cost, paymentRules(game, me, !isUnit));
		if (payment && payment.choices > 0) pendingBuy = { name, payment, buy };
		else buy([]);
	};

	// A building is bought when placed; a unit was bought before and comes from your stock.
	const place = async (x: number, y: number) => {
		const name = selectedBuilding;
		if (!name) return;
		selectedBuilding = null;
		if (units.some((u) => u.name === name)) {
			send({ type: 'deploy', unit: name as Unit['type'], x, y });
		} else {
			// placing a farm or estate over farms and estates (your own, or with "Build over farms" also those of
			// opponents) removes them: ask first
			const replaced = playerId ? replacedBuildings(game, playerId, name, x, y) : [];
			const isFarmland = buildings.find((b) => b.name === name)?.resourceType === 'people';
			if (isFarmland && replaced.length) {
				const what = replaced
					.map((b) => `${b.type === 'estate' ? 'an' : 'a'} ${b.type} of ${b.ownerId === playerId ? 'yours' : getPlayer(game, b.ownerId).name}`)
					.join(' and ');
				if (!(await confirmPopup(`Placing this ${name} removes ${what}. Are you sure?`))) return;
			}
			pay(name, (talents) => send({ type: 'build', building: name, x, y, talents }));
		}
	};

	// Ambassador bribes: remove an opponent's unit from your building for gold.
	const bribe = async (unit: Unit) => {
		const owner = game.players.find((p) => p.id === unit.ownerId);
		const price = bribeGold[unit.type as keyof typeof bribeGold];
		if (owner && (await confirmPopup(`Do you want to bribe ${fullName(game, owner)}'s ${unit.type} away for ${price} gold?`))) {
			send({ type: 'unit:bribe', unitId: unit.id });
		}
	};

	const buyUnit = (unit: Unit['type']) => pay(unit, (talents) => send({ type: 'unit:buy', unit, talents }));

	let boardScale = $state(1);

	// The opponents whose player board a selected trader can go on.
	const tradeTargets = $derived(selectedBuilding === 'trader' && isMyTurn && playerId ? traderTargets(game, playerId) : new Set<string>());
	const startTrade = (targetId: string) => {
		selectedBuilding = null;
		// once per opponent each turn, unless you have Caravans
		if (me && hasTradedWith(me, targetId)) alertPopup(tradeLimitMessage);
		else tradePlayerId = targetId;
	};

	// Winning an opponent's people over with culture, during your turn; not from a player with Subsidies.
	const canConvince = (player: PublicPlayer, effect: 'propagandaPosters' | 'frescoPaintings') =>
		isMyTurn && !!me && player.id !== me.id && hasEffect(me, effect) && !hasEffect(player, 'subsidies');

	// Warn when ending your turn before your city centre produces anything.
	const endTurn = async () => {
		const hasNoCentreResource = !!me && cityCentreAmount(game, me) > 0 && !me.cityCentreResource;
		if (hasNoCentreResource && !(await confirmPopup('You have not chosen a resource for your city centre yet. End your turn anyway?'))) return;
		send({ type: 'turn:end' });
	};

	// The tutorial is shown to each player once per game; this browser remembers that it was finished or cancelled.
	const tutorialKey = `citystates-tutorial-${game.id}`;
	const isTutorialSeen = () => {
		try {
			return localStorage.getItem(tutorialKey) === 'seen';
		} catch {
			return false;
		}
	};
	let isTutorialOpen = $state(!!game.isTutorialEnabled && !!playerId && !isTutorialSeen());
	const closeTutorial = () => {
		isTutorialOpen = false;
		try {
			localStorage.setItem(tutorialKey, 'seen');
		} catch {
			// it shows again next time
		}
	};

	const confirmBuy = (talents: Talent[]) => {
		pendingBuy?.buy(talents);
		pendingBuy = null;
	};
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && (selectedBuilding = null)} />

<div class="screen">
	<header>
		<div class="objectives" data-tutorial="objectives">
			{#each game.objectives as objective (objective)}
				<div class="objective" title={objectiveOverview(game, objective)}>
					<!-- a bar per player, filling from the bottom with their progress, behind the text -->
					<div class="progress" aria-hidden="true">
						{#each game.players as player (player.id)}
							{@const progress = objectiveProgress(game, player.id, objective)}
							<span class="bar" class:met={progress >= 1} data-color={player.color} style:height="{progress * 100}%"></span>
						{/each}
					</div>
					<span class="objective-text">
						<span class="objective-name">{objectives[objective].name}</span>
						<span class="objective-description">{objectives[objective].description}</span>
					</span>
				</div>
			{/each}
		</div>
		{#if game.isReligiousDominanceEnabled}
			<!-- a bar per player, like the objectives: their missionaries and inquisitors on opponents' buildings inside the
			     wall and city centres, 9 steps per opponent -->
			<div class="religious-dominance" data-tutorial="religious-dominance" title={religiousDominanceOverview(game)}>
				<div class="progress" aria-hidden="true">
					{#each game.players as player (player.id)}
						{@const progress = religiousDominanceProgress(game, player.id)}
						<span class="bar" class:met={progress >= 1} data-color={player.color} style:height="{progress * 100}%"></span>
					{/each}
				</div>
				<span class="objective-text">Religious dominance</span>
			</div>
		{/if}
	</header>

	<div class="board-area" data-tutorial="board">
		<Board
			{game}
			{playerId}
			{selectedBuilding}
			onPlace={place}
			onSetCityCentre={(resource) => send({ type: 'cityCentre:set', resource })}
			onBribe={isMyTurn && me && hasEffect(me, 'ambassadorBribes') ? bribe : undefined}
			bind:scale={boardScale}
		>
			{#snippet playerBoard(player, vertical)}
				{@const isMine = player.id === playerId}
				<PlayerBoard
					{game}
					{player}
					{vertical}
					{me}
					onPropaganda={canConvince(player, 'propagandaPosters') ? () => send({ type: 'person:propaganda', targetId: player.id }) : undefined}
					onIndoctrinate={canConvince(player, 'frescoPaintings')
						? (index) => send({ type: 'talent:indoctrinate', targetId: player.id, index })
						: undefined}
					{isMine}
					selectedUnit={isMine ? selectedBuilding : null}
					canUseUnits={isMine && isMyTurn}
					onSelectUnit={isMine ? (unit) => (selectedBuilding = unit) : undefined}
					onRetrain={isMine && isMyTurn && me && hasEffect(me, 'reeducationPrograms') ? (index) => (retrainIndex = index) : undefined}
					isTarget={tradeTargets.has(player.id)}
					onTarget={() => startTrade(player.id)}
				/>
			{/snippet}
		</Board>

		<!-- over the board, inside its area -->
		{#if openInvestment === 'technology'}
			<TechnologiesDialog
				{game}
				{me}
				{isMyTurn}
				onUnlock={(technology) => send({ type: 'technology:unlock', technology })}
				onClose={() => (openInvestment = null)}
			/>
		{:else if openInvestment === 'policy'}
			<PoliciesDialog
				{game}
				{me}
				{isMyTurn}
				onUnlock={(policy) => send({ type: 'policy:unlock', policy })}
				onImplement={(policy, slot) => send({ type: 'policy:implement', policy, slot })}
				onRemove={(policy) => send({ type: 'policy:remove', policy })}
				onClose={() => (openInvestment = null)}
			/>
		{/if}

		{#if phaseTitle}
			{#key phaseTitle.key}
				<h2 class="phase-title">{phaseTitle.text}</h2>
			{/key}
		{/if}

		{#if isTutorialOpen && game.gameStatus === 'inProgress'}
			<Tutorial isReligiousDominanceEnabled={!!game.isReligiousDominanceEnabled} onClose={closeTutorial} />
		{/if}

	</div>

	<ActionSelector
		{game}
		{me}
		{isMyTurn}
		{selectedBuilding}
		onBuyUnit={buyUnit}
		onSelect={(building, toggle = true) =>
			(selectedBuilding = toggle && selectedBuilding === building ? null : building)}
		onEndTurn={endTurn}
		onOpenInvestment={(kind) => (openInvestment = kind)}
		{boardScale}
		onQuit={async () => (await confirmPopup('Are you sure you want to quit? The game will be paused for the other players.')) && goto(resolve('/'))}
	/>

	<Sidebar {game} canChat={!!me} onChat={(text) => send({ type: 'chat', text })} />
</div>

<!-- the tutorial comes first, then the born dialog: everyone born, the talents among them; closing it goes on to the bidding -->
{#if isTutorialOpen}
	<!-- the born dialog and the bidding wait until the tutorial is done or cancelled -->
{:else if game.gameStatus === 'inProgress' && (game.phase === 'auction' || game.phase === 'action') && me && game.lastBorn && closedBornGeneration !== game.stats.nrOfGenerations}
	<BornDialog {game} {me} onClose={() => (closedBornGeneration = game.stats.nrOfGenerations)} />
{:else if game.gameStatus === 'inProgress' && game.phase === 'auction' && game.auction}
	<!-- a fresh dialog for every talent, so the next auction is clearly a new one -->
	{#key game.auction.queue.length}
		<AuctionDialog {game} {me} {send} />
	{/key}
{/if}

{#if game.gameStatus === 'inProgress' && game.phase === 'legacy' && game.legacy}
	<LegacyDialog {game} {me} onNext={() => send({ type: 'legacy:next' })} />
{/if}

{#if tradePlayer && me}
	<TradeDialog
		{game}
		player={tradePlayer}
		{me}
		onTrade={(give, take) => {
			send({ type: 'trade', targetId: tradePlayer.id, give, take });
		}}
		onClose={() => (tradePlayerId = null)}
	/>
{/if}

{#if retrainIndex !== null && me?.talents[retrainIndex] && isMyTurn}
	<RetrainDialog
		talent={me.talents[retrainIndex]}
		canPay={canSpend(game, me, [{ amount: reeducationCost, resourceType: 'culture' }])}
		onRetrain={(talent) => {
			send({ type: 'talent:retrain', index: retrainIndex!, talent });
			retrainIndex = null;
		}}
		onCancel={() => (retrainIndex = null)}
	/>
{/if}

{#if pendingBuy && isMyTurn}
	<TalentDialog
		name={pendingBuy.name}
		isUnit={units.some((u) => u.name === pendingBuy!.name)}
		isWorkEthic={!!me && paymentRules(game, me, true).workEthic && !units.some((u) => u.name === pendingBuy!.name)}
		{...pendingBuy.payment}
		onConfirm={confirmBuy}
		onCancel={() => (pendingBuy = null)}
	/>
{/if}

{#if game.gameStatus === 'finished' && game.winnerIds?.length}
	<StatisticsDialog {game} />
{/if}

{#if game.gameStatus === 'saved'}
	<SavedOverlay {game} {me} {send} />
{/if}

<style>
	.screen {
		display: grid;
		grid-template-columns: 1fr 20rem;
		grid-template-rows: auto 1fr auto;
		grid-template-areas:
			'header sidebar'
			'board sidebar'
			'actions sidebar';
		gap: 1px;
		height: 100vh;

		background-color: var(--color-grayscale-3);
	}

	/* the objectives, with the religious dominance objective under them when enabled */
	header {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		grid-area: header;
		padding: 0.5rem 1rem;

		background-color: var(--color-grayscale-2);
	}

	.objectives {
		display: flex;
		flex: 1;
	}

	/* three objectives of equal width, with a line between them */
	.objective {
		position: relative;
		flex: 1 1 0;
		padding: 0.3rem 0.6rem;
		text-align: center;

		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	.objective:not(:last-child) {
		border-right: 1px solid var(--color-grayscale-5);
	}

	/* a column per player over the full objective, no padding or margin */
	.progress {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-end;
	}

	.bar {
		flex: 1 1 0;

		background-color: var(--player-color);
		opacity: 0.3;
	}

	/* the objective is met */
	.bar.met {
		opacity: 0.65;
	}

	/* the name, with the description under it */
	.objective-text {
		position: relative;
		display: flex;
		flex-direction: column;
	}

	.objective-name {
		color: var(--color-grayscale-6);
		font-weight: 700;
	}

	.objective-description {
		font: var(--font-tiny);
	}

	/* half the height of the objectives, the full width of the board */
	.religious-dominance {
		position: relative;
		padding: 0.05rem 0.6rem;
		text-align: center;

		color: var(--color-grayscale-5);
		border-top: 1px solid var(--color-grayscale-5);
		font: var(--font-tiny);
	}

	.board-area {
		position: relative;
		grid-area: board;
		overflow: hidden;
	}

	.phase-title {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 2;
		margin: 0;
		padding: 1rem 1.5rem;
		text-align: center;

		background-color: var(--color-grayscale-1);
		color: var(--color-accent);
		border-radius: var(--border-radius);
		font: var(--font-heading);
		opacity: 0;

		animation: fade var(--phase-title-speed) ease-in-out;
		pointer-events: none;
	}

	@keyframes fade {
		0% {
			opacity: 0;
			transform: translate(-50%, calc(-50% - 0.5rem));
		}
		20%,
		80% {
			opacity: 1;
			transform: translate(-50%, -50%);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -50%);
		}
	}
</style>
