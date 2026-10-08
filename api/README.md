# Stalemates API: Backend for the Chess Platform

This is the backend API for Stalemates, a full-stack chess platform. It handles game logic, real-time communication, and serves as the server-side component of the Stalemates project.

## Table of Contents

- [Stalemates API: Backend for the Chess Platform](#stalemates-api-backend-for-the-chess-platform)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [API Overview](#api-overview)
  - [API Endpoints](#api-endpoints)
  - [WebSocket Events](#websocket-events)
  - [Contributing](#contributing)
  - [License](#license)

## Introduction

The Stalemates API provides the backend functionality for the Stalemates chess platform. It manages game states, handles player moves, and facilitates real-time communication between players.

## Features

- RESTful API for game management
- WebSocket support for real-time gameplay
- Game state management using chess.js
- Player authentication and session handling
- Time control for chess games

## Tech Stack

- Node.js
- Express.js
- WebSocket (ws)
- chess.js for chess logic
- TypeScript for type-safe development
- dotenv for environment variable management

## Getting Started

Follow these instructions to set up the Stalemates API on your local machine for development and testing purposes.

### Prerequisites

- Node.js 22 (see the repo-root `.nvmrc`)
- Bun

### Installation

1. Clone the repository (if you haven't already):

   ```bash
   git clone https://github.com/Maiz27/stale-mates.git
   cd stale-mates/api
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Set up environment variables:

   - Copy `.env.example` to `.env`
   - Update the variables in `.env` as needed

4. Start the development server:
   ```bash
   bun run dev
   ```

## API Overview

The Stalemates API is built around the concept of game rooms, managed by the `GameRoom` class. Here's a high-level overview of how it works:

1. **Game Creation**: When a new game is created, a `GameRoom` instance is instantiated. This class manages the game state, players, and time control.

2. **Player Management**: The `GameRoom` class handles player connections, disconnections, and reconnections. It supports two players per game, identified by their color (white or black).

3. **Game State**: The game state is managed using chess.js, which handles the chess logic, move validation, and game status checks.

4. **Time Control**: Time control is handled within the `GameRoom` class, managing player time remaining and increments.

5. **WebSocket Communication**: Real-time updates are sent to players using WebSocket connections. This includes move updates, game status changes, and time updates.

6. **Move Handling**: When a player makes a move, it's validated by the `GameRoom` class, updated in the game state, and broadcasted to both players.

7. **Game Termination**: The `GameRoom` class also manages game end conditions, such as checkmate, stalemate, or time-out scenarios.

This architecture allows for efficient management of multiple concurrent games, each isolated in its own room with real-time communication capabilities.

## Limitations / scaling

This server is intentionally simple and runs as a **single instance**:

- **In-memory state.** All game rooms live in a process-local `Map`. There is no
  database or shared cache.
- **Restart loses games.** Because state is in memory, a restart or crash drops all
  in-progress games. (Graceful shutdown closes sockets cleanly but does not persist
  games.)
- **Not horizontally scalable as-is.** Running multiple instances behind a load
  balancer would split rooms across processes; a player and their opponent could land
  on different instances. Scaling out would require **sticky sessions** (to pin a
  game's players to one instance) and/or moving room state into a shared store
  (e.g. Redis) plus a pub/sub layer for cross-instance broadcasts.
- **Memory is bounded by room TTL.** A periodic sweep reaps abandoned rooms — those
  older than `ROOM_TTL_MS` (default 30 min) with no connected players — so rooms that
  are created but never joined, or long finished, cannot leak indefinitely.
- **Crashes exit.** Per-socket problems (oversized or malformed frames, protocol
  errors) are handled on the socket and never reach the process. A genuinely uncaught
  exception logs, shuts down and exits non-zero so the process manager (Fly's machine
  restart policy, Docker `restart:`) starts a clean process — the in-memory games are
  lost either way, but a half-updated room is never served. Unhandled promise
  rejections are logged and the process keeps running.
- **Concurrent WebSockets are capped per IP** (`MAX_WS_CONNECTIONS_PER_IP`, default 20).
- **Room creation is rate-limited per IP** (default ~30 creates / 10 min) to prevent
  spam; this limiter is also in-memory and therefore per-instance.

## Configuration

Environment variables (validated at startup; the server fails fast on invalid values):

| Variable                    | Required           | Default                 | Notes                                                                                                                                                                                                                             |
| --------------------------- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                      | No                 | `3000`                  | Must be an integer 1-65535 if set.                                                                                                                                                                                                |
| `ORIGIN`                    | In production only | `http://localhost:5173` | Allowed frontend origin(s), comma-separated. Used for CORS **and** the WebSocket `Origin` check. Required in production.                                                                                                          |
| `ROOM_TTL_MS`               | No                 | `1800000` (30 min)      | How long a room with nobody connected is kept (measured from its last activity) before the sweep reaps it.                                                                                                                        |
| `DISCONNECT_GRACE_MS`       | No                 | `60000` (60 s)          | How long a disconnected player has to return before the opponent may claim the win.                                                                                                                                               |
| `TRUST_PROXY`               | No                 | `1`                     | Reverse-proxy hops trusted for the client IP in `X-Forwarded-For` (Express `trust proxy`; also used for WebSockets). `1` fits Fly.io's edge; use `0` when exposed directly, or clients can spoof their IP past the per-IP limits. |
| `MAX_WS_CONNECTIONS_PER_IP` | No                 | `20`                    | Concurrent WebSocket connections per client IP; extra ones are closed with `1013` ("Too many connections").                                                                                                                       |

Outside production the WebSocket `Origin` check also accepts any `localhost` origin
and origin-less clients, so local tools work.

## API Endpoints

- `GET /health` → `{ status: 'ok', rooms }`
- `POST /game/create` — body `{ time: 0 | 1 | 3 | 10, color?: 'white' | 'black' | 'random' }`
  (`color` is the creator's seat, default white; `random` is resolved on the server).
  Responds `{ id, you: { color, token }, invite: { color, token } }`. Rate-limited per IP.

## WebSocket protocol

Connect to `/game/join?id=<roomId>` — the URL carries no secret. The wire types are
defined once in `src/lib/protocol.ts` (copied verbatim to the frontend; run
`node scripts/sync-protocol.mjs` from the repo root after editing, CI checks the copies
match). Every inbound frame is validated (`src/lib/validate.ts`), frames are capped at
4 KB, each connection has a message-rate budget, and dead sockets are reaped by a
ping/pong heartbeat.

**Seats.** The first frame must be `{ type: 'join', token }`. The token selects the seat
— the client never chooses its colour. The tokens returned by `/game/create` are
single-use: the first `join` rotates the seat's token and returns the new one in
`seat`, so a spent invite link can't take over the seat. Reconnecting (same tab) sends
the rotated token; a newer connection for a seat replaces the older one (closed with
code `4000`). Bad room / bad token / no `join` within 10 s → close `1008`.

Client → server: `join`, `move { from, to, promotion? }`, `resign`, `offerRematch`,
`acceptRematch`, `claimVictory`, `offerDraw`, `acceptDraw`, `declineDraw`.

Server → client: `seat`, `opponentJoined`, `opponentDisconnected { graceMs }`,
`opponentReconnected`, `gameStart` (incl. opponent presence: `opponentConnected`,
`opponentGraceMs` — the creator may have left before the friend joined), `opponentMove` (normalised), `clock`, `gameOver`
(`winner`, `reason`), `gameState` (full per-player resync: FEN, UCI move list, clocks,
result, rematch and draw-offer state, opponent presence), `rematchOffer`,
`rematchAccepted { color }` (colours swap on every rematch), `drawOffer`, `drawDeclined`.

Draw offers are server-authoritative: an offer stands until the opponent accepts,
declines or moves (an implicit decline); both sides offering is an agreement; a side can
re-offer only once a move has been played since its last offer (a refused re-offer is
answered with `drawDeclined`, and the client disables the button until then).

The server is authoritative for outcomes and time: clients can't declare a result,
a move that arrives after the mover's flag fell loses on time, and a disconnected
player's clock keeps running.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the GNU General Public License v3.0 (GPL-3.0). For more details, see the [LICENSE](../LICENSE) file in the root directory of this repository.
