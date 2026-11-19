<script lang="ts">
	import { talentResource } from '#lib/game/config.ts';
	import { bornMessage } from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer } from '#lib/game/types.ts';
	import PersonIcon from './PersonIcon.svelte';

	// Everyone born this generation as people (the cylinders of the player board). Without talents it is known who gets them: first the people of opponents
	// in gray, then yours in the people color. With talents everyone is shown in the order they were drawn, regular people
	// in the people color and talents in the color of their resource; closing it (or Escape) goes on to the bidding.
	let { game, me, onClose }: { game: PublicGameState; me: PublicPlayer; onClose: () => void } = $props();

	const drawn = $derived(game.lastBorn?.drawn ?? []);
	const hasTalents = $derived(drawn.some((item) => item !== 'person'));
	const mine = $derived(Math.min(drawn.length, game.lastBorn?.deficits?.[me.id] ?? 0));
</script>

<dialog
	{@attach (node) => node.showModal()}
	oncancel={(event) => {
		event.preventDefault();
		onClose();
	}}
>
	<h2>A new generation is born</h2>

	<div class="container" data-resource="people">
		{#if hasTalents}
			{#each drawn as item, i (i)}
				{#if item === 'person'}
					<span class="piece person" title="Regular person"><PersonIcon class="person" /></span>
				{:else}
					<span class="piece person" data-resource={talentResource[item]} title={item}><PersonIcon class="person" /></span>
				{/if}
			{/each}
		{:else}
			{#each { length: drawn.length - mine }, i (i)}<span class="piece person opponent" title="For your opponents"><PersonIcon class="person" /></span>{/each}
			{#each { length: mine }, i (i)}<span class="piece person" title="For you"><PersonIcon class="person" /></span>{/each}
		{/if}
	</div>

	{#if game.lastBorn}
		<p>{bornMessage(game.lastBorn.people, game.lastBorn.talents, 'exceptionally talented')}</p>
	{/if}

	<button class="primary" onclick={onClose}>{game.phase === 'auction' ? 'To the bidding' : 'Close'}</button>
</dialog>

<style>
	dialog {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem 2.5rem;
		text-align: center;
	}

	/* the dialog is as wide as the title, on one line */
	h2 {
		color: var(--color-accent);
		font: var(--font-h2);
		white-space: nowrap;
	}

	/* like a container of the legacy dialog */
	.container {
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 0.15rem;
		width: 16rem;
		min-height: 2.5rem;
		padding: 0.5rem;

		border: 2px solid color-mix(in srgb, var(--resource-color) 70%, transparent);
		border-radius: var(--border-radius);
	}

	/* a person like on the player board: a narrow cylinder in 3D (see .piece in app.css) with a person on its top face */
	.person {
		--width: 1.1rem;
		--depth: calc(0.45rem - 1px);
	}

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

	.person.opponent {
		--piece-color: var(--color-grayscale-4);
	}

	p {
		margin: 0;

		font: var(--font-normal);
	}
</style>
