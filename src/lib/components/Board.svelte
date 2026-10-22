<script lang="ts">
	import { bribeGold, cityCentreProduction, resourceTypes, units, type ResourceType } from '#lib/game/config.ts';
	import { canSetCityCentre, faithUnitsAt, fullName, getBuildingStats, getPlayer, unitImage, unitTargets, validCells } from '#lib/game/logic.ts';
	import type { PublicGameState, Unit } from '#lib/game/types.ts';

	let {
		game,
		playerId,
		selectedBuilding,
		onPlace,
		onSetCityCentre,
		onOpenOverview,
		onBribe,
		scale = $bindable(1)
	}: {
		game: PublicGameState;
		playerId: string | null;
		selectedBuilding: string | null;
		onPlace: (x: number, y: number) => void;
		onSetCityCentre: (resource: ResourceType) => void;
		onOpenOverview: (playerId: string) => void; // clicking an opponent's city centre
		onBribe?: (unit: Unit) => void; // with Bribery: clicking an opponent's unit on your building
		scale?: number; // the zoom, so pieces outside the board can match its size
	} = $props();

	// Clicking your own city centre during your turn opens a dropdown to choose what it produces.
	let isChoosingCentre = $state(false);
	const canChooseCentre = $derived(!!playerId && canSetCityCentre(game, playerId));
	$effect(() => {
		if (!canChooseCentre) isChoosingCentre = false;
	});

	// The picture of a building or unit in static/images/pieces, e.g. "scribe's chamber" -> scribes-chamber.jpg
	const pieceImage = (name: string) =>
		`url('/games/citystates/images/pieces/${name.replace(/'/g, '').replace(/\s+/g, '-')}.jpg')`;

	// Hover text of a building: its name and, except for farms and estates, what it produces.
	const buildingTitle = (type: string) => {
		const stats = getBuildingStats(type);
		const name = type[0].toUpperCase() + type.slice(1);
		return stats.production ? `${name}\n+${stats.production} ${stats.resourceType}` : name;
	};

	const cellSize = 48; // px, keep in sync with --board-cell-size in app.css
	const gap = 2;

	let viewport: HTMLDivElement;
	let width = $state(0);
	let height = $state(0);
	let offset = $state({ x: 0, y: 0 });
	let hasFitted = false;

	const boardSize = $derived(game.gridSize * (cellSize + gap) + gap);
	// where the selected building, or unit, can go
	const valid = $derived.by(() => {
		if (!selectedBuilding || !playerId) return new Set<string>();
		if (units.some((u) => u.name === selectedBuilding)) return unitTargets(game, playerId, selectedBuilding as Unit['type']);
		return validCells(game, playerId, selectedBuilding);
	});

	// The side of the board your city is on, so the board can be turned in quarter turns to put it at the bottom.
	// Spectators see the board as it is.
	const side = $derived.by(() => {
		const center = game.players.find((p) => p.id === playerId)?.center;
		if (!center) return 'bottom';
		const dx = center.x - (game.gridSize - 1) / 2;
		const dy = center.y - (game.gridSize - 1) / 2;
		if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'top' : 'bottom';
		return dx < 0 ? 'left' : 'right';
	});

	const cells = $derived.by(() => {
		const content = new Map<
			string,
			| { kind: 'building'; type: string; color: string }
			| { kind: 'center'; color: string; name: string; playerId: string; resource: ResourceType | null }
		>();
		for (const building of game.buildings) {
			content.set(`${building.x},${building.y}`, {
				kind: 'building',
				type: building.type,
				color: getPlayer(game, building.ownerId).color
			});
		}
		for (const player of game.players) {
			content.set(`${player.center.x},${player.center.y}`, {
				kind: 'center',
				color: player.color,
				name: fullName(game, player),
				playerId: player.id,
				resource: player.cityCentreResource ?? null
			});
		}
		// cells in display order, turned so your own city is on the bottom side
		const last = game.gridSize - 1;
		return Array.from({ length: game.gridSize * game.gridSize }, (_, i) => {
			const column = i % game.gridSize;
			const row = Math.floor(i / game.gridSize);
			const [x, y] = {
				bottom: [column, row],
				top: [last - column, last - row],
				right: [row, last - column],
				left: [last - row, column]
			}[side];
			return { x, y, key: `${x},${y}`, content: content.get(`${x},${y}`) };
		});
	});

	// The scale at which the whole board fits in view; you cannot zoom out further than this.
	const fitScale = $derived(Math.min(width / boardSize, height / boardSize, 1.5) * 0.95);

	// Fit the whole board in view the first time it is shown.
	$effect(() => {
		if (hasFitted || !width || !height || !game.gridSize) return;
		scale = fitScale;
		offset = { x: (width - boardSize * scale) / 2, y: (height - boardSize * scale) / 2 };
		hasFitted = true;
	});

	const zoom = (event: WheelEvent) => {
		event.preventDefault();
		const rect = viewport.getBoundingClientRect();
		const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		const next = Math.min(3, Math.max(fitScale, scale * (event.deltaY < 0 ? 1.1 : 0.9)));
		offset = {
			x: cursor.x - ((cursor.x - offset.x) * next) / scale,
			y: cursor.y - ((cursor.y - offset.y) * next) / scale
		};
		scale = next;
	};

	// Dragging pans the board; a drag that moved does not count as a click.
	let drag: { x: number; y: number; startX: number; startY: number } | null = null;
	let hasMoved = false;

	const startPan = (event: PointerEvent) => {
		if (event.button !== 0) return;
		drag = { x: event.clientX, y: event.clientY, startX: offset.x, startY: offset.y };
		hasMoved = false;
	};

	const pan = (event: PointerEvent) => {
		if (!drag) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (Math.abs(dx) + Math.abs(dy) > 4) hasMoved = true;
		if (hasMoved) offset = { x: drag.startX + dx, y: drag.startY + dy };
	};

	const clickCell = (cell: (typeof cells)[number]) => {
		if (hasMoved) return;
		if (valid.has(cell.key)) onPlace(cell.x, cell.y);
		else if (cell.content?.kind === 'center' && cell.content.playerId !== playerId) onOpenOverview(cell.content.playerId);
		else if (cell.content?.kind === 'center' && canChooseCentre) isChoosingCentre = true;
	};
</script>

<svelte:window onpointermove={pan} onpointerup={() => (drag = null)} />

<div
	class="viewport"
	class:placing={!!selectedBuilding}
	bind:this={viewport}
	bind:clientWidth={width}
	bind:clientHeight={height}
	onwheel={zoom}
	onpointerdown={startPan}
	role="application"
	aria-label="Game board"
>
	<div
		class="board"
		style:--grid-size={game.gridSize}
		style:transform="translate({offset.x}px, {offset.y}px) scale({scale})"
	>
		{#each cells as cell (cell.key)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="cell"
				class:valid={valid.has(cell.key)}
				role="gridcell"
				tabindex="-1"
				onclick={() => clickCell(cell)}
				ondragover={(event) => valid.has(cell.key) && event.preventDefault()}
				ondrop={(event) => {
					event.preventDefault();
					if (valid.has(cell.key)) onPlace(cell.x, cell.y);
				}}
			>
				{#if cell.content?.kind === 'building'}
					<span
						class="building"
						data-color={cell.content.color}
						data-resource={getBuildingStats(cell.content.type).resourceType}
						style:background-image={pieceImage(cell.content.type)}
						title={buildingTitle(cell.content.type)}
					></span>
					<!-- an army (or mercenary) or a spy sits on the top left of the building (armies only go on F&E, spies never), missionaries and inquisitors stacked on the top right -->
					{#each (game.units ?? []).filter((u) => u.x === cell.x && u.y === cell.y) as unit (unit.id)}
						{@const owner = getPlayer(game, unit.ownerId)}
						{@const canBribe = !!onBribe && cell.content.ownerId === playerId && unit.ownerId !== playerId}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<span
							class:bribable={canBribe}
							onclick={(event) => {
								if (!canBribe) return;
								event.stopPropagation();
								onBribe?.(unit);
							}}
							class="unit-marker {unit.type}"
							data-color={owner.color}
							style:--stack={faithUnitsAt(game, cell.x, cell.y).indexOf(unit)}
							style:background-image={pieceImage(unitImage(unit.type))}
							title={`${unit.type[0].toUpperCase() + unit.type.slice(1)} of ${fullName(game, owner)}${canBribe ? `\nClick to bribe it away for ${bribeGold} gold` : ''}`}
						></span>
					{/each}
				{:else if cell.content?.kind === 'center'}
					{@const centre = cell.content}
					{@const isMine = centre.playerId === playerId}
					<span
						class="building city-centre"
						class:choosable={isMine && canChooseCentre}
						class:opponent={!isMine}
						data-color={centre.color}
						data-resource={centre.resource ?? 'none'}
						style:background-image={pieceImage('city centre')}
						title={!game.isCityCentreEnabled
							? 'City centre'
							: centre.resource
								? `City centre\n+${cityCentreProduction} ${centre.resource}`
								: 'City centre\nNo resource chosen yet'}
					>
						{#if centre.resource}<span class="centre-resource">{centre.resource}</span>{/if}
					</span>
					{#if isMine && isChoosingCentre}
						<select
							class="centre-select"
							value={centre.resource ?? ''}
							onpointerdown={(event) => event.stopPropagation()}
							onclick={(event) => event.stopPropagation()}
							onchange={(event) => {
								onSetCityCentre(event.currentTarget.value as ResourceType);
								isChoosingCentre = false;
							}}
							onblur={() => (isChoosingCentre = false)}
							{@attach (node) => node.focus()}
						>
							<option value="" disabled>Choose a resource</option>
							{#each resourceTypes as resource (resource)}
								<option value={resource}>{resource[0].toUpperCase() + resource.slice(1)}</option>
							{/each}
						</select>
					{/if}
					<span class="name">{centre.name}</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;

		background-color: var(--color-grayscale-1);

		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	.viewport.placing .cell.valid {
		cursor: pointer;
	}

	.board {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--grid-size), var(--board-cell-size));
		grid-auto-rows: var(--board-cell-size);
		gap: 2px;
		width: max-content;
		padding: 2px;

		transform-origin: 0 0;
	}

	/* the board image */
	.board::before {
		position: absolute;
		inset: 0;
		z-index: -1;

		background: url('/games/citystates/images/board-background.jpg') center / cover no-repeat;
		border-radius: 5px;
		/* filter: grayscale(0.25) contrast(0.95) brightness(1.05); */
		content: '';
	}

	.cell {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;

		background-color: var(--color-board-cell);
		box-shadow: 0 0 0 1px var(--color-board-line);
	}

	.cell.valid {
		background-color: var(--color-valid-cell);
	}

	.building {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 90%;
		height: 90%;
		overflow: hidden;
		text-align: center;

		background: var(--resource-color, transparent) center / cover no-repeat;
		color: var(--color-grayscale-1);
		border: 3px solid var(--player-color);
		border-radius: var(--border-radius);
		font: var(--font-tiny);
		font-size: 0.55rem;
		line-height: 1.1;
	}

	/* the city centre looks like a building in your color, filled with the chosen resource's color */
	.unit-marker {
		position: absolute;
		top: -14%;
		z-index: 2;
		width: 55%;
		height: 55%;

		background: center / cover no-repeat;
		border: 2px solid var(--player-color);
		border-radius: 50%;
	}

	/* with Bribery, an opponent's unit on your building can be clicked away */
	.unit-marker.bribable {
		cursor: pointer;
	}

	.unit-marker.bribable:hover {
		outline: 2px solid var(--color-accent);
	}

	.unit-marker.army,
	.unit-marker.mercenary,
	.unit-marker.spy {
		left: -14%;
	}

	/* the first missionary (or inquisitor) on top; each next one lies under it, shifted left by a fifth of its width so less than a quarter shows */
	.unit-marker.missionary,
	.unit-marker.inquisitor {
		right: calc(-14% + var(--stack) * 11%);
		z-index: calc(20 - var(--stack));
	}

	/* the city centre shows its chosen resource in a strip at the bottom */
	.city-centre {
		position: relative;
	}

	.centre-resource {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;

		background-color: var(--resource-color);
		color: var(--color-grayscale-1);
		font-weight: 700;
	}

	.city-centre.choosable,
	.city-centre.opponent {
		cursor: pointer;
	}

	.centre-select {
		position: absolute;
		top: 100%;
		left: 50%;
		z-index: 3;
		padding: 0.1rem 0.3rem;

		font: var(--font-tiny);

		transform: translateX(-50%);
	}

	.name {
		position: absolute;
		bottom: 95%;
		left: 50%;
		z-index: 1;
		width: max-content;
		padding: 0 0.3rem;
		white-space: nowrap;

		background-color: var(--color-backdrop);
		color: var(--color-grayscale-6);
		border-radius: var(--border-radius);
		font: var(--font-tiny);

		transform: translateX(-50%);
	}
</style>
