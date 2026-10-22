<script lang="ts">
	import { policies, policyRemoveCost, policySlots } from '#lib/game/config.ts';
	import { canPay, costLabel } from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer } from '#lib/game/types.ts';
	import InfoIcon from './InfoIcon.svelte';
	import LockIcon from './LockIcon.svelte';

	// The policy tree. Buying a policy unlocks it; drag it (or click it, then a slot) into a slot to implement it.
	// Opened over the board, not modal, so it stays inside the board area.
	let {
		game,
		me,
		isMyTurn,
		onUnlock,
		onImplement,
		onRemove,
		onClose
	}: {
		game: PublicGameState;
		me: PublicPlayer | null;
		isMyTurn: boolean;
		onUnlock: (policy: string) => void;
		onImplement: (policy: string, slot: number) => void;
		onRemove: (policy: string) => void;
		onClose: () => void;
	} = $props();

	const unlocked = $derived(me?.unlockedPolicies ?? []);
	const inEffect = $derived(me?.policiesInEffect ?? []);
	// implementing a policy is free, removing one costs power
	const canRemove = $derived(isMyTurn && !!me && canPay(game, me, policyRemoveCost));
	const canImplement = (name: string) =>
		isMyTurn && unlocked.includes(name) && !inEffect.includes(name) && inEffect.filter(Boolean).length < policySlots;

	// the unlocked policy picked (or dragged) to implement in the slot it is dropped on or that is clicked
	let selected = $state<string | null>(null);

	const implement = (name: string | null, slot: number) => {
		if (name && canImplement(name)) onImplement(name, slot);
		selected = null;
	};

	const removeLabel = costLabel(policyRemoveCost);
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && onClose()} />

<dialog {@attach (node) => node.show()} onclose={onClose}>
	<h2>
		Policies
		<InfoIcon
			placement="right"
			text="Unlock policies by buying them. Implement a policy by dragging it to a policy slot. Remove a policy by clicking the ×, this costs {removeLabel}."
		/>
	</h2>

	<!-- the slots on top, 2 columns wide each; under them the policies, the first of a column at the top -->
	<div class="tree">
		<!-- your policies in effect; an empty slot takes an unlocked policy -->
		<div class="policies">
			{#each { length: policySlots }, i (i)}
				{@const policy = inEffect[i]}
				{#if policy}
					<span class="policy filled">
						{policy}
						<button class="remove" disabled={!canRemove} title="Remove, costs {removeLabel}" aria-label="Remove {policy}" onclick={() => onRemove(policy)}>
							×
						</button>
					</span>
				{:else}
					<!-- not disabled without a selection: a disabled button gets no drop -->
					<button
						class="policy slot"
						class:target={!!selected}
						title={selected ? `Implement ${selected}` : undefined}
						ondragover={(event) => event.preventDefault()}
						ondrop={(event) => {
							event.preventDefault();
							implement(event.dataTransfer?.getData('text/plain') ?? null, i);
						}}
						onclick={() => implement(selected, i)}
					>
						Empty policy slot
					</button>
				{/if}
			{/each}
		</div>
		{#each policies as column, c (c)}
			<div class="column">
				{#each column as policy (policy.name)}
					{@const isUnlocked = unlocked.includes(policy.name)}
					{@const isInEffect = inEffect.includes(policy.name)}
					{@const canUnlock = isMyTurn && !!me && !isUnlocked && policy.cost.length > 0 && canPay(game, me, policy.cost)}
					<button
						class="item"
						data-resource={policy.color ?? policy.cost[0]?.resourceType}
						class:buyable={canUnlock}
						class:unlocked={isUnlocked}
						class:in-effect={isInEffect}
						class:selected={selected === policy.name}
						disabled={isUnlocked ? !canImplement(policy.name) : !canUnlock}
						title={isInEffect
							? 'In effect'
							: isUnlocked
								? 'Drag to a slot (or click, then a slot) to implement'
								: policy.cost.length
									? 'Click to unlock'
									: undefined}
						draggable={isUnlocked && canImplement(policy.name)}
						ondragstart={(event) => {
							event.dataTransfer?.setData('text/plain', policy.name);
							selected = policy.name;
						}}
						ondragend={() => (selected = null)}
						onclick={() => (isUnlocked ? (selected = selected === policy.name ? null : policy.name) : onUnlock(policy.name))}
					>
						<LockIcon class="lock" open={isUnlocked} />
						<span class="name">{policy.name}</span>
						<span class="description">{policy.description}</span>
						{#if !isUnlocked && policy.cost.length}
							<span class="cost">{costLabel(policy.cost)}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/each}
	</div>

	<button onclick={onClose}>Close</button>
</dialog>

<style>
	/* over the board: a small inset at the top and bottom, a bit more at the sides */
	dialog[open] {
		position: absolute;
		inset: 1rem 4rem;
		z-index: 3;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8rem;
		width: auto;
		max-width: none;
		height: auto;
		max-height: none;
		margin: 0;
	}

	/* the title with its info icon next to it */
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;

		color: var(--color-accent);
		font: var(--font-h2);
	}

	/* three policies in the top row of the tree, 2 columns wide each, with a line between them, like the objectives */
	.policies {
		display: contents;
	}

	/* What was the margin around it is padding, so the whole area is the drop target. The line and the hover
	   background keep the size of the text area: the --inset away from the top and bottom. The space under it is the
	   old margin plus the dialog's gap, so the columns stay where they were. */
	.policy {
		--inset-top: 1rem;
		--inset-bottom: 1.8rem;
		position: relative;
		isolation: isolate;
		grid-column: span 2;
		padding: calc(var(--inset-top) + 0.3rem) 0.6rem calc(var(--inset-bottom) + 0.3rem);
		text-align: center;

		color: var(--color-grayscale-4);
		font: var(--font-small);
	}

	/* the line after slot 1 and 2 */
	.policy:not(:last-child)::after {
		position: absolute;
		top: var(--inset-top);
		right: 0;
		bottom: var(--inset-bottom);
		width: 1px;

		background-color: var(--color-grayscale-5);
		content: '';
	}

	.policy.filled {
		color: var(--color-grayscale-6);
	}

	/* an empty slot looks like plain text, until a policy is picked to go in it; a hover only colors the text area */
	.policy.slot,
	.policy.slot:hover {
		background: none;
		border: none;
		border-radius: 0;
	}

	.policy.slot:disabled {
		opacity: 1;
		cursor: default;
	}

	/* the slot is not disabled (a disabled button gets no drop), so without a picked policy it looks disabled */
	.policy.slot:not(.target) {
		cursor: default;
	}

	.policy.slot.target {
		color: var(--color-accent);
	}

	/* the hover background of a target, around the text area */
	.policy.slot.target::before {
		position: absolute;
		inset: var(--inset-top) 0 var(--inset-bottom);
		z-index: -1;

		content: '';
	}

	.policy.slot.target:hover::before {
		background-color: var(--color-grayscale-4);
	}

	.remove {
		margin-left: 0.4rem;
		padding: 0 0.3rem;

		background: none;
		font-size: 1.3rem;
		line-height: 1;
		vertical-align: middle;
		color: var(--color-grayscale-5);
		border: none;
	}

	.remove:hover:not(:disabled) {
		background: none;
		color: var(--color-danger);
	}

	.tree {
		display: grid;
		flex: 1;
		grid-template-columns: repeat(6, 1fr);
		/* the slots as high as their text, the columns take the rest */
		grid-template-rows: auto 1fr;
		align-self: stretch;
		min-height: 0;
	}

	/* 2rem between the columns, with a line in the middle like the objectives */
	.column {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0 1rem;
	}

	.column:not(:last-child) {
		border-right: 1px solid var(--color-grayscale-5);
	}

	.item {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.5rem 0.7rem;
		text-align: center;

		background-color: var(--color-grayscale-3);
		color: var(--color-grayscale-6);
		border: 1px solid var(--color-grayscale-4);
		border-radius: var(--border-radius);
	}

	/* not bought, or nothing to do with it right now: readable, just not clickable */
	.item:disabled {
		opacity: 0.6;
	}

	/* can be bought: brighter text and a faint border in the color of its first cost */
	.item.buyable {
		border-color: color-mix(in srgb, var(--resource-color) 45%, var(--color-grayscale-4));
	}

	.item.buyable .description,
	.item.buyable .cost {
		color: var(--color-grayscale-6);
	}

	/* bought: a bright border in the color of its first cost */
	.item.unlocked {
		background-color: color-mix(in srgb, var(--color-power) 10%, transparent);
		border-color: var(--resource-color, var(--color-accent));
		opacity: 1;
	}

	.item.unlocked:not(:disabled) {
		cursor: grab;
	}

	.item.in-effect {
		background-color: color-mix(in srgb, var(--color-power) 65%, transparent);
	}

	/* a closed lock until bought, an open one after */
	.item :global(.lock) {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		width: 0.9rem;
		height: 0.9rem;

		color: var(--color-grayscale-5);
	}

	.item.unlocked :global(.lock) {
		color: var(--resource-color, var(--color-accent));
	}

	.item.selected {
		outline: 2px solid var(--color-accent);
	}

	.name {
		font: var(--font-small);
		font-weight: 700;
	}

	.description {
		color: var(--color-grayscale-5);
		font: var(--font-tiny);
	}

	.cost {
		color: var(--color-grayscale-5);
		font: var(--font-tiny);
		font-size: 0.6rem;
	}
</style>
