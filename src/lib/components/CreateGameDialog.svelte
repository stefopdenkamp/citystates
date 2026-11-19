<script lang="ts">
	import { characteristicLabels, maxTurnTimer, objectives } from '#lib/game/config.ts';
	import type { Characteristic, GameSettings } from '#lib/game/types.ts';

	let { onCreate }: { onCreate: (settings: GameSettings) => void } = $props();

	let dialog: HTMLDialogElement;
	let name = $state('');
	let minPlayerCount = $state(2);
	let maxPlayerCount = $state(6);
	let hasTurnTimer = $state(false);
	let turnTimer = $state<number | null>(null);
	// the second and third objective can be left out (the third by default: a game of 2 objectives)
	let chosenObjectives = $state<(number | 'random' | 'none')[]>(['random', 'random', 'none']);
	let enabledCharacteristics = $state<Record<Characteristic, boolean>>({
		title: false,
		personalityTrait: false,
		cityState: false
	});
	let isCityCentreEnabled = $state(false);
	let isBuildOverFarmsEnabled = $state(false);
	let isReligiousDominanceEnabled = $state(false);
	let isTestMode = $state(false);
	let isTutorialEnabled = $state(false);
	let hasPassword = $state(false);
	let password = $state('');

	// An objective is unavailable when another dropdown already picked it.
	const isTaken = (index: number, slot: number) => chosenObjectives.some((o, i) => i !== slot && o === index);

	// Test mode names the game "Test" when it has no name yet; turning it off clears that name again.
	const onTestModeChange = () => {
		if (isTestMode && !name.trim()) name = 'Test';
		else if (!isTestMode && name === 'Test') name = '';
	};

	export const open = () => dialog.showModal();

	const submit = (event: SubmitEvent) => {
		event.preventDefault();
		onCreate({
			name,
			minPlayerCount,
			maxPlayerCount,
			turnTimer: hasTurnTimer ? turnTimer || null : null,
			objectives: chosenObjectives,
			enabledCharacteristics,
			isCityCentreEnabled,
			isBuildOverFarmsEnabled,
			isReligiousDominanceEnabled,
			isTestMode,
			isTutorialEnabled,
			password: hasPassword && password ? password : null
		});
		dialog.close();
	};
</script>

<dialog bind:this={dialog} closedby="any">
	<form onsubmit={submit}>
		<h2>Create a new game</h2>

		<label>
			Name
			<input bind:value={name} required maxlength="40" />
		</label>

		<div class="row">
			<label>
				Min players
				<input type="number" bind:value={minPlayerCount} min="1" max={maxPlayerCount} />
			</label>
			<label>
				Max players
				<input type="number" bind:value={maxPlayerCount} min={minPlayerCount} max="6" />
			</label>
		</div>

		<fieldset>
			<legend>Objectives</legend>
			{#each chosenObjectives as _, slot (slot)}
				<select bind:value={chosenObjectives[slot]}>
					{#if slot > 0}<option value="none">None</option>{/if}
					<option value="random">Random</option>
					{#each objectives as objective, index (index)}
						<option value={index} disabled={isTaken(index, slot)}>{objective.name}: {objective.description}</option>
					{/each}
				</select>
			{/each}
			<label class="toggle">
				<input type="checkbox" bind:checked={isReligiousDominanceEnabled} />
				Religious dominance objective
			</label>
		</fieldset>

		<!-- in two columns, so the dialog fits without scrolling; in groups with a line between them: password, tutorial and
		     turn time, the characteristics, the board, test mode -->
		<fieldset class="parts">
			<legend>Parts of the game</legend>
			<label class="toggle">
				<input type="checkbox" bind:checked={hasPassword} />
				Protect with a password
			</label>

			<label class="toggle">
				<input type="checkbox" bind:checked={isTutorialEnabled} />
				Tutorial
			</label>

			<label class="toggle">
				<input type="checkbox" bind:checked={hasTurnTimer} />
				Limit time per turn
			</label>

			<hr />
			<!-- personality traits have no bonus yet, so they cannot be enabled -->
			{#each Object.keys(characteristicLabels) as Characteristic[] as key (key)}
				<label class="toggle">
					<input type="checkbox" disabled={key === 'personalityTrait'} bind:checked={enabledCharacteristics[key]} />
					{characteristicLabels[key]}
				</label>
			{/each}

			<hr />
			<label class="toggle">
				<input type="checkbox" bind:checked={isCityCentreEnabled} />
				City centre production
			</label>

			<label class="toggle">
				<input type="checkbox" bind:checked={isBuildOverFarmsEnabled} />
				Build over farms
			</label>

			<hr />
			<label class="toggle">
				<input type="checkbox" bind:checked={isTestMode} onchange={onTestModeChange} />
				Test mode
			</label>
		</fieldset>

		<!-- the fields of the checked parts, under them -->
		{#if hasTurnTimer}
			<label>
				Time per turn in seconds
				<input type="number" bind:value={turnTimer} required min="1" max={maxTurnTimer} />
			</label>
		{/if}
		{#if hasPassword}
			<input class="password" bind:value={password} required placeholder="Password" autocomplete="off" />
		{/if}

		<button class="primary" type="submit">Start new game</button>
	</form>
</dialog>

<style>
	form {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		width: min(26rem, 80vw);
	}

	h2 {
		font: var(--font-h2);
		color: var(--color-accent)
	}

	label,
	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		width: 100%;

		font: var(--font-small);
	}

	/* a fieldset is as wide as its content unless told otherwise */
	fieldset {
		min-width: 0;
		margin: 0;

		border: 1px solid var(--color-grayscale-3);
		border-radius: var(--border-radius);
	}

	fieldset.parts {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}

	/* a line between the groups, over both columns and almost the full width */
	fieldset.parts hr {
		grid-column: 1 / -1;
		width: 95%;
		margin: 0.2rem auto;

		border: none;
		border-top: 1px solid var(--color-grayscale-3);
	}

	/* the long objective names are cut off instead of widening the dialog */
	select {
		min-width: 0;
	}

	.row {
		display: flex;
		gap: 1rem;
		width: 100%;
	}

	/* the number inputs share the row instead of keeping their default width */
	.row label,
	.row input {
		min-width: 0;
	}

	.toggle {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}

	.password {
		width: 100%;
	}
</style>
