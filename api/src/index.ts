import http from 'http';

import app from './app';
import WebSocket from 'ws';
import { handleWebSocketConnection } from './lib/websocket';

const server = http.createServer(app);

// Create a WebSocket server attached to the HTTP server
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on('connection', handleWebSocketConnection);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
