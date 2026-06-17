# 2. Server-authoritative outcomes, colors, and clocks

- **Status:** Proposed
- **Date:** 2026-06-16

## Context

The multiplayer backend validates moves with `chess.js`, but it **delegates several
authority-bearing decisions to the client**. The audit (`AUDIT.md`, headline issue
and C3) and the detailed plan (`docs/server-authority-plan.md` §1.1) verify five
concrete problems, each forgeable by a malicious or buggy client:

- **Timeout winner is client-supplied.** The server routes a client
  `{type:'gameOver', reason:'timeout', winner}` straight into a broadcast with no
  verification (`api/src/lib/GameRoom.ts`, `handleMessage` → `handleTimeOut`). Any
  player can declare themselves the winner at any time.
- **Color is client-chosen and unvalidated.** Color comes from the WebSocket URL
  query param (`api/src/lib/websocket.ts`) and is never checked for conflicts — both
  players can be white.
- **No join authorization.** Anyone with the room id can join; reconnect is
  "authenticated" only by a leaked `playerId` (in URLs, logs, and a JS-readable
  cookie).
- **Clocks are not ticked server-side.** The server only decrements a clock when that
  player moves; a player who never moves is never flagged on time. The only real-time
  flag-fall is the **client's** `setInterval`, which then tells the server who won.
- **Rematch / gameOver messages aren't gated** on real game state.

These mean the server is not the source of truth for outcomes, and the cheat vectors
above are trivially exploitable.

## Decision

Move authority for **winner, color assignment, clocks, and end conditions fully
server-side**, turning the client into a (mostly) pure renderer that interpolates a
server-provided clock snapshot and never decides outcomes. Specifically:

- Game over is produced only by the server (`checkGameEnd` / a server flag-fall
  watchdog); the client `gameOver`/`timeout` message is removed.
- Colors are assigned and validated server-side via per-seat tokens; two players
  cannot hold the same color.
- The server runs an authoritative, lazily-computed clock with a single flag-fall
  watchdog timer per running room, and emits clock snapshots the client interpolates.
- Reconnect uses a per-seat token that is not trivially forgeable and does not travel
  in the URL query string.
- One shared, typed message protocol replaces today's drifting duplicate types and
  `any` payloads, with inbound validation.

The full design — target architecture, message protocol, and an ordered, independently
shippable migration (Steps 0–6) — is specified in
**[`docs/server-authority-plan.md`](../server-authority-plan.md)**. This ADR records
the decision; the plan is the implementation reference and should not be duplicated
here.

This decision stays within the constraints of ADR 0001: the authoritative clocks and
watchdog live in-process on a single instance, with no new persistence store.

## Consequences

**Positive**
- Closes the forge-a-win, impersonate-a-color, hijack-a-seat, and stall-the-clock
  cheat vectors.
- The clock and turn logic becomes pure server logic, unit-testable without sockets
  (`docs/server-authority-plan.md` §6).
- A single typed protocol removes the type drift between `api/src/lib/types.ts` and
  `src/lib/chess/types.ts` (audit M1).

**Negative / accepted trade-offs**
- Larger refactor touching both the server move/clock/seat paths and the client
  `MultiplayerGameState` / `WebSocketManager`; shipped in stages to stay low-risk.
- The join URL changes (old `?color=` links and `playerId` cookies become invalid).
  Acceptable because rooms are ephemeral, so there are no long-lived links.
- Clock display can be up to ~1×RTT optimistic on the client; the authoritative
  flag-fall is server-side, so this is cosmetic, not exploitable
  (`docs/server-authority-plan.md` §7).

## Alternatives considered

- **Keep client-authoritative play, add light validation.** Cheap, but leaves every
  forgery vector open; rejected as insufficient.
- **Full anti-cheat** (engine-assistance detection, RTT/premove analysis). Out of
  scope for a friendly-duel app; the plan explicitly closes only forgery of
  outcomes/colors/seats (`docs/server-authority-plan.md` §2 non-goals).
- **Big-bang rewrite.** Higher risk; rejected in favor of the staged migration in
  the plan, where each step compiles and ships independently.

Status is **Proposed**: this is a written design that has not yet been implemented.
