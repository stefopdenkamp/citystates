<script lang="ts">
	import { technologies, technologyDiscount } from '#lib/game/config.ts';
	import { canPay, costLabel, isNextTechnology, technologyCost } from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer } from '#lib/game/types.ts';
	import InfoIcon from './InfoIcon.svelte';
	import LockIcon from './LockIcon.svelte';

	// The technology tree, each column unlocked from the top down. Opened over the board, not modal, so it stays
	// inside the board area.
	let {
		game,
		me,
		isMyTurn,
		onUnlock,
		onClose
	}: {
		game: PublicGameState;
		me: PublicPlayer | null;
		isMyTurn: boolean;
		onUnlock: (technology: string) => void;
		onClose: () => void;
	} = $props();

	const unlocked = $derived(me?.unlockedTechnologies ?? []);
	const costOf = (name: string) => (me ? technologyCost(game, me.id, name) : technologies.flat().find((t) => t.name === name)!.cost);
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && onClose()} />

<dialog {@attach (node) => node.show()} onclose={onClose}>
	<h2>
		Technologies
		<InfoIcon
			placement="right"
			text="Unlock technologies by buying them, each column from the top down. A technology costs {technologyDiscount} knowledge less for each opponent who already has it."
		/>
	</h2>

	<!-- the first of a column is at the top, connected downwards by arrows -->
	<div class="tree">
		{#each technologies as column, c (c)}
			<div class="column">
				{#each column as technology, i (technology.name)}
					{#if i > 0}<span class="arrow" aria-hidden="true"></span>{/if}
					{@const isUnlocked = unlocked.includes(technology.name)}
					{@const cost = costOf(technology.name)}
					{@const canUnlock = isMyTurn && !!me && isNextTechnology(me, technology.name) && canPay(game, me, cost)}
					<button
						class="item"
						data-resource={technology.cost[0]?.resourceType}
						class:buyable={canUnlock}
						class:unlocked={isUnlocked}
						disabled={!canUnlock}
						title={canUnlock ? 'Click to unlock' : undefined}
						onclick={() => onUnlock(technology.name)}
					>
						<LockIcon class="lock" open={isUnlocked} />
						<!-- everyone who has unlocked it, on the right side -->
						<span class="owners">
							{#each game.players.filter((p) => (p.unlockedTechnologies ?? []).includes(technology.name)) as owner (owner.id)}
								<span class="owner" data-color={owner.color} title={owner.name}></span>
							{/each}
						</span>
						<span class="name">{technology.name}</span>
						<span class="description">{technology.description}</span>
						{#if !isUnlocked}<span class="cost">{costLabel(cost)}</span>{/if}
					</button>
				{/each}
			</div>
		{/each}
	</div>

	<button onclick={onClose}>Close</button>
</dialog>

<style>
	/* over the board: a small inset at the top and bottom, a bit more at the sides */
	dialog[open] {
		position: absolute;
		inset: 1rem 4rem;
		z-index: 3;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8rem;
		width: auto;
		max-width: none;
		height: auto;
		max-height: none;
		margin: 0;
	}

	/* the title with its info icon next to it */
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;

		color: var(--color-accent);
		font: var(--font-h2);
	}

	.tree {
		display: grid;
		flex: 1;
		grid-template-columns: repeat(4, 1fr);
		align-self: stretch;
		min-height: 0;
	}

	/* 2rem between the columns, with a line in the middle like the objectives */
	.column {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0 1rem;
	}

	.column:not(:last-child) {
		border-right: 1px solid var(--color-grayscale-5);
	}

	.item {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.5rem 0.7rem;
		text-align: center;

		justify-content: center;

		background-color: var(--color-grayscale-3);
		color: var(--color-grayscale-6);
		border: 1px solid var(--color-grayscale-4);
		border-radius: var(--border-radius);
	}

	/* not bought and cannot be bought now: readable, just not clickable */
	.item:disabled {
		opacity: 0.6;
	}

	/* can be bought: brighter text and a faint border in the color of its first cost */
	.item.buyable {
		border-color: color-mix(in srgb, var(--resource-color) 45%, var(--color-grayscale-4));
	}

	.item.buyable .description,
	.item.buyable .cost {
		color: var(--color-grayscale-6);
	}

	/* bought: a bright border in the color of its first cost */
	.item.unlocked {
		background-color: color-mix(in srgb, var(--color-knowledge) 50%, transparent);
		border-color: var(--resource-color, var(--color-accent));
		opacity: 1;
	}

	/* a closed lock until bought, an open one after */
	.item :global(.lock) {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		width: 0.9rem;
		height: 0.9rem;

		color: var(--color-grayscale-5);
	}

	.item.unlocked :global(.lock) {
		color: var(--resource-color, var(--color-accent));
	}

	/* a dot per player who has unlocked it, down the right side under the lock */
	.owners {
		position: absolute;
		top: 1.5rem;
		right: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.owner {
		width: 0.7rem;
		height: 0.7rem;

		background-color: var(--player-color);
		border-radius: 50%;
	}

	.name {
		font: var(--font-small);
		font-weight: 700;
	}

	.description {
		color: var(--color-grayscale-5);
		font: var(--font-tiny);
	}

	.cost {
		color: var(--color-grayscale-5);
		font: var(--font-tiny);
		font-size: 0.6rem;
	}

	/* from the bottom centre of the one above to the top centre of the one below */
	.arrow {
		position: relative;
		align-self: center;
		width: 2px;
		height: 1.5rem;

		background-color: var(--color-grayscale-5);
	}

	.arrow::after {
		content: '';
		position: absolute;
		bottom: -2px;
		left: 50%;

		border: 0.35rem solid transparent;
		border-bottom: none;
		border-top: 0.5rem solid var(--color-grayscale-5);

		transform: translateX(-50%);
	}
</style>
