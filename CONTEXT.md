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

### Seat / color / seat token

A `color` is a side of the board, `'white' | 'black'`. Each room has exactly two
**seats**, one per colour, each guarded by a secret **seat token** minted when the room
is created (`POST /game/create` returns `you` and `invite` seats). The **server assigns
colours** — the creator's request (`white`/`black`/`random`, resolved server-side) picks
their seat and the invitee gets the other; the client never sends a colour.
A WebSocket must present a seat token in its first frame (`{ type: 'join', token }`).
The creation tokens are single-use: the first claim rotates the token and returns the
new one in `seat`, which the browser keeps in `localStorage`, keyed by room id and
expiring after two hours unused, so closing the tab and reopening the room resumes the
seat. A seat already held in this browser wins over an invite link's token. Two tabs
on one seat: the newer connection takes over and the older tab shows "open somewhere
else" (close `4000`). Invite links carry the opponent's token in the URL fragment
(`/room?id=…#seat=…`), never in a query string the server would log.
Server: `GameRoom.claimSeat` (`api/src/lib/GameRoom.ts`), connection handling in
`api/src/lib/websocket.ts`. Client: `src/lib/chess/seat.ts`, `MultiplayerGameState`.

### Player

A seated participant: `{ id, color, ws, connected, disconnectedAt }` (`api/src/lib/types.ts`).
The `id` is internal to the server and never sent to clients. Only one live socket per
seat exists; a newer connection replaces the older one (close code `4000`). When a
player's socket drops, the opponent is told (`opponentDisconnected`) and may claim the
win after `DISCONNECT_GRACE_MS`; the room itself survives until the TTL sweep. Clocks
do not pause while a player is disconnected: their clock keeps running and they can
lose on time before the grace period ends.

### Game state

The snapshot of a game: board (FEN), whose turn it is, both clocks, and whether the
game has started. The server's authoritative snapshot is built by
`GameRoom.getCurrentGameState` and broadcast as a `gameState` message
(`api/src/lib/GameRoom.ts`). The client projects everything it renders into a
single immutable **`GameView`** (`src/lib/chess/types.ts`) — `fen`, `turn`, `started`,
`checkState`, `gameOver`, `destinations`, `moveHistory`/`sanHistory`, the
player-relative `clock` (`myClock`/`opponentClock`) and the multiplayer-only fields.
`GameModel` (`src/lib/chess/GameModel.ts`) owns that view as one `Readable<GameView>`
and the modes mutate it only through `patch()`; components read `$gameState`.

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

- **Engine / Stockfish** — the chess AI (Stockfish 18, single-threaded WebAssembly,
  vendored in `static/engine/stockfish-18.0.8/`), run as a Web Worker in the browser for AI mode only.
  Wrapped by the `Stockfish` class in `src/lib/engine/Stockfish.ts`, which queues
  commands until `readyok`, keeps at most one search in flight and swallows the
  `bestmove` of any cancelled search.
- **Difficulty** — an integer level mapped (via a sigmoid) to Stockfish's Skill Level
  / depth / move-time options (`Stockfish.setDifficulty`, `mapLevelToSkill`).
- **Hint** — a best-move suggestion produced by asking the engine to search the
  current position (`Stockfish.getHint`, surfaced via `AIGameState.getHint`). Hints
  are AI-mode only — `MultiplayerGameState` simply has no `getHint`.

### Move / promotion / destinations

- **Move** — a `ChessMove` (`{ from, to, promotion? }`). Validated against `chess.js`
  in `ChessCore.move` (`src/lib/chess/ChessCore.ts`, via `GameModel.makeMove`) and on
  the server in `GameRoom.handleMove`.
- **Promotion** — a pawn reaching the last rank, choosing a piece. Detected by
  `ChessCore.isPromotion`; the UI shows a promotion modal and stages a
  `promotionMove` in the view before committing.
- **Destinations** — the map of legal target squares per piece for the side to move,
  used to highlight moves on the board. Computed by `toDestinations`
  (`src/lib/chess/utils.ts`) into `GameView.destinations`.

### Game over / reason

The end of a game, carried as `GameOver { isOver, winner, reason? }`. `winner` is a
`Color`, `'draw'`, or `null`. The `reason` (`GameOverReason`) is one of:
`checkmate`, `stalemate`, `threefold` (threefold repetition), `insufficient`
(insufficient material), `fiftyMove`, `draw`, `timeout`, `resignation`.
`GameOver` / `GameOverReason` types: `src/lib/chess/types.ts`. Detection is now
**server-authoritative** for multiplayer: `GameRoom` ends the game only via the rules
(`gameOutcome` in `api/src/lib/outcome.ts`) or its flag-fall watchdog (`onFlagFall`),
and broadcasts the winner/reason. The client-supplied `timeout` message has been removed
(audit F1). Client-side detection (`ChessCore.outcome`, via `GameModel.checkGameOver`)
still drives AI mode.

### Rematch / draw offer

A **rematch** is a post-game restart of the same room with the same players and time
control, with **colours swapped**. Both players must agree (`offerRematch` /
`acceptRematch`, tracked per seat colour). A **draw offer** (`offerDraw`) stands until
the opponent accepts (`acceptDraw` → reason `agreement`), declines, or moves instead.
Server: `GameRoom.handleRematchOffer` / `handleRematchAccept` / `restartGame`.
Client: `MultiplayerGameState.offerRematch` / `acceptRematch` / `handleRematchAccepted`.

### ChessCore / GameModel ↔ AIGameState ↔ MultiplayerGameState

The frontend's game logic is composition plus a thin concrete base:

- **`ChessCore`** (`src/lib/chess/ChessCore.ts`) — pure rules over `chess.js`: move,
  legal destinations, check state, outcome, FEN/PGN. No stores, audio or sockets.
- **`AudioCue`** (`src/lib/chess/AudioCue.ts`) — owns the move/game cues.
- **`GameModel`** (`src/lib/chess/GameModel.ts`) — composes the two and exposes the
  single `Readable<GameView>`; all state changes go through `patch()`.
- **`AIGameState`** (`src/lib/chess/AIGameState.ts`) — extends `GameModel` with a
  `Stockfish` engine, difficulty, hints, undo and AI move triggering (**AI mode**).
- **`MultiplayerGameState`** (`src/lib/chess/MultiplayerGameState.ts`) — extends
  `GameModel` with a `WebSocketManager`, server-clock interpolation (display only),
  opponent presence, draw/rematch handling (**multiplayer mode**). It adds no
  AI-only methods.

### WebSocketManager

The frontend's thin wrapper around the browser `WebSocket` for multiplayer
(`src/lib/websocket/WebSocketManager.ts`). It opens one socket, dispatches inbound
messages by `type` to registered handlers, and sends outbound messages.
It **reconnects automatically** with exponential backoff + jitter, sends the seat `join`
frame first on every (re)connect, and exposes connection status via `onStatus`
(`connecting`/`open`/`reconnecting`/`closed`, plus the terminal `rejected` — room gone,
full or bad seat — and `replaced` — the seat was opened elsewhere). The server-side counterpart is the connection plumbing in
`api/src/lib/websocket.ts`.
