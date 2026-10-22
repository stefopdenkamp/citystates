<script lang="ts">
	// A closed lock, or an open one when `open` (bought / unlocked).
	let { open = false, class: className = '' }: { open?: boolean; class?: string } = $props();
</script>

<svg class={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
	<rect x="5" y="11" width="14" height="10" rx="2" />
	{#if open}
		<path d="M8 11V7a4 4 0 0 1 7.5-2" />
	{:else}
		<path d="M8 11V7a4 4 0 0 1 8 0v4" />
	{/if}
</svg>
