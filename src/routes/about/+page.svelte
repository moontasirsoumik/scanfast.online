<script lang="ts">
	import { Grid, Row, Column } from 'carbon-components-svelte';
	import LogoGithubIcon from 'carbon-icons-svelte/lib/LogoGithub.svelte';
	import LicenseIcon from 'carbon-icons-svelte/lib/License.svelte';
	import ShieldIcon from 'carbon-icons-svelte/lib/Security.svelte';
</script>

<svelte:head>
	<title>About — ScanFast</title>
</svelte:head>

<div class="about-page">
	<Grid>
		<Row>
			<Column sm={4} md={8} lg={10}>
				<section class="page-header">
					<h1>About ScanFast</h1>
					<p class="lead">
						A free, open-source document scanner and PDF manipulator.
						No ads, no logins, no tracking. Everything runs in your browser.
					</p>
				</section>

				<section class="info-section">
					<div class="info-card">
						<div class="info-icon"><ShieldIcon size={20} /></div>
						<div>
							<strong>Privacy</strong>
							<p>
								All processing happens locally on your device. No data is ever uploaded
								to any server. No analytics. No cookies for tracking. Your documents
								never leave your browser.
							</p>
						</div>
					</div>

					<div class="info-card">
						<div class="info-icon"><LicenseIcon size={20} /></div>
						<div>
							<strong>License</strong>
							<p>
								ScanFast is released under the MIT License. You are free to use, modify,
								and distribute this software.
							</p>
						</div>
					</div>

					<div class="info-card">
						<div class="info-icon"><LogoGithubIcon size={20} /></div>
						<div>
							<strong>Open Source</strong>
							<p>
								Source code is available on GitHub. Contributions welcome.
							</p>
							<a
								href="https://github.com/moontasirsoumik/scanfast.online"
								target="_blank"
								rel="noopener"
								class="github-link"
							>
								View on GitHub
							</a>
						</div>
					</div>
				</section>

				<section class="how-section">
					<h2>How it Works</h2>
					<ol class="how-list">
						<li>
							<strong>Scan or Import</strong>
							<span>Use your camera to scan documents, or import images and PDFs from your device.</span>
						</li>
						<li>
							<strong>Edit & Enhance</strong>
							<span>Crop, rotate, apply filters, and rearrange pages. All processing happens instantly in your browser.</span>
						</li>
						<li>
							<strong>Export</strong>
							<span>Download as PDF or images. Share directly from your device. No account needed.</span>
						</li>
					</ol>
				</section>

				<section class="shortcuts-section">
					<h2>Keyboard Shortcuts</h2>
					<div class="shortcuts-grid">
						<div class="shortcut"><kbd>Ctrl</kbd> + <kbd>Z</kbd> <span>Undo</span></div>
						<div class="shortcut"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> <span>Redo</span></div>
						<div class="shortcut"><kbd>Ctrl</kbd> + <kbd>A</kbd> <span>Select all</span></div>
						<div class="shortcut"><kbd>Delete</kbd> <span>Delete selected</span></div>
						<div class="shortcut"><kbd>←</kbd> <kbd>→</kbd> <span>Navigate pages</span></div>
					</div>
				</section>

				<section class="tech-section">
					<h2>Built with</h2>
					<div class="tech-grid">
						<div class="tech-item">
							<strong>SvelteKit</strong>
							<span>Framework</span>
						</div>
						<div class="tech-item">
							<strong>IBM Carbon</strong>
							<span>Design system</span>
						</div>
						<div class="tech-item">
							<strong>pdf-lib</strong>
							<span>PDF manipulation</span>
						</div>
						<div class="tech-item">
							<strong>pdf.js</strong>
							<span>PDF rendering</span>
						</div>
						<div class="tech-item">
							<strong>OpenCV.js</strong>
							<span>Document scanning</span>
						</div>
						<div class="tech-item">
							<strong>Cloudflare Pages</strong>
							<span>Hosting</span>
						</div>
					</div>
				</section>

				<section class="limits-section">
					<h2>Limitations</h2>
					<ul>
						<li>Maximum 20 pages per session</li>
						<li>Session data is lost on page refresh (no database)</li>
						<li>PDF compression works best on image-heavy PDFs</li>
						<li>Camera scanning requires HTTPS and browser permissions</li>
					</ul>
				</section>

				<footer class="page-footer">
					<p>Version 0.0.1 · MIT License · Made for everyday users</p>
				</footer>
			</Column>
		</Row>
	</Grid>
</div>

<style>
	.about-page {
		max-width: 1312px;
		margin: 0 auto;
	}

	.page-header {
		padding: 32px 0 24px;
	}

	.page-header h1 {
		font-family: var(--sf-font-heading);
		font-size: 1.75rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0 0 12px;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.lead {
		font-size: 1rem;
		line-height: 1.6;
		color: var(--cds-text-secondary, #c6c6c6);
		margin: 0;
	}

	h2 {
		font-family: var(--sf-font-heading);
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 16px;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.info-section {
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-md);
		overflow: hidden;
		margin-bottom: 48px;
	}

	.info-card {
		display: flex;
		gap: 16px;
		padding: 24px;
		background: var(--cds-layer-01, #0d0d0d);
	}

	.info-icon {
		color: var(--cds-interactive, #0f62fe);
		flex-shrink: 0;
		padding-top: 2px;
	}

	.info-card strong {
		display: block;
		font-size: 0.875rem;
		margin-bottom: 4px;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.info-card p {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--cds-text-secondary, #c6c6c6);
		margin: 0 0 8px;
	}

	.github-link {
		font-size: 0.8125rem;
		color: var(--cds-link-primary, #78a9ff);
		text-decoration: none;
		font-family: var(--sf-font-body);
		font-weight: 600;
	}

	.github-link:hover {
		color: var(--cds-link-primary-hover, #a6c8ff);
		text-decoration: underline;
	}

	.tech-section {
		margin-bottom: 48px;
	}

	.how-section {
		margin-bottom: 48px;
	}

	.how-list {
		list-style: none;
		padding: 0;
		margin: 0;
		counter-reset: howstep;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.how-list li {
		counter-increment: howstep;
		display: flex;
		gap: 16px;
		padding: 20px;
		background: var(--cds-layer-01, #0d0d0d);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-md, 12px);
	}

	.how-list li::before {
		content: counter(howstep);
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--cds-interactive, #0f62fe);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.how-list li strong {
		display: block;
		font-size: 0.875rem;
		margin-bottom: 4px;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.how-list li span {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--cds-text-secondary, #c6c6c6);
	}

	.shortcuts-section {
		margin-bottom: 48px;
	}

	.shortcuts-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.shortcut {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8125rem;
		color: var(--cds-text-secondary, #c6c6c6);
	}

	.shortcut span {
		margin-left: auto;
		color: var(--cds-text-primary, #f4f4f4);
	}

	kbd {
		background: var(--cds-layer-02, #1a1a1a);
		border: 1px solid var(--cds-border-subtle-01, #262626);
		border-radius: 4px;
		padding: 2px 6px;
		font-family: var(--sf-font-body);
		font-size: 0.75rem;
		min-width: 24px;
		text-align: center;
	}

	.tech-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 1px;
		background: var(--cds-border-subtle-01, #262626);
		border-radius: var(--sf-radius-md);
		overflow: hidden;
	}

	.tech-item {
		background: var(--cds-layer-01, #0d0d0d);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tech-item strong {
		font-size: 0.875rem;
		color: var(--cds-text-primary, #f4f4f4);
	}

	.tech-item span {
		font-size: 0.75rem;
		color: var(--cds-text-placeholder, #6f6f6f);
	}

	.limits-section {
		margin-bottom: 48px;
	}

	.limits-section ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.limits-section li {
		font-size: 0.875rem;
		color: var(--cds-text-secondary, #c6c6c6);
		padding: 8px 0;
		border-bottom: 1px solid var(--cds-border-subtle-01, #262626);
	}

	.page-footer {
		padding: 32px 0;
		border-top: 1px solid var(--cds-border-subtle-01, #262626);
	}

	.page-footer p {
		font-size: 0.75rem;
		color: var(--cds-text-placeholder, #6f6f6f);
		margin: 0;
	}
</style>
