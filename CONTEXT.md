# Domain Glossary (Ubiquitous Language)

This is the shared vocabulary for the Stalemates chess platform. It defines the
terms used across the SvelteKit frontend and the Express/`ws` multiplayer backend,
and points at where each concept lives in code. Keep this in sync when the model
changes; it is the reference the ADRs in `docs/adr/` build on.

## Two deployment targets

Stalemates ships as **two separately deployed processes** (see
`docs/adr/0003-two-deployment-targets.md`):

1. **Frontend** — the SvelteKit app (repo root `src/`), built for Vercel. It serves
   the UI and runs the **AI mode** entirely in the browser (Stockfish in a Web
   Worker); no backend is involved for AI play.
2. **Backend** — a stateful Express + `ws` server (`api/`) that powers **multiplayer
   mode**. It is a long-lived process holding all game state in memory, so it cannot
   run on Vercel/serverless (see ADR 0001 and 0003).

The two communicate over REST (`POST /game/create`) and a WebSocket (`/game/join`).

---

## Core terms

### Room
A multiplayer game container, keyed by a `nanoid` id and held **in memory** for the
life of the server process. Owns the canonical `chess.js` board, the current turn,
the players, time control, and rematch state.
Lives in `api/src/lib/GameRoom.ts` (the `GameRoom` class); the registry of all rooms
is the `Map<string, GameRoom>` in `api/src/lib/game.ts`.

### Seat / color
A `color` is a side of the board, `'white' | 'black'`. There is no first-class "seat"
object yet — a color is a slot a `Player` claims. The color is still **requested by the
client** via a URL query param, but the server now **validates it** (`GameRoom.addPlayer`
rejects an out-of-domain color and rejects a second player requesting an already-taken
color, so the two players can't both be white). Full seat-token assignment remains a gap
(see ADR 0002, plan Steps 4–5, audit C3/F3).
`Color` type: `api/src/lib/types.ts` and `src/lib/chess/types.ts`. Color is read off
the WS URL in `api/src/lib/websocket.ts` (`parseConnectionParams`) and validated in
`GameRoom.addPlayer`.

### Player / playerId
A connected participant in a room. A `Player` holds `{ id, color, ws, connected }`
(clocks now live on the room, not the player — see Clock below). The `playerId` is a
server-minted `nanoid` returned in the `connected`
message; it doubles as the **reconnect credential** (the client stores it in a
JS-readable cookie and replays it on the WS URL — another authority gap, see ADR 0002).
`Player` type: `api/src/lib/types.ts`. Created in `GameRoom.addPlayer`
(`api/src/lib/GameRoom.ts`). Client-side cookie handling: `src/lib/chess/MultiplayerGameState.ts`
(`handleConnected`).

### Game state
The snapshot of a game: board (FEN), whose turn it is, both clocks, and whether the
game has started. The server's authoritative snapshot is built by
`GameRoom.getCurrentGameState` and broadcast as a `gameState` message
(`api/src/lib/GameRoom.ts`). The client mirrors it in stores (`fen`, `turn`,
`started`, `whiteTime`, `blackTime`) on `GameState` and its subclasses
(`src/lib/chess/GameState.ts`, `MultiplayerGameState.ts`).

### Clock / time control / increment / lowTimeThreshold
- **Time control** — the time settings for a game: `{ initial, lowTimeThreshold,
  increment, isUnlimited }`. Derived from a `TimeOption` (`0 | 1 | 3 | 10` minutes;
  `0` = unlimited) by `GameRoom.convertTimeOption`.
- **Clock** — a player's remaining time. The server holds it authoritatively in
  **milliseconds** (`GameRoom.clocksMs` + `turnStartedAt`) and flags time-outs with a
  single per-room watchdog; the pure math lives in `api/src/lib/clock.ts`.
- **Increment** — seconds added to a player's clock after their move (Fischer-style).
- **lowTimeThreshold** — the remaining-time level below which the UI flags "low time".
`TimeControl` / `TimeOption` types: `api/src/lib/types.ts` and `src/lib/chess/types.ts`
(now a **single canonical** definition with all fields required; the earlier drift in
audit M1 is resolved). The server broadcasts a `ClockSnapshot` (`whiteMs`, `blackMs`,
`running`, `serverTime`); the client interpolates it for **display only** in
`MultiplayerGameState` (`applyClockSnapshot`/`renderClock`) and never declares a timeout.
Clocks are server-authoritative — see ADR 0002.

### Engine / Stockfish / difficulty / hint
- **Engine / Stockfish** — the chess AI, run as a Web Worker in the browser for AI
  mode only. Wrapped by the `Stockfish` class in `src/lib/engine/Stockfish.ts`.
- **Difficulty** — an integer level mapped (via a sigmoid) to Stockfish's Skill Level
  / depth / move-time options (`Stockfish.setDifficulty`, `mapLevelToSkill`).
- **Hint** — a best-move suggestion produced by asking the engine to search the
  current position (`Stockfish.getHint`, surfaced via `AIGameState.getHint`). Hints
  are AI-mode only; `MultiplayerGameState.getHint` is a no-op.

### Move / promotion / destinations
- **Move** — a `ChessMove` (`{ from, to, promotion? }`). Validated against `chess.js`
  in `GameState.makeMove` (`src/lib/chess/GameState.ts`) and on the server in
  `GameRoom.handleMove`.
- **Promotion** — a pawn reaching the last rank, choosing a piece. Detected by
  `GameState.isPromotionMove`; the UI shows a promotion modal and stages a
  `promotionMove` before committing.
- **Destinations** — the map of legal target squares per piece for the side to move,
  used to highlight moves on the board. Computed by `toDestinations`
  (`src/lib/chess/utils.ts`) into the `destinations` store on `GameState`.

### Game over / reason
The end of a game, carried as `GameOver { isOver, winner, reason? }`. `winner` is a
`Color`, `'draw'`, or `null`. The `reason` (`GameOverReason`) is one of:
`checkmate`, `stalemate`, `threefold` (threefold repetition), `insufficient`
(insufficient material), `fiftyMove`, `draw`, `timeout`, `resignation`.
`GameOver` / `GameOverReason` types: `src/lib/chess/types.ts`. Detection is now
**server-authoritative** for multiplayer: `GameRoom` ends the game only via the rules
(`gameOutcome` in `api/src/lib/outcome.ts`) or its flag-fall watchdog (`onFlagFall`),
and broadcasts the winner/reason. The client-supplied `timeout` message has been removed
(audit F1). Client-side detection (`GameState.checkGameOver`) still drives AI mode.

### Rematch
A post-game restart of the same room with the same players and time control. Both
players must agree: one sends `offerRematch`, the other `acceptRematch`; when the
offer set reaches two, the room resets and starts a new game.
Server: `GameRoom.handleRematchOffer` / `handleRematchAccept` / `restartGame`.
Client: `MultiplayerGameState.offerRematch` / `acceptRematch` / `handleRematchAccepted`.

### GameState ↔ AIGameState ↔ MultiplayerGameState
The frontend's game-logic inheritance hierarchy:
- **`GameState`** (abstract, `src/lib/chess/GameState.ts`) — owns the local `chess.js`
  instance, the Svelte stores (`fen`, `turn`, `started`, `moveHistory`, `gameOver`,
  `destinations`, etc.), move validation, move-type/audio, and game-over detection.
- **`AIGameState`** (`src/lib/chess/AIGameState.ts`) — adds a `Stockfish` engine,
  `difficulty`, `getHint`, undo, and AI move triggering for **AI mode**.
- **`MultiplayerGameState`** (`src/lib/chess/MultiplayerGameState.ts`) — adds a
  `WebSocketManager`, server-clock interpolation (display only), opponent/rematch
  handling, and disables AI-only features (undo/hint/difficulty are no-ops) for
  **multiplayer mode**.

### WebSocketManager
The frontend's thin wrapper around the browser `WebSocket` for multiplayer
(`src/lib/websocket/WebSocketManager.ts`). It opens one socket, dispatches inbound
messages by `type` to registered handlers, and sends outbound messages.
It **reconnects automatically** with exponential backoff + jitter (stopping on an
intentional close or a 1008 rejection), resolves its URL lazily so a reconnect re-sends
the `playerId` for the server to rebind the seat, and exposes connection status via
`onStatus` (audit H2 fixed). The server-side counterpart is the connection plumbing in
`api/src/lib/websocket.ts`.
