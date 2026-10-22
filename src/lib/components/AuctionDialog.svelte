<script lang="ts">
	import { talentResource } from '#lib/game/config.ts';
	import { bidLabel, bidTotal, cultureWorth, fullName, getPlayer } from '#lib/game/logic.ts';
	import type { Auction, ClientMessage, PublicGameState, PublicPlayer } from '#lib/game/types.ts';

	let {
		game,
		me,
		send
	}: { game: PublicGameState; me: PublicPlayer | null; send: (message: ClientMessage) => void } = $props();

	const auction = $derived(game.auction as Auction);
	const talent = $derived(auction.talent!);
	const resource = $derived(talentResource[talent]);
	const canBid = $derived(!!me && auction.eligible.includes(me.id) && !auction.done.includes(me.id));
	// Culture adds to any bid; for an artist the talent's own resource already is culture.
	const usesCulture = $derived(resource !== 'culture');
	const myBid = $derived(me ? (auction.bids[me.id] ?? 0) : 0);
	const myCulture = $derived(me ? (auction.cultureBids?.[me.id] ?? 0) : 0);

	// eligible is in turn order from the first player, so the first highest bid is the one that wins a tie
	const highest = $derived(
		auction.eligible.reduce<string | null>(
			(best, id) => (bidTotal(game, id) > (best ? bidTotal(game, best) : 0) ? id : best),
			null
		)
	);

	// the first player in turn order who can bid
	const tieWinner = $derived(getPlayer(game, auction.eligible[0]));

	let amount = $state(0);
	let culture = $state(0);
	$effect(() => {
		amount = myBid;
		culture = myCulture;
	});
</script>

<dialog {@attach (node) => node.showModal()} oncancel={(event) => event.preventDefault()}>
	<h2>A talented {talent} is born</h2>
	<p>
		Bid with <strong data-resource={resource} class="resource">{resource}</strong>{#if usesCulture}{' '}and
			<strong data-resource="culture" class="resource">culture</strong>, each counts 1{/if}. The highest bid wins,
		ties go to <span class="tie" data-color={tieWinner.color}>{fullName(game, tieWinner)}</span>.
	</p>

	<ul>
		{#each auction.eligible as id (id)}
			{@const player = getPlayer(game, id)}
			<li data-color={player.color}>
				<span class="name">{fullName(game, player)}</span>
				<span class="has">
					has {player.resources[resource]} {resource}{#if usesCulture}, {player.resources.culture} culture{/if}
					{#if cultureWorth(game, player) > 1}(Patron: culture counts {cultureWorth(game, player)}){/if}
				</span>
				<span class="status" class:done={auction.done.includes(id)}>{auction.done.includes(id) ? '✔ done' : 'bidding…'}</span>
			</li>
		{/each}
	</ul>

	{#if canBid && me}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				send({ type: 'auction:bid', amount, culture: usesCulture ? culture : 0 });
			}}
		>
			<label>
				<input type="number" bind:value={amount} min={myBid} max={me.resources[resource]} />
				{resource}
			</label>
			{#if usesCulture}
				<span>+</span>
				<label>
					<input type="number" bind:value={culture} min={myCulture} max={me.resources.culture} />
					culture
				</label>
			{/if}
			<button type="submit" class="primary" disabled={amount <= myBid && culture <= myCulture}>Bid</button>
			<button type="button" onclick={() => send({ type: 'auction:done' })}>Done bidding</button>
		</form>
	{:else if me && !auction.eligible.includes(me.id)}
		<p class="note">Your people cap is reached, you cannot bid on this talent.</p>
	{:else}
		<p class="note">Waiting for the others…</p>
	{/if}

	<p class="highest">
		{#if highest}
			{@const leader = getPlayer(game, highest)}
			{@const total = bidTotal(game, highest)}
			{@const parts = bidLabel(resource, auction.bids[highest], auction.cultureBids?.[highest] ?? 0)}
			Highest bid: {total}{usesCulture && auction.cultureBids?.[highest] ? ` (${parts})` : ` ${resource}`} by
			<span class="leader" data-color={leader.color}>{fullName(game, leader)}</span>
		{:else}
			No bids yet
		{/if}
	</p>
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
		font: var(--font-small);
	}

	.resource {
		color: var(--resource-color);
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 1rem 0;
		padding: 0;

		list-style: none;
	}

	/* a player row like in the lobby: change the columns and their order here */
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 6rem;
		grid-template-areas: 'name has status';
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1rem;
		text-align: left;

		background-color: var(--color-grayscale-2);
		border: 1px solid var(--color-grayscale-4);
		border-radius: var(--border-radius);
		font: var(--font-small);
	}

	.name {
		grid-area: name;

		color: var(--player-color);
		font-weight: 700;
	}

	.has {
		grid-area: has;
	}

	.status {
		grid-area: status;

		color: var(--color-grayscale-5);
	}

	/* green like the Join button in the lobby */
	.status.done {
		color: var(--color-success);
	}

	form {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
	}

	.highest {
		color: var(--color-grayscale-5);
	}

	.tie {
		color: var(--player-color);
	}

	.leader {
		color: var(--player-color);
		font-weight: 700;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	input {
		width: 5rem;
	}

	.note {
		color: var(--color-grayscale-5);
	}
</style>
