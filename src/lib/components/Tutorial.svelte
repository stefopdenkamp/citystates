<script lang="ts">
	import { tutorialSteps } from '#lib/game/config.ts';

	// The tutorial: a dialog in the middle of the board that explains the game step by step, with the elements of
	// each step highlighted. Not modal, so the highlighted parts stay visible.
	let { onClose }: { onClose: () => void } = $props();

	let step = $state(0);
	const current = $derived(tutorialSteps[step]);
	const isLast = $derived(step === tutorialSteps.length - 1);

	// the screen positions of the highlighted elements and the dialog, measured after rendering (the action selector
	// and side bar come after the board) and again when the window resizes
	let dialog: HTMLDialogElement;
	let resized = $state(0);
	let highlights = $state<DOMRect[]>([]);
	let dialogRect = $state<DOMRect | null>(null);
	$effect(() => {
		void resized;
		highlights = current.targets.flatMap((target) =>
			[...document.querySelectorAll(`[data-tutorial~="${target}"]`)].map((element) => element.getBoundingClientRect())
		);
		dialogRect = dialog.getBoundingClientRect();
	});

	// Where the line from a rectangle's centre towards a point leaves the rectangle.
	const edgePoint = (rect: DOMRect, x: number, y: number) => {
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const dx = x - cx;
		const dy = y - cy;
		const t = Math.min(Math.abs(rect.width / 2 / dx) || Infinity, Math.abs(rect.height / 2 / dy) || Infinity);
		return { x: cx + dx * t, y: cy + dy * t };
	};

	// An arrow from the edge of the dialog to the edge of each highlighted element. No arrow to an element the
	// dialog lies on (the board).
	const arrows = $derived(
		dialogRect
			? highlights
					.filter((rect) => {
						const x = dialogRect!.left + dialogRect!.width / 2;
						const y = dialogRect!.top + dialogRect!.height / 2;
						return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
					})
					.map((rect) => {
						const from = edgePoint(dialogRect!, rect.left + rect.width / 2, rect.top + rect.height / 2);
						const to = edgePoint(rect, from.x, from.y);
						return { from, to };
					})
			: []
	);
</script>

<svelte:window onresize={() => resized++} onkeydown={(event) => event.key === 'Escape' && onClose()} />

{#each highlights as rect, i (i)}
	<div class="highlight" style:left="{rect.left}px" style:top="{rect.top}px" style:width="{rect.width}px" style:height="{rect.height}px"></div>
{/each}

<svg class="arrows" aria-hidden="true">
	<defs>
		<marker id="tutorial-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
			<path d="M 0 0 L 10 5 L 0 10 z" />
		</marker>
	</defs>
	{#each arrows as { from, to }, i (i)}
		<line x1={from.x} y1={from.y} x2={to.x} y2={to.y} marker-end="url(#tutorial-arrowhead)" />
	{/each}
</svg>

<dialog bind:this={dialog} {@attach (node) => node.show()}>
	<!-- the texts come from config.ts, written by hand -->
	<p>{@html current.text}</p>
	<div class="buttons">
		<span class="counter">{step + 1}/{tutorialSteps.length}</span>
		<button onclick={onClose}>Cancel tutorial</button>
		<button class="primary" {@attach (node) => node.focus()} onclick={() => (isLast ? onClose() : step++)}>
			{isLast ? 'Finish' : 'Next'}
		</button>
	</div>
</dialog>

<style>
	/* an accent outline around each highlighted element, over everything but the dialog */
	.highlight {
		position: fixed;
		z-index: 4;

		border: 2px solid var(--color-accent);
		border-radius: var(--border-radius);
		box-shadow: 0 0 1rem var(--color-accent);

		pointer-events: none;
	}

	/* the arrows from the dialog to the highlights, over the whole window */
	.arrows {
		position: fixed;
		inset: 0;
		z-index: 4;
		width: 100%;
		height: 100%;

		pointer-events: none;
	}

	.arrows line {
		stroke: var(--color-accent);
		stroke-width: 2;
	}

	.arrows path {
		fill: var(--color-accent);
	}

	/* in the middle of the board */
	dialog[open] {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 5;
		max-width: min(28rem, 90%);
		margin: 0;
		padding: 1rem 1.2rem;

		transform: translate(-50%, -50%);
	}

	p {
		margin: 0 0 0.8rem;

		font: var(--font-small);
	}

	.buttons {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.counter {
		margin-right: auto;

		color: var(--color-grayscale-5);
		font: var(--font-tiny);
	}
</style>
