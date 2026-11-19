<script lang="ts">
	import { resourceTypes } from '#lib/game/config.ts';
	import { fullName, isLowered, overviewText } from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer } from '#lib/game/types.ts';

	let { game, me, onNext }: { game: PublicGameState; me: PublicPlayer | null; onNext: () => void } = $props();

	const waitingFor = $derived(game.players.filter((p) => !p.isReadyForNextGeneration));
</script>

<dialog {@attach (node) => node.showModal()} oncancel={(event) => event.preventDefault()}>
	<h2>The legacy of a generation</h2>

	<!-- per player a row of containers, one per resource, with the cap above it (red when it was reached): what they had as gray
	     disks, what they gained in the resource color -->
	{#if game.legacy}
		<div class="players">
			{#each game.players as player (player.id)}
				<section data-color={player.color}>
					<h3>{fullName(game, player)}</h3>
					<div class="containers">
						{#each resourceTypes as resource (resource)}
							{@const line = game.legacy[player.id][resource]}
							<div class="resource" data-resource={resource}>
								<span
									class="cap"
									class:lowered={isLowered(game, player.id, resource, 'cap') || line.isCapped}
									title={`${line.isCapped ? 'Cap reached\n\n' : ''}${overviewText(game, player.id, resource, 'cap')}`}>Cap {line.cap}</span
								>
								<div
									class="container"
									title={`${resource[0].toUpperCase() + resource.slice(1)}: ${line.after}\n\n${overviewText(game, player.id, resource, 'production')}`}
								>
									{#each { length: Math.min(line.before, line.after) }, i (i)}<span class="piece disk had"></span>{/each}
									{#each { length: Math.max(0, line.after - line.before) }, i (i)}<span class="piece disk"></span>{/each}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}

	{#if waitingFor.length}
		<p class="note">
			Waiting for:
			{#each waitingFor as player, i (player.id)}
				<span class="waiting" data-color={player.color}>{fullName(game, player)}</span>{i < waitingFor.length - 1 ? ', ' : ''}
			{/each}
		</p>
	{/if}

	{#if me}
		<button class="primary" disabled={me.isReadyForNextGeneration} onclick={onNext}>Next generation</button>
	{/if}
</dialog>

<style>
	dialog {
		max-width: 95vw;
		text-align: center;
	}

	/* wide screens, like the action selector */
	@media (min-width: 1921px) {
		dialog {
			max-width: 75vw;
		}
	}

	h2 {
		color: var(--color-accent);
		font: var(--font-h2);
	}

	/* per player their name in their color, with their containers under it */
	.players {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		margin: 1rem 0;
	}

	h3 {
		margin: 0 0 0.3rem;
		text-align: center;

		color: var(--player-color);
		font: var(--font-normal);
		font-weight: 700;
	}

	.containers {
		display: grid;
		grid-template-columns: repeat(6, max-content);
		align-items: start;
		gap: 0.6rem;
	}

	.resource {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.cap {
		color: var(--color-grayscale-5);
		font: var(--font-tiny);
		cursor: help;
	}

	/* the disks of a resource, in a box of its color: 5 per row from the top left, 4 rows high up to 20 disks, then it
	   grows a row for every 5 more */
	.container {
		--disk: 1.2rem;

		display: grid;
		grid-template-columns: repeat(5, var(--disk));
		grid-template-rows: repeat(4, var(--disk));
		grid-auto-rows: var(--disk);
		align-content: start;
		gap: 0.15rem;
		padding: 0.5rem;

		border: 2px solid color-mix(in srgb, var(--resource-color) 70%, transparent);
		border-radius: var(--border-radius);
		cursor: help;
	}

	/* a low disk in 3D (see .piece in app.css) */
	.disk {
		--width: var(--disk);
		--depth: 0.27rem;
	}

	.disk.had {
		--piece-color: var(--color-grayscale-4);
	}

	/* the cap was reached, or something (like an opponent's spy) lowers it */
	.cap.lowered {
		color: var(--color-danger);
	}

	.waiting {
		color: var(--player-color);
	}

	.note {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}
</style>
