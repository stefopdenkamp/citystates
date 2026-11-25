<script lang="ts">
	import { bribeGold, resourceTypes, units, wallRing, type ResourceType } from '#lib/game/config.ts';
	import {
		buildingSize,
		canSetCityCentre,
	canSpend,
		cityCentreAmount,
		hasEffect,
		faithUnitsAt,
		footprint,
		fullName,
		getBuildingStats,
		getPlayer,
		pieceImage,
		unitImage,
		unitTargets,
		validCells
	} from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer, Unit } from '#lib/game/types.ts';
	import type { Snippet } from 'svelte';

	let {
		game,
		playerId,
		selectedBuilding,
		onPlace,
		onSetCityCentre,
		onBribe,
		playerBoard,
		scale = $bindable(1)
	}: {
		game: PublicGameState;
		playerId: string | null;
		selectedBuilding: string | null;
		onPlace: (x: number, y: number) => void;
		onSetCityCentre: (resource: ResourceType) => void;
		onBribe?: (unit: Unit) => void; // with Ambassador bribes: clicking an opponent's unit on your building
		playerBoard: Snippet<[PublicPlayer, boolean]>; // a player's board next to the grid, vertical on the left and right edges
		scale?: number; // the zoom, so a building dragged onto the board can match its size
	} = $props();

	// Clicking your own city centre during your turn opens a dropdown to choose what it produces.
	let isChoosingCentre = $state(false);
	const canChooseCentre = $derived(!!playerId && canSetCityCentre(game, playerId));
	$effect(() => {
		if (!canChooseCentre) isChoosingCentre = false;
	});

	// Hover text of a building: its name and, except for farms and estates, what it produces.
	const buildingTitle = (type: string) => {
		const stats = getBuildingStats(type);
		const name = type[0].toUpperCase() + type.slice(1);
		return stats.production ? `${name}\n+${stats.production} ${stats.resourceType}` : name;
	};

	let viewport: HTMLDivElement;
	let width = $state(0);
	let height = $state(0);
	let offset = $state({ x: 0, y: 0 });
	let hasFitted = false;
	// the grid with the player boards around it, which zoom and move together
	let worldWidth = $state(0);
	let worldHeight = $state(0);

	// where the selected building (the cell of its corner with the lowest x and y), or unit (the building it goes on), can go
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
		const content = new Map<string, { kind: 'center'; color: string; name: string; playerId: string; resource: ResourceType | null }>();
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
			return { x, y, column, row, key: `${x},${y}`, content: content.get(`${x},${y}`) };
		});
	});

	// Where each cell of the board is shown.
	const shownAt = $derived(new Map(cells.map((c) => [c.key, c])));

	// The wall around each city centre, around the rings up to wallRing (for now only a border).
	const walls = $derived(
		game.players.map((player) => {
			const { column, row } = shownAt.get(`${player.center.x},${player.center.y}`)!;
			return { id: player.id, color: player.color, column: column - wallRing, row: row - wallRing };
		})
	);

	// Buildings cover a square of cells (farms 2×2, estates 3×3); shown from the top left cell as you see the board.
	const placed = $derived(
		game.buildings.map((building) => {
			const size = buildingSize(building.type);
			const shown = footprint(building.x, building.y, size).map((c) => shownAt.get(`${c.x},${c.y}`)!);
			return {
				building,
				size,
				key: `${building.x},${building.y}`,
				column: Math.min(...shown.map((c) => c.column)),
				row: Math.min(...shown.map((c) => c.row)),
				color: getPlayer(game, building.ownerId).color
			};
		})
	);

	// Placing a building: the cursor is on the top left cell of a farm and the middle cell of an estate, as you see
	// the board. This gives the cells it would cover and its corner with the lowest x and y.
	const isUnitSelected = $derived(units.some((u) => u.name === selectedBuilding));
	const placingSize = $derived(selectedBuilding && !isUnitSelected ? buildingSize(selectedBuilding) : 0);
	const coverAt = (column: number, row: number) => {
		const first = Math.floor((placingSize - 1) / 2);
		const covered = [];
		for (let dr = 0; dr < placingSize; dr++) {
			for (let dc = 0; dc < placingSize; dc++) {
				const c = column - first + dc;
				const r = row - first + dr;
				if (c < 0 || r < 0 || c >= game.gridSize || r >= game.gridSize) return null;
				covered.push(cells[r * game.gridSize + c]);
			}
		}
		const x = Math.min(...covered.map((c) => c.x));
		const y = Math.min(...covered.map((c) => c.y));
		return { x, y, isValid: valid.has(`${x},${y}`), column: column - first, row: row - first };
	};
	// Where the building goes with the cursor on this cell: held as usual when it fits there, otherwise the first place
	// where it fits and covers this cell (so every cell a farm or estate can cover can be clicked).
	const placementAt = (column: number, row: number) => {
		const usual = coverAt(column, row);
		if (usual?.isValid) return usual;
		const first = Math.floor((placingSize - 1) / 2);
		for (let dr = 0; dr < placingSize; dr++) {
			for (let dc = 0; dc < placingSize; dc++) {
				const cover = coverAt(column - dc + first, row - dr + first);
				if (cover?.isValid) return cover;
			}
		}
		return usual;
	};
	// the cells the selected building can cover: the highlighted cells
	const placeable = $derived(
		placingSize ? new Set(cells.filter((c) => placementAt(c.column, c.row)?.isValid).map((c) => c.key)) : new Set<string>()
	);
	// While placing a farm or estate, your own farms and estates it can go over let the cursor through to the cells
	// under them, so it can be placed anywhere over them.
	const isOverPlaceable = (building: { x: number; y: number; type: string }) =>
		placingSize > 1 &&
		footprint(building.x, building.y, buildingSize(building.type)).some((c) => placeable.has(`${c.x},${c.y}`));
	// the cell under the cursor while placing a building, to show what it would cover
	let hovered = $state<{ column: number; row: number } | null>(null);
	const preview = $derived(placingSize && hovered ? placementAt(hovered.column, hovered.row) : null);

	// The player boards by the edge their city centre is nearest to (as displayed), in the order along that edge.
	const edges = $derived.by(() => {
		const middle = (game.gridSize - 1) / 2;
		const result = { top: [], bottom: [], left: [], right: [] } as Record<'top' | 'bottom' | 'left' | 'right', { player: PublicPlayer; along: number }[]>;
		for (const player of game.players) {
			const i = cells.findIndex((c) => c.x === player.center.x && c.y === player.center.y);
			const dx = (i % game.gridSize) - middle;
			const dy = Math.floor(i / game.gridSize) - middle;
			if (Math.abs(dy) >= Math.abs(dx)) result[dy < 0 ? 'top' : 'bottom'].push({ player, along: dx });
			else result[dx < 0 ? 'left' : 'right'].push({ player, along: dy });
		}
		for (const edge of Object.values(result)) edge.sort((a, b) => a.along - b.along);
		return result;
	});

	// The scale at which the board and the player boards fit in view; you can zoom out 20% further than this.
	const fitScale = $derived(Math.min(width / worldWidth, height / worldHeight, 1.5) * 0.95);

	// Fit everything in view the first time it is shown.
	$effect(() => {
		if (hasFitted || !width || !height || !worldWidth || !worldHeight) return;
		scale = fitScale;
		offset = { x: (width - worldWidth * scale) / 2, y: (height - worldHeight * scale) / 2 };
		hasFitted = true;
	});

	const zoom = (event: WheelEvent) => {
		event.preventDefault();
		const rect = viewport.getBoundingClientRect();
		const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		const next = Math.min(3, Math.max(fitScale * 0.8, scale * (event.deltaY < 0 ? 1.1 : 0.9)));
		offset = {
			x: cursor.x - ((cursor.x - offset.x) * next) / scale,
			y: cursor.y - ((cursor.y - offset.y) * next) / scale
		};
		scale = next;
	};

	// Dragging pans the board; a drag that moved does not count as a click.
	let drag: { x: number; y: number; startX: number; startY: number } | null = null;
	let hasMoved = false;

	// A unit in your stock is dragged onto the board, so that does not pan it.
	const startPan = (event: PointerEvent) => {
		if (event.button !== 0) return;
		hasMoved = false;
		// dragging a unit from your stock moves that, not the board
		if ((event.target as HTMLElement).closest('[data-drag-unit]')) return;
		drag = { x: event.clientX, y: event.clientY, startX: offset.x, startY: offset.y };
	};

	const pan = (event: PointerEvent) => {
		if (!drag) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (Math.abs(dx) + Math.abs(dy) > 4) hasMoved = true;
		if (hasMoved) offset = { x: drag.startX + dx, y: drag.startY + dy };
	};

	// Places the selected building with the cursor on this cell.
	const placeAt = (cell: (typeof cells)[number]) => {
		const cover = placementAt(cell.column, cell.row);
		if (cover?.isValid) onPlace(cover.x, cover.y);
	};

	const clickCell = (cell: (typeof cells)[number]) => {
		if (hasMoved) return;
		if (isTarget(cell.key)) onPlace(cell.x, cell.y);
		else if (placeable.has(cell.key)) placeAt(cell);
		else if (cell.content?.kind === 'center' && canChooseCentre) isChoosingCentre = true;
	};

	// A unit goes on a building: any of its cells can be clicked or dropped on. With religious dominance a missionary or
	// inquisitor also goes on a city centre.
	const isTarget = (key: string) => isUnitSelected && valid.has(key);
	const clickBuilding = (building: { x: number; y: number }, key: string) => {
		if (hasMoved) return;
		if (isTarget(key)) onPlace(building.x, building.y);
		else if (placeable.has(key)) placeAt(shownAt.get(key)!);
	};
</script>

<!-- any press resets hasMoved, also one outside the board (dragging a building from the action selector) -->
<svelte:window onpointerdown={() => (hasMoved = false)} onpointermove={pan} onpointerup={() => (drag = null)} />

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
		class="world"
		style:transform="translate({offset.x}px, {offset.y}px) scale({scale})"
		bind:offsetWidth={worldWidth}
		bind:offsetHeight={worldHeight}
	>
	{#each Object.entries(edges) as [edge, boards] (edge)}
		{#if boards.length}
			<!-- a click that ends a drag does nothing on a player board either -->
			<div class="edge {edge}" onclickcapture={(event) => hasMoved && event.stopPropagation()} role="presentation">
				{#each boards as { player } (player.id)}
					<div class="slot">{@render playerBoard(player, edge === 'left' || edge === 'right')}</div>
				{/each}
			</div>
		{/if}
	{/each}
	<div class="board" style:--grid-size={game.gridSize} onpointerleave={() => (hovered = null)} role="presentation">
		{#each cells as cell (cell.key)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="cell"
				class:valid={placeable.has(cell.key) || isTarget(cell.key)}
				style:grid-column={cell.column + 1}
				style:grid-row={cell.row + 1}
				role="gridcell"
				tabindex="-1"
				onclick={() => clickCell(cell)}
				onpointerenter={() => (hovered = cell)}
			>
				{#if cell.content?.kind === 'center'}
					{@const centre = cell.content}
					{@const isMine = centre.playerId === playerId}
					{@const amount = cityCentreAmount(game, getPlayer(game, centre.playerId))}
					<span
						class="building tile city-centre"
						class:choosable={isMine && canChooseCentre}
						data-color={centre.color}
						style:background-image={pieceImage('city centre')}
						title={!amount
							? 'City centre'
							: centre.resource
								? `City centre\n+${amount} ${centre.resource}`
								: 'City centre\nNo resource chosen yet'}
					>
						<!-- a circle in the chosen resource's color, with Grand Palazzo with what it produces in it -->
						{#if centre.resource}
							<span class="centre-resource" data-resource={centre.resource}>{hasEffect(getPlayer(game, centre.playerId), 'grandPalazzo') ? amount : ''}</span>
						{/if}
					</span>
					<!-- the missionaries and inquisitors of religious dominance, stacked on the top right like on a building -->
					{#each faithUnitsAt(game, cell.x, cell.y) as unit, i (unit.id)}
						{@const owner = getPlayer(game, unit.ownerId)}
						<span
							class="unit-marker tile {unit.type}"
							data-color={owner.color}
							style:--stack={i}
							style:background-image={pieceImage(unitImage(unit.type))}
							title={`${unit.type[0].toUpperCase() + unit.type.slice(1)} of ${fullName(game, owner)}: religious dominance over ${centre.name}`}
						></span>
					{/each}
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

		<!-- the walls, then over them the buildings; both in the board's layer, so every unit (z-index) is in front of all buildings -->
		{#each walls as wall (wall.id)}
			<div class="wall" data-color={wall.color} style:grid-column="{wall.column + 1} / span {2 * wallRing + 1}" style:grid-row="{wall.row + 1} / span {2 * wallRing + 1}"></div>
		{/each}

		<!-- the buildings over the cells they cover, with their units -->
		{#each placed as { building, size, key, column, row, color } (building.id)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="placed"
				class:valid={isTarget(key) || placeable.has(key)}
				class:pass-through={isOverPlaceable(building)}
				style:grid-column="{column + 1} / span {size}"
				style:grid-row="{row + 1} / span {size}"
				role="gridcell"
				tabindex="-1"
				onclick={() => clickBuilding(building, key)}
				onpointerenter={() => (hovered = placeable.has(key) ? shownAt.get(key)! : null)}
			>
				<span
					class="building tile"
					class:in-wall={getBuildingStats(building.type).resourceType !== 'people'}
					data-color={color}
					data-resource={getBuildingStats(building.type).resourceType}
					style:background-image={pieceImage(building.type)}
					title={buildingTitle(building.type)}
				></span>
				<!-- an army (or mercenary) or a spy sits on the top left of the building (armies only go on F&E, spies never), missionaries and inquisitors stacked on the top right -->
				{#each (game.units ?? []).filter((u) => u.x === building.x && u.y === building.y) as unit (unit.id)}
					{@const owner = getPlayer(game, unit.ownerId)}
					{@const price = bribeGold[unit.type as keyof typeof bribeGold]}
					{@const canBribe = !!onBribe && building.ownerId === playerId && unit.ownerId !== playerId && !!price && canSpend(game, getPlayer(game, playerId!), [{ amount: price, resourceType: 'gold' }])}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<span
						class:bribable={canBribe}
						onclick={(event) => {
							if (!canBribe) return;
							event.stopPropagation();
							onBribe?.(unit);
						}}
						class="unit-marker tile {unit.type}"
						data-color={owner.color}
						style:--stack={faithUnitsAt(game, building.x, building.y).indexOf(unit)}
						style:background-image={pieceImage(unitImage(unit.type))}
						title={`${unit.type[0].toUpperCase() + unit.type.slice(1)} of ${fullName(game, owner)}${canBribe ? `\nClick to bribe it away for ${price} gold` : ''}`}
					></span>
				{/each}
			</div>
		{/each}

		<!-- what the selected building would cover, under the cursor -->
		{#if preview}
			<div
				class="preview"
				class:valid={preview.isValid}
				style:grid-column="{preview.column + 1} / span {placingSize}"
				style:grid-row="{preview.row + 1} / span {placingSize}"
			></div>
		{/if}
	</div>
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

	.viewport.placing .cell.valid,
	.viewport.placing .placed.valid {
		cursor: pointer;
	}

	/* the grid in the middle, the player boards along its edges */
	.world {
		--edge-gap: 1.5rem;

		display: grid;
		grid-template-areas:
			'. top .'
			'left board right'
			'. bottom .';
		grid-template-columns: auto max-content auto;
		width: max-content;

		transform-origin: 0 0;
	}

	/* spread along the edge, as close to the grid as they can be */
	.edge {
		display: flex;
		justify-content: space-around;
		grid-area: top;
	}

	.edge.top {
		align-items: flex-end;
		padding-bottom: var(--edge-gap);
	}

	.edge.bottom {
		align-items: flex-start;
		grid-area: bottom;
		padding-top: var(--edge-gap);
	}

	.edge.left,
	.edge.right {
		flex-direction: column;
		align-self: center;
		height: 100%;
	}

	.edge.left {
		align-items: flex-end;
		grid-area: left;
		padding-right: var(--edge-gap);
	}

	.edge.right {
		align-items: flex-start;
		grid-area: right;
		padding-left: var(--edge-gap);
	}

	/* as wide as the grid, without making it wider */
	.edge.top,
	.edge.bottom {
		width: 0;
		min-width: 100%;
	}

	/* 9 cells wide (with the gaps between them) */
	.edge.top .slot,
	.edge.bottom .slot {
		width: calc(9 * var(--board-cell-size) + 8 * 2px);
	}

	.edge.left .slot,
	.edge.right .slot {
		width: 16rem;
	}

	.board {
		position: relative;
		display: grid;
		grid-area: board;
		align-self: center;
		grid-template-columns: repeat(var(--grid-size), var(--board-cell-size));
		grid-auto-rows: var(--board-cell-size);
		gap: 2px;
		width: max-content;
		padding: 2px;
	}

	/* the board image */
	.board::before {
		position: absolute;
		inset: 0;
		z-index: -1;

		background: url('/images/board-background.jpg') center / cover no-repeat;
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

	/* a building over the cells it covers (2×2 for a farm, 3×3 for an estate) */
	/* the cells under it get the cursor (see isOverPlaceable), and show it can be covered */
	.placed.pass-through {
		outline: 2px solid var(--color-valid-cell);
		outline-offset: -2px;

		pointer-events: none;
	}

	/* no z-index, so its units are layered with all buildings, not only its own */
	.placed {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.placed .building {
		width: calc(100% - var(--board-cell-size) * 0.1);
		height: calc(100% - var(--board-cell-size) * 0.1);
	}

	/* inside a wall a building's border (and side) is in its resource color; farms and estates keep the owner's color */
	.placed .building.in-wall {
		--player-color: var(--resource-color);
	}

	/* a unit can go on this building */
	.placed.valid {
		background-color: var(--color-valid-cell);
		border-radius: var(--border-radius);
	}

	/* the wall around a city centre and the cells inside it: over the cells, under the buildings and their units; in the
	   owner's color, with its dark edges in the wall color */
	.wall {
		position: relative;
		margin: -3px;

		border: 3px solid var(--player-color);
		border-radius: 2px;
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-wall), black 45%), inset 0 0 0 1px color-mix(in srgb, var(--color-wall), black 45%);

		pointer-events: none;
	}

	/* what the selected building would cover */
	/* red where it cannot be placed, white where it can */
	.preview {
		z-index: 25;

		border: 2px solid var(--color-danger);
		border-radius: var(--border-radius);

		pointer-events: none;
	}

	.preview.valid {
		border-color: white;
	}

	.building {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 90%;
		height: 90%;
		overflow: hidden;
		text-align: center;

		color: var(--color-grayscale-1);
		font: var(--font-tiny);
		font-size: 0.55rem;
		line-height: 1.1;
	}

	/* the city centre looks like a building in your color, filled with the chosen resource's color */
	/* a round tile seen from above, like the units in the action selector (button.tile.unit there; .tile in
	   app.css), with the owner's color as its border */
	.unit-marker {
		--height: 0.2rem;

		position: absolute;
		top: calc(var(--board-cell-size) * -0.14 + 2px);
		z-index: 2;
		width: calc(var(--board-cell-size) * 0.55);
		height: calc(var(--board-cell-size) * 0.55);

		border-radius: 50%;
	}

	/* with Ambassador bribes, an opponent's unit on your building can be clicked away */
	.unit-marker.bribable {
		cursor: pointer;
	}

	.unit-marker.bribable:hover {
		filter: drop-shadow(0 0 1px var(--color-accent)) drop-shadow(0 0 2px var(--color-accent));
	}

	.unit-marker.army,
	.unit-marker.mercenary,
	.unit-marker.spy {
		left: calc(var(--board-cell-size) * -0.14 + 2px);
	}

	/* the first missionary (or inquisitor) on top; each next one lies under it, shifted left by a fifth of its width so less than a quarter shows */
	.unit-marker.missionary,
	.unit-marker.inquisitor {
		right: calc(var(--board-cell-size) * (-0.14 + var(--stack) * 0.11) + 2px);
		z-index: calc(20 - var(--stack));
	}

	/* the city centre shows its chosen resource in a strip at the bottom */
	.city-centre {
		position: relative;
	}

	/* a fixed size, so the number in it cannot stretch it */
	.centre-resource {
		display: flex;
		flex: none;
		justify-content: center;
		align-items: center;
		width: calc(var(--board-cell-size) * 0.42);
		height: calc(var(--board-cell-size) * 0.42);

		background-color: var(--resource-color);
		color: black;
		border: 1px solid black;
		border-radius: 50%;
		font: var(--font-tiny);
		font-weight: 800;
		line-height: 1;
	}

	.city-centre.choosable {
		cursor: pointer;
	}

	.centre-select {
		position: absolute;
		top: 100%;
		left: 50%;
		z-index: 30;
		padding: 0.1rem 0.3rem;

		font: var(--font-tiny);

		transform: translateX(-50%);
	}

	.name {
		position: absolute;
		bottom: 95%;
		left: 50%;
		z-index: 21;
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
