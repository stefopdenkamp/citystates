<script lang="ts">
	// An information icon that shows its text when you hover or click it, above the icon or to its right
	// (e.g. at the top of a dialog, where above would end up under the objectives).
	let { text, placement = 'top' }: { text: string; placement?: 'top' | 'right' } = $props();

	let isOpen = $state(false);
</script>

<span class="info">
	<button type="button" aria-label={text} onclick={() => (isOpen = !isOpen)} onblur={() => (isOpen = false)}>
		<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<path d="M24,2A22,22,0,1,0,46,24,21.9,21.9,0,0,0,24,2Zm0,40A18,18,0,1,1,42,24,18.1,18.1,0,0,1,24,42Z" />
			<path d="M24,20a2,2,0,0,0-2,2V34a2,2,0,0,0,4,0V22A2,2,0,0,0,24,20Z" />
			<circle cx="24" cy="14" r="2" />
		</svg>
	</button>
	<span class="tip" class:open={isOpen} class:right={placement === 'right'} role="tooltip">{text}</span>
</span>

<style>
	.info {
		position: relative;
		display: inline-flex;
		vertical-align: middle;
	}

	button {
		display: flex;
		padding: 0;

		background: none;
		color: var(--color-grayscale-5);
		border: none;
	}

	button:hover:not(:disabled) {
		background: none;
		color: var(--color-grayscale-6);
	}

	svg {
		width: 1.1rem;
		height: 1.1rem;

		fill: currentColor;
	}

	/* above the icon, shown while hovered or after a click */
	.tip {
		position: absolute;
		bottom: calc(100% + 0.4rem);
		left: 50%;
		z-index: 5;
		display: none;
		width: max-content;
		max-width: 14rem;
		padding: 0.3rem 0.5rem;

		background-color: var(--color-grayscale-1);
		color: var(--color-grayscale-6);
		border: 1px solid var(--color-grayscale-4);
		border-radius: var(--border-radius);
		font: var(--font-tiny);
		white-space: pre-line;

		transform: translateX(-50%);
		pointer-events: none;
	}

	.tip.right {
		bottom: auto;
		top: 50%;
		left: calc(100% + 0.4rem);

		transform: translateY(-50%);
	}

	.info:hover .tip,
	.tip.open {
		display: block;
	}
</style>
