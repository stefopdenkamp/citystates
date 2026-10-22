<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { characteristicInfo, cityStates, colors, personalityTraits, titles } from '#lib/game/config.ts';
	import { canBeReady, canStart } from '#lib/game/logic.ts';
	import type { Characteristic, ClientMessage, PublicGameState } from '#lib/game/types.ts';
	import InfoIcon from './InfoIcon.svelte';

	let {
		game,
		playerId,
		send
	}: { game: PublicGameState; playerId: string | null; send: (message: ClientMessage) => void } = $props();

	const options: Record<Characteristic, string[]> = {
		title: titles,
		personalityTrait: personalityTraits,
		cityState: cityStates
	};

	const labels: Record<Characteristic, string> = {
		title: 'Titles',
		personalityTrait: 'Personality traits',
		cityState: 'City states'
	};

	// the column headers, in the order of a full name: "Anna the Wise Patron of Bologna"
	const headers: Record<Characteristic, string> = {
		title: 'Title',
		personalityTrait: 'Trait',
		cityState: 'City state'
	};
	const columns = $derived((['personalityTrait', 'title', 'cityState'] as Characteristic[]).filter((key) => game.enabledCharacteristics[key]));

	const enabledParts = $derived([
		...(Object.keys(labels) as Characteristic[]).filter((key) => game.enabledCharacteristics[key]).map((key) => labels[key]),
		...(game.isCityCentreEnabled ? ['City centre production'] : []),
		...(game.isReligiousDominanceEnabled ? ['Religious dominance objective'] : []),
		...(game.isBuildingLimitEnabled ? ['Building limit'] : []),
		...(game.isTestMode ? ['Test mode'] : [])
	]);

	// Colors and city states can only be chosen by one player.
	const others = $derived(game.players.filter((p) => p.id !== playerId));
	const takenColors = $derived(new Set(others.map((p) => p.color)));
	const takenCityStates = $derived(new Set(others.map((p) => p.characteristics.cityState)));

	const updateCharacteristic = (key: Characteristic, value: string) =>
		send({ type: 'player:update', characteristics: { [key]: value } });
</script>

<main>
	<h1>{game.name}</h1>
	<p class="parts">
		{enabledParts.length ? `Enabled: ${enabledParts.join(', ')}` : 'No extra rules enabled'}
		· {game.minPlayerCount}–{game.maxPlayerCount} players
		{game.turnTimer ? `· ${game.turnTimer}s per turn` : ''}
	</p>

	<!-- a grid, so the headers line up with the inputs like a table -->
	<ul style:--columns={columns.length + 3}>
		<li class="header">
			<span></span>
			<span>Name</span>
			{#each columns as key (key)}
				<span class="field">{headers[key]} <InfoIcon text={characteristicInfo[key]} placement="right" /></span>
			{/each}
			<span></span>
		</li>
		{#each game.players as player (player.id)}
			{@const isMe = player.id === playerId}
			<li class:me={isMe} data-color={player.color}>
				<select
					class="color"
					class:empty={!player.color}
					value={player.color}
					disabled={!isMe}
					onchange={(event) => send({ type: 'player:update', color: event.currentTarget.value })}
				>
					<option value="">Color</option>
					{#each colors as color (color)}
						<option value={color} disabled={takenColors.has(color)}>{color[0].toUpperCase() + color.slice(1).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)}</option>
					{/each}
				</select>

				<input
					value={player.name}
					disabled={!isMe}
					required
					maxlength="30"
					aria-label="Name"
					oninput={(event) => send({ type: 'player:update', name: event.currentTarget.value })}
				/>

				{#each columns as key (key)}
					<select
						class:empty={!player.characteristics[key]}
						value={player.characteristics[key]}
						disabled={!isMe}
						aria-label={headers[key]}
						onchange={(event) => updateCharacteristic(key, event.currentTarget.value)}
					>
						<option value="">{labels[key]}</option>
						{#each options[key] as option (option)}
							<option value={option} disabled={key === 'cityState' && takenCityStates.has(option)}>
								{key === 'cityState' ? `of ${option}` : option}
							</option>
						{/each}
					</select>
				{/each}

				<label>
					<input
						type="checkbox"
						checked={player.isReadyForGame}
						disabled={!isMe || !canBeReady(game, player)}
						onchange={(event) => send({ type: 'player:ready', ready: event.currentTarget.checked })}
					/>
					Ready
				</label>
			</li>
		{/each}
	</ul>

	<button class="primary large" disabled={!playerId || !canStart(game)} onclick={() => send({ type: 'game:start' })}>
		Start game
	</button>
	<button onclick={() => goto(resolve('/'))}>Back to the lobby</button>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		padding: 4rem 1rem;
		text-align: center;
	}

	h1 {
		color: var(--color-accent);
		font: var(--font-h1);
	}

	.parts {
		margin: 0;

		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	ul {
		display: grid;
		grid-template-columns: repeat(var(--columns), auto);
		gap: 0.5rem;
		margin: 0;
		padding: 0;

		list-style: none;
	}

	/* each row uses the columns of the list */
	li {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		padding: 0.5rem;

		background-color: var(--color-grayscale-2);
		border: 1px solid var(--color-grayscale-3);
		border-left: 0.4rem solid var(--player-color, var(--color-grayscale-3));
		border-radius: var(--border-radius);
	}

	/* the column headers, like the <th> of a table */
	li.header {
		padding-top: 0;
		padding-bottom: 0;
		text-align: left;

		background: none;
		border-color: transparent;
		color: var(--color-grayscale-5);
		font: var(--font-small);
		font-weight: 700;
	}

	/* the city state texts are long: a wider tip */
	li.header :global(.tip) {
		max-width: 24rem;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	/* your row: accent color until you choose a color, then your color */
	li.me {
		border-color: var(--player-color, var(--color-accent));
	}

	/* all dropdowns the same width; dropdowns, the name and the checkbox the same height */
	select {
		width: 11rem;
		height: 2.2rem;
	}

	/* a dropdown still on its default option ('Color', 'City states', ...) is grayer */
	select.empty {
		color: var(--color-grayscale-4);
	}

	option {
		color: var(--color-grayscale-6);
	}

	/* the default option and options taken by another player */
	option[value=''],
	option:disabled {
		color: var(--color-grayscale-4);
	}

	input:not([type='checkbox']) {
		height: 2.2rem;
	}

	select:disabled,
	input:disabled {
		opacity: 0.8;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.4rem;

		font: var(--font-small);
	}

	/* the Ready text is darker when you cannot tick the checkbox */
	label:has(input:disabled) {
		color: var(--color-grayscale-4);
	}

	input[type='checkbox'] {
		width: 2.2rem;
		height: 2.2rem;
		margin: 0;
		padding: 0;
	}
</style>
