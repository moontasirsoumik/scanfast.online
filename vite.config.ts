import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { buildSync } from 'esbuild';

const buildTimestamp = new Date().toISOString();

/** Scan dist/ after build, collect all asset paths, inject into SW as precache manifest */
function buildServiceWorker(): Plugin {
	return {
		name: 'build-service-worker',
		apply: 'build',
		closeBundle() {
			const distDir = path.resolve(__dirname, 'dist');
			const assetFiles: string[] = [];

			// Collect all files from dist/assets/
			const assetsDir = path.join(distDir, 'assets');
			if (fs.existsSync(assetsDir)) {
				for (const file of fs.readdirSync(assetsDir)) {
					assetFiles.push(`/assets/${file}`);
				}
			}

			buildSync({
				entryPoints: [path.resolve(__dirname, 'src/service-worker.ts')],
				outfile: path.join(distDir, 'service-worker.js'),
				bundle: true,
				minify: true,
				format: 'iife',
				define: {
					'__BUILD_TIMESTAMP__': JSON.stringify(buildTimestamp),
					'__PRECACHE_ASSETS__': JSON.stringify(assetFiles),
				},
			});
		}
	};
}

export default defineConfig({
	plugins: [react(), buildServiceWorker()],
	publicDir: 'static',
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src')
		}
	},
	define: {
		'__BUILD_TIMESTAMP__': JSON.stringify(buildTimestamp)
	},
	build: {
		outDir: 'dist',
		sourcemap: true
	}
});
