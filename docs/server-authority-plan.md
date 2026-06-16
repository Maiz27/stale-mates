# Server Authority Refactor Plan

**Status:** Draft / design doc
**Scope:** Make the multiplayer backend the single source of truth for board, turn, clocks, colors, and end conditions. Turn the client into a (mostly) pure renderer.
**Audience:** A single developer implementing this incrementally on a hobby/portfolio project.

---

## 1. Background

The multiplayer backend is a stateful Express + `ws` server that keeps games in an in-memory `Map<string, GameRoom>` (`api/src/lib/game.ts:5`). Each `GameRoom` (`api/src/lib/GameRoom.ts`) owns a `chess.js` instance, the current turn, per-player clocks, and rematch state. The SvelteKit client mirrors all of this in `MultiplayerGameState` (`src/lib/chess/MultiplayerGameState.ts`) and runs its own `chess.js` instance and its own `setInterval` clock.

The server today validates moves with chess.js (good), but delegates several authority-bearing decisions to the client. The audit below confirms five concrete problems. Each is cited to the exact code.

### 1.1 Verified audit findings

**F1 — Client-supplied timeout winner is trusted (forgeable).**
`handleMessage` routes a client `gameOver`/`timeout` message straight into `handleTimeOut(message.winner)` which broadcasts the client's claimed winner with no verification:
- `api/src/lib/GameRoom.ts:82-86` (`case 'gameOver': if (message.reason === 'timeout') this.handleTimeOut(message.winner)`)
- `api/src/lib/GameRoom.ts:132-134` (`handleTimeOut(winner)` → `broadcastGameOver(winner, 'timeout')`)
- Client emits this from its own timer: `src/lib/chess/MultiplayerGameState.ts:213-235` (`handleTimeOut` → `notifyGameOverDueToTimeout`). A malicious client can send `{type:'gameOver',reason:'timeout',winner:'<self>'}` at any time and the server will broadcast it as truth.

**F2 — Color is client-chosen via URL and never validated/assigned server-side.**
- Color comes from the `color` query param on the WebSocket URL: `api/src/lib/websocket.ts:46` (`url.searchParams.get('color')`), passed unchecked into `addPlayerToGame` → `room.addPlayer(color, ws)` (`api/src/lib/game.ts:17-31`, `api/src/lib/GameRoom.ts:22-38`).
- `addPlayer` only checks room capacity (`>= 2`), never that the requested color is free (`api/src/lib/GameRoom.ts:23-29`). Both players can request `color=white`.
- The client picks both colors locally and bakes them into the two share links: `src/lib/components/PlayDrawer/PlayDrawer.svelte:47-50` and reads it back at `src/routes/room/+page.svelte:11`.

**F3 — No join authorization; reconnect "auth" is a leaked `playerId`.**
- Anyone with the room id can `addPlayer` — there is no token/secret check (`api/src/lib/websocket.ts:56-69`).
- The `playerId` returned by the server (`{type:'connected', playerId}` at `api/src/lib/websocket.ts:61`) is the *only* reconnect credential. The client stores it in a **non-HttpOnly** cookie via `AddItemToCookies` (JS-readable, `src/lib/utils.ts:89-92`, `src/lib/chess/MultiplayerGameState.ts:122-128`) and replays it on the URL query string (`src/lib/chess/MultiplayerGameState.ts:37-38`, parsed at `api/src/lib/websocket.ts:47`). It leaks into URLs, server logs (`api/src/lib/websocket.ts:26`), and JS. Anyone who learns it can take over that seat (`reconnectPlayer` only checks the id exists, `api/src/lib/GameRoom.ts:49-53`).

**F4 — Clocks are not actually ticked server-side; a staller is never flagged.**
- The server only decrements a clock *when that player moves*: `updatePlayerTime` is called from `updateGameStateAfterMove` (`api/src/lib/GameRoom.ts:99-110`) and subtracts `now - lastMoveTime` (`api/src/lib/GameRoom.ts:112-130`). There is **no interval / no timer**. If a player simply never moves, their clock is never decremented and `handleTimeOut` is never reached server-side.
- The only thing that flags a timeout in real time is the **client's** `setInterval` (`src/lib/chess/MultiplayerGameState.ts:161-211`), which then *tells* the server who won (see F1).
- Also note `updatePlayerTime` decrements the clock of the player who *just moved* using `lastMoveTime` (`api/src/lib/GameRoom.ts:107`, `:112-130`), and the increment is applied with a `<=` threshold instead of after the move — the bookkeeping is subtly wrong in addition to being non-authoritative.

**F5 — Rematch / gameOver messages aren't gated on real game state.**
- `handleRematchOffer` / `handleRematchAccept` add to a `Set` and restart the game whenever the set reaches size 2 (`api/src/lib/GameRoom.ts:136-160`), regardless of whether a game has actually ended, who the players are, or whether the ids are real players. A single client can send both `offerRematch` and `acceptRematch` with no game over having occurred.
- `gameOver` handling (F1) is likewise ungated.

### 1.2 Duplicated / drifting types

`TimeControl` is declared twice and the two copies have **already drifted**:
- `api/src/lib/types.ts:16-21` — `lowTimeThreshold`/`increment` are **required**.
- `src/lib/chess/types.ts:42-47` — `lowTimeThreshold`/`increment` are **optional** (`?`).

Both files even carry a `// duplicate at ...` comment (`api/src/lib/types.ts:15`, `src/lib/chess/types.ts:41`). The wire message shapes are duplicated implicitly too: the server hand-builds `any` message objects (e.g. `api/src/lib/GameRoom.ts:192,197,202,252`) and the client handlers re-declare their own inline payload types (e.g. `src/lib/chess/MultiplayerGameState.ts:134,237,244`). The `GameMessage` union exists only on the server (`api/src/lib/types.ts:23-27`); the client sends untyped `any` (`src/lib/websocket/WebSocketManager.ts:39`).

---

## 2. Goals & non-goals

### Goals
- Server is the **single source of truth** for: board (FEN), whose turn it is, both clocks, color assignment, game-over and its reason/winner.
- The client never *decides* outcomes. It renders server state and, for smooth clocks, interpolates from a server-provided time snapshot.
- Illegal / out-of-turn / out-of-state messages are rejected and the offending client is **resynced** rather than trusted.
- A player who stalls (never moves) is flagged on time by the **server**.
- Colors are assigned/validated server-side; two players cannot hold the same color.
- Reconnect uses a per-seat token that is **not** trivially forgeable and does **not** travel in the URL query string.
- One shared, typed message protocol; inbound messages are validated.

### Non-goals
- **Single-instance only.** State stays in the in-memory `Map`. No Redis/DB unless §7 forces it. Horizontal scaling, sticky sessions, and cross-instance room sharing are out of scope.
- **Full anti-cheat is out of scope.** We close *forgery of outcomes/colors/seats*, not engine assistance, premove timing analysis, or RTT manipulation. A determined client can still lag its own moves within its own clock budget; that is acceptable for a friendly-duel app.
- **No accounts / persistent identity.** Seats are ephemeral per room. No login.
- **No spectators, no matchmaking, no ratings.** Out of scope.
- **No move-history persistence / reconnect-to-finished-game beyond process lifetime.** Rooms still die when both disconnect (`api/src/lib/game.ts:37-40`).
- **Latency compensation beyond a simple clock snapshot is out of scope.** We accept ~1×RTT of clock skew.

---

## 3. Target architecture

### 3.1 Server as source of truth

`GameRoom` already holds the canonical `chess.js`, `currentTurn`, and per-player `timeRemaining`. The refactor (a) stops trusting client outcome messages, (b) adds an authoritative clock, (c) assigns colors, and (d) gates rematch/gameOver on real state. The server's outbound `gameState` (`api/src/lib/GameRoom.ts:280-297`) becomes the canonical resync payload and is extended with a time snapshot.

### 3.2 Authoritative clock & flag-fall

Use **lazy, monotonic, computed-on-read clocks** plus **one cheap watchdog timer per running room**. This is more accurate and simpler than a 1 Hz interval that mutates state.

Model per room (replacing the per-move-only logic at `api/src/lib/GameRoom.ts:112-130`):

```
// Authoritative clock state (server)
timeControl: TimeControl                 // unchanged source: convertTimeOption()
clocks: { white: number; black: number } // remaining MILLISECONDS (store ms, not s)
turnStartedAt: number | null             // Date.now() when current turn began
flagTimer: NodeJS.Timeout | null         // single watchdog
```

- **On move (validated):** compute `elapsed = now - turnStartedAt` for the mover, subtract from the mover's clock, add `increment` to the mover's clock (chess increment is applied *after* you move), flip turn, set `turnStartedAt = now`, and `(re)scheduleFlagTimer()`.
- **`remainingFor(color, now)` (computed on read):** if `color === currentTurn` return `clocks[color] - (now - turnStartedAt)`, else return `clocks[color]`. This is what feeds every outbound snapshot, so reads are always current without mutating state.
- **`scheduleFlagTimer()`:** clear any existing timer, then `setTimeout(onFlagFall, clocks[currentTurn])`. The watchdog only ever fires for the player *on the move* (only their clock runs), so one timer per room suffices. Re-armed on every move and on game start.
- **`onFlagFall()`:** recompute `remainingFor(currentTurn, now)`; if `<= 0`, end the game with winner = the *other* color, reason `timeout`, source = server. This is the authoritative replacement for both `handleTimeOut` (`api/src/lib/GameRoom.ts:132-134`) and the client's `handleTimeOut` (`src/lib/chess/MultiplayerGameState.ts:213-235`).
- **On game end / disconnect-pause:** clear `flagTimer`. (Optional: pause the running clock while a player is disconnected — see §7.)

Unlimited games (`timeControl.isUnlimited`, `api/src/lib/GameRoom.ts:226`) skip all clock logic and never schedule a flag timer.

**Why milliseconds:** the current code mixes seconds and `Date.now()` ms math (`api/src/lib/GameRoom.ts:117`), inviting rounding drift. Store ms internally; convert at the protocol boundary if the client wants seconds.

### 3.3 Time snapshots & client interpolation

The server stops sending "the number to display" and instead sends a **snapshot the client can interpolate from**:

```ts
type ClockSnapshot = {
  whiteMs: number;        // remaining for white at serverTime
  blackMs: number;        // remaining for black at serverTime
  running: 'white' | 'black' | null; // whose clock is ticking (null = paused/over)
  serverTime: number;     // Date.now() on server when snapshot was taken
};
```

Snapshots ride on `gameStarted`, `gameState`, every `moveApplied`, and `gameOver`. The client:
1. Records `offset = serverTime - Date.now()` (approx; ignores RTT, acceptable per §2).
2. Renders the *running* clock as `remaining - (Date.now() + offset - serverTime)` each animation frame / 250 ms tick.
3. **Never** triggers game-over from its own clock. When its local interpolation hits 0 it may show `00:00` but waits for the server's authoritative `gameOver`. This deletes `notifyGameOverDueToTimeout` (`src/lib/chess/MultiplayerGameState.ts:229-235`) and the whole `firstMovesMade` / `updateRemainingTime` flag-fall machinery (`src/lib/chess/MultiplayerGameState.ts:18,192-222`).

The client's local `chess.js` stays only for *rendering legal-move hints and optimistic piece movement*; the server FEN in every snapshot is the truth and overrides it on any mismatch (§3.4).

### 3.4 Authoritative move flow

```
client: user drags piece
  -> optimistic local apply (existing GameState.makeMove, src/lib/chess/GameState.ts:98-111)
  -> send {type:'move', from,to,promotion}        (no winner, no clocks, no FEN)
server GameRoom.handleMove (api/src/lib/GameRoom.ts:90-97), hardened:
  1. if game not started OR player.color !== currentTurn -> reject -> resync(player)
  2. try { chess.move(move) } catch -> reject -> resync(player)     // wrap in try/catch
  3. if !move result -> reject -> resync(player)
  4. apply clock update + flip turn + reschedule flag timer (§3.2)
  5. broadcast {type:'moveApplied', move, fen, turn, clock} to BOTH players
  6. checkGameEnd() (api/src/lib/GameRoom.ts:175-189) authoritatively
```

`resync(player)` = send that one client a full `{type:'gameState', fen, turn, clock, ...}` so its optimistic apply is rolled back to the server truth. Today an illegal/out-of-turn move is silently dropped (`api/src/lib/GameRoom.ts:91,93-94`) which can desync the optimistic client; resync fixes that.

Important correctness fix: chess.js `move()` throws on illegal input in the 1.0 beta (`api/package.json:13`), so the bare `this.chess.move(move)` at `api/src/lib/GameRoom.ts:93` must be wrapped in try/catch (the client already does this at `src/lib/chess/GameState.ts:99-109`; the server does not).

Broadcasting the **full move + FEN to both players** (not just `opponentMove` to the other player, `api/src/lib/GameRoom.ts:191-194`) means the mover also gets an authoritative confirmation and can reconcile its optimistic state.

### 3.5 Server-side color assignment & seat tokens

Replace "client picks color in the URL" (F2/F3) with seats minted at creation time.

**At `POST /game/create`** (`api/src/routes/game.ts:10-20`):
- Accept `{ time, creatorColor?: 'white'|'black'|'random' }`.
- Server resolves `random` itself, assigns the creator one seat and the opponent the other.
- Server generates **two seat tokens** (`nanoid`, already a dep, `api/package.json:17`): `whiteToken`, `blackToken`. Each token is the secret credential for *that seat*.
- Response: `{ id, you: { color, token }, invite: { color, token } }`. The creator keeps `you`; the share link only needs to convey the *opponent's* seat token.

**Seats live in `GameRoom`:**
```ts
seats: {
  white: { token: string; playerId?: string; connected: boolean; ws: WebSocket|null };
  black: { ... };
}
```
A WebSocket connection must present a valid seat token to bind to that seat. `addPlayer` (`api/src/lib/GameRoom.ts:22-38`) is replaced by `claimSeat(token, ws)` which: looks up the seat by token, rejects if the seat is already claimed by a live connection, otherwise binds and (if both seats now have a connection) starts the game. Duplicate-color is now structurally impossible — there are exactly two seats keyed by color.

**Token transport (not in the URL query string):**
- **Preferred:** pass the token in the `Sec-WebSocket-Protocol` header. The browser `WebSocket` constructor's second arg sets this, and `ws` exposes it at `req.headers['sec-websocket-protocol']`. This keeps the secret out of the URL/path and out of access logs. Replace the `color`/`playerId` query parsing at `api/src/lib/websocket.ts:43-54`.
- **Alternative (if subprotocol is fiddly):** a **one-time ticket** — client first does `POST /game/ticket {id, token}` over HTTPS, server returns a short-lived single-use `ticket` id (stored in a `Map<ticket, {roomId, color}>` with a ~30 s TTL), and the WS connects with `?ticket=...`. The ticket is single-use and expires, so leaking it in a log is low-value. (HttpOnly note below.)
- **HttpOnly where possible:** the *opponent invite token* must be shareable (it's literally the thing you paste to a friend), so it can't be HttpOnly. The *creator's own seat token* should be set by the server as an `HttpOnly; Secure; SameSite` cookie scoped to the room on the `create`/`ticket` response, so the creator's own credential is not JS-readable. This replaces the JS-cookie `playerId` scheme (`src/lib/utils.ts:89-100`, `src/lib/chess/MultiplayerGameState.ts:30,122-128`). On cross-origin deploys (client and `api` are separate origins per `api/src/app.ts:7-12`) cookies require `SameSite=None; Secure` and `credentials: 'include'`; if that's friction for the portfolio deploy, fall back to the one-time-ticket scheme and accept that the *invite* token is non-HttpOnly by nature.

**Reconnect** becomes "re-present the seat token" (same channel as join). `reconnectPlayer` (`api/src/lib/GameRoom.ts:49-66`) is folded into `claimSeat`: if the seat's token matches and the seat is not currently held by a live socket, re-bind and send a full `gameState`. No more trusting a bare id (`api/src/lib/GameRoom.ts:50-53`).

### 3.6 Gating rematch & game-over (F5)

- `gameOver` is **never** accepted from a client. Remove the `case 'gameOver'` branch entirely (`api/src/lib/GameRoom.ts:82-86`). Game over is produced only by `checkGameEnd` (`api/src/lib/GameRoom.ts:175-181`) or `onFlagFall` (§3.2).
- Rematch (`api/src/lib/GameRoom.ts:136-160`) is gated: only accept `offerRematch`/`acceptRematch` when `!this.gameStarted && <a game has actually ended>`, and only from the two real seat-bound players. Track `rematchOffers` keyed by *color* (two seats) so one client can't fill the set alone. `restartGame` resets clocks via the new clock model and re-arms the flag timer.

---

## 4. Message protocol redesign

### 4.1 Shared, typed discriminated unions

Create one protocol module that is the single definition of every wire message, replacing the drifting duplicates (`api/src/lib/types.ts:16-27`, `src/lib/chess/types.ts:42-47`) and the `any` message objects.

**Packaging (pick the lowest-friction option):**
- **Option A (recommended for this repo): a copied `protocol.ts`** living in both `api/src/lib/protocol.ts` and `src/lib/chess/protocol.ts`, with a one-line note + a tiny `bun`/`node` script `scripts/sync-protocol.ts` that copies one to the other and a CI/`lint` check that they're identical. Zero build-graph changes; the two packages already build independently (`api/package.json` vs root `package.json`).
- **Option B: a real shared workspace package** (`packages/protocol`, bun/npm workspace) imported by both. Cleaner, but adds workspace + path-alias + two `tsconfig` changes; only worth it if the protocol grows.

Recommend **A** now, leave a TODO to graduate to **B** if it proves annoying.

**Shape:**
```ts
// protocol.ts  (shared)
export type Color = 'white' | 'black';

export type TimeControl = {            // ONE definition; required fields
  initialMs: number;
  incrementMs: number;
  lowTimeThresholdMs: number;
  isUnlimited: boolean;
};

export type ClockSnapshot = {
  whiteMs: number; blackMs: number;
  running: Color | null; serverTime: number;
};

// ---- inbound (client -> server) ----
export type ClientMessage =
  | { type: 'move'; from: string; to: string; promotion?: string }
  | { type: 'offerRematch' }
  | { type: 'acceptRematch' };
//  NOTE: no client 'gameOver'/'timeout' — deleted (F1).

// ---- outbound (server -> client) ----
export type ServerMessage =
  | { type: 'seat'; color: Color; playerId: string }      // replaces 'connected'
  | { type: 'gameStart'; fen: string; turn: Color; timeControl: TimeControl; clock: ClockSnapshot }
  | { type: 'moveApplied'; move: {from:string;to:string;promotion?:string}; fen: string; turn: Color; clock: ClockSnapshot }
  | { type: 'gameState'; started: boolean; fen: string; turn: Color; timeControl: TimeControl; clock: ClockSnapshot }
  | { type: 'gameOver'; winner: Color | 'draw' | null; reason: GameOverReason; clock: ClockSnapshot }
  | { type: 'opponentJoined' }
  | { type: 'opponentReconnected' }
  | { type: 'opponentDisconnected' }
  | { type: 'rematchOffer' }
  | { type: 'rematchAccepted'; fen: string; turn: Color; timeControl: TimeControl; clock: ClockSnapshot }
  | { type: 'rejected'; reason: 'illegal_move'|'not_your_turn'|'not_started'|'bad_seat'|'bad_message' };
```

`GameOverReason` already exists on the client (`src/lib/chess/types.ts:8-16`) and should move into `protocol.ts`. Note this collapses today's `opponentMove`-only broadcast (`api/src/lib/GameRoom.ts:191-194`) into a both-players `moveApplied` (§3.4).

### 4.2 Inbound validation

Every inbound frame is parsed and validated before dispatch (today it's `JSON.parse` then a bare `switch`, `api/src/lib/game.ts:54`, `api/src/lib/GameRoom.ts:72-87`).

- **Recommended: hand-written type guards** (zero new deps; `api` has no validation lib and `nanoid@3`/CJS constraints make adding deps non-trivial). A small `parseClientMessage(raw: string): ClientMessage | null` with per-type guards (check `type`, field presence, `from`/`to` are 2-char squares, `promotion` ∈ `qrbn`). Reject → send `{type:'rejected', reason:'bad_message'}` and drop.
- **Alternative: zod** if you'd rather have schemas; it's a single dependency and gives you the parser + types from one source. Only adopt if you also adopt Option B (shared package) so the schema isn't duplicated.

The client should also type its outbound sends against `ClientMessage` — `WebSocketManager.sendMessage(message: any)` (`src/lib/websocket/WebSocketManager.ts:39`) becomes `sendMessage(message: ClientMessage)`, and `addMessageHandler` keys become `ServerMessage['type']`.

---

## 5. Migration steps (each independently shippable)

Ordered so each step compiles, ships, and leaves the app working. Effort: **S** ≈ <½ day, **M** ≈ ~1 day, **L** ≈ ~2 days.

> Convention below: "server" = `api/src/...`, "client" = `src/...`.

### Step 0 — Shared protocol module (no behavior change) — **S**
- Create `api/src/lib/protocol.ts` and `src/lib/chess/protocol.ts` (identical) per §4.1. Add `scripts/sync-protocol.ts` + a `lint`-time identity check.
- Re-export the existing types from the old locations (`api/src/lib/types.ts`, `src/lib/chess/types.ts`) to avoid touching every importer yet. Fold the two `TimeControl` definitions into the protocol's single one (resolving the drift at `api/src/lib/types.ts:16-21` vs `src/lib/chess/types.ts:42-47`); keep the old names as aliases.
- **Client pairing:** none functional; just the new import surface.
- Ships green; nothing depends on it at runtime yet.

### Step 1 — Harden the move path (try/catch + reject + resync) — **S/M**
- Server: wrap `chess.move` in try/catch and add the out-of-turn / not-started guards at `api/src/lib/GameRoom.ts:90-97`; on any rejection send `{type:'rejected'}` + a full `gameState` resync to the offending socket. Broadcast `moveApplied` to **both** players (extend/replace `broadcastMove` at `api/src/lib/GameRoom.ts:191-194`).
- **Client pairing (`MultiplayerGameState.ts`):** add a `rejected` + `moveApplied` handler in `setupMessageHandlers` (`src/lib/chess/MultiplayerGameState.ts:41-51`); on `moveApplied`/`gameState`, `chess.load(fen)` to reconcile optimistic state; on `rejected`, roll back the last optimistic move by reloading server FEN. Keep sending `move` from `makeMove` (`src/lib/chess/MultiplayerGameState.ts:59-73`).
- Backwards-compatible if you keep emitting the old `opponentMove` alongside `moveApplied` for one release, then drop it.

### Step 2 — Authoritative server clock + flag-fall — **M/L**
- Server: replace `lastMoveTime`/`updatePlayerTime` (`api/src/lib/GameRoom.ts:16,99-130`) with the ms-based `clocks` + `turnStartedAt` + `flagTimer` model and `remainingFor()` (§3.2). Add `scheduleFlagTimer`/`onFlagFall`. Emit `ClockSnapshot` on `gameStart`, `moveApplied`, `gameState`, `gameOver`. Update `getCurrentGameState` (`api/src/lib/GameRoom.ts:289-297`) and `startGame`/`restartGame` (`api/src/lib/GameRoom.ts:249-259,162-173`) to set `turnStartedAt` and arm the timer.
- **Client pairing (`MultiplayerGameState.ts`):** **delete** the client clock authority — `firstMovesMade` (`:18,67,140,147,256-273`), `updateTimer`/`updatePlayerTime`/`updateRemainingTime`/`handleTimeOut`/`notifyGameOverDueToTimeout` (`:176-235`), and the `setInterval` in `startTimer` (`:161-167`). Replace with an interpolation tick that reads the latest `ClockSnapshot` (§3.3) and updates `whiteTime`/`blackTime` for display only. `+page.svelte` clock UI (`src/routes/room/+page.svelte:94-115`) is unchanged (still reads `whiteTime`/`blackTime`).
- This step alone fixes F4 and removes the *need* for the client to declare timeouts.

### Step 3 — Delete client-trusted outcomes (F1) + gate rematch (F5) — **S**
- Server: remove `case 'gameOver'` (`api/src/lib/GameRoom.ts:82-86`); game over now only via `checkGameEnd`/`onFlagFall`. Gate `handleRematchOffer`/`handleRematchAccept` on `!gameStarted && gameEnded && sender is a real seat`, keyed by color (`api/src/lib/GameRoom.ts:136-160`).
- **Client pairing:** remove the now-dead `notifyGameOverDueToTimeout` send (already deleted in Step 2); ensure `offerRematch`/`acceptRematch` (`src/lib/chess/MultiplayerGameState.ts:97-103`) are only enabled when `gameOver.isOver` (UI already conditions on `gameOver`, `src/routes/room/+page.svelte:121-129`).
- Hard dependency: do this **after** Step 2 so removing the client timeout path doesn't strand games on time.

### Step 4 — Server-side seats & color assignment (F2) — **M**
- Server: extend `POST /game/create` (`api/src/routes/game.ts:10-20`) to take `creatorColor`, build two seats with tokens in `GameRoom` (replace `players[]` shape and `addPlayer`, `api/src/lib/GameRoom.ts:8-9,22-38`), and return `{id, you:{color,token}, invite:{color,token}}`. Replace `addPlayerToGame` (`api/src/lib/game.ts:17-31`) with `claimSeat`.
- **Client pairing (`PlayDrawer.svelte`):** stop computing colors locally (`src/lib/components/PlayDrawer/PlayDrawer.svelte:47-50`); use the server's `you`/`invite` to build the two links. The invite link carries the *opponent seat token*, not a color. `room/+page.svelte` (`:10-11`) reads token (not color) and passes it to `MultiplayerGameState`.
- Still compiles if Step 5's transport isn't done yet by temporarily accepting the token however the WS currently reads params; recommended to land 4+5 close together.

### Step 5 — Token-based WS auth & reconnect (F3) — **M**
- Server: replace query parsing (`api/src/lib/websocket.ts:43-54`) with seat-token via `Sec-WebSocket-Protocol` (or the one-time ticket, §3.5). `handlePlayerConnection` (`api/src/lib/websocket.ts:56-69`) calls `claimSeat(token, ws)`; reconnect is the same call. Set the creator's own token as an HttpOnly cookie on `create`/`ticket`. Remove the `playerId` logging (`api/src/lib/websocket.ts:25-26`).
- **Client pairing (`MultiplayerGameState.ts` + `WebSocketManager.ts`):** drop `constructWebSocketUrl`'s `color`/`playerId` query (`src/lib/chess/MultiplayerGameState.ts:36-39`); pass the seat token via the `WebSocket` constructor's subprotocol arg (extend `WebSocketManager` constructor, `src/lib/websocket/WebSocketManager.ts:10-13`). Replace the JS-cookie `playerId` store/read (`src/lib/chess/MultiplayerGameState.ts:30,122-128`, `src/lib/utils.ts:89-100`) — for the creator the HttpOnly cookie handles reconnect; for the invitee, persist the invite token in `sessionStorage` keyed by room (acceptable: it was already a shareable secret). Rename the `connected` handler to `seat` and read assigned color from it (`src/lib/chess/MultiplayerGameState.ts:42,122-128`).
- Hard dependency on Step 4 (seats/tokens must exist).

### Step 6 — Protocol cleanup & validation — **S/M**
- Server: route all inbound through `parseClientMessage` (§4.2) in `handlePlayerMessage` (`api/src/lib/game.ts:51-56`) / `handleMessage` (`api/src/lib/GameRoom.ts:68-88`); replace `any` outbound builders (`api/src/lib/GameRoom.ts:206-222` and the inline message objects) with `ServerMessage`-typed helpers.
- **Client pairing:** type `WebSocketManager.sendMessage`/`addMessageHandler` against the protocol (`src/lib/websocket/WebSocketManager.ts:39,47`); replace inline payload types in handlers (`src/lib/chess/MultiplayerGameState.ts:134,237,244`). Delete the old duplicate type re-exports left behind in Step 0.

**Suggested ship order:** 0 → 1 → 2 → 3 → 4 → 5 → 6. Steps 0–3 are pure correctness/authority and don't touch the join URL, so they can ship first and independently. 4–5 are the auth change (the riskiest, most user-visible) and should ship together behind a short test window. 6 is cleanup.

---

## 6. Testing strategy

The clock and turn logic is now pure server logic and unit-testable without sockets. Add a test runner to `api` (none today — `api/package.json:6-10`). Lightest option: `bun test` (the repo already standardizes on Bun per recent commits) or `vitest` (already used by the root, `package.json:15`).

**Refactor for testability:** extract the clock math (`remainingFor`, `applyMoveClock`, `onFlagFall` decision) into a pure module/function that takes `(clocks, turnStartedAt, timeControl, now)` and returns new state — no `Date.now()` or `setTimeout` inside the pure core; inject `now`. This makes flag-fall deterministic in tests.

- **Clock / flag-fall (unit):**
  - mover's clock decreases by exactly `elapsed`, opponent's unchanged.
  - increment applied after a move, not before; unlimited games never decrement.
  - `remainingFor(currentTurn)` decreases as `now` advances; non-mover is flat.
  - `onFlagFall` declares the *opponent* of the flagged color the winner; a player who never moves is flagged at exactly `initialMs`.
  - ms/seconds boundary conversions round-trip.
- **Turn enforcement (unit, with a fake `ws`):**
  - out-of-turn move → rejected + resync, board FEN unchanged.
  - illegal move (chess.js throws) → caught, rejected, no crash (regression for the un-try/caught `chess.move` at `api/src/lib/GameRoom.ts:93`).
  - move when `!gameStarted` → rejected.
  - legal move → `moveApplied` to both seats, turn flips, clock snapshot present.
- **Color / seat assignment (unit):**
  - `creatorColor:'random'` yields exactly one white + one black seat.
  - explicit `creatorColor` honored; opponent gets the complement.
  - claiming a seat with a wrong token → rejected; with the right token → bound.
  - second live claim on an already-connected seat → rejected (no double-occupancy); claim after disconnect (reconnect) → allowed.
- **Rematch gating (unit):**
  - `offerRematch` before game over → ignored.
  - one client sending both offer+accept → does not restart (keyed by color).
  - both seats accept after a real game over → restart, clocks reset, flag timer re-armed.
- **Outcome forgery (regression for F1):** a client `{type:'gameOver',...}` frame → `parseClientMessage` rejects it; server never broadcasts a client-declared winner.
- **Integration (optional, Playwright already present, `package.json:14`):** two browser contexts join one room, play to checkmate and to a timeout, and assert the loser's client shows the server's `gameOver` (not a self-declared one). Reconnect test: drop one socket, reconnect with the seat token, assert full `gameState` resync.

---

## 7. Risks & backwards-compatibility

- **In-memory state / single instance.** The flag timer and clocks live in the process. A restart loses all games (already true, `api/src/lib/game.ts:5`). Multiple instances would split rooms and break the watchdog. Mitigation: stay single-instance (a non-goal to fix); document it. Only reach for Redis/DB if you later need multi-instance or crash-survivable games — out of scope now.
- **Clock skew from RTT.** The snapshot model ignores network latency, so a client can be up to ~1×RTT optimistic on its *own* displayed clock. The authoritative flag-fall is server-side, so this is cosmetic, not exploitable. Accepted per §2.
- **Disconnect during a running clock.** Today the clock simply isn't ticking server-side, so disconnects are "free". With the authoritative clock, a disconnected player on the move keeps losing time. Decide explicitly: either (a) keep the clock running (simplest, matches real chess servers) or (b) pause `turnStartedAt` on `opponentDisconnected` and resume on reconnect. Recommend (a) for v1; note `removePlayer` (`api/src/lib/GameRoom.ts:40-47`) and reconnect (`:49-66`) are where you'd hook (b).
- **Subprotocol transport quirks.** Some proxies strip/echo `Sec-WebSocket-Protocol`; the server must echo the accepted subprotocol back or the browser closes the socket. If this bites the deploy (the `api` is a separate origin, `api/src/app.ts:7-12`), fall back to the one-time-ticket scheme (§3.5).
- **Cookie/CORS friction across origins.** HttpOnly seat cookies need `SameSite=None; Secure` + `credentials:'include'` + a non-wildcard CORS origin (currently `process.env.ORIGIN`, `api/src/app.ts:7-9`). If the portfolio deploy can't do that cleanly, the one-time-ticket fallback avoids cookies entirely.
- **Breaking the join URL (F2/F5 fix).** Old `?color=` links and old JS `playerId` cookies become invalid once Steps 4–5 land. Because rooms are ephemeral, there are no long-lived links to migrate — just ship 4+5 together and bump any cached client. Steps 0–3 are wire-compatible enough to ship first (keep emitting legacy `opponentMove`/`connected` during the transition, then drop in Step 6).
- **Type duplication during transition.** Step 0 keeps old type aliases so importers don't churn; the risk is the copied `protocol.ts` drifting again — the `lint`-time identity check (§4.1) is the guardrail. Graduate to a real shared package (Option B) if drift recurs.

---

## 8. File-change quick reference

| Concern | Server | Client |
|---|---|---|
| Protocol types | `api/src/lib/protocol.ts` (new), `api/src/lib/types.ts:16-27` | `src/lib/chess/protocol.ts` (new), `src/lib/chess/types.ts:41-47` |
| Move auth / resync | `api/src/lib/GameRoom.ts:90-97,191-194` | `src/lib/chess/MultiplayerGameState.ts:41-73,143-151` |
| Clock / flag-fall | `api/src/lib/GameRoom.ts:16,99-134,289-297` | `src/lib/chess/MultiplayerGameState.ts:18,153-235` |
| Outcomes / rematch gating | `api/src/lib/GameRoom.ts:68-88,136-160,175-189` | `src/lib/chess/MultiplayerGameState.ts:97-116,229-242` |
| Seats / color assignment | `api/src/routes/game.ts:10-20`, `api/src/lib/game.ts:17-31`, `api/src/lib/GameRoom.ts:8-9,22-38` | `src/lib/components/PlayDrawer/PlayDrawer.svelte:28-57`, `src/routes/room/+page.svelte:10-11` |
| WS auth / reconnect | `api/src/lib/websocket.ts:43-69,25-26`, `api/src/lib/GameRoom.ts:49-66` | `src/lib/chess/MultiplayerGameState.ts:30,36-39,122-128`, `src/lib/websocket/WebSocketManager.ts:10-13`, `src/lib/utils.ts:89-100` |
| Inbound validation | `api/src/lib/game.ts:51-56`, `api/src/lib/GameRoom.ts:68-88` | `src/lib/websocket/WebSocketManager.ts:39,47` |
