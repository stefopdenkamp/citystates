<script lang="ts">
	import { buildings, resourceTypes, talentResource, units, type BuildingStats, type UnitStats } from '#lib/game/config.ts';
	import {
		canPay,
		costLabel,
		fullName,
		getBuildingStats,
		hasPlaceFor,
		hasEffect,
		isAtBuildingLimit,
		isUnitUnlocked,
		needsLowerBuilding,
		overviewText,
		peopleCap,
		peopleCount,
		peopleText,
		resourceCap,
		resourceProduction,
		unitCost
	} from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer, Unit } from '#lib/game/types.ts';
	import PersonIcon from './PersonIcon.svelte';

	let {
		game,
		me,
		isMyTurn,
		selectedBuilding,
		onBuyUnit,
		onSelect,
		onEndTurn,
		onQuit,
		onOpenInvestment,
		onRetrain
	}: {
		game: PublicGameState;
		me: PublicPlayer | null;
		isMyTurn: boolean;
		selectedBuilding: string | null;
		onBuyUnit: (unit: Unit['type']) => void;
		onSelect: (building: string, toggle?: boolean) => void;
		onEndTurn: () => void;
		onQuit: () => void;
		onOpenInvestment: (kind: 'technology' | 'policy') => void;
		onRetrain: (index: number) => void;
	} = $props();

	// With the Reeducation programs in effect, clicking one of your talents during your turn retrains it.
	const canRetrain = $derived(isMyTurn && !!me && hasEffect(me, 'retraining'));
	// Spies and inquisitors only show while their policy is in effect.
	const shownUnits = $derived(units.filter((u) => !me || isUnitUnlocked(me, u.name)));

	// Upgrades also need one of your buildings one level lower to replace.
	const canBuy = (b: BuildingStats) => isMyTurn && !!me && canPay(game, me, b.cost) && hasPlaceFor(game, me.id, b.name);

	// While dragging a building, show a square in your color with the resource color in the middle.
	const showDragPreview = (event: DragEvent, resource: string) => {
		if (!me) return;
		const preview = document.createElement('div');
		preview.className = 'drag-preview';
		preview.dataset.color = me.color;
		preview.dataset.resource = resource;
		document.body.append(preview);
		event.dataTransfer?.setDragImage(preview, 24, 24);
		setTimeout(() => preview.remove());
	};

	// Units without a description cannot be bought yet; bought units go to your stock over the board.
	const costOfUnit = (unit: UnitStats) => (me ? unitCost(game, me, unit.name) : unit.cost);
	const canBuyUnit = (unit: UnitStats) => isMyTurn && !!me && !!unit.description && canPay(game, me, costOfUnit(unit));

	// The building or unit hovered, with its button's position: its tip is fixed above it, so the scrolling bar does not clip it.
	let hovered = $state<{ building?: BuildingStats; unit?: UnitStats; rect: DOMRect } | null>(null);

	// Whether an opponent's unit of one of these types sits on one of your buildings of that resource: an army
	// blocks the people cap, a spy lowers a cap, a missionary or inquisitor blocks production.
	const isBlocked = (resource: string, types: Unit['type'][]) =>
		(game.units ?? []).some((u) => {
			const b = game.buildings.find((b) => b.x === u.x && b.y === u.y);
			return types.includes(u.type) && u.ownerId !== me?.id && b?.ownerId === me?.id && getBuildingStats(b.type).resourceType === resource;
		});

	// Turn timer, counted down on the client from turnEndsAt.
	let now = $state(Date.now());
	$effect(() => {
		const interval = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(interval);
	});
	const secondsLeft = $derived(game.turnEndsAt ? Math.max(0, Math.ceil((game.turnEndsAt - now) / 1000)) : null);
	const currentPlayer = $derived(game.phase === 'action' ? game.players[game.turnIndex] : null);
</script>

{#snippet buildingButton(building: BuildingStats)}
	<button
		class="building"
		class:selected={selectedBuilding === building.name}
		disabled={!canBuy(building)}
		onmouseenter={(event) => (hovered = { building, rect: event.currentTarget.getBoundingClientRect() })}
		onmouseleave={() => (hovered = null)}
		draggable={canBuy(building)}
		ondragstart={(event) => {
			event.dataTransfer?.setData('text/plain', building.name);
			showDragPreview(event, building.resourceType);
			onSelect(building.name, false);
		}}
		onclick={() => onSelect(building.name)}
	>
		<span class="building-name">{building.name}</span>
		<span class="cost">{costLabel(building.cost)}</span>
		<span class="stats">{building.production ? `+${building.production} production · ` : ''}{building.resourceType === 'people' ? '+' : ''}{building.cap} cap</span>
	</button>
{/snippet}

<!-- the hover text of a building in 3 parts: level, costs, production and cap; what stops you from buying it in red -->
{#if hovered?.building}
	{@const b = hovered.building}
	{@const needsLower = !!me && needsLowerBuilding(game, me.id, b.name)}
	{@const atLimit = !!me && isAtBuildingLimit(game, me.id, b.name)}
	<div class="tip" style:left="{hovered.rect.left + hovered.rect.width / 2}px" style:top="{hovered.rect.top}px">
		<div class:unmet={needsLower || atLimit}>
			Level {b.level}
			{#if needsLower}<br />Level {b.level - 1} building needed{/if}
			{#if atLimit}<br />You already have a {b.name}{/if}
		</div>
		<div class:unmet={!!me && !canPay(game, me, b.cost)}>Costs {costLabel(b.cost)}</div>
		<div>
			{#if b.production}Produces {b.production} {b.resourceType}<br />{/if}
			Cap {b.cap}
		</div>
	</div>
{:else if hovered?.unit}
	<!-- a unit in 2 parts: what it does, its costs -->
	{@const unit = hovered.unit}
	<div class="tip" style:left="{hovered.rect.left + hovered.rect.width / 2}px" style:top="{hovered.rect.top}px">
		<div>{unit.description || 'Units come later'}</div>
		<div class:unmet={!!me && !canPay(game, me, costOfUnit(unit))}>Costs {costLabel(costOfUnit(unit))}</div>
	</div>
{/if}

<section class="actions">
	<div class="columns">
		<div class="column" data-resource="people">
			<h3>
				People
				{#if me}<span class="amount" title={`${peopleText(me)}\n\n${overviewText(game, me.id, 'people', 'cap')}`}>{peopleCount(me)}/<span class:blocked={isBlocked('people', ['army', 'mercenary'])}>{peopleCap(game, me.id)}</span></span>{/if}
			</h3>
			{#each buildings.filter((b) => b.resourceType === 'people') as building (building.name)}
				{@render buildingButton(building)}
			{/each}
			<div class="talents">
				{#if me?.talents.length}
					{#each me.talents as talent, i (i)}
						{#if canRetrain}
							<button class="talent" data-resource={talentResource[talent]} title="Reeducate this {talent}" onclick={() => onRetrain(i)}>
								<PersonIcon class="circle" />
								<span class="talent-name">{talent}</span>
							</button>
						{:else}
							<span class="talent" data-resource={talentResource[talent]}>
								<PersonIcon class="circle" />
								<span class="talent-name">{talent}</span>
							</span>
						{/if}
					{/each}
				{:else}
					<span class="none">No talents</span>
				{/if}
			</div>
		</div>

		{#each resourceTypes as resource (resource)}
			<div class="column" data-resource={resource}>
				<h3>
					{resource}
					{#if me}
						<span
							class="amount"
							title={`${overviewText(game, me.id, resource, 'production')}\n\n${overviewText(game, me.id, resource, 'cap')}`}
						>
							{me.resources[resource]}/<span class:blocked={isBlocked(resource, ['spy'])}>{resourceCap(game, me.id, resource)}</span>
							<small class:blocked={isBlocked(resource, ['missionary', 'inquisitor'])}>+{resourceProduction(game, me.id, resource)}</small>
						</span>
					{/if}
				</h3>
				{#each buildings.filter((b) => b.resourceType === resource) as building (building.name)}
					{@render buildingButton(building)}
				{/each}
			</div>
		{/each}

		<!-- each unit keeps the color of the resource it belongs to -->
		<div class="column units">
			<!-- an empty second line where other columns show their amount, so the buttons align -->
			<h3>Units <span class="amount">&nbsp;</span></h3>
			<!-- 4 units per column, then the next column -->
			<div class="unit-list">
				{#each shownUnits as unit (unit.name)}
					<button
						class="building unit"
						data-resource={unit.resourceType}
						disabled={!canBuyUnit(unit)}
						onmouseenter={(event) => (hovered = { unit, rect: event.currentTarget.getBoundingClientRect() })}
						onmouseleave={() => (hovered = null)}
						onclick={() => onBuyUnit(unit.name as Unit['type'])}
					>
						<span class="building-name">{unit.name}</span>
						<span class="cost">{costLabel(costOfUnit(unit))}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="column">
			<h3>Upgrades <span class="amount">&nbsp;</span></h3>
			<button class="building" data-resource="knowledge" onclick={() => onOpenInvestment('technology')}>
				<span class="building-name">Technologies</span>
				<span class="cost">Discover technologies</span>
			</button>
			<button class="building" data-resource="power" onclick={() => onOpenInvestment('policy')}>
				<span class="building-name">Policies</span>
				<span class="cost">Implement policies</span>
			</button>
		</div>
	</div>

	<div class="turn">
		{#if currentPlayer}
			<span class="turn-label">{isMyTurn ? 'Your turn' : `${fullName(game, currentPlayer)}'s turn`}</span>
			{#if secondsLeft !== null}
				<span class="timer" class:urgent={secondsLeft <= 10}>{secondsLeft}s</span>
			{/if}
		{/if}
		<button class="primary" disabled={!isMyTurn} onclick={onEndTurn}>End turn</button>
		<button onclick={onQuit}>Quit game</button>
	</div>
</section>

<style>
	/* the columns in the middle, the turn controls on the right */
	.actions {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 1rem;
		grid-area: actions;
		padding: 0.6rem;
		overflow-x: auto;

		background-color: var(--color-grayscale-2);
	}

	.columns {
		display: flex;
		gap: 1rem;
		grid-column: 2;
	}

	.column {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 7rem;
	}

	.column.units {
		width: auto;
	}

	.unit-list {
		display: grid;
		grid-template-rows: repeat(4, auto);
		grid-auto-columns: 7rem;
		grid-auto-flow: column;
		gap: 0.25rem 1rem;
		align-content: start;
	}

	h3 {
		display: flex;
		flex-direction: column;

		color: var(--resource-color, var(--color-grayscale-5));
		font: var(--font-small);
		font-weight: 700;
		text-transform: capitalize;
	}

	.amount {
		color: var(--color-grayscale-6);
		font-weight: 400;
	}

	small {
		color: var(--color-grayscale-5);
	}

	.blocked {
		color: var(--color-danger);
	}

	/* room for 4 talents (2 by 2); it grows a row for every 2 more */
	.talents {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-auto-rows: 2.7rem;
		gap: 0.3rem;
		min-height: calc(2 * 2.7rem + 0.3rem + 2 * 0.3rem + 2px);
		padding: 0.3rem;

		border: 1px solid var(--color-grayscale-3);
		border-radius: var(--border-radius);
	}

	.talent {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	button.talent {
		padding: 0;

		background: none;
		border: none;
	}

	button.talent:hover :global(.circle) {
		outline: 2px solid var(--color-accent);
	}

	.talent :global(.circle) {
		width: 1.8rem;
		height: 1.8rem;
		padding: 0.15rem;

		background-color: var(--resource-color);
		color: var(--color-grayscale-6);
		border-radius: 50%;
	}

	.talent-name {
		color: var(--resource-color);
		font: var(--font-tiny);
		font-size: 0.55rem;
	}

	.none {
		grid-column: 1 / -1;
		grid-row: 1 / 3;
		place-self: center;

		color: var(--color-grayscale-4);
		font: var(--font-tiny);
	}

	.building {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-height: 3rem;
		padding: 0.2rem 0.4rem;
		text-align: left;

		border-left: 3px solid var(--resource-color, var(--color-grayscale-4));
		font: var(--font-tiny);
	}

	.building.selected {
		background-color: var(--color-accent-dark);
		border-color: var(--color-accent);
	}

	.building-name {
		font: var(--font-tiny);
		font-weight: 700;
		text-transform: capitalize;
	}

	.cost {
		color: var(--color-grayscale-5);
		font: var(--font-tiny);
		font-size: 0.6rem;
	}

	/* like the tip of the info icon, its parts split by a line */
	.tip {
		position: fixed;
		z-index: 20;
		width: max-content;
		max-width: 14rem;
		padding: 0.3rem 0.5rem;

		background-color: var(--color-grayscale-1);
		color: var(--color-grayscale-6);
		border: 1px solid var(--color-grayscale-4);
		border-radius: var(--border-radius);
		font: var(--font-tiny);

		transform: translate(-50%, calc(-100% - 0.4rem));
		pointer-events: none;
	}

	.tip > div:not(:first-child) {
		margin-top: 0.2rem;
		padding-top: 0.2rem;

		border-top: 1px solid var(--color-grayscale-4);
	}

	.tip .unmet {
		color: var(--color-danger);
	}

	/* production and cap, only on large screens, under a line below the cost */
	.stats {
		display: none;
		align-self: stretch;
		margin-top: 0.2rem;
		padding-top: 0.2rem;

		color: var(--color-grayscale-5);
		border-top: 1px solid var(--color-grayscale-4);
		font: var(--font-tiny);
		font-size: 0.6rem;
	}

	/* wider columns, and all buttons (units and upgrades too) as high as a building with its stats */
	@media (min-width: 1921px) {
		.column {
			width: 9rem;
		}

		.unit-list {
			grid-auto-columns: 9rem;
		}

		.building {
			min-height: 4.5rem;
		}

		.stats {
			display: block;
		}
	}

	.turn {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: stretch;
		gap: 0.5rem;
		grid-column: 3;
		justify-self: end;
		/* the same width on every turn; a long opponent name wraps instead of widening the buttons */
		width: 9rem;
		text-align: center;
	}

	.turn-label {
		font: var(--font-small);
		overflow-wrap: break-word;
	}

	.timer {
		font: var(--font-heading);
	}

	.timer.urgent {
		color: var(--color-danger);
	}
</style>
