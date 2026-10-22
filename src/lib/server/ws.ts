import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { eq } from 'drizzle-orm';
import { WebSocketServer, type WebSocket } from 'ws';
import { db } from './db';
import { gamestate, password } from './db/schema';
import { bornPhaseMs } from '../game/config';
import * as game from '../game/logic';
import type { ClientMessage, GameState, LobbyGame, ServerMessage } from '../game/types';

export const wsPath = '/games/citystates/ws';

type Connection = { gameId: string | null; playerId: string | null; inLobby: boolean };

// State lives on globalThis so it survives when Vite reloads this module after a code change in dev.
// Open connections then keep working and their messages go to the newest code (see setup below).
type Shared = {
	connections: Map<WebSocket, Connection>;
	games: Map<string, GameState>;
	timers: Map<string, { key: string; timeout: ReturnType<typeof setTimeout> }>;
	wss: WebSocketServer;
	onMessage: (ws: WebSocket, data: string) => Promise<void>;
	onClose: (ws: WebSocket) => void;
};
const shared: Shared = ((globalThis as { __citystates?: Shared }).__citystates ??= {
	connections: new Map(),
	games: new Map(),
	timers: new Map(),
	wss: new WebSocketServer({ noServer: true }),
	onMessage: async () => {},
	onClose: () => {}
});
const { connections, games, timers } = shared;

// ---- persistence ----

const hashPassword = (plain: string) => {
	const salt = randomBytes(16).toString('hex');
	return `${salt}:${scryptSync(plain, salt, 32).toString('hex')}`;
};

const checkPassword = (plain: string, stored: string) => {
	const [salt, hash] = stored.split(':');
	return timingSafeEqual(scryptSync(plain, salt, 32), Buffer.from(hash, 'hex'));
};

const save = async (state: GameState) => {
	const row = { gameStatus: state.gameStatus, state, updatedAt: new Date() };
	await db
		.insert(gamestate)
		.values({ id: state.id, ...row })
		.onConflictDoUpdate({ target: gamestate.id, set: row });
};

const loadGame = async (id: string) => {
	if (games.has(id)) return games.get(id)!;
	const row = await db.query.gamestate.findFirst({ where: eq(gamestate.id, id) });
	if (!row) return null;
	const state = row.state as GameState;
	// Nobody is connected to a game that was not in memory, e.g. after a server restart.
	for (const player of state.players) {
		if (player.isConnected) game.disconnectPlayer(state, player.id, Date.now());
	}
	games.set(id, state);
	return state;
};

// ---- sending ----

const send = (ws: WebSocket, message: ServerMessage) => {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
};

const lobbyList = async (): Promise<LobbyGame[]> => {
	const rows = await db.query.gamestate.findMany();
	return rows
		.map((row) => {
			const state = games.get(row.id);
			if (state) return { state, isLoaded: true };
			return { state: row.state as GameState, isLoaded: false };
		})
		.map(({ state, isLoaded }) => ({
			id: state.id,
			name: state.name,
			// Nobody is connected to a game that is not in memory, so a running one counts as saved.
			gameStatus: !isLoaded && state.gameStatus === 'inProgress' ? 'saved' : state.gameStatus,
			// Players leave an open game when they disconnect, so one that is not in memory has nobody in it.
			playerCount: !isLoaded && state.gameStatus === 'open' ? 0 : state.players.length,
			connectedCount: isLoaded ? state.players.filter((p) => p.isConnected).length : 0,
			maxPlayerCount: state.maxPlayerCount,
			hasPassword: state.lobbyPasswordId !== null,
			winners: (state.winnerIds ?? []).map((id) => {
				const { name, color } = game.getPlayer(state, id);
				return { name, color };
			})
		}));
};

const broadcastLobby = async () => {
	const games = await lobbyList();
	for (const [ws, connection] of connections) {
		if (connection.inLobby) send(ws, { type: 'lobby:list', games });
	}
};

const broadcastGame = (state: GameState) => {
	const publicState = game.toPublic(state);
	for (const [ws, connection] of connections) {
		if (connection.gameId === state.id) send(ws, { type: 'game:state', state: publicState });
	}
};

// ---- timers: the born phase and the turn timer ----

// Only reschedules when the phase, turn or status changed, so e.g. a chat message does not reset a timer.
const schedule = (state: GameState) => {
	const key = [state.gameStatus, state.phase, state.stats.nrOfGenerations, state.turnsTaken, state.turnEndsAt].join(':');
	if (timers.get(state.id)?.key === key) return;
	clearTimeout(timers.get(state.id)?.timeout);
	timers.delete(state.id);
	if (state.gameStatus !== 'inProgress') return;

	let delay: number | null = null;
	let action: (() => void) | null = null;
	if (state.phase === 'born') {
		delay = bornPhaseMs;
		action = () => game.finishBorn(state, Date.now());
	} else if (state.phase === 'action' && state.turnEndsAt) {
		delay = Math.max(0, state.turnEndsAt - Date.now());
		action = () => game.endTurn(state, null, Date.now());
	}
	if (delay === null || !action) return;
	const run = action;
	const timeout = setTimeout(() => {
		timers.delete(state.id);
		run();
		changed(state).catch((error) => console.error(error));
	}, delay);
	timers.set(state.id, { key, timeout });
};

const changed = async (state: GameState) => {
	schedule(state);
	broadcastGame(state);
	await save(state);
	await broadcastLobby();
};

// ---- message handling ----

const handlers: {
	[K in ClientMessage['type']]: (
		ws: WebSocket,
		connection: Connection,
		message: Extract<ClientMessage, { type: K }>
	) => Promise<void>;
} = {
	'lobby:subscribe': async (ws, connection) => {
		connection.inLobby = true;
		send(ws, { type: 'lobby:list', games: await lobbyList() });
	},

	'lobby:create': async (ws, _connection, { settings }) => {
		let lobbyPasswordId: string | null = null;
		if (settings.password) {
			lobbyPasswordId = crypto.randomUUID();
			await db.insert(password).values({ id: lobbyPasswordId, passwordHash: hashPassword(settings.password) });
		}
		const state = game.createGameState(settings, crypto.randomUUID(), lobbyPasswordId);
		games.set(state.id, state);
		await save(state);
		send(ws, { type: 'lobby:created', id: state.id });
		await broadcastLobby();
	},

	'lobby:delete': async (_ws, _connection, { gameId }) => {
		const state = await loadGame(gameId);
		if (!state) throw new Error('This game does not exist anymore');
		if (!['saved', 'open', 'finished'].includes(state.gameStatus) || state.players.some((p) => p.isConnected)) {
			throw new Error('Only open, saved or finished games without connected players can be deleted');
		}
		clearTimeout(timers.get(gameId)?.timeout);
		timers.delete(gameId);
		games.delete(gameId);
		await db.delete(gamestate).where(eq(gamestate.id, gameId));
		if (state.lobbyPasswordId) await db.delete(password).where(eq(password.id, state.lobbyPasswordId));
		await broadcastLobby();
	},

	'game:join': async (ws, connection, { gameId, token, password: plain }) => {
		const state = await loadGame(gameId);
		if (!state || state.gameStatus === 'finished') throw new Error('This game does not exist anymore');
		connection.inLobby = false;

		const returning = token ? state.players.find((p) => p.token === token) : undefined;
		if (returning) {
			if (returning.isConnected) throw new Error('You are already playing this game in another tab');
			returning.isConnected = true;
			connection.gameId = gameId;
			connection.playerId = returning.id;
			send(ws, { type: 'game:joined', playerId: returning.id, token: returning.token });
			await changed(state);
			return;
		}

		if (state.lobbyPasswordId) {
			const row = await db.query.password.findFirst({ where: eq(password.id, state.lobbyPasswordId) });
			if (!plain || !row || !checkPassword(plain, row.passwordHash)) {
				send(ws, { type: 'game:passwordRequired' });
				return;
			}
		}

		connection.gameId = gameId;
		if (state.gameStatus === 'open') {
			const player = game.addPlayer(state);
			connection.playerId = player.id;
			send(ws, { type: 'game:joined', playerId: player.id, token: player.token });
			await changed(state);
		} else {
			// In a saved game you can adopt a player that is not connected.
			send(ws, { type: 'game:joined', playerId: null, token: null });
			send(ws, { type: 'game:state', state: game.toPublic(state) });
		}
	},

	'player:adopt': async (ws, connection, { playerId }) => {
		const state = currentGame(connection);
		if (state.gameStatus !== 'saved') throw new Error('You can only take over a player in a saved game');
		if (connection.playerId) throw new Error('You are already playing');
		const player = game.getPlayer(state, playerId);
		if (player.isConnected) throw new Error('That player is still connected');
		player.isConnected = true;
		player.token = crypto.randomUUID(); // the old browser can no longer reconnect as this player
		connection.playerId = player.id;
		send(ws, { type: 'game:joined', playerId: player.id, token: player.token });
		await changed(state);
	},

	'player:update': async (_ws, connection, { name, color, characteristics }) => {
		const state = currentGame(connection);
		game.updatePlayer(state, currentPlayer(connection), { name, color, characteristics });
		await changed(state);
	},

	'player:ready': async (_ws, connection, { ready }) => {
		const state = currentGame(connection);
		game.setReady(state, currentPlayer(connection), ready);
		game.resumeIfPossible(state, Date.now());
		await changed(state);
	},

	'game:start': async (_ws, connection) => {
		const state = currentGame(connection);
		currentPlayer(connection);
		game.startGame(state);
		await changed(state);
	},

	'auction:bid': async (_ws, connection, { amount, culture }) => {
		const state = currentGame(connection);
		assertRunning(state);
		game.placeBid(state, currentPlayer(connection), amount, culture);
		await changed(state);
	},

	'auction:done': async (_ws, connection) => {
		const state = currentGame(connection);
		assertRunning(state);
		game.doneBidding(state, currentPlayer(connection), Date.now());
		await changed(state);
	},

	build: async (_ws, connection, { building, x, y, talents }) => {
		const state = currentGame(connection);
		game.build(state, currentPlayer(connection), building, x, y, talents);
		await changed(state);
	},

	'unit:buy': async (_ws, connection, { unit, talents }) => {
		const state = currentGame(connection);
		game.buyUnit(state, currentPlayer(connection), unit, talents);
		await changed(state);
	},

	deploy: async (_ws, connection, { unit, x, y }) => {
		const state = currentGame(connection);
		game.deployUnit(state, currentPlayer(connection), unit, x, y);
		await changed(state);
	},

	trade: async (_ws, connection, { targetId, give, take }) => {
		const state = currentGame(connection);
		game.trade(state, currentPlayer(connection), targetId, give, take);
		await changed(state);
	},

	'technology:unlock': async (_ws, connection, { technology }) => {
		const state = currentGame(connection);
		game.unlockTechnology(state, currentPlayer(connection), technology);
		await changed(state);
	},

	'policy:unlock': async (_ws, connection, { policy }) => {
		const state = currentGame(connection);
		game.unlockPolicy(state, currentPlayer(connection), policy);
		await changed(state);
	},

	'policy:implement': async (_ws, connection, { policy, slot }) => {
		const state = currentGame(connection);
		game.implementPolicy(state, currentPlayer(connection), policy, slot);
		await changed(state);
	},

	'policy:remove': async (_ws, connection, { policy }) => {
		const state = currentGame(connection);
		game.removePolicy(state, currentPlayer(connection), policy);
		await changed(state);
	},

	'talent:retrain': async (_ws, connection, { index, talent }) => {
		const state = currentGame(connection);
		game.retrainTalent(state, currentPlayer(connection), index, talent);
		await changed(state);
	},

	'talent:indoctrinate': async (_ws, connection, { targetId, index }) => {
		const state = currentGame(connection);
		game.indoctrinate(state, currentPlayer(connection), targetId, index);
		await changed(state);
	},

	'person:propaganda': async (_ws, connection, { targetId }) => {
		const state = currentGame(connection);
		game.propaganda(state, currentPlayer(connection), targetId);
		await changed(state);
	},

	'unit:bribe': async (_ws, connection, { unitId }) => {
		const state = currentGame(connection);
		game.bribe(state, currentPlayer(connection), unitId);
		await changed(state);
	},

	'turn:end': async (_ws, connection) => {
		const state = currentGame(connection);
		game.endTurn(state, currentPlayer(connection), Date.now());
		await changed(state);
	},

	'legacy:next': async (_ws, connection) => {
		const state = currentGame(connection);
		game.readyForNextGeneration(state, currentPlayer(connection));
		await changed(state);
	},

	'cityCentre:set': async (_ws, connection, { resource }) => {
		const state = currentGame(connection);
		game.setCityCentre(state, currentPlayer(connection), resource);
		await changed(state);
	},

	chat: async (_ws, connection, { text }) => {
		const state = currentGame(connection);
		const player = game.getPlayer(state, currentPlayer(connection));
		const trimmed = text.trim().slice(0, 500);
		if (!trimmed) return;
		state.chatHistory.push({
			playerId: player.id,
			name: player.name || 'Unnamed',
			color: player.color,
			text: trimmed,
			at: Date.now()
		});
		await changed(state);
	}
};

const currentGame = (connection: Connection) => {
	const state = connection.gameId ? games.get(connection.gameId) : undefined;
	if (!state) throw new Error('You are not in a game');
	return state;
};

const currentPlayer = (connection: Connection) => {
	if (!connection.playerId) throw new Error('You are only watching this game');
	return connection.playerId;
};

const assertRunning = (state: GameState) => {
	if (state.gameStatus !== 'inProgress') throw new Error('The game is paused');
};

const onClose = async (connection: Connection) => {
	if (!connection.gameId || !connection.playerId) return;
	const state = games.get(connection.gameId);
	if (!state || !state.players.some((p) => p.id === connection.playerId)) return;
	game.disconnectPlayer(state, connection.playerId, Date.now());
	await changed(state);
};

// ---- setup ----

// Replaced every time this module is (re)loaded, so messages always run the newest code.
shared.onMessage = async (ws, data) => {
	const connection = connections.get(ws);
	if (!connection) return;
	try {
		const message = JSON.parse(data) as ClientMessage;
		const handler = handlers[message.type] as (ws: WebSocket, c: Connection, m: ClientMessage) => Promise<void>;
		if (!handler) throw new Error(`Unknown message ${message.type}`);
		await handler(ws, connection, message);
	} catch (error) {
		send(ws, { type: 'error', message: error instanceof Error ? error.message : 'Something went wrong' });
	}
};

shared.onClose = (ws) => {
	const connection = connections.get(ws);
	connections.delete(ws);
	if (connection) onClose(connection).catch((error) => console.error(error));
};

export const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
	if (!request.url?.startsWith(wsPath)) return;
	shared.wss.handleUpgrade(request, socket, head, (ws) => {
		connections.set(ws, { gameId: null, playerId: null, inLobby: false });
		ws.on('message', (data) => shared.onMessage(ws, data.toString()));
		ws.on('close', () => shared.onClose(ws));
	});
};
