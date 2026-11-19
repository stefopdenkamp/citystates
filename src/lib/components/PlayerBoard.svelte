<script lang="ts">
	import { frescoCost, policySlots, propagandaCost, resourceTypes, talentResource, units, type ResourceType } from '#lib/game/config.ts';
	import { canSpend, fullName, getBuildingStats, overviewText, peopleCap, peopleCount, peopleText, pieceImage, resourceCap, resourceOverview, resourceProduction, unitImage } from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer, Unit } from '#lib/game/types.ts';
	import { confirmPopup } from '#lib/client/popup.svelte.ts';
	import PersonIcon from './PersonIcon.svelte';

	// A player's board next to the game board: their policies in effect, people, resources and unused units.
	// - vertical: the variant on the left and right edges, with the parts stacked
	// - isTrading: in the trade dialog, where only the resources matter (the rest is greyed out)
	// - onPick: the resource circles can be picked, for a trade
	// - onPropaganda / onIndoctrinate: their regular people / talents can be clicked to win them over for culture
	// - onRetrain: your own talents can be clicked to reeducate them (Reeducation programs)
	// - onSelectUnit: your own stock, whose units are dragged (or clicked, then a target) to place them
	// - isTarget / onTarget: a trader can be put on this board to trade with its player
	let {
		game,
		player,
		vertical = false,
		isTrading = false,
		selected = [],
		onPick,
		me = null,
		onPropaganda,
		onIndoctrinate,
		onRetrain,
		selectedUnit = null,
		canUseUnits = false,
		onSelectUnit,
		isTarget = false,
		onTarget,
		isMine = false
	}: {
		game: PublicGameState;
		player: PublicPlayer;
		vertical?: boolean;
		isTrading?: boolean;
		selected?: number[];
		onPick?: (i: number) => void;
		me?: PublicPlayer | null; // you, to see whether you can afford winning people over
		onPropaganda?: () => void;
		onIndoctrinate?: (index: number) => void;
		onRetrain?: (index: number) => void;
		selectedUnit?: string | null;
		canUseUnits?: boolean;
		onSelectUnit?: (unit: Unit['type'] | null) => void;
		isTarget?: boolean;
		onTarget?: () => void;
		isMine?: boolean; // your own board: the tutorial points at your people and resources
	} = $props();

	const canPayCulture = (amount: number) => !!me && canSpend(game, me, [{ amount, resourceType: 'culture' }]);
	const policies = $derived(player.policiesInEffect ?? []);
	// one circle per single resource, in resource order
	const circles = $derived(resourceTypes.flatMap((resource) => Array.from({ length: player.resources[resource] }, () => resource)));
	const unitStats = (unit: string) => units.find((u) => u.name === unit)!;
	const capitalized = (text: string) => text[0].toUpperCase() + text.slice(1);
	// Whether an opponent's unit of one of these types sits on one of this player's buildings of that resource: an
	// army blocks the people cap, a spy lowers a cap, a missionary or inquisitor blocks production.
	const isBlocked = (resource: string, types: Unit['type'][]) =>
		(game.units ?? []).some((u) => {
			const b = game.buildings.find((b) => b.x === u.x && b.y === u.y);
			return types.includes(u.type) && u.ownerId !== player.id && b?.ownerId === player.id && getBuildingStats(b.type).resourceType === resource;
		});
	// Whether this player's units raise their cap: spies a resource cap (Tradecraft), armies the people cap
	// (Centralized logistics).
	const isRaisedByUnits = (resource: ResourceType | 'people') =>
		resourceOverview(game, player.id, resource).cap.some((line) => ['spy', 'army', 'mercenary'].includes(line.source) && line.amount > 0);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="player-board"
	class:vertical
	class:target={isTarget}
	data-color={player.color}
	onclick={(event) => isTarget && !(event.target as HTMLElement).closest('button') && onTarget?.()}
	ondragover={(event) => isTarget && event.preventDefault()}
	ondrop={(event) => {
		event.preventDefault();
		if (isTarget) onTarget?.();
	}}
>
	<h2>{fullName(game, player)}</h2>

	<div class="policies" class:greyed={isTrading}>
		{#each { length: policySlots }, i (i)}
			<span class="policy" class:filled={!!policies[i]}>{policies[i] ?? 'Empty policy slot'}</span>
		{/each}
	</div>

	<!-- per resource on one line: the production with a circle in its color, then the cap ("+1 ● /5"); the amount is in the
	     resource pool -->
	<div class="amounts" class:greyed={isTrading}>
		{#each resourceTypes as resource (resource)}
			<div
				class="resource-amount"
				data-resource={resource}
				data-tutorial={isMine ? resource : undefined}
				title={`${capitalized(resource)}\n\n${overviewText(game, player.id, resource, 'production')}\n\n${overviewText(game, player.id, resource, 'cap')}`}
			>
				<span class="production">
					<span class:blocked={isBlocked(resource, ['missionary', 'inquisitor'])}>+{resourceProduction(game, player.id, resource)}</span>
					<span class="circle"></span>
				</span>
				<span class:blocked={isBlocked(resource, ['spy'])} class:raised={isRaisedByUnits(resource)}>/{resourceCap(game, player.id, resource)}</span>
			</div>
		{/each}
	</div>

	<div class="parts">
		<!-- regular people, then talents in the color of their resource; people cannot be traded -->
		<section class:greyed={isTrading} data-tutorial={isMine ? 'people' : undefined}>
			<h3>
				People
				<span class="amount" title={`${peopleText(player)}\n\n${overviewText(game, player.id, 'people', 'cap')}`}
					>{peopleCount(player)}/<span class:blocked={isBlocked('people', ['army', 'mercenary'])} class:raised={isRaisedByUnits('people')}>{peopleCap(game, player.id)}</span></span
				>
			</h3>
			<div class="pool">
				{#each { length: player.people }, i (i)}
					{#if onPropaganda}
						<button
							class="piece person"
							data-resource="people"
							disabled={!canPayCulture(propagandaCost)}
							title="Propaganda posters: win this person over for {propagandaCost} culture"
							onclick={async () => (await confirmPopup(`Do you want to buy this regular person for ${propagandaCost} culture?`)) && onPropaganda()}
						>
							<PersonIcon class="person" />
						</button>
					{:else}
						<span class="piece person" data-resource="people" title="Regular person"><PersonIcon class="person" /></span>
					{/if}
				{/each}
				{#each player.talents as talent, i (i)}
					{#if onIndoctrinate}
						<button
							class="piece person"
							data-resource={talentResource[talent]}
							disabled={!canPayCulture(frescoCost)}
							title="Fresco paintings: {talent}, {frescoCost} culture"
							onclick={async () => (await confirmPopup(`Do you want to buy this ${talent} for ${frescoCost} culture?`)) && onIndoctrinate(i)}
						>
							<PersonIcon class="person" />
						</button>
					{:else if onRetrain}
						<button class="piece person" data-resource={talentResource[talent]} title="Reeducate this {talent}" onclick={() => onRetrain(i)}>
							<PersonIcon class="person" />
						</button>
					{:else}
						<span class="piece person" data-resource={talentResource[talent]} title={talent}><PersonIcon class="person" /></span>
					{/if}
				{:else}
					{#if player.people === 0}<span class="none">No people</span>{/if}
				{/each}
			</div>
		</section>

		<section data-tutorial={isMine ? 'resources' : undefined}>
			<h3>Resources</h3>
			<div class="pool">
				{#each circles as resource, i (i)}
					{#if onPick}
						<button class="piece disk" class:selected={selected.includes(i)} data-resource={resource} title={resource} onclick={() => onPick(i)}
						></button>
					{:else}
						<span class="piece disk" data-resource={resource} title={resource}></span>
					{/if}
				{:else}
					<span class="none">No resources</span>
				{/each}
			</div>
		</section>

		<!-- units bought but not placed; on your own board they are your stock -->
		<section class:greyed={isTrading}>
			<h3>Units</h3>
			<div class="pool">
				{#each player.undeployedUnits ?? [] as unit, i (i)}
					{#if onSelectUnit}
						<button
							class="piece picture unit"
							class:selected={selectedUnit === unit}
							data-resource={unitStats(unit).resourceType}
							style:--image={pieceImage(unitImage(unit))}
							title={`${capitalized(unit)}\n${unitStats(unit).description}`}
							disabled={!canUseUnits}
							draggable={canUseUnits}
							ondragstart={(event) => {
								event.dataTransfer?.setData('text/plain', unit);
								onSelectUnit(unit);
							}}
							ondragend={(event) => event.dataTransfer?.dropEffect === 'none' && onSelectUnit(null)}
							onclick={() => onSelectUnit(selectedUnit === unit ? null : unit)}
							aria-label={unit}
						></button>
					{:else}
						<span
							class="piece picture unit"
							data-resource={unitStats(unit).resourceType}
							style:--image={pieceImage(unitImage(unit))}
							title={capitalized(unit)}
						></span>
					{/if}
				{:else}
					<span class="none">No unused units</span>
				{/each}
			</div>
		</section>
	</div>
</div>

<style>
	.player-board {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
		padding: 0.6rem 0.8rem;
		text-align: center;

		background-color: var(--color-grayscale-2);
		border: 3px solid var(--player-color);
		border-radius: var(--border-radius);
	}

	/* a trader can be put here */
	.player-board.target {
		background-color: var(--color-valid-cell);
		outline: 3px solid var(--color-accent);

		cursor: pointer;
	}

	h2 {
		margin: 0;

		color: var(--color-accent);
		font: var(--font-normal);
		font-weight: 700;
	}

	/* three policies of equal width, with a line between them, like the objectives */
	.policies {
		display: flex;
	}

	.policy {
		flex: 1 1 0;
		padding: 0.2rem 0.4rem;

		color: var(--color-grayscale-4);
		font: var(--font-tiny);
	}

	.policy.filled {
		color: var(--color-grayscale-6);
	}

	.policy:not(:last-child) {
		border-right: 1px solid var(--color-grayscale-5);
	}

	/* people, resources and units side by side; stacked on the vertical variant */
	.parts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}

	.vertical .parts {
		grid-template-columns: 1fr;
	}

	section {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	h3 {
		margin: 0;
		text-align: left;

		color: var(--color-grayscale-5);
		font: var(--font-tiny);
		font-weight: 700;
	}

	.amount {
		color: var(--color-grayscale-6);
		font-weight: 400;
	}

	.raised {
		color: var(--color-success);
	}

	/* after .raised: red wins when an opponent's spy lowers the cap too */
	.blocked {
		color: var(--color-danger);
	}

	/* between gray lines, like the line between the resources in the action selector */
	.amounts {
		display: flex;
		justify-content: space-around;
		flex-wrap: wrap;
		gap: 0.2rem 0.6rem;
		padding: 0.25rem 0;

		border-top: 1px solid var(--color-grayscale-4);
		border-bottom: 1px solid var(--color-grayscale-4);
	}

	.resource-amount {
		display: flex;
		align-items: center;
		gap: 0.2rem;

		color: var(--color-grayscale-6);
		font: var(--font-tiny);
		font-size: 0.62rem;
	}

	/* the circle right next to the production */
	.production {
		display: flex;
		align-items: center;
		gap: 0.05rem;
	}

	/* the color stays inside the black border, so no fringe of it shows around the circle when the board is zoomed */
	.circle {
		flex: none;
		width: 0.6rem;
		height: 0.6rem;

		background-color: var(--resource-color);
		background-clip: padding-box;
		border: 1px solid black;
		border-radius: 50%;
	}

	.pool {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-content: flex-start;
		align-items: flex-end;
		gap: 0.2rem;
		min-height: 2rem;
		margin-top: 0.2rem;
		padding: 0.3rem;

		border: 1px solid var(--color-grayscale-3);
		border-radius: var(--border-radius);
	}

	/* in a trade, what cannot be traded is greyed out */
	.greyed {
		opacity: 0.35;
		filter: grayscale(1);
	}

	/* the pieces in 3D (see .piece in app.css): resources are low disks, people cylinders like the units but narrower
	   with a person on top, units cylinders with their picture on top */
	.disk {
		--width: 1rem;
		--depth: 0.22rem;
	}

	.person {
		--width: 1.1rem;
		--depth: calc(0.45rem - 1px);
	}

	.unit {
		--width: 1.8rem;
		--depth: calc(0.45rem - 1px);
	}

	/* the person icon on the side of a person */
	/* the person icon on the top face of a person */
	.piece :global(.person) {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
		width: 100%;
		height: calc(var(--width) / 2);
		padding: 0.05rem;

		color: var(--color-grayscale-6);
	}

	button.piece:hover:not(:disabled) {
		background: none;
		filter: brightness(1.25);
	}

	button.piece.selected,
	button.piece.selected:hover:not(:disabled) {
		filter: drop-shadow(0 0 1px var(--color-accent)) drop-shadow(0 0 2px var(--color-accent));
	}

	button.unit {
		cursor: grab;
	}

	.none {
		align-self: center;
		margin: auto;

		color: var(--color-grayscale-4);
		font: var(--font-tiny);
	}
</style>
