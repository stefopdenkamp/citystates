<script lang="ts">
	import { talentResource } from '#lib/game/config.ts';
	import { bidLabel, cultureWorth, fullName, getPlayer, hasEffect } from '#lib/game/logic.ts';
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
	// with Centralization power can pay what you lack
	const extra = $derived(me && hasEffect(me, 'centralization') ? me.resources.power : 0);

	// every bid on this talent, lowest first, so the highest is at the bottom. Of equal bids the one that wins the tie
	// (eligible is in turn order from the first player) is lowest.
	const history = $derived(
		(auction.history ?? []).toSorted(
			(a, b) => a.total - b.total || auction.eligible.indexOf(b.playerId) - auction.eligible.indexOf(a.playerId)
		)
	);

	// the players who cannot bid (their people cap is reached), shown greyed out under the others
	const capped = $derived(game.players.filter((p) => !auction.eligible.includes(p.id)));

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
		{#each capped as player (player.id)}
			<li class="capped" data-color={player.color}>
				<span class="name">{fullName(game, player)}</span>
				<span class="has">people cap reached</span>
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
				<input type="number" bind:value={amount} min={myBid} max={me.resources[resource] + extra} />
				{resource}
			</label>
			{#if usesCulture}
				<span>+</span>
				<label>
					<input type="number" bind:value={culture} min={myCulture} max={me.resources.culture + extra} />
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

	<!-- the bids under each other, the highest at the bottom -->
	{#if history.length}
		<ol class="bids" aria-label="Bids">
			{#each history as bid, i (i)}
				{@const bidder = getPlayer(game, bid.playerId)}
				<li>
					{bid.total}{usesCulture && bid.culture ? ` (${bidLabel(resource, bid.amount, bid.culture)})` : ` ${resource}`} by
					<span class="leader" data-color={bidder.color}>{fullName(game, bidder)}</span>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="highest">No bids yet</p>
	{/if}
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

	/* a player who cannot bid */
	li.capped {
		opacity: 0.5;
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

	/* the bid log: plain lines, not player rows */
	.bids {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		margin: 1rem 0 0;
		padding: 0.3rem 0 0;

		list-style: none;
	}

	.bids li {
		display: block;
		padding: 0;
		text-align: center;

		color: var(--color-grayscale-5);
		background: none;
		border: none;
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
