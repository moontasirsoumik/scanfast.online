import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { buildSync } from 'esbuild';

const buildTimestamp = new Date().toISOString();

/** Plugin that builds the service worker with the build timestamp inlined */
function buildServiceWorker(): Plugin {
	return {
		name: 'build-service-worker',
		apply: 'build',
		closeBundle() {
			buildSync({
				entryPoints: [path.resolve(__dirname, 'src/service-worker.ts')],
				outfile: path.resolve(__dirname, 'dist/service-worker.js'),
				bundle: true,
				minify: true,
				format: 'iife',
				define: {
					'__BUILD_TIMESTAMP__': JSON.stringify(buildTimestamp),
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
