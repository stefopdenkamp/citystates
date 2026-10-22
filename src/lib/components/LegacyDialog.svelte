<script lang="ts">
	import { resourceTypes } from '#lib/game/config.ts';
	import { fullName, isLowered, overviewText, peopleCap, peopleCount, peopleText } from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer } from '#lib/game/types.ts';

	let { game, me, onNext }: { game: PublicGameState; me: PublicPlayer | null; onNext: () => void } = $props();

	const waitingFor = $derived(game.players.filter((p) => !p.isReadyForNextGeneration));
</script>

<dialog {@attach (node) => node.showModal()} oncancel={(event) => event.preventDefault()}>
	<h2>The legacy of a generation</h2>

	{#if game.legacy}
		<table>
			<thead>
				<tr>
					<th></th>
					{#each game.players as player (player.id)}
						<td class="gap"></td>
						<th colspan="3" class="player" class:me={player.id === me?.id} data-color={player.color}>
							{fullName(game, player)}
						</th>
					{/each}
				</tr>
				<tr class="sub">
					<th></th>
					{#each game.players as player (player.id)}
						<td class="gap"></td>
						<th>Produced</th>
						<th>Total</th>
						<th>Cap</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				<tr data-resource="people">
					<th>people</th>
					{#each game.players as player (player.id)}
						<td class="gap"></td>
						<td>–</td>
						<td title={peopleText(player)}>{peopleCount(player)}</td>
						<td class:lowered={isLowered(game, player.id, 'people', 'cap')} title={overviewText(game, player.id, 'people', 'cap')}>
							{peopleCap(game, player.id)}
						</td>
					{/each}
				</tr>
				{#each resourceTypes as resource (resource)}
					<tr data-resource={resource}>
						<th>{resource}</th>
						{#each game.players as player (player.id)}
							{@const line = game.legacy[player.id][resource]}
							<td class="gap"></td>
							<td class:lowered={isLowered(game, player.id, resource, 'production')} title={overviewText(game, player.id, resource, 'production')}>
								+{line.production}
							</td>
							<td class:capped={line.isCapped} title={line.isCapped ? 'Cap reached' : undefined}>{line.after}</td>
							<td class:lowered={isLowered(game, player.id, resource, 'cap')} title={overviewText(game, player.id, resource, 'cap')}>
								{line.cap}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
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
		min-width: 40vw;
		min-height: 40vh;
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

	/* fixed, so the columns divide the width evenly */
	table {
		width: 100%;
		margin: 1rem 0;

		border-collapse: collapse;
		table-layout: fixed;
		font: var(--font-small);
	}

	/* centered, so the numbers line up under their column headers */
	th,
	td {
		padding: 0.3rem 0.6rem;
		text-align: center;

		border-bottom: 1px solid var(--color-grayscale-3);
	}

	.player {
		text-align: center;

		border-bottom: 3px solid var(--player-color);
	}

	.player.me {
		color: var(--color-accent);
	}

	.sub th {
		color: var(--color-grayscale-5);
		font: var(--font-tiny);
	}

	tbody th {
		text-align: left;

		color: var(--resource-color);
		text-transform: capitalize;
	}

	.gap {
		width: 1rem;
		padding: 0;

		border: none;
	}

	td[title] {
		cursor: help;
	}

	/* something, like an opponent's army, spy or missionary, lowers this production or cap */
	.lowered {
		color: var(--color-danger);
	}

	.waiting {
		color: var(--player-color);
	}

	.capped {
		color: var(--color-danger);
		font-weight: 700;
	}

	.note {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}
</style>
