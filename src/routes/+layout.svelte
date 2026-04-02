<script lang="ts">
	import '@fontsource-variable/outfit';
	import '@fontsource-variable/plus-jakarta-sans';
	import 'carbon-components-svelte/css/all.css';
	import '../app.css';
	import {
		Header,
		HeaderNav,
		HeaderNavItem,
		HeaderUtilities,
		HeaderGlobalAction,
		SideNav,
		SideNavItems,
		SideNavLink,
		Content,
		SkipToContent,
		Theme
	} from 'carbon-components-svelte';
	import ScanIcon from 'carbon-icons-svelte/lib/Scan.svelte';
	import DocumentPdfIcon from 'carbon-icons-svelte/lib/DocumentPdf.svelte';
	import InformationIcon from 'carbon-icons-svelte/lib/Information.svelte';
	import LightIcon from 'carbon-icons-svelte/lib/Light.svelte';
	import AsleepIcon from 'carbon-icons-svelte/lib/Asleep.svelte';
	import WifiOff from 'carbon-icons-svelte/lib/WifiOff.svelte';
	import type { Snippet } from 'svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import { scanner } from '$lib/stores/scanner.svelte';
	import { workspace } from '$lib/stores/manipulator.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let isSideNavOpen = $state(false);
	let theme: 'g100' | 'white' = $state('g100');
	let isOnline = $state(true);

	let hasUnsavedWork = $derived(workspace.pages.length > 0 || scanner.pages.length > 0);

	function toggleTheme() {
		theme = theme === 'g100' ? 'white' : 'g100';
	}

	// beforeunload warning when there's unsaved work
	$effect(() => {
		if (typeof window === 'undefined') return;
		function handler(e: BeforeUnloadEvent) {
			if (hasUnsavedWork) {
				e.preventDefault();
			}
		}
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	// Online/offline tracking
	$effect(() => {
		if (typeof window === 'undefined') return;
		isOnline = navigator.onLine;
		function goOnline() { isOnline = true; }
		function goOffline() { isOnline = false; }
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);
		return () => {
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	});
</script>

<Theme bind:theme tokens={{
	'background': theme === 'g100' ? '#000000' : undefined,
	'layer-01': theme === 'g100' ? '#0d0d0d' : undefined,
	'layer-02': theme === 'g100' ? '#1a1a1a' : undefined,
	'layer-03': theme === 'g100' ? '#262626' : undefined,
	'field-01': theme === 'g100' ? '#0d0d0d' : undefined,
	'field-02': theme === 'g100' ? '#1a1a1a' : undefined,
	'border-subtle-01': theme === 'g100' ? '#262626' : undefined,
	'border-subtle-02': theme === 'g100' ? '#393939' : undefined,
	'ui-background': theme === 'g100' ? '#000000' : undefined,
}} />

<Header
	companyName="ScanFast"
	platformName=""
	href="/"
	bind:isSideNavOpen
>
	<svelte:fragment slot="skipToContent">
		<SkipToContent />
	</svelte:fragment>

	<HeaderNav>
		<HeaderNavItem href="/scanner" text="Scanner" />
		<HeaderNavItem href="/manipulator" text="PDF Manipulator" />
		<HeaderNavItem href="/about" text="About" />
	</HeaderNav>

	<HeaderUtilities>
		{#if !isOnline}
			<div class="offline-badge">
				<WifiOff size={16} />
				<span>Offline</span>
			</div>
		{/if}
		<HeaderGlobalAction
			aria-label={theme === 'g100' ? 'Switch to light mode' : 'Switch to dark mode'}
			on:click={toggleTheme}
		>
			{#if theme === 'g100'}
				<LightIcon size={20} />
			{:else}
				<AsleepIcon size={20} />
			{/if}
		</HeaderGlobalAction>
	</HeaderUtilities>
</Header>

<SideNav bind:isOpen={isSideNavOpen}>
	<SideNavItems>
		<SideNavLink icon={ScanIcon} text="Scanner" href="/scanner" />
		<SideNavLink icon={DocumentPdfIcon} text="PDF Manipulator" href="/manipulator" />
		<SideNavLink icon={InformationIcon} text="About" href="/about" />
	</SideNavItems>
</SideNav>

<Content>
	{@render children()}
</Content>

<Toast />

<style>
	:global(.bx--content) {
		background: var(--cds-background, #000000);
		min-height: calc(100vh - 48px);
		padding: 16px;
	}

	:global(.bx--header) {
		background-color: var(--cds-layer-01, #0d0d0d);
		border-bottom: 1px solid var(--cds-border-subtle-01, #262626);
	}

	:global(.bx--header__name) {
		font-family: 'Outfit Variable', 'Outfit', sans-serif;
		font-weight: 700;
		letter-spacing: 0.04em;
	}

	:global(.bx--side-nav),
	:global(.bx--side-nav__navigation) {
		background-color: var(--cds-layer-01, #0d0d0d);
	}

	:global(.bx--side-nav__link:hover) {
		background-color: var(--cds-layer-hover-01, #1a1a1a);
	}

	:global(body) {
		background: var(--cds-background, #000000);
	}

	.offline-badge {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.75rem;
		height: 100%;
		font-size: 0.75rem;
		color: var(--cds-support-warning, #f1c21b);
	}
</style>
