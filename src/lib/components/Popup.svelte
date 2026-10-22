<script lang="ts">
	import { closePopup, popup } from '#lib/client/popup.svelte.ts';
</script>

<!-- a small dialog without a title: the message and OK (and Cancel for a confirm) -->
{#if popup.current}
	{@const current = popup.current}
	<dialog
		{@attach (node) => node.showModal()}
		oncancel={(event) => {
			event.preventDefault();
			closePopup(false);
		}}
	>
		<p>{current.message}</p>
		<div class="buttons">
			<button class="primary" {@attach (node) => node.focus()} onclick={() => closePopup(true)}>OK</button>
			{#if current.isConfirm}<button onclick={() => closePopup(false)}>Cancel</button>{/if}
		</div>
	</dialog>
{/if}

<style>
	dialog {
		max-width: 22rem;
		padding: 1rem 1.2rem;
		text-align: center;
	}

	p {
		margin: 0 0 0.8rem;

		font: var(--font-small);
	}

	.buttons {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
	}
</style>
