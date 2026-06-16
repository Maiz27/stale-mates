# Stalemates — Architecture & Deepening Opportunities

This document captures the current architecture of the chess core and a ranked set of
**deepening opportunities** — structural refactors that make the codebase more correct,
more testable, and easier to navigate. It is the reference for the "Phase 2" chess-core
work and complements `AUDIT.md` (findings) and `docs/server-authority-plan.md` (the
biggest single refactor).

> Ranking is **impact-to-effort**. Effort: **S** ≈ <½ day · **M** ≈ ~1 day · **L** ≈ ~2 days.

> **Status (remediation branch):** #3 (pure clock) ✅ done server-side (`api/src/lib/clock.ts`);
> #4 (dead `Engine` base) ✅ done; #6 (shared domain-core) 🟡 partial — `gameOutcome()` +
> unified `TimeControl`/`ClockSnapshot`/`GameOverReason`, but not yet a single copied `protocol.ts`;
> the latent draw-reason bug ✅ fixed. #1/#2/#5 (composition / store consolidation / presentational
> board) remain **deferred** — high-regression-risk internal restructuring that needs interactive
> browser verification.

---

## Current shape (as-built)

The game logic is organized around a class hierarchy:

```
GameState  (src/lib/chess/GameState.ts)
   ├── AIGameState          (src/lib/chess/AIGameState.ts)        — play vs Stockfish
   └── MultiplayerGameState (src/lib/chess/MultiplayerGameState.ts) — play vs a remote peer
```

`GameState` owns *everything*: the `chess.js` instance and rules, ~18 per-field Svelte
`Writable` stores (board/turn/clocks/check/game-over/…), seven `Audio` cue objects, and
(in the AI subclass) a Stockfish web-worker. The two route pages (`src/routes/ai/+page.svelte`,
`src/routes/room/+page.svelte`) and the board component
(`src/lib/components/chessBoard/ChessBoard.svelte`) consume these stores and, in places,
drive the game by calling methods *through* the board via `bind:this`.

The multiplayer backend (`api/`) keeps its own authoritative-ish `chess.js` per `GameRoom`,
but today delegates several outcome decisions to the client — see
`docs/server-authority-plan.md`.

### Known structural smells (why the refactors below exist)
- **Liskov violation:** `MultiplayerGameState` stubs ~4/5 of `GameState`'s abstract/engine
  methods with `console.warn` — multiplayer is *not* a kind of AI-capable game; inheritance
  is the wrong relationship.
- **Store ceremony:** every consumer manually `subscribe`s, copies into a local, and
  `unsubscribe`s for ~18 separate stores. High boilerplate, easy to get wrong.
- **Time/units drift:** clock math mixes seconds and `Date.now()` milliseconds across client
  and server; `TimeControl` is defined twice and has already drifted (`AUDIT.md` M1).
- **Engine seam is stringly-typed:** callers parse raw UCI `bestmove` strings; a dead `Engine`
  base class shadows `Stockfish` with an incompatible `go()` signature.
- **Inverted control:** pages reach *into* the board (`newGame/resign/...`) instead of the
  board being a pure presentational component (props in / events out).

---

## Deepening opportunities (ranked)

### 1. (High / M) Composition over a pure `ChessCore` instead of inheritance
Replace the `GameState → AIGameState/MultiplayerGameState` inheritance with **composition**:
- A pure **`ChessCore`** module — rules only (wraps `chess.js`: make move, legal destinations,
  check/checkmate/draw detection, FEN). No stores, no audio, no sockets, no engine. Trivially
  unit-testable.
- An **`AudioCue`** adapter that owns the seven `Audio` objects and a `destroy()`; injected, not
  inherited.
- The two modes become **composition roots** that wire `ChessCore` + `AudioCue` + (AI) a
  Stockfish adapter / (MP) a `WebSocketManager`. They *share* the core rather than descending
  from a common ancestor that knows about engines.

Kills the Liskov violation and the `console.warn` stubs in `MultiplayerGameState`.

### 2. (High / S–M) Collapse the per-field stores into one `Readable<GameView>`
Replace the ~18 individual `Writable`s with a single derived **`Readable<GameView>`** view-model.
Deletes the manual subscribe/copy/unsubscribe ceremony at every call site
(`ChessBoard.svelte`, both route pages). Add **player-relative accessors** `myClock` /
`opponentClock` so the UI doesn't re-derive "which clock is mine" everywhere. Pairs naturally
with #1 — the composition root publishes the consolidated view-model.

### 3. (Med-High / S) Extract a pure `clock` module with injected `now`
A pure clock module — no `Date.now()` / `setTimeout` *inside* — that takes
`(clocks, turnStartedAt, timeControl, now)` and returns new state. Shared by the client's
display interpolation and the server's flag-fall. **Ships before/with the server-authority
rewrite** and kills the seconds-vs-ms drift. Makes flag-fall deterministic in tests
(see `docs/server-authority-plan.md` §3.2, §6).

### 4. (Med / S) Delete the dead `Engine` base class; type the Stockfish seam
`src/lib/engine/engine.ts` is a base class with a single subclass, an incompatible `go()`
signature, and a double `uci` init. Delete it and give `Stockfish` a typed
`onBestMove(move, { generation })` callback seam so callers stop parsing UCI strings. Makes
`AIGameState` testable against a fake engine.

### 5. (Med / M) Make `ChessBoard.svelte` purely presentational
Props in / events out. Remove the inverted `bind:this` command-routing where pages call
`newGame` / `resign` / … *through* the board. Lift `REASON_LABELS` / `resultText` out into a
pure `formatResult()` helper. Reduces coupling and makes the board reusable.

### 6. (Med / L) Shared domain-core (turn / outcome / time)
Widen `docs/server-authority-plan.md`'s protocol package from *wire types* to *domain logic*:
a single shared module exporting `Color`, `TimeControl` + `convertTimeOption`, `flipTurn`, and
one canonical **`gameOutcome()`** used by BOTH `src/` and `api/`. This also fixes the latent
bug below.

### 7. (Low-Med / S) `CONTEXT.md` + ADRs
Domain glossary and ADRs for the deliberate decisions (single-instance in-memory state,
server-authoritative outcomes, two-deployment split). Delivered as Phase-1 Stream C
(`CONTEXT.md`, `docs/adr/*`).

---

## Latent bug (✅ FIXED on the remediation branch) — generic draw reason from the server

`api/src/lib/GameRoom.ts` `determineGameOutcome` (~lines 225–231) collapses every
non-checkmate ending to `reason: 'draw'`, discarding stalemate / threefold / insufficient
material / fifty-move — outcomes the client's `checkGameOver` now distinguishes. Since the
server is authoritative for multiplayer game-over, it broadcasts the generic `'draw'` reason,
so a multiplayer **stalemate displays "Draw" instead of "Stalemate"** (the winner is still
correct, so severity is low). Fixed structurally by the shared `gameOutcome()` in #6 / the
shared domain-core step of the server-authority plan, or as a standalone quick fix.

---

## Recommended sequencing

The chess core is central, so these refactors and the server-authority rewrite **cannot run
in parallel with each other**. Do the foundational refactors *before* the server-authority
rewrite so the rewrite builds on clean seams:

1. Composition refactor (#1, #2) — then #5, #4.
2. Shared domain-core / protocol (#6) — also fixes the latent draw-reason bug.
3. Server-authority refactor (`docs/server-authority-plan.md`, Steps 0–6) — builds on #3's
   pure clock and #6's shared `gameOutcome()`.
4. Client reconnect with backoff — part of / right after the server-authority work.
5. Mid-game color desync fix (`AIGameState.ts` + `ai/+page.svelte`) — independent; slot in
   anytime.
