<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import Popup from '#lib/components/Popup.svelte';
	import '../app.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>City States of Italy</title>
</svelte:head>

{@render children()}

<Popup />
