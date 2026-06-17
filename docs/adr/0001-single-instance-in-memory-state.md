# 1. Single-instance, in-memory game state

- **Status:** Accepted
- **Date:** 2026-06-16

## Context

Multiplayer games are stored in a plain `Map<string, GameRoom>` that lives in the
backend process's memory (`api/src/lib/game.ts`). Each `GameRoom`
(`api/src/lib/GameRoom.ts`) holds its own `chess.js` board, current turn, per-player
clocks, and rematch state. There is no database, no Redis, and no persistence layer.

Consequences of this, identified in the audit (`AUDIT.md`, H1) and the refactor plan
(`docs/server-authority-plan.md`, §2 non-goals and §7 risks):

- A process restart or crash **loses every in-progress game**.
- The server **cannot scale horizontally** — a second instance would not see the
  rooms held by the first, so two players routed to different instances could never
  meet, and an authoritative clock/watchdog timer (planned in the server-authority
  refactor) only exists in the process that owns the room.

Stalemates is a hobby/portfolio project for short, friendly games between two people
who share a link. Rooms are ephemeral by design: a room is deleted as soon as both
players disconnect (`api/src/lib/game.ts`, `removePlayerFromGame`). There is no
account system, no match history, and no expectation that a game survives a server
restart.

## Decision

Keep all multiplayer game state in the in-memory `Map` on a **single backend
instance**. Do not add a database or Redis. Treat single-instance, non-persistent,
ephemeral rooms as an explicit, documented constraint rather than a deficiency.

The planned server-authority refactor (ADR 0002) is designed to respect this: its
authoritative clocks and flag-fall watchdog deliberately live in-process and assume
a single instance (`docs/server-authority-plan.md` §2, §7).

## Consequences

**Positive**
- Drastically simpler: no schema, no migrations, no external service to run or pay
  for, no serialization of `chess.js` state.
- Low latency and trivial local development — clone and run, nothing to provision.
- Fits the actual product: rooms are short-lived and disposable.

**Negative / accepted risks**
- All games are lost on restart, crash, or deploy. Acceptable for friendly duels.
- Cannot run more than one instance; no horizontal scaling and no failover.
- Abandoned rooms can leak until both sockets close; there is no room TTL yet
  (`AUDIT.md` H4). This is a separate, in-scope cleanup, not a reason to add a store.

## Alternatives considered

- **Redis-backed rooms** — enables multi-instance and crash survival, but adds an
  external dependency, connection management, and serialization for state that is
  meant to be ephemeral. Rejected as overkill for the product.
- **A SQL/document database** — persistent match history and reconnect-after-restart,
  at the cost of a schema, migrations, and write latency on every move. Out of scope;
  there is no requirement to persist finished or in-progress games.

If a future requirement forces multi-instance operation or crash-survivable games,
revisit this decision and reach for Redis first (per `docs/server-authority-plan.md`
§7). Until then, single-instance in-memory state is the intended design.
