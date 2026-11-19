<script lang="ts">
	import { reeducationCost, talentResource, talents, type Talent } from '#lib/game/config.ts';
	import PersonIcon from './PersonIcon.svelte';

	// Reeducation programs: one of your talents becomes another talent, for culture.
	let {
		talent,
		canPay,
		onRetrain,
		onCancel
	}: { talent: Talent; canPay: boolean; onRetrain: (talent: Talent) => void; onCancel: () => void } = $props();

	const others = $derived(talents.filter((t) => t !== talent));
	let chosen = $state<Talent | ''>('');
</script>

<dialog {@attach (node) => node.showModal()} oncancel={onCancel}>
	<h2>Reeducate a talent</h2>

	<div class="talent" data-resource={talentResource[talent]}>
		<PersonIcon class="circle" />
		<span class="talent-name">{talent}</span>
	</div>

	<label>
		Reeducate to
		<select bind:value={chosen}>
			<option value="" disabled>Choose a talent</option>
			{#each others as other (other)}
				<option value={other}>{other[0].toUpperCase() + other.slice(1)}</option>
			{/each}
		</select>
	</label>

	<p class="note" class:unmet={!canPay}>Costs {reeducationCost} culture</p>

	<div class="buttons">
		<button class="primary" disabled={!chosen || !canPay} onclick={() => chosen && onRetrain(chosen)}>Reeducate</button>
		<button onclick={onCancel}>Cancel</button>
	</div>
</dialog>

<style>
	dialog {
		min-width: 22rem;
		text-align: center;
	}

	h2 {
		color: var(--color-accent);
		font: var(--font-h2);
	}

	.talent {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		margin: 1rem 0;
	}

	.talent :global(.circle) {
		width: 2.4rem;
		height: 2.4rem;
		padding: 0.2rem;

		background-color: var(--resource-color);
		color: var(--color-grayscale-6);
		border-radius: 50%;
	}

	.talent-name {
		color: var(--resource-color);
		font: var(--font-small);
	}

	label {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;

		font: var(--font-small);
	}

	.note {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	.note.unmet {
		color: var(--color-danger);
	}

	.buttons {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1rem;
	}
</style>
