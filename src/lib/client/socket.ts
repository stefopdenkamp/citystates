import type { ClientMessage, ServerMessage } from '../game/types';

const wsPath = '/games/citystates/ws';

// Opens the game websocket and reconnects when the connection drops.
export const connect = (onOpen: () => void, onMessage: (message: ServerMessage) => void) => {
	let ws: WebSocket;
	let isClosed = false;
	let retry: ReturnType<typeof setTimeout>;

	const open = () => {
		const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
		ws = new WebSocket(`${protocol}://${location.host}${wsPath}`);
		ws.onopen = onOpen;
		ws.onmessage = (event) => onMessage(JSON.parse(event.data));
		ws.onclose = () => {
			if (!isClosed) retry = setTimeout(open, 1000);
		};
	};
	open();

	return {
		send: (message: ClientMessage) => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
		},
		close: () => {
			isClosed = true;
			clearTimeout(retry);
			ws.close();
		}
	};
};
