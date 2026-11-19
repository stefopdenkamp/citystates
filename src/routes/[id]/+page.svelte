<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { connect } from '#lib/client/socket.ts';
	import GameScreen from '#lib/components/GameScreen.svelte';
	import StartScreen from '#lib/components/StartScreen.svelte';
	import type { PublicGameState } from '#lib/game/types.ts';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	let gameState = $state<PublicGameState | null>(null);
	let playerId = $state<string | null>(null);
	let error = $state('');
	let isPasswordRequired = $state(false);
	let password = $state('');

	const tokenKey = () => `citystates:${params.id}`;

	const readToken = () => {
		try {
			return localStorage.getItem(tokenKey()) ?? undefined;
		} catch {
			return undefined;
		}
	};

	const join = () => socket.send({ type: 'game:join', gameId: params.id, token: readToken(), password: password || undefined });

	const socket = connect(join, (message) => {
		if (message.type === 'game:state') gameState = message.state;
		if (message.type === 'game:passwordRequired') isPasswordRequired = true;
		if (message.type === 'game:joined') {
			isPasswordRequired = false;
			playerId = message.playerId;
			if (message.token) {
				try {
					localStorage.setItem(tokenKey(), message.token);
				} catch {
					// without storage you just cannot reconnect as this player
				}
			}
		}
		if (message.type === 'error') {
			// The game could not be joined (finished, in progress, deleted): back to the lobby.
			if (!gameState && !isPasswordRequired) goto(resolve('/'));
			error = message.message;
			setTimeout(() => (error = ''), 4000);
		}
	});

	$effect(() => socket.close);
</script>

{#if isPasswordRequired}
	<form
		class="centered"
		onsubmit={(event) => {
			event.preventDefault();
			join();
		}}
	>
		<h2>This game is protected</h2>
		<input bind:value={password} placeholder="Password" required autocomplete="off" />
		<button class="primary" type="submit">Join</button>
		<a href={resolve('/')}>Back to the lobby</a>
	</form>
{:else if !gameState}
	<p class="centered">Joining the game…</p>
{:else if gameState.gameStatus === 'open'}
	<StartScreen game={gameState} {playerId} send={socket.send} />
{:else}
	<GameScreen game={gameState} {playerId} send={socket.send} />
{/if}

{#if error}
	<p class="toast error">{error}</p>
{/if}

<style>
	.centered {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-top: 20vh;
		text-align: center;
	}

	a {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	.toast {
		position: fixed;
		bottom: 1rem;
		left: 50%;
		z-index: 10;
		margin: 0;
		padding: 0.6rem 1rem;

		background-color: var(--color-grayscale-2);
		border: 1px solid var(--color-danger);
		border-radius: var(--border-radius);

		transform: translateX(-50%);
	}
</style>
