<script lang="ts">
	import { talentResource, type Talent } from '#lib/game/config.ts';
	import PersonIcon from './PersonIcon.svelte';

	// Shown before buying something that spends talents while you have to choose which talent pays for a regular person.
	// With Work ethic one talent pays all the people of a building.
	let {
		name,
		isUnit,
		isWorkEthic,
		required,
		choices,
		options,
		onConfirm,
		onCancel
	}: {
		name: string;
		isUnit: boolean;
		isWorkEthic: boolean;
		required: Talent[]; // spent because the cost asks for them
		choices: number; // how many regular people a chosen talent pays for
		options: Talent[]; // the talents to choose from
		onConfirm: (talents: Talent[]) => void;
		onCancel: () => void;
	} = $props();

	// indexes into options, as the same talent can be there more than once
	let chosen = $state<number[]>([]);

	const toggle = (i: number) => {
		if (chosen.includes(i)) chosen = chosen.filter((c) => c !== i);
		else if (chosen.length < choices) chosen = [...chosen, i];
	};
</script>

<dialog {@attach (node) => node.showModal()} oncancel={onCancel}>
	<h2>Buy a {name}</h2>

	{#if required.length}
		<p>The {name} needs: {required.join(', ')}.</p>
	{/if}

	{#if choices > 0}
		<p>
			You don't have enough regular people.
			{#if isWorkEthic}
				Work ethic: choose which talented person pays all of its people:
			{:else if choices === 1}
				Choose which talented person to use as a regular person:
			{:else}
				Choose which {choices} talented people to use as regular people:
			{/if}
		</p>
		<div class="options">
			{#each options as talent, i (i)}
				<button class="talent" class:selected={chosen.includes(i)} data-resource={talentResource[talent]} onclick={() => toggle(i)}>
					<PersonIcon class="circle" />
					<span class="talent-name">{talent}</span>
				</button>
			{/each}
		</div>
	{/if}

	<div class="buttons">
		<button class="primary" disabled={chosen.length !== choices} onclick={() => onConfirm(chosen.map((i) => options[i]))}>
			{isUnit ? 'Buy' : 'Build'}
		</button>
		<button onclick={onCancel}>Cancel</button>
	</div>
</dialog>

<style>
	dialog {
		min-width: 24rem;
		text-align: center;
	}

	h2 {
		color: var(--color-accent);
		font: var(--font-h2);
		text-transform: capitalize;
	}

	p {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		margin: 1rem 0;
	}

	.talent {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.4rem;

		background: none;
		border: 1px solid transparent;
	}

	.talent.selected {
		border-color: var(--color-accent);
	}

	.talent :global(.circle) {
		width: 2rem;
		height: 2rem;
		padding: 0.15rem;

		background-color: var(--resource-color);
		color: var(--color-grayscale-6);
		border-radius: 50%;
	}

	.talent-name {
		color: var(--resource-color);
		font: var(--font-tiny);
	}

	.buttons {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1rem;
	}
</style>
