# Stalemates — Audit & Improvement Plan

A full audit of the Stalemates chess platform (SvelteKit frontend on Vercel + a separate
stateful Express/`ws` backend with in-memory game rooms), across four dimensions: security &
backend robustness, frontend game-logic correctness, architecture/deployment/DX, and
UX/accessibility/features.

Severity is framed for a hobby/portfolio project: **Critical** = the app can't work, can't deploy,
or is trivially exploitable; **High** = serious bug or major gap; **Medium/Low** = polish.

> Status column: ✅ fixed in this pass · 🟡 partially addressed · ⬜ open · 📄 design doc written
> See `docs/server-authority-plan.md` for the authoritative-backend refactor plan.

---

## The headline issue: the game is client-authoritative

The server keeps its own `chess.js` board but does **not** hold authority over outcomes:

- **Timeout winner is sent by the client and broadcast verbatim** — any player can send
  `{"type":"gameOver","reason":"timeout","winner":"<me>"}` at any time and win.
- **The client picks its own color** via a URL query param (no validation; both players can be white).
- **Anyone with the room ID can join** — no invite/seat token; reconnect is authenticated only by a
  `playerId` that leaks into the WS URL, server logs, and a JS-readable cookie.

The proper fix is to move winner/color/clock/end-condition authority fully server-side. This is
captured as a staged plan in `docs/server-authority-plan.md`.

---

## Critical

| #   | Finding                                                                                                                                                                                                                                               | Location                                               | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------ |
| C1  | **Deployment mismatch** — frontend targets Vercel serverless, backend is a long-lived stateful WS process with in-memory state. No Dockerfile/fly/railway/render/`vercel.json` in repo; backend host is undocumented and unreproducible from a clone. | `svelte.config.js`, `api/`                             | ✅     |
| C2  | **One bad WS frame crashes the whole server** — unguarded `JSON.parse(message)` and illegal moves _throw_ in chess.js beta; both uncaught, all games share one process → unauthenticated DoS.                                                         | `api/src/lib/game.ts:54`, `api/src/lib/GameRoom.ts:92` | ✅     |
| C3  | **Forge any win / impersonate side / hijack room** — client-supplied timeout winner, client-chosen color, no join auth, reconnect by leaked `playerId`.                                                                                               | `GameRoom.ts`, `websocket.ts`                          | 🟡     |
| C4  | **AI game can permanently hang** — Stockfish `setPosition`/`go` silently no-op off `Waiting`; undo during AI thinking + no search cancellation applies a stale `bestmove` or drops it, freezing the game with no watchdog.                            | `Stockfish.ts`, `AIGameState.ts`                       | ✅     |

## High

| #   | Finding                                                                                                                                                                                               | Location                                             | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| H1  | **No persistence / single instance** — in-memory `Map`; restart loses all games; can't scale horizontally. Acceptable for a hobby project _if documented_.                                            | `api/src/lib/game.ts:5`                              | ✅     |
| H2  | **Client reconnect missing despite server support** — `WebSocketManager` opens one socket and never retries; `onClose` never wired, though `reconnectPlayer` + `playerId` cookie exist server-side.   | `src/lib/websocket/WebSocketManager.ts`              | ✅     |
| H3  | **Clocks are client-side** — both clients tick independently → drift, `setInterval` throttling when backgrounded, reconnect hands back free time, `firstMovesMade` can freeze a clock.                | `MultiplayerGameState.ts:176-275`                    | ✅     |
| H4  | **Memory leaks** — each game creates 7 `Audio` objects + a Stockfish Worker with no cleanup; no room TTL (abandoned rooms leak, no rate limiting on `/game/create`).                                  | `AudioCue.ts`, `GameModel.ts`, `api/src/lib/game.ts` | ✅     |
| H5  | **Testing ≈ zero** — `src/index.test.ts` / `tests/test.ts` are stubs; Vitest + Playwright unused; no CI. Pure functions (Stockfish mappers, `convertTimeOption`, board utils) are trivially testable. | tests                                                | ✅     |
| H6  | **Missing core chess features** — move list/PGN (data already tracked!), game-result _reason_ (only "wins/draw"), resign, draw offer, board flip.                                                     | UI                                                   | 🟡     |
| H7  | **SEO/social** — no Open Graph/Twitter cards, no per-page `<title>`, no web manifest despite a full PWA icon set in `static/`.                                                                        | `+layout.svelte`, `app.html`                         | ✅     |
| H8  | **Accessibility** — board is mouse/touch only (keyboard users can't play); no `aria-live` move announcements.                                                                                         | `ChessBoard.svelte`                                  | 🟡     |

## Medium

| #   | Finding                                                                                                                                                                                                                                                                                | Location                                 | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ |
| M1  | **Type/protocol duplication & drift** — `Color`/`TimeControl`/`TimeOption`/move shapes redefined in `src/lib` and `api/src/lib`; `TimeControl` already drifted; WS messages typed `any`.                                                                                               | both `types.ts`                          | 🟡     |
| M2  | **Mid-game color change desyncs** `gameState.player` vs board orientation → AI plays wrong side.                                                                                                                                                                                       | `AIGameState.ts`, `ai/+page.svelte`      | ✅     |
| M3  | **AI under-promotion lost** — always promotes to queen, discarding Stockfish's choice; board input not locked during promotion modal.                                                                                                                                                  | `AIGameState.ts:78`, `ChessBoard.svelte` | ✅     |
| M4  | **DX** — `api/` has no lint/format/test scripts; no shared tsconfig; no root install/build-all; no env validation; raw `console.*` logging (logs `playerId`); no `/health`, no graceful shutdown, no error monitoring.                                                                 | tooling                                  | 🟡     |
| M5  | **UX friction** — "Waiting for opponent" dead end (no re-copy invite, no color shown, no leave); no toast on copy; weak game-over overlay (no rematch/analyze in AI); no error states for invalid/full room; empty `<footer>`; no 404 page; board shrinks to ⅓ width on large screens. | routes                                   | 🟡     |

## Low

- Stockfish `getHint` guard `if (!this.started ...)` checks the store object, not its value (dead guard).
- `$: started = false` reactive-label smell across `ChessBoard.svelte` / `ai/+page.svelte` (use plain `let`).
- `config` object in `ChessBoard.svelte` rebuilt every reactive tick (hoist static parts).
- Checkmate plays the `check` sound but the `game-end` cue may not fire (`checkGameOver` sets cue, doesn't play).
- README hero image is a fragile Google-Drive thumbnail.

---

## Recommended order of attack

1. **Make the server authoritative** (winner, color, clocks, end conditions) + crash guards — kills the
   cheat vectors _and_ the DoS. (`docs/server-authority-plan.md`)
2. **Commit a real backend deploy config** (Dockerfile + fly/railway) and document the two-target split.
3. **Client reconnect with backoff** — server already supports it; biggest fix-per-line.
4. **CI + unit tests on the pure functions** — one GitHub Action + a handful of tests.
5. **Quick wins** (this pass): game-result reasons, PGN move-list panel (hosts the `aria-live` region),
   OG/Twitter meta + per-page titles, web manifest, copy toast, resign + board-flip, AI-hang fix, worker `destroy()`.

---

## What this pass changed

**Audit pass (baseline):** Tier-1 quick wins + cheap Critical backend guards (C2, C4), and the
server-authority design doc.

**Remediation pass (this branch):**

- **C1 ✅** — `api/Dockerfile` + `.dockerignore` + `fly.toml`, two-target deploy docs in `README.md`.
- **H5 🟡 / M4 🟡** — `.github/workflows/ci.yml` (lint + check + unit tests, both targets); real unit
  tests for the pure seams (`clock`, `outcome`, board utils, `convertTimeOption`); api test scripts.
  Playwright integration tests still TODO.
- **H3 ✅ / C3(F1) ✅ / F4 ✅ / F5 ✅** — multiplayer server is now authoritative for clocks and
  outcomes: ms-based clock + per-room flag-fall watchdog (pure, tested), client-trusted `gameOver`
  removed (no more forged wins), rematch gated on a real game end, client interpolates a server clock
  snapshot instead of self-declaring timeouts.
- **Latent draw-reason bug ✅** — `gameOutcome()` distinguishes stalemate/threefold/insufficient/
  fifty-move.
- **C3(F2) 🟡** — duplicate-color joins rejected server-side (two players can't both be white).
- **H2 ✅** — client WebSocket reconnect with exponential backoff + jitter; reconnecting banner.
- **M1 🟡** — single canonical `TimeControl` (drift resolved); `ClockSnapshot`/`GameOverReason`
  mirrored both sides. Full copied-`protocol.ts` module deferred (arch #6).
- **M2 ✅** — AI no longer desyncs on a mid-game color change.
- **arch #4 ✅** — dead `Engine` base class deleted; double UCI init fixed.
- **arch #1/#2/#5 ✅ (Phase 2.1)** — `GameState` inheritance replaced by a concrete `GameModel`
  base composing a pure `ChessCore` + `AudioCue` (no more `console.warn` stubs in MP); the ~18
  per-field stores collapsed into one `Readable<GameView>` (player-relative `clock`); `ChessBoard`
  is presentational (props in / `move`+`promotion` events out), `bind:this` command routing gone,
  result text extracted to a pure unit-tested `formatResult()`. Behaviour-preserving:
  svelte-check 0/0, eslint, 28 unit tests, `vite build` all green.
- **`moveHistory` reset bug ✅** — history backing the AI undo guard wasn't cleared on
  newGame/endGame; a stale game's history survived a reset. Fixed + regression-tested.
- **H4 ✅** — abandoned-room TTL sweep (configurable `ROOM_TTL_MS`, default 30 min, never spawned
  in tests) + per-IP rate limit on `POST /game/create` (429); audio/worker cleanup already landed.
- **H5 ✅** — real Playwright e2e harness (AI move + Stockfish reply, two-context multiplayer move
  propagation) wired into CI; backs the unit suites already in place.
- **H1 ✅** — single-instance/in-memory limitation documented in `api/README.md` (accepted by design).
- **M1 🟡→** — client WS traffic now fully typed via `src/lib/chess/protocol.ts`
  (`ServerMessage`/`ClientMessage` unions); the last `any`s in `WebSocketManager` are gone. A single
  protocol module shared verbatim with the server still remains (arch #6).
- **M4 🟡→** — env validation (fail-fast) + eslint/prettier + lint/format scripts for `api/`; `/health`
  and graceful shutdown already existed. Shared tsconfig and error monitoring still open.

**Deliberately deferred (need two-browser end-to-end verification not available in this session):**

- **C3(F3) + server-authority plan Steps 4–5** — seat tokens, `Sec-WebSocket-Protocol`/ticket
  transport, HttpOnly creator cookie, server-side color assignment. The riskiest, most user-visible
  change; tracked in issue #10. Join URL/`?color=` scheme unchanged for now.

---

## Follow-up audit (second pass)

A second review found new game-breaking multiplayer bugs, AI/board bugs, backend
hardening gaps, tooling drift and UX gaps. Items are grouped by work package; IDs are
referenced from commit messages.

### SM-4 — Tooling & docs

| #      | Finding                                                                                                                                        | Status |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| SM-4.1 | `prettier-plugin-tailwindcss@0.8` crashed on prettier 3.3 (`e.charAt is not a function`); prettier check disabled in CI                        | ✅     |
| SM-4.2 | `bun install --frozen-lockfile` failed (root + api): binary lockfiles out of sync; CI didn't use frozen installs or pin Bun                    | ✅     |
| SM-4.3 | `vite build` failed on Node 24 (adapter-vercel 5 auto-runtime); no `engines`/`.nvmrc`                                                          | ✅     |
| SM-4.4 | `api/Dockerfile` used `npm install`, ignoring the Bun lockfile (non-reproducible image)                                                        | ✅     |
| SM-4.5 | CI: no api lint, no concurrency/cancel, duplicate push+PR runs, e2e on Node 20, no dependabot, no build step                                   | ✅     |
| SM-4.6 | `@eslint/js` missing from root devDeps; `@types/js-cookie` in dependencies; DaisyUI `bg-base-100` leftover; stub `tests/test.ts`; dead helpers | ✅     |
| SM-4.7 | `CONTEXT.md` described the deleted `GameState.ts`/per-field stores; README lacked testing/Node/`ROOM_TTL_MS`/Stockfish GPL notes               | ✅     |

### SM-1 — Multiplayer game-breaking bugs

| #      | Finding                                                                                                                                                                                                                                          | Status |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| SM-1.1 | Reconnect race: the old socket's late `close` ran `removePlayer(playerId)` and nulled the **new** socket (player deaf, room possibly deleted). Now socket-identity checked, old socket closed with 4000, ping/pong heartbeat                     | ✅     |
| SM-1.2 | Room deleted the instant every player disconnected (creator refreshing the waiting page killed it). Rooms are now only reaped by the TTL sweep, measured from last activity                                                                      | ✅     |
| SM-1.3 | Reconnecting into a finished game showed no result. `gameState` now carries `gameOver` + rematch state                                                                                                                                           | ✅     |
| SM-1.4 | Server accepted a move after the mover's flag fell (watchdog latency). Moves now check remaining time first; flagging vs a lone king is a draw (`timeoutVsInsufficient`)                                                                         | ✅     |
| SM-1.5 | Move list/PGN wiped on every resync (`core.load(fen)` clears history); rejected optimistic moves lingered. `gameState` now carries the UCI move list, which the client replays                                                                   | ✅     |
| SM-1.6 | Opponent disconnects were never shown (`gameState` forced `opponentConnected: true`). New `opponentDisconnected`/`opponentReconnected`, a badge, and a server-verified `claimVictory` after a grace period (`DISCONNECT_GRACE_MS`, default 60 s) | ✅     |
| SM-1.7 | A rejected/expired/full room left a dead-end page (status `closed`, nothing rendered). New `rejected`/`replaced` statuses with "Room not found or full" + Home, and a "Connecting…" state                                                        | ✅     |

### SM-2 — AI & board bugs

| #       | Finding                                                                                                                                                                                                                                | Status |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| SM-2.1  | Undo while the AI was thinking always undid 2 plies (removing the AI's _previous_ move and handing the AI the player's side); `endGame` didn't stop the engine; a stopped search's late `bestmove` could be applied to the next search | ✅     |
| SM-2.2  | Dismissing the promotion dialog (Esc / outside click / swipe) left `promotionMove` set — the board stayed locked                                                                                                                       | ✅     |
| SM-2.3  | Board stayed movable after game over                                                                                                                                                                                                   | ✅     |
| SM-2.4  | Colour change after game over desynced board orientation (settings store) from the AI's side (model). Board now reads `view.player`                                                                                                    | ✅     |
| SM-2.5  | Hints left `UCI_AnalyseMode`/`Analysis Contempt`/`MultiPV` set (weakening/altering later AI moves), a stale hint arrow survived a move, double-clicks nested hint callbacks                                                            | ✅     |
| SM-2.6  | Verified: a `bestmove` arriving before `readyok` was dropped by the init-only handler (AI-as-white could hang on a fast Start); no `worker.onerror`                                                                                    | ✅     |
| SM-2.7  | `formatTime` rounded seconds → "00:60"                                                                                                                                                                                                 | ✅     |
| SM-2.8  | `PLAYER_ID_EXPIRATION` was 14,400,000 _days_ (ms passed to js-cookie's day-based `expires`)                                                                                                                                            | ✅     |
| SM-2.9  | Unguarded `JSON.parse` of the player-id cookie and saved settings could crash the page; `PlayAiForm` mutated `$settingsStore` in place (cancel still applied edits)                                                                    | ✅     |
| SM-2.10 | Room low-time warning hard-coded at 10 s; now uses the server's per-control `lowTimeThreshold` (landed with SM-1)                                                                                                                      | ✅     |
