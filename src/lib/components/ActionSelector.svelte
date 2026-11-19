<script lang="ts">
	import { buildings, resourceTypes, units, type BuildingStats, type Cost, type UnitStats } from '#lib/game/config.ts';
	import {
		buildingSize,
		canPay,
		costLabel,
		fullName,
		hasPlaceFor,
		isUnitUnlocked,
		pieceImage,
		unitCost,
		unitUnlockText,
		unitImage
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
		boardScale
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
		boardScale: number; // the zoom of the board, so a dragged building shows the size it will have there
	} = $props();

	// A building also needs a place to go.
	const canBuy = (b: BuildingStats) => isMyTurn && !!me && canPay(game, me, b.cost, true) && hasPlaceFor(game, me.id, b.name);

	const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

	// While dragging a building, show its tile, as big as the building will be on the board (2×2 cells for a farm,
	// 3×3 for an estate). The cursor holds it by the top left cell of a farm and the middle cell of an estate, the
	// cell it is dropped on.
	const showDragPreview = (event: DragEvent, building: BuildingStats) => {
		if (!me) return;
		const cell = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-cell-size')) || 3.2) * rem;
		const pitch = cell + 2; // a cell and the gap after it
		const size = buildingSize(building.name);
		const preview = document.createElement('div');
		preview.className = 'drag-preview tile';
		preview.dataset.color = me.color;
		preview.dataset.resource = building.resourceType;
		preview.style.backgroundImage = pieceImage(building.name);
		preview.style.width = preview.style.height = `${(size * pitch - 2) * boardScale}px`;
		document.body.append(preview);
		const held = (Math.floor((size - 1) / 2) * pitch + cell / 2) * boardScale;
		event.dataTransfer?.setDragImage(preview, held, held);
		setTimeout(() => preview.remove());
	};

	// The buildings (and after them the technologies and policies) and the units go from the top left to the bottom
	// right and wrap, in the order of their resource; the border of a tile is in its resource color. Size in rem.
	const tileSize = 5.5;
	const tileGap = 0.4;
	const buildingsInOrder = (['people', ...resourceTypes] as const).flatMap((resource) => buildings.filter((b) => b.resourceType === resource));
	// all units, greyed out until unlocked (see isUnitUnlocked)
	const unitsInOrder = resourceTypes.flatMap((resource) => units.filter((u) => u.resourceType === resource));
	const tutorialTarget = (resource: string) => (resource === 'people' ? 'people' : `resources ${resource}`);

	// bought units go to your stock
	const costOfUnit = (unit: UnitStats) => (me ? unitCost(game, me, unit.name) : unit.cost);
	const canBuyUnit = (unit: UnitStats) =>
		isMyTurn && !!me && isUnitUnlocked(game, me, unit.name) && canPay(game, me, costOfUnit(unit));

	// The building or unit hovered, with its button's position: its tip is fixed above it, so the scrolling bar does not clip it.
	let hovered = $state<{ building?: BuildingStats; unit?: UnitStats; rect: DOMRect } | null>(null);

	// Turn timer, counted down on the client from turnEndsAt.
	let now = $state(Date.now());
	$effect(() => {
		const interval = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(interval);
	});
	// the time left as minutes and seconds, e.g. "2:05"
	const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	const secondsLeft = $derived(game.turnEndsAt ? Math.max(0, Math.ceil((game.turnEndsAt - now) / 1000)) : null);
	const currentPlayer = $derived(game.phase === 'action' ? game.players[game.turnIndex] : null);
</script>

{#snippet buildingButton(building: BuildingStats)}
	<!-- its tile, with its production and cap on it (F&E only add to the people cap) -->
	<button
		class="tile"
		class:selected={selectedBuilding === building.name}
		data-resource={building.resourceType}
		data-tutorial={tutorialTarget(building.resourceType)}
		style:background-image={pieceImage(building.name)}
		disabled={!canBuy(building)}
		onmouseenter={(event) => (hovered = { building, rect: event.currentTarget.getBoundingClientRect() })}
		onmouseleave={() => (hovered = null)}
		draggable={canBuy(building)}
		ondragstart={(event) => {
			event.dataTransfer?.setData('text/plain', building.name);
			showDragPreview(event, building);
			onSelect(building.name, false);
		}}
		onclick={() => onSelect(building.name)}
	>
		<!-- the production with a circle in its resource color (like the unit costs), on a new line the cap -->
		<span class="tile-stats building-stats">
			{#if building.resourceType === 'people'}
				<span>/+{building.cap}</span>
			{:else}
				<span class="cost-icons">+{building.production} <span class="cost-circle"></span></span>
				<span>/{building.cap}</span>
			{/if}
		</span>
	</button>
{/snippet}

<!-- a unit's costs as amounts with icons: a person for people, a circle in its color for a resource -->
{#snippet costIcons(cost: Cost[])}
	<span class="tile-stats cost-icons">
		{#each cost as c, i (i)}
			{c.amount}
			{#if c.resourceType === 'people'}
				<PersonIcon class="cost-person" filled />
			{:else}
				<span class="cost-circle" data-resource={c.resourceType}></span>
			{/if}
		{/each}
	</span>
{/snippet}

<!-- the costs as a list, each cost you cannot pay in red -->
{#snippet costList(cost: Cost[], isBuilding = false)}
	<div>
		Costs
		<ul>
			{#each cost as c, i (i)}
				<li class:unmet={!!me && !canPay(game, me, [c], isBuilding)}>{costLabel([c])}</li>
			{/each}
		</ul>
	</div>
{/snippet}

<!-- the hover text of a building in 3 parts: name and level, costs, production and cap -->
{#if hovered?.building}
	{@const b = hovered.building}
	<div class="tip" style:left="{hovered.rect.left + hovered.rect.width / 2}px" style:top="{hovered.rect.top}px">
		<div><span class="tip-name">{b.name}</span> · level {b.level}</div>
		{@render costList(b.cost, true)}
		{#if me && !hasPlaceFor(game, me.id, b.name)}<div class="unmet">There is no place for it</div>{/if}
		<div>
			{#if b.production}Produces {b.production} {b.resourceType}<br />{/if}
			Cap {b.resourceType === 'people' ? '+' : ''}{b.cap}
		</div>
	</div>
{:else if hovered?.unit}
	<!-- a unit in 2 parts: what it does, its costs -->
	{@const unit = hovered.unit}
	<div class="tip" style:left="{hovered.rect.left + hovered.rect.width / 2}px" style:top="{hovered.rect.top}px">
		<div><span class="tip-name">{unit.name}</span></div>
		<div>{unit.description}</div>
		{#if me && !isUnitUnlocked(game, me, unit.name)}<div class="unmet">Needs {unitUnlockText(unit.name)}</div>{/if}
		{@render costList(costOfUnit(unit))}
	</div>
{/if}

<!-- the buildings, the units and the turn controls, 65%, 25% and 10% of the width -->
<section class="actions">
	<!-- the buildings, in rows, in the order of their resource -->
	<div class="buildings" style:--tile-size="{tileSize}rem" style:--tile-gap="{tileGap}rem">
		<div class="flow">
			<!-- a gray line between the resources -->
			{#each buildingsInOrder as building, i (building.name)}
				{#if i && building.resourceType !== buildingsInOrder[i - 1].resourceType}<span class="divider"></span>{/if}
				{@render buildingButton(building)}
			{/each}
			<span class="divider"></span>
			<button
				class="tile upgrade"
				data-resource="knowledge"
				data-tutorial="technologies"
				style:background-image={pieceImage('technologies')}
				title="Technologies: discover technologies"
				aria-label="Technologies"
				onclick={() => onOpenInvestment('technology')}
			></button>
			<button
				class="tile upgrade"
				data-resource="power"
				data-tutorial="policies"
				style:background-image={pieceImage('policies')}
				title="Policies: implement policies"
				aria-label="Policies"
				onclick={() => onOpenInvestment('policy')}
			></button>
			<span class="divider"></span>
		</div>
	</div>

	<!-- the units as round tiles with their picture and their costs on them, in rows like the buildings -->
	<div class="buildings units" data-tutorial="units" style:--tile-size="{tileSize}rem" style:--tile-gap="{tileGap}rem">
		<div class="flow">
			{#each unitsInOrder as unit (unit.name)}
				<button
					class="tile unit"
					data-resource={unit.resourceType}
					style:background-image={pieceImage(unitImage(unit.name))}
					disabled={!canBuyUnit(unit)}
					onmouseenter={(event) => (hovered = { unit, rect: event.currentTarget.getBoundingClientRect() })}
					onmouseleave={() => (hovered = null)}
					onclick={() => onBuyUnit(unit.name as Unit['type'])}
					aria-label={unit.name}
				>
					{@render costIcons(costOfUnit(unit))}
				</button>
			{/each}
		</div>
	</div>

	<div class="turn" data-tutorial="turn">
		{#if currentPlayer}
			<span class="turn-label">{isMyTurn ? 'Your turn' : `${fullName(game, currentPlayer)}'s turn`}</span>
			{#if secondsLeft !== null}
				<span class="timer" class:urgent={secondsLeft <= 10}>{timeLabel(secondsLeft)}</span>
			{/if}
		{/if}
		<button class="primary" disabled={!isMyTurn} onclick={onEndTurn}>End turn</button>
		<button onclick={onQuit}>Quit game</button>
	</div>
</section>

<style>
	.actions {
		display: grid;
		grid-template-columns: minmax(0, 6.5fr) minmax(0, 2.5fr) minmax(0, 1fr);
		gap: 1rem;
		grid-area: actions;
		padding: 1rem 3rem;
		overflow-x: auto;

		background-color: var(--color-grayscale-2);
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

	.tip ul {
		margin: 0;
		padding-left: 1rem;
	}

	.tip-name {
		font-weight: 700;
		text-transform: capitalize;
	}

	.buildings {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	/* a gray line on either side of the units, like the line before the technologies */
	.units {
		padding: 0 1rem;

		border-right: 1px solid var(--color-grayscale-4);
		border-left: 1px solid var(--color-grayscale-4);
	}

	/* the units in columns centered as a whole, so they are as far from both lines; a last row still starts on the left */
	.units .flow {
		display: grid;
		grid-template-columns: repeat(auto-fill, var(--tile-size));
		justify-content: center;
	}

	/* more room at the bottom for the side of the tiles */
	.flow {
		display: flex;
		flex-wrap: wrap;
		gap: calc(var(--tile-gap) + 0.25rem) var(--tile-gap);
		padding-bottom: 0.25rem;
	}

	/* a gray line before the technologies and after the policies */
	.divider {
		width: 1px;
		height: var(--tile-size);

		background-color: var(--color-grayscale-4);
	}

	/* in the action bar the border shows the resource of a tile, on the board the owner's color */
	button.tile {
		--player-color: var(--resource-color, var(--color-grayscale-4));

		display: flex;
		flex: none;
		justify-content: center;
		align-items: center;
		width: var(--tile-size);
		height: var(--tile-size);
		padding: 0;
	}

	/* the technologies and policies: their name on their resource color */
	button.tile.unit {
		/* as thick as the units on the board (.unit-marker in Board) */
		--height: 0.3rem;

		border-radius: 50%;
	}

	.cost-icons {
		display: flex;
		align-items: center;
		gap: 0.1rem;
	}

	.building-stats {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.2;
	}

	.cost-icons :global(.cost-person) {
		width: 0.8rem;
		height: 0.8rem;
		margin-right: 0.15rem;
		filter: drop-shadow(0 0 1px white) drop-shadow(0 0 1px white);
	}

	.cost-circle {
		width: 0.7rem;
		height: 0.7rem;

		background-color: var(--resource-color);
		border: 1px solid black;
		border-radius: 50%;
	}

	button.tile:hover:not(:disabled) {
		background-color: var(--resource-color, transparent);
		filter: brightness(1.15);
	}

	button.tile.selected {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.tile-stats {
		color: black;
		font: var(--font-small);
		font-weight: 800;
		white-space: nowrap;
		text-shadow:
			0 0 2px white,
			0 0 3px white;
	}

	.turn {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: stretch;
		gap: 0.5rem;
		text-align: center;
	}

	.turn-label {
		font: var(--font-button);
		overflow-wrap: break-word;
	}

	.timer {
		font: var(--font-heading);
	}

	.timer.urgent {
		color: var(--color-danger);
	}
</style>
