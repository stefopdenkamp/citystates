import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// SvelteKit has no websockets, so the game's websocket server is attached to Vite's dev server.
const websocketServer = (): Plugin => ({
	name: 'citystates-websocket',
	configureServer(server) {
		server.httpServer?.on('upgrade', async (request, socket, head) => {
			if (!request.url?.startsWith('/games/citystates/ws')) return;
			const { handleUpgrade } = await server.ssrLoadModule('/src/lib/server/ws.ts');
			handleUpgrade(request, socket, head);
		});
	}
});

export default defineConfig(({ mode }) => {
	// Make DATABASE_URL from .env available to the websocket server.
	Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				paths: { base: '/games/citystates' },

				// Pages are only rendered in the browser, so the build is static files with an SPA fallback,
				// served by server.ts together with the websocket.
				adapter: adapter({ fallback: 'index.html' })
			}),
			websocketServer()
		],
		// PORT comes from .env; without it Vite uses its default.
		server: {
			port: process.env.PORT ? Number(process.env.PORT) : undefined
		}
	};
});
