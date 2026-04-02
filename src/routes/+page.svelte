<script lang="ts">
	import { Grid, Row, Column, ClickableTile, Tag } from 'carbon-components-svelte';
	import ScanIcon from 'carbon-icons-svelte/lib/Scan.svelte';
	import DocumentPdfIcon from 'carbon-icons-svelte/lib/DocumentPdf.svelte';
	import ArrowRightIcon from 'carbon-icons-svelte/lib/ArrowRight.svelte';
</script>

<svelte:head>
	<title>ScanFast — Free Document Scanner & PDF Manipulator</title>
</svelte:head>

<div class="landing">
	<section class="hero">
		<h1>ScanFast</h1>
		<p class="hero-sub">
			Scan documents, manipulate PDFs. Free, offline, no sign-up.
		</p>
		<div class="hero-tags">
			<Tag type="blue">Offline-capable</Tag>
			<Tag type="green">No tracking</Tag>
			<Tag type="purple">Open source</Tag>
		</div>
	</section>

	<Grid>
		<Row>
			<Column sm={4} md={4} lg={8}>
				<a href="/scanner" class="card-link">
					<ClickableTile>
						<div class="card">
							<div class="card-icon">
								<ScanIcon size={32} />
							</div>
							<h2>Scanner</h2>
							<p>
								Scan documents with your camera or import from gallery.
								Auto-detect edges, crop, apply filters, and save as PDF or JPEG.
							</p>
							<div class="card-action">
								Open Scanner <ArrowRightIcon size={16} />
							</div>
						</div>
					</ClickableTile>
				</a>
			</Column>
			<Column sm={4} md={4} lg={8}>
				<a href="/manipulator" class="card-link">
					<ClickableTile>
						<div class="card">
							<div class="card-icon">
								<DocumentPdfIcon size={32} />
							</div>
							<h2>PDF Manipulator</h2>
							<p>
								Merge, split, rotate, reorder, delete, and compress PDF pages.
								All in one session, fully chainable with undo/redo.
							</p>
							<div class="card-action">
								Open Manipulator <ArrowRightIcon size={16} />
							</div>
						</div>
					</ClickableTile>
				</a>
			</Column>
		</Row>
	</Grid>

	<section class="features">
		<Grid>
			<Row>
				<Column sm={4} md={8} lg={16}>
					<div class="features-grid">
						<div class="feature">
							<strong>No ads. No logins.</strong>
							<span>Just open and use. Nothing gets in the way.</span>
						</div>
						<div class="feature">
							<strong>Works offline</strong>
							<span>After first load, everything runs in your browser.</span>
						</div>
						<div class="feature">
							<strong>Your data stays local</strong>
							<span>Nothing uploaded. Nothing tracked. Ever.</span>
						</div>
						<div class="feature">
							<strong>20 pages per session</strong>
							<span>Scan, merge, split — fast enough for everyday use.</span>
						</div>
					</div>
				</Column>
			</Row>
		</Grid>
	</section>
</div>

<style>
	.landing {
		max-width: 1312px;
		margin: 0 auto;
	}

	.hero {
		padding: 64px 16px 48px;
		text-align: center;
	}

	.hero h1 {
		font-family: var(--sf-font-heading);
		font-size: 2.5rem;
		font-weight: 700;
		line-height: 1.2;
		margin: 0 0 12px;
		color: var(--cds-text-primary, #f4f4f4);
		letter-spacing: -0.03em;
	}

	.hero-sub {
		font-family: var(--sf-font-body);
		font-size: 1.125rem;
		line-height: 1.5;
		color: var(--cds-text-secondary, #c6c6c6);
		margin: 0 0 24px;
		max-width: 480px;
		margin-left: auto;
		margin-right: auto;
	}

	.hero-tags {
		display: flex;
		gap: 8px;
		justify-content: center;
		flex-wrap: wrap;
	}

	.card-link {
		text-decoration: none;
		color: inherit;
		display: block;
		margin-bottom: 16px;
	}

	.card {
		padding: 8px 0;
	}

	.card-icon {
		margin-bottom: 16px;
		color: var(--cds-interactive, #0f62fe);
	}

	.card h2 {
		font-family: var(--sf-font-heading);
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 8px;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.card p {
		font-family: var(--sf-font-body);
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--cds-text-secondary, #c6c6c6);
		margin: 0 0 16px;
	}

	.card-action {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--sf-font-body);
		font-size: 0.875rem;
		color: var(--cds-link-primary, #78a9ff);
		font-weight: 600;
	}

	:global(.card-link .bx--tile--clickable) {
		background-color: var(--cds-layer-01, #0d0d0d);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-md);
		min-height: 200px;
	}

	:global(.card-link .bx--tile--clickable:hover) {
		background-color: var(--cds-layer-hover-01, #1a1a1a);
	}

	.features {
		padding: 48px 0;
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1px;
		background: var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-md);
		overflow: hidden;
	}

	.feature {
		background: var(--cds-layer-01, #0d0d0d);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.feature strong {
		font-family: var(--sf-font-body);
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.feature span {
		font-family: var(--sf-font-body);
		font-size: 0.8125rem;
		color: var(--cds-text-secondary, #c6c6c6);
		line-height: 1.4;
	}

	@media (max-width: 671px) {
		.hero {
			padding: 40px 16px 32px;
		}

		.hero h1 {
			font-size: 1.75rem;
		}

		.features-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
