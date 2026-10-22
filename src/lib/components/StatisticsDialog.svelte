<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { objectives, resourceTypes } from '#lib/game/config.ts';
	import { fullName, getPlayer, objectiveProgress } from '#lib/game/logic.ts';
	import type { PublicGameState } from '#lib/game/types.ts';

	// Shown to everyone once the game has ended; more than one winner is a draw.
	let { game }: { game: PublicGameState } = $props();

	const winners = $derived((game.winnerIds ?? []).map((id) => getPlayer(game, id)));
	// every player's statistics, the winners first
	const columns = $derived([...winners, ...game.players.filter((p) => !winners.some((w) => w.id === p.id))]);
</script>

<dialog {@attach (node) => node.showModal()} oncancel={(event) => event.preventDefault()}>
	<h2>
		Congratulations
		{#each winners as winner, i (winner.id)}
			{i > 0 ? ' and ' : ''}<span class="winner" data-color={winner.color}>{fullName(game, winner)}</span>
		{/each}
	</h2>
	{#if winners.length > 1}<p class="draw">It is a draw</p>{/if}

	<table>
		{#if columns.length > 1}
			<thead>
				<tr>
					<th></th>
					{#each columns as player (player.id)}
						<th class="winner" data-color={player.color}>{player.name}</th>
					{/each}
				</tr>
			</thead>
		{/if}
		<tbody>
			<tr class="heading"><th colspan={columns.length + 1}>Objectives</th></tr>
			{#each game.objectives as objective (objective)}
				<tr>
					<td>{objectives[objective].name}</td>
					{#each columns as player (player.id)}
						<td class="value">{Math.round(objectiveProgress(game, player.id, objective) * 100)}%</td>
					{/each}
				</tr>
			{/each}
			<tr class="heading"><th colspan={columns.length + 1}>Produced in total</th></tr>
			<!-- the people born to them over all generations, talents included -->
			<tr>
				<td class="resource" data-resource="people">people</td>
				{#each columns as player (player.id)}
					<td class="value">{player.totalBorn ?? 0}</td>
				{/each}
			</tr>
			{#each resourceTypes as resource (resource)}
				<tr>
					<td class="resource" data-resource={resource}>{resource}</td>
					{#each columns as player (player.id)}
						<td class="value">{player.totalProduced[resource]}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	<button class="primary" onclick={() => goto(resolve('/'))}>Return to lobby</button>
</dialog>

<style>
	dialog {
		min-width: 28rem;
		text-align: center;
	}

	h2 {
		color: var(--color-accent);
		font: var(--font-h2);
	}

	.winner {
		color: var(--player-color);
	}

	.draw {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	table {
		width: 100%;
		margin-top: 0.6rem;

		border-collapse: collapse;
		font: var(--font-small);
	}

	td,
	th {
		padding: 0.2rem 0.4rem;
		text-align: left;

		border-bottom: 1px solid var(--color-grayscale-3);
	}

	.heading th {
		padding-top: 1rem;

		color: var(--color-grayscale-5);
		font-weight: 700;
	}

	.value,
	thead th {
		text-align: right;
	}

	.resource {
		color: var(--resource-color);
		text-transform: capitalize;
	}

	button {
		margin-top: 1.2rem;
	}
</style>
