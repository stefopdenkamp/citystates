<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { bribeGold, buildings, objectives, taxGold, units, type Talent } from '#lib/game/config.ts';
	import { bornMessage, fullName, hasEffect, hasTitle, hasTradedWith, isTaxed, objectiveOverview, objectiveProgress, quotedName, talentPayment, tradeLimitMessage, unitCost, unitImage } from '#lib/game/logic.ts';
	import type { ClientMessage, PublicGameState, Unit } from '#lib/game/types.ts';
	import ActionSelector from './ActionSelector.svelte';
	import AuctionDialog from './AuctionDialog.svelte';
	import Board from './Board.svelte';
	import LegacyDialog from './LegacyDialog.svelte';
	import OpponentOverview from './OpponentOverview.svelte';
	import PoliciesDialog from './PoliciesDialog.svelte';
	import RetrainDialog from './RetrainDialog.svelte';
	import SavedOverlay from './SavedOverlay.svelte';
	import TalentDialog from './TalentDialog.svelte';
	import Sidebar from './Sidebar.svelte';
	import StatisticsDialog from './StatisticsDialog.svelte';
	import TechnologiesDialog from './TechnologiesDialog.svelte';
	import Tutorial from './Tutorial.svelte';
	import { alertPopup, confirmPopup } from '#lib/client/popup.svelte.ts';

	let {
		game,
		playerId,
		send
	}: { game: PublicGameState; playerId: string | null; send: (message: ClientMessage) => void } = $props();

	let selectedBuilding = $state<string | null>(null);
	let overviewPlayerId = $state<string | null>(null);
	let openInvestment = $state<'technology' | 'policy' | null>(null);
	// the index of your talent being retrained (Reeducation programs)
	let retrainIndex = $state<number | null>(null);
	const overviewPlayer = $derived(game.players.find((p) => p.id === overviewPlayerId) ?? null);
	// A trader placed on an opponent's city centre opens the overview to trade; the trader stays in stock until traded.
	let tradePlayerId = $state<string | null>(null);
	const tradePlayer = $derived(game.players.find((p) => p.id === tradePlayerId) ?? null);

	const me = $derived(game.players.find((p) => p.id === playerId) ?? null);
	const isMyTurn = $derived(game.gameStatus === 'inProgress' && game.phase === 'action' && !!me?.isTurn);

	// The phase title fades in and out whenever it changes.
	const phaseTitle = $derived.by(() => {
		if (game.phase === 'born') return { key: `born-${game.stats.nrOfGenerations}`, text: 'A new generation is born' };
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
		const cost = units.some((u) => u.name === name) ? unitCost(game, me, name) : buildings.find((b) => b.name === name)!.cost;
		const payment = talentPayment(me, cost, hasTitle(game, me, 'Philosopher'));
		if (payment && payment.choices > 0) pendingBuy = { name, payment, buy };
		else buy([]);
	};

	// Tax reformation: using a spy, trader, missionary or inquisitor on its owner costs gold, so ask first.
	const acceptsTax = async (targetId: string | undefined) => {
		const target = game.players.find((p) => p.id === targetId);
		return !me || !target || !isTaxed(me, target) || confirmPopup(`${fullName(game, target)} has strict taxes, you have to pay ${taxGold} gold. Are you sure?`);
	};

	// A building is bought when placed; a unit was bought before and comes from your stock.
	const place = async (x: number, y: number) => {
		const name = selectedBuilding;
		if (!name) return;
		selectedBuilding = null;
		if (name === 'trader') {
			// once per opponent each turn, unless you have Caravans
			const targetId = game.players.find((p) => p.center.x === x && p.center.y === y)?.id ?? null;
			if (me && targetId && hasTradedWith(me, targetId)) alertPopup(tradeLimitMessage);
			else tradePlayerId = targetId;
		} else if (units.some((u) => u.name === name)) {
			const targetId = game.buildings.find((b) => b.x === x && b.y === y)?.ownerId;
			if (name === 'army' || name === 'mercenary' || (await acceptsTax(targetId))) send({ type: 'deploy', unit: name as Unit['type'], x, y });
		} else pay(name, (talents) => send({ type: 'build', building: name, x, y, talents }));
	};

	// Bribery: remove an opponent's unit from your building for gold.
	const bribe = async (unit: Unit) => {
		const owner = game.players.find((p) => p.id === unit.ownerId);
		if (owner && (await confirmPopup(`Do you want to bribe ${fullName(game, owner)}'s ${unit.type} away for ${bribeGold} gold?`))) {
			send({ type: 'unit:bribe', unitId: unit.id });
		}
	};

	const buyUnit = (unit: Unit['type']) => pay(unit, (talents) => send({ type: 'unit:buy', unit, talents }));

	let boardScale = $state(1);

	// Warn when ending your turn before your city centre produces anything.
	const endTurn = async () => {
		const hasNoCentreResource = game.isCityCentreEnabled && !me?.cityCentreResource;
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
			<div class="religious-dominance">Religious dominance</div>
		{/if}
	</header>

	<div class="board-area" data-tutorial="board">
		<Board
			{game}
			{playerId}
			{selectedBuilding}
			onPlace={place}
			onSetCityCentre={(resource) => send({ type: 'cityCentre:set', resource })}
			onOpenOverview={(id) => (overviewPlayerId = id)}
			onBribe={isMyTurn && me && hasEffect(me, 'bribery') && me.resources.gold >= bribeGold ? bribe : undefined}
			bind:scale={boardScale}
		/>

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

		<!-- your bought units, stacked from the bottom right; drag one onto the board to place it -->
		{#if me}
			<div class="unit-stock" style:--unit-scale={boardScale}>
				<div class="stock-units">
					{#each me.undeployedUnits ?? [] as unit, i (i)}
						<button
							class="stock-unit"
							class:selected={selectedBuilding === unit}
							data-resource={units.find((u) => u.name === unit)!.resourceType}
							style:background-image="url('/games/citystates/images/pieces/{unitImage(unit)}.jpg')"
							title={`${unit[0].toUpperCase() + unit.slice(1)}\n${units.find((u) => u.name === unit)!.description}`}
							disabled={!isMyTurn}
							draggable={isMyTurn}
							ondragstart={(event) => {
								event.dataTransfer?.setData('text/plain', unit);
								selectedBuilding = unit;
							}}
							onclick={() => (selectedBuilding = selectedBuilding === unit ? null : unit)}
							aria-label={unit}
						></button>
					{/each}
				</div>
			</div>
		{/if}

		{#if phaseTitle}
			{#key phaseTitle.key}
				<h2 class="phase-title">{phaseTitle.text}</h2>
			{/key}
		{/if}

		{#if isTutorialOpen && game.gameStatus === 'inProgress'}
			<Tutorial onClose={closeTutorial} />
		{/if}

		{#if game.phase === 'born' && game.lastBorn}
			{#key game.stats.nrOfGenerations}
				<p class="born-message">
					{bornMessage(game.lastBorn.people, game.lastBorn.talents, 'exceptionally talented')}
				</p>
			{/key}
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
		onRetrain={(index) => (retrainIndex = index)}
		onQuit={async () => (await confirmPopup('Are you sure you want to quit? The game will be paused for the other players.')) && goto(resolve('/'))}
	/>

	<Sidebar {game} canChat={!!me} onChat={(text) => send({ type: 'chat', text })} />
</div>

{#if game.gameStatus === 'inProgress' && game.phase === 'auction' && game.auction}
	<!-- a fresh dialog for every talent, so the next auction is clearly a new one -->
	{#key game.auction.queue.length}
		<AuctionDialog {game} {me} {send} />
	{/key}
{/if}

{#if game.gameStatus === 'inProgress' && game.phase === 'legacy' && game.legacy}
	<LegacyDialog {game} {me} onNext={() => send({ type: 'legacy:next' })} />
{/if}

{#if tradePlayer}
	<OpponentOverview
		{game}
		player={tradePlayer}
		{me}
		onTrade={async (give, take) => {
			const targetId = tradePlayer.id;
			if (await acceptsTax(targetId)) send({ type: 'trade', targetId, give, take });
		}}
		onClose={() => (tradePlayerId = null)}
	/>
{:else if overviewPlayer}
	<OpponentOverview
		{game}
		player={overviewPlayer}
		{me}
		onIndoctrinate={isMyTurn && me && hasEffect(me, 'indoctrination')
			? (index) => send({ type: 'talent:indoctrinate', targetId: overviewPlayer.id, index })
			: undefined}
		onPropaganda={isMyTurn && me && hasEffect(me, 'propaganda')
			? () => send({ type: 'person:propaganda', targetId: overviewPlayer.id })
			: undefined}
		onClose={() => (overviewPlayerId = null)}
	/>
{/if}

{#if retrainIndex !== null && me?.talents[retrainIndex] && isMyTurn}
	<RetrainDialog
		talent={me.talents[retrainIndex]}
		culture={me.resources.culture}
		onRetrain={(talent) => {
			send({ type: 'talent:retrain', index: retrainIndex!, talent });
			retrainIndex = null;
		}}
		onCancel={() => (retrainIndex = null)}
	/>
{/if}

{#if pendingBuy && isMyTurn}
	<TalentDialog
		building={pendingBuy.name}
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

	/* transparent and click-through, so the board can be dragged under it */
	.unit-stock {
		--unit-size: calc(var(--board-cell-size) * 0.55 * var(--unit-scale));
		--stock-gap: 0.3rem;

		position: absolute;
		inset: 0.5rem;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--stock-gap);

		pointer-events: none;
	}

	/* fills up bottom to top, then right to left */
	.stock-units {
		display: flex;
		flex: 1;
		flex-direction: column-reverse;
		flex-wrap: wrap-reverse;
		align-content: flex-start;
		gap: var(--stock-gap);
		align-self: stretch;
		min-height: 0;
	}

	/* the same size and look as a unit on the board, with a border in its resource color */
	.stock-unit {
		width: var(--unit-size);
		height: var(--unit-size);
		padding: 0;

		background: center / cover no-repeat;
		border: calc(2px * var(--unit-scale)) solid var(--resource-color);
		border-radius: 50%;

		cursor: grab;
		pointer-events: auto;
	}

	.stock-unit.selected {
		outline: 2px solid var(--color-accent);
	}

	.phase-title,
	.born-message {
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

	/* the born message fades in after the phase title has faded out */
	.born-message {
		color: var(--color-grayscale-6);
		font: var(--font-normal);

		animation-delay: var(--phase-title-speed);
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
