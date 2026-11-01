<script lang="ts">
	import type { PublicGameState } from '#lib/game/types.ts';

	let { game, canChat, onChat }: { game: PublicGameState; canChat: boolean; onChat: (text: string) => void } = $props();

	let text = $state('');
	let chatList = $state<HTMLElement>();
	let logList = $state<HTMLElement>();

	// Log text refers to players as {player:<id>}; show those as the player's name in their color.
	// 'Generation x' is highlighted.
	const logParts = (text: string) =>
		text
			.split(/(\{player:[^}]+\}|Generation \d+)/)
			.filter(Boolean)
			.map((part) => {
				const id = part.match(/^\{player:([^}]+)\}$/)?.[1];
				const player = id ? game.players.find((p) => p.id === id) : undefined;
				if (player) return { text: player.name, color: player.color, isGeneration: false };
				return { text: part, color: undefined, isGeneration: /^Generation \d+$/.test(part) };
			});

	const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

	// Keep both lists scrolled to the newest message.
	$effect(() => {
		void game.chatHistory.length;
		chatList?.scrollTo({ top: chatList.scrollHeight });
	});
	$effect(() => {
		void game.log.length;
		logList?.scrollTo({ top: logList.scrollHeight });
	});
</script>

<aside>
	<section data-tutorial="chat">
		<h3>Chat</h3>
		<ol bind:this={chatList}>
			{#each game.chatHistory as message (message.at + message.playerId)}
				<li data-color={message.color}>
					<span class="author">{message.name}:</span>
					{message.text}
				</li>
			{/each}
		</ol>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				if (!text.trim()) return;
				onChat(text);
				text = '';
			}}
		>
			<input bind:value={text} disabled={!canChat} maxlength="500" placeholder="Say something…" />
		</form>
	</section>

	<section data-tutorial="log">
		<h3>Game log</h3>
		<ol bind:this={logList}>
			{#each game.log as entry, i (i)}
				<li>
					<span class="time">{time(entry.at)}</span>
					{#each logParts(entry.text) as part, i (i)}
						{#if part.color}<span class="author" data-color={part.color}>{part.text}</span>
						{:else if part.isGeneration}<span class="generation">{part.text}</span>
						{:else}{part.text}{/if}
					{/each}
				</li>
			{/each}
		</ol>
	</section>
</aside>

<style>
	aside {
		display: grid;
		grid-template-rows: 1fr 1fr;
		gap: 1px;
		grid-area: sidebar;
		min-height: 0;

		background-color: var(--color-grayscale-3);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 0;
		padding: 0.6rem;

		background-color: var(--color-grayscale-2);
	}

	h3 {
		color: var(--color-grayscale-5);
		font: var(--font-small);
		font-weight: 700;
	}

	ol {
		display: flex;
		flex-direction: column;
		flex: 1;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;

		font: var(--font-small);
		list-style: none;
	}

	.author {
		color: var(--player-color, var(--color-accent));
		font-weight: 700;
	}

	.generation {
		color: var(--color-accent);
		font-weight: 700;
	}

	.time {
		color: var(--color-grayscale-4);
	}

	input {
		width: 100%;
	}
</style>
