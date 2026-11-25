// Production server: serves the static build under /games/citystates and the game websocket.
//   bun run build && bun server.ts
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { db } from './src/lib/server/db';
import { handleUpgrade, wsPath } from './src/lib/server/ws';

const base = '/games/citystates';
const root = join(import.meta.dir, 'build');
const port = Number(process.env.PORT || 3000);

// Same tables as src/lib/server/db/schema.ts (what `bun run db:push` creates in dev).
await db.$client.executeMultiple(`
	CREATE TABLE IF NOT EXISTS gamestate (
		id text PRIMARY KEY NOT NULL,
		game_status text NOT NULL,
		state text NOT NULL,
		updated_at integer NOT NULL
	);
	CREATE TABLE IF NOT EXISTS password (
		id text PRIMARY KEY NOT NULL,
		password_hash text NOT NULL
	);
`);

const types: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain'
};

// The build hardcodes /games/citystates in index.html (the JS takes its base from there). Rewrite it so the
// browser works out the base from its own URL: then the same build works directly and behind a proxy that
// strips a path prefix (https://host/prefix/games/citystates/ reaching us as /games/citystates/).
// Every page is index.html directly under the base, so _app/ can be relative.
const indexHtml = (() => {
	const html = readFileSync(join(root, 'index.html'), 'utf8');
	const rewritten = html
		.replaceAll(`"${base}/_app/`, '"./_app/')
		.replaceAll(
			`: "${base}"`,
			`: location.pathname.slice(0, location.pathname.indexOf("${base}/")) + "${base}"`
		);
	if (rewritten.includes(`"${base}/_app/`) || rewritten.includes(`: "${base}"`) || !rewritten.includes('location.pathname')) {
		throw new Error('build/index.html has an unexpected shape, see the rewrite in server.ts');
	}
	return rewritten;
})();

const server = createServer((req, res) => {
	const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
	// relative redirects, so a proxy prefix in front of us is kept
	if (path === '/' || path === base) {
		res.writeHead(302, { location: path === '/' ? 'games/citystates/' : 'citystates/' }).end();
		return;
	}
	if (!path.startsWith(`${base}/`)) {
		res.writeHead(404).end();
		return;
	}

	const file = normalize(join(root, path.slice(base.length)));
	if (!file.startsWith(root)) {
		res.writeHead(404).end();
		return;
	}
	// every page (lobby and /:id) is the SPA fallback
	if (!existsSync(file) || statSync(file).isDirectory() || file === join(root, 'index.html')) {
		res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-cache' }).end(indexHtml);
		return;
	}

	const immutable = file.includes(`${join(root, '_app', 'immutable')}`);
	res.writeHead(200, {
		'content-type': types[extname(file)] ?? 'application/octet-stream',
		'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
	});
	createReadStream(file).pipe(res);
});

server.on('upgrade', (req, socket, head) => {
	if (req.url?.startsWith(wsPath)) handleUpgrade(req, socket, head);
	else socket.destroy();
});

server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`citystates on port ${port}${base}`));

// as PID 1 in a container nothing stops us on SIGTERM by default
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => process.exit(0));
