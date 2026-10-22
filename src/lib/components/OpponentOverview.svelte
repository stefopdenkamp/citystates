<script lang="ts">
	import { indoctrinateCost, policySlots, propagandaCost, resourceTypes, talentResource, units, type ResourceType } from '#lib/game/config.ts';
	import { fullName, hasEffect, maxTraders, tradeRatio, unitImage } from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer } from '#lib/game/types.ts';
	import { confirmPopup } from '#lib/client/popup.svelte.ts';
	import PersonIcon from './PersonIcon.svelte';

	// With onTrade (a trader used on their city centre) it also shows your resources, to trade 2 of yours for 1 of theirs
	// (or another ratio, see tradeRatio). With onIndoctrinate or onPropaganda (those technologies, during your turn)
	// their talents or regular people
	// can be clicked to win them over for culture.
	let {
		game,
		player,
		me = null,
		onTrade,
		onIndoctrinate,
		onPropaganda,
		onClose
	}: {
		game: PublicGameState;
		player: PublicPlayer;
		me?: PublicPlayer | null;
		onTrade?: (give: ResourceType[], take: ResourceType[]) => void;
		onIndoctrinate?: (index: number) => void;
		onPropaganda?: () => void;
		onClose: () => void;
	} = $props();

	const theirPolicies = $derived(player.policiesInEffect ?? []);
	const culture = $derived(me?.resources.culture ?? 0);

	const isTrading = $derived(!!onTrade && !!me);
	// one circle per single resource, in resource order
	const circlesOf = (owner: PublicPlayer) =>
		resourceTypes.flatMap((resource) => Array.from({ length: owner.resources[resource] }, () => resource));
	const theirCircles = $derived(circlesOf(player));
	const myCircles = $derived(me ? circlesOf(me) : []);
	const unusedUnits = $derived(player.undeployedUnits ?? []);

	// the selected circles, e.g. 1 of theirs and 2 of yours per trader; with Caravans for several traders at once
	const ratio = $derived(me ? tradeRatio(me) : { give: 2, take: 1 });
	const traderCount = $derived((me?.undeployedUnits ?? []).filter((u) => u === 'trader').length);
	const usable = $derived(me ? maxTraders(me) : 0);
	const hasCaravans = $derived(!!me && hasEffect(me, 'caravans'));
	let taken = $state<number[]>([]);
	let given = $state<number[]>([]);
	const count = $derived(taken.length / ratio.take);
	const canTrade = $derived(Number.isInteger(count) && count >= 1 && given.length === count * ratio.give);

	// a click selects a circle, or deselects it; no more than your traders can trade
	const toggle = (picked: number[], i: number, max: number) =>
		picked.includes(i) ? picked.filter((p) => p !== i) : picked.length < max ? [...picked, i] : picked;
	const pickTheirs = (i: number) => (taken = toggle(taken, i, ratio.take * usable));
	const pickMine = (i: number) => (given = toggle(given, i, ratio.give * usable));

	const trade = () => {
		if (!onTrade || !canTrade) return;
		onTrade(
			given.map((i) => myCircles[i]),
			taken.map((i) => theirCircles[i])
		);
		onClose();
	};
</script>

<!-- a circle per single resource; in a trade they can be picked -->
{#snippet resourcePool(circles: ResourceType[], selected: number[], onPick?: (i: number) => void)}
	<div class="pool">
		{#each circles as resource, i (i)}
			{#if onPick}
				<button class="circle" class:selected={selected.includes(i)} data-resource={resource} title={resource} onclick={() => onPick(i)}
				></button>
			{:else}
				<span class="circle" data-resource={resource} title={resource}></span>
			{/if}
		{/each}
		{#if circles.length === 0}<span class="none">No resources</span>{/if}
	</div>
{/snippet}

<dialog {@attach (node) => node.showModal()} onclose={onClose}>
	<h2>{fullName(game, player)}</h2>

	<div class="policies" class:greyed={isTrading}>
		{#each { length: policySlots }, i (i)}
			<span class="policy" class:filled={!!theirPolicies[i]}>{theirPolicies[i] ?? 'Empty policy slot'}</span>
		{/each}
	</div>

	<!-- regular people, then talents in the color of their resource; people cannot be traded -->
	<h3 class:greyed={isTrading}>People</h3>
	<div class="pool" class:greyed={isTrading}>
		{#each { length: player.people }, i (i)}
			{#if onPropaganda && !isTrading}
				<button
					class="circle"
					data-resource="people"
					disabled={culture < propagandaCost}
					title="Propaganda posters: win this person over for {propagandaCost} culture"
					onclick={onPropaganda}
				>
					<PersonIcon class="person" />
				</button>
			{:else}
				<span class="circle" data-resource="people" title="Regular person"><PersonIcon class="person" /></span>
			{/if}
		{/each}
		{#each player.talents as talent, i (i)}
			{#if onIndoctrinate && !isTrading}
				<button
					class="circle"
					data-resource={talentResource[talent]}
					disabled={culture < indoctrinateCost}
					title="Fresco paintings: {talent}, {indoctrinateCost} culture"
					onclick={async () => (await confirmPopup(`Do you want to buy this ${talent} for ${indoctrinateCost} culture?`)) && onIndoctrinate(i)}
				>
					<PersonIcon class="person" />
				</button>
			{:else}
				<span class="circle" data-resource={talentResource[talent]} title={talent}><PersonIcon class="person" /></span>
			{/if}
		{:else}
			{#if player.people === 0}<span class="none">No people</span>{/if}
		{/each}
	</div>

	<h3>Resources</h3>
	{@render resourcePool(theirCircles, taken, isTrading ? pickTheirs : undefined)}

	<h3 class:greyed={isTrading}>Units</h3>
	<div class="pool" class:greyed={isTrading}>
		{#each unusedUnits as unit, i (i)}
			<span
				class="circle unit"
				data-resource={units.find((u) => u.name === unit)!.resourceType}
				style:background-image="url('/games/citystates/images/pieces/{unitImage(unit)}.jpg')"
				title={unit}
			></span>
		{:else}
			<span class="none">No unused units</span>
		{/each}
	</div>

	{#if isTrading && me}
		<div class="trade">
			<!-- three equal parts, so the button is in the centre -->
			<!-- without Caravans you trade with one trader, so the count is left out (the empty part keeps the button centred) -->
			<div class="traders">{#if hasCaravans}{traderCount} {traderCount === 1 ? 'trader' : 'traders'}{/if}</div>
			<div><button class="primary" disabled={!canTrade} onclick={trade}>Trade</button></div>
			<!-- with Caravans for all your traders at once -->
			<div class="traders">{ratio.take * usable} of theirs for {ratio.give * usable} of yours</div>
		</div>
		<h3>Your resources</h3>
		{@render resourcePool(myCircles, given, pickMine)}
	{/if}

	<button onclick={onClose}>Close</button>
</dialog>

<style>
	dialog {
		width: min(36rem, 90vw);
		text-align: center;
	}

	h2 {
		color: var(--color-accent);
		font: var(--font-h2);
	}

	/* three policies of equal width, with a line between them, like the objectives */
	.policies {
		display: flex;
		margin: 0.5rem 0 1rem;
	}

	.policy {
		flex: 1 1 0;
		padding: 0.3rem 0.6rem;

		color: var(--color-grayscale-4);
		font: var(--font-small);
	}

	.policy.filled {
		color: var(--color-grayscale-6);
	}

	.policy:not(:last-child) {
		border-right: 1px solid var(--color-grayscale-5);
	}

	h3 {
		margin-top: 0.5rem;
		text-align: left;

		color: var(--color-grayscale-5);
		font: var(--font-small);
		font-weight: 700;
	}

	.pool {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		min-height: 2.4rem;
		margin: 0.3rem 0 0.8rem;
		padding: 0.4rem;

		border: 1px solid var(--color-grayscale-3);
		border-radius: var(--border-radius);
	}

	/* in a trade, what cannot be traded is greyed out */
	.greyed {
		opacity: 0.35;
		filter: grayscale(1);
	}

	.circle {
		width: 1.2rem;
		height: 1.2rem;
		padding: 0;

		background-color: var(--resource-color);
		color: var(--color-grayscale-6);
		border: none;
		border-radius: 50%;
	}

	button.circle:hover {
		background-color: var(--resource-color);
		outline: 2px solid var(--color-grayscale-5);
	}

	button.circle.selected {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.circle :global(.person) {
		width: 100%;
		height: 100%;
		padding: 0.15rem;
	}

	/* a unit looks like it does in your stock: its picture with a border in its resource color */
	.unit {
		width: 1.6rem;
		height: 1.6rem;

		background: center / cover no-repeat;
		border: 2px solid var(--resource-color);
	}

	.none {
		align-self: center;
		margin: auto;

		color: var(--color-grayscale-4);
		font: var(--font-tiny);
	}

	.trade {
		display: flex;
		justify-content: space-around;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.trade > div {
		flex: 1;
		text-align: center;
	}

	.traders {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}
</style>
