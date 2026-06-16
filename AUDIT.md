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
| C1  | **Deployment mismatch** — frontend targets Vercel serverless, backend is a long-lived stateful WS process with in-memory state. No Dockerfile/fly/railway/render/`vercel.json` in repo; backend host is undocumented and unreproducible from a clone. | `svelte.config.js`, `api/`                             | ⬜     |
| C2  | **One bad WS frame crashes the whole server** — unguarded `JSON.parse(message)` and illegal moves _throw_ in chess.js beta; both uncaught, all games share one process → unauthenticated DoS.                                                         | `api/src/lib/game.ts:54`, `api/src/lib/GameRoom.ts:92` | ✅     |
| C3  | **Forge any win / impersonate side / hijack room** — client-supplied timeout winner, client-chosen color, no join auth, reconnect by leaked `playerId`.                                                                                               | `GameRoom.ts`, `websocket.ts`                          | 📄     |
| C4  | **AI game can permanently hang** — Stockfish `setPosition`/`go` silently no-op off `Waiting`; undo during AI thinking + no search cancellation applies a stale `bestmove` or drops it, freezing the game with no watchdog.                            | `Stockfish.ts`, `AIGameState.ts`                       | ✅     |

## High

| #   | Finding                                                                                                                                                                                               | Location                                | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------ |
| H1  | **No persistence / single instance** — in-memory `Map`; restart loses all games; can't scale horizontally. Acceptable for a hobby project _if documented_.                                            | `api/src/lib/game.ts:5`                 | 🟡     |
| H2  | **Client reconnect missing despite server support** — `WebSocketManager` opens one socket and never retries; `onClose` never wired, though `reconnectPlayer` + `playerId` cookie exist server-side.   | `src/lib/websocket/WebSocketManager.ts` | ⬜     |
| H3  | **Clocks are client-side** — both clients tick independently → drift, `setInterval` throttling when backgrounded, reconnect hands back free time, `firstMovesMade` can freeze a clock.                | `MultiplayerGameState.ts:176-275`       | 📄     |
| H4  | **Memory leaks** — each `GameState` creates 7 `Audio` objects + a Stockfish Worker with no cleanup; no room TTL (abandoned rooms leak, no rate limiting on `/game/create`).                           | `GameState.ts`, `api/src/lib/game.ts`   | 🟡     |
| H5  | **Testing ≈ zero** — `src/index.test.ts` / `tests/test.ts` are stubs; Vitest + Playwright unused; no CI. Pure functions (Stockfish mappers, `convertTimeOption`, board utils) are trivially testable. | tests                                   | ⬜     |
| H6  | **Missing core chess features** — move list/PGN (data already tracked!), game-result _reason_ (only "wins/draw"), resign, draw offer, board flip.                                                     | UI                                      | 🟡     |
| H7  | **SEO/social** — no Open Graph/Twitter cards, no per-page `<title>`, no web manifest despite a full PWA icon set in `static/`.                                                                        | `+layout.svelte`, `app.html`            | ✅     |
| H8  | **Accessibility** — board is mouse/touch only (keyboard users can't play); no `aria-live` move announcements.                                                                                         | `ChessBoard.svelte`                     | 🟡     |

## Medium

| #   | Finding                                                                                                                                                                                                                                                                                | Location                                 | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ |
| M1  | **Type/protocol duplication & drift** — `Color`/`TimeControl`/`TimeOption`/move shapes redefined in `src/lib` and `api/src/lib`; `TimeControl` already drifted; WS messages typed `any`.                                                                                               | both `types.ts`                          | 📄     |
| M2  | **Mid-game color change desyncs** `gameState.player` vs board orientation → AI plays wrong side.                                                                                                                                                                                       | `AIGameState.ts`, `ai/+page.svelte`      | ⬜     |
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

This audit pass implemented the Tier-1 quick wins and the cheap Critical backend guards, and wrote the
server-authority design doc. Remaining items (deployment config, client reconnect, full server-authority
refactor, CI/tests) are tracked as GitHub issues and in the status columns above.
