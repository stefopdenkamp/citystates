<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { confirmPopup } from '#lib/client/popup.svelte.ts';
	import { connect } from '#lib/client/socket.ts';
	import CreateGameDialog from '#lib/components/CreateGameDialog.svelte';
	import type { GameStatus, LobbyGame } from '#lib/game/types.ts';

	let games = $state<LobbyGame[]>([]);
	// the history shows only finished games, otherwise they are hidden
	let showHistory = $state(false);
	const shownGames = $derived(games.filter((game) => (game.gameStatus === 'finished') === showHistory));
	let error = $state('');
	let createDialog: CreateGameDialog;

	const statusLabels: Record<GameStatus, string> = {
		open: 'Open',
		inProgress: 'In progress',
		saved: 'Saved',
		finished: 'Finished'
	};

	const openGame = (id: string) => goto(resolve('/[id]', { id }));

	const socket = connect(
		() => socket.send({ type: 'lobby:subscribe' }),
		(message) => {
			if (message.type === 'lobby:list') games = message.games;
			if (message.type === 'lobby:created') openGame(message.id);
			if (message.type === 'error') error = message.message;
		}
	);

	$effect(() => socket.close);

	const canJoin = (game: LobbyGame) =>
		game.gameStatus === 'saved' || (game.gameStatus === 'open' && (game.playerCount < game.maxPlayerCount || game.botCount > 0));

	const canDelete = (game: LobbyGame) => game.gameStatus !== 'inProgress' && game.connectedCount === 0;

	const deleteGame = async (game: LobbyGame) => {
		if (await confirmPopup(`Delete "${game.name}"? This cannot be undone.`)) socket.send({ type: 'lobby:delete', gameId: game.id });
	};
</script>

<div class="background" aria-hidden="true"></div>

<main>
	<h1>City States of Italy</h1>
	<p class="description">
		In the 13th century, Italy was divided into powerful city-states, each with its own government and laws, becoming
		important centers of commerce, culture and politics. You are a ruler of one of these city-states. Develop your city
		through generations, and undermine the cities of your enemies. May the best city-state win.
	</p>

	<div class="games">
		<label class="history">
			<input type="checkbox" bind:checked={showHistory} />
			View history
		</label>
		<ul>
			{#each shownGames as game (game.id)}
				<li>
					<span class="name">{game.name}{game.hasPassword ? ' 🔒' : ''}</span>
					<span class="status">{statusLabels[game.gameStatus]}</span>
					{#if game.gameStatus === 'finished'}
						<!-- who won, instead of the players and the join button; more than one is a draw -->
						<span class="winners">
							{game.winners.length > 1 ? 'Draw:' : 'Won by'}
							{#each game.winners as winner, i (i)}
								{i > 0 ? ' and ' : ''}<span class="winner" data-color={winner.color}>{winner.name}</span>
							{/each}
						</span>
					{:else}
						<!-- connected players / the maximum while open, the players who joined once started -->
						<span class="players">
							{game.connectedCount}/{game.gameStatus === 'open' ? game.maxPlayerCount : game.playerCount} players
						</span>
						<button class="join" onclick={() => openGame(game.id)} disabled={!canJoin(game)}>Join</button>
					{/if}
					{#if canDelete(game)}
						<button class="delete" onclick={() => deleteGame(game)}>Delete</button>
					{/if}
				</li>
			{:else}
				<li class="empty">{showHistory ? 'No finished games yet' : 'No games yet'}</li>
			{/each}
		</ul>
	</div>

	{#if error}<p class="error">{error}</p>{/if}

	<button class="primary large" onclick={() => createDialog.open()}>Create new game</button>
</main>

<small class="credits">created by Stef</small>

<CreateGameDialog bind:this={createDialog} onCreate={(settings) => socket.send({ type: 'lobby:create', settings })} />

<style>
	/* the lobby image, starting a bit below the top so the title has a plain dark band above it */
	.background {
		position: fixed;
		top: 18vh;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: -1;

		background: url('/games/citystates/images/lobby-background.jpg') center top / cover no-repeat;
	}

	/* fades the top edge of the image into the page background */
	.background::before {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		height: 6rem;

		background: linear-gradient(var(--color-grayscale-1), transparent);
		content: '';
	}

	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		max-width: 50rem;
		margin: 0 auto;
		padding: 4rem 1rem;
		text-align: center;
	}

	h1 {
		color: var(--color-accent);
		font: var(--font-h1);
	}

	.description {
		margin: 0 3rem;

		color: var(--color-grayscale-5);
		font: var(--font-normal);
		font-style: italic;
	}

	/* the history filter sits small above the top right of the list */
	.games {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		width: 100%;
	}

	.history {
		display: flex;
		align-self: flex-end;
		align-items: center;
		gap: 0.3rem;

		color: var(--color-grayscale-4);
		font: var(--font-tiny);
		cursor: pointer;
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		margin: 0;
		padding: 0.5rem;

		background-color: var(--color-grayscale-3);
		border-radius: var(--border-radius);
		
		list-style: none;
	}

	/* A game row: change the column widths and the order of the areas here,
	   and the alignment of a single cell in its own rule below. */
	li {
		display: grid;
		grid-template-columns: 2fr 5rem 5rem 5rem 5rem;
		grid-template-areas: 'name status players join delete';
		align-items: center;
		gap: 1rem;
		padding: 0.8rem 1rem;
		text-align: left;

		background-color: var(--color-grayscale-2);
		border: 1px solid var(--color-grayscale-4);
		border-radius: var(--border-radius);
		font: var(--font-small);
	}

	li.empty {
		display: block;
		text-align: center;

		color: var(--color-grayscale-5);
		background-color: var(--color-grayscale-3);
	}

	.name {
		grid-area: name;
	}

	.status {
		grid-area: status;
	}

	.players {
		grid-area: players;
	}

	/* spans the players and join columns */
	.winners {
		grid-column: players-start / join-end;
	}

	.winner {
		color: var(--player-color);
		font-weight: 700;
	}

	.join {
		grid-area: join;

		border-color: var(--color-success);
	}

	.delete {
		grid-area: delete;

		border-color: var(--color-danger);
	}

	.credits {
		position: fixed;
		right: 0.5rem;
		bottom: 0.3rem;

		color: var(--color-grayscale-4);
		font: var(--font-tiny);
	}
</style>
