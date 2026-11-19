<script lang="ts">
	import { resourceTypes, type ResourceType } from '#lib/game/config.ts';
	import { hasEffect, maxTraders, tradeRatio } from '#lib/game/logic.ts';
	import type { PublicGameState, PublicPlayer } from '#lib/game/types.ts';
	import PlayerBoard from './PlayerBoard.svelte';

	// A trader put on an opponent's player board: their board above yours, to trade 2 of yours for 1 of theirs
	// (or another ratio, see tradeRatio). The trader stays in your stock until you trade.
	let {
		game,
		player,
		me,
		onTrade,
		onClose
	}: {
		game: PublicGameState;
		player: PublicPlayer;
		me: PublicPlayer;
		onTrade: (give: ResourceType[], take: ResourceType[]) => void;
		onClose: () => void;
	} = $props();

	// one circle per single resource, in resource order, as on the player boards
	const circlesOf = (owner: PublicPlayer) =>
		resourceTypes.flatMap((resource) => Array.from({ length: owner.resources[resource] }, () => resource));
	const theirCircles = $derived(circlesOf(player));
	const myCircles = $derived(circlesOf(me));

	// the selected circles, e.g. 1 of theirs and 2 of yours per trader; with Caravans for several traders at once
	const ratio = $derived(tradeRatio(me));
	const traderCount = $derived((me.undeployedUnits ?? []).filter((u) => u === 'trader').length);
	const usable = $derived(maxTraders(me));
	const hasCaravans = $derived(hasEffect(me, 'caravans'));
	let taken = $state<number[]>([]);
	let given = $state<number[]>([]);
	const count = $derived(taken.length / ratio.take);
	const canTrade = $derived(Number.isInteger(count) && count >= 1 && given.length === count * ratio.give);

	// a click selects a circle, or deselects it; no more than your traders can trade
	const toggle = (picked: number[], i: number, max: number) =>
		picked.includes(i) ? picked.filter((p) => p !== i) : picked.length < max ? [...picked, i] : picked;

	const trade = () => {
		if (!canTrade) return;
		onTrade(
			given.map((i) => myCircles[i]),
			taken.map((i) => theirCircles[i])
		);
		onClose();
	};
</script>

<dialog {@attach (node) => node.showModal()} onclose={onClose}>
	<PlayerBoard {game} {player} isTrading selected={taken} onPick={(i) => (taken = toggle(taken, i, ratio.take * usable))} />

	<div class="trade">
		<!-- three equal parts, so the button is in the centre -->
		<!-- without Caravans you trade with one trader, so the count is left out (the empty part keeps the button centred) -->
		<div class="traders">{#if hasCaravans}{traderCount} {traderCount === 1 ? 'trader' : 'traders'}{/if}</div>
		<div><button class="primary" disabled={!canTrade} onclick={trade}>Trade</button></div>
		<!-- with Caravans for all your traders at once -->
		<div class="traders">{ratio.take * usable} of theirs for {ratio.give * usable} of yours</div>
	</div>

	<PlayerBoard {game} player={me} isTrading selected={given} onPick={(i) => (given = toggle(given, i, ratio.give * usable))} />

	<button class="close" onclick={onClose}>Close</button>
</dialog>

<style>
	dialog {
		width: min(50rem, 90vw);
		padding: 2rem 2.5rem;
		text-align: center;
	}

	.trade {
		display: flex;
		justify-content: space-around;
		align-items: center;
		margin: 1.2rem 0;
	}

	.trade > div {
		flex: 1;
		text-align: center;
	}

	.traders {
		color: var(--color-grayscale-5);
		font: var(--font-small);
	}

	.close {
		margin-top: 0.8rem;
	}
</style>
