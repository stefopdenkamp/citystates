<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { fullName } from '#lib/game/logic.ts';
	import type { ClientMessage, PublicGameState, PublicPlayer } from '#lib/game/types.ts';

	let {
		game,
		me,
		send
	}: { game: PublicGameState; me: PublicPlayer | null; send: (message: ClientMessage) => void } = $props();
</script>

<dialog {@attach (node) => node.showModal()} oncancel={(event) => event.preventDefault()}>
	<h2>The game is paused</h2>
	<p>
		{me
			? 'The game continues once every player is connected and ready.'
			: 'Take over a player who is not connected to continue their game.'}
	</p>

	<ul>
		{#each game.players as player (player.id)}
			{@const isMe = player.id === me?.id}
			<li data-color={player.color} class:me={isMe} class:disconnected={!player.isConnected}>
				<span class="name">{fullName(game, player)}</span>
				<span class="status">{player.isConnected ? 'Connected' : 'Not connected'}</span>
				{#if !me && !player.isConnected}
					<button onclick={() => send({ type: 'player:adopt', playerId: player.id })}>Take over</button>
				{:else}
					<label>
						<input
							type="checkbox"
							checked={player.isReadyForGame}
							disabled={!isMe}
							onchange={(event) => send({ type: 'player:ready', ready: event.currentTarget.checked })}
						/>
						Ready
					</label>
				{/if}
			</li>
		{/each}
	</ul>

	<button onclick={() => goto(resolve('/'))}>Back to the lobby</button>
</dialog>

<style>
	dialog {
		min-width: 40vw;
		min-height: 40vh;
		text-align: center;
	}

	h2 {
		color: var(--color-accent);
		font: var(--font-h2);
	}

	p {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0;
		padding: 0;

		list-style: none;
	}

	/* one row per player, like the start screen */
	li {
		display: grid;
		grid-template-columns: 1fr 8rem 6rem;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0.8rem;
		text-align: left;

		background-color: var(--color-grayscale-2);
		border: 1px solid var(--color-grayscale-3);
		border-left: 0.4rem solid var(--player-color, var(--color-grayscale-3));
		border-radius: var(--border-radius);
	}

	li.me {
		border-color: var(--color-accent);
		border-left-color: var(--player-color, var(--color-accent));
	}

	li.disconnected .name,
	li.disconnected .status {
		opacity: 0.5;
	}

	.status {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.3rem;

		font: var(--font-small);
	}
</style>
