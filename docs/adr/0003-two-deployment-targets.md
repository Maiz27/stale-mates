# 3. Two deployment targets (SvelteKit on Vercel + stateful API on a long-lived host)

- **Status:** Accepted
- **Date:** 2026-06-16

## Context

Stalemates is two distinct runtimes with very different deployment needs:

- **The SvelteKit frontend** (repo root, `src/`) serves the UI and runs the entire
  **AI mode** in the browser — Stockfish executes in a Web Worker
  (`src/lib/engine/Stockfish.ts`), so AI play needs no backend at all. This is a
  classic request/response web app that fits serverless hosting (Vercel) well.

- **The multiplayer backend** (`api/`) is a stateful Express + `ws` server. It holds
  every game in an in-memory `Map<string, GameRoom>` (`api/src/lib/game.ts`, see
  ADR 0001), keeps **long-lived WebSocket connections** open for the duration of a
  game (`api/src/lib/websocket.ts`), and — per the server-authority plan (ADR 0002) —
  will own a per-room flag-fall **timer** that must keep running between requests.

A serverless function is request-scoped and stateless: it spins up per request, may
run on any of many instances, and is frozen/torn down between invocations. None of
the backend's requirements survive that model — in-memory rooms would not be shared
across instances, persistent WebSockets cannot be held, and a `setTimeout` watchdog
would not fire after the function returns. The audit (`AUDIT.md`, C1) flagged this
mismatch and that the backend host was previously undocumented and unreproducible
from a clone.

## Decision

Deploy the two parts to **two different targets**:

1. **Frontend → Vercel** (serverless), via the SvelteKit Vercel adapter.
2. **Backend → a long-lived, always-on host** (a persistent container/VM, e.g.
   Fly/Railway/Render or any Docker host) so a single process can hold in-memory
   state, persistent WebSockets, and timers.

The two are separate origins and communicate over REST (`POST /game/create`) and a
WebSocket (`/game/join`). Cross-origin access is handled by CORS on the API
(`api/src/app.ts`, `ORIGIN` env var) and a `VITE_API_WS_URL` on the client. The
backend exposes `/health` (`api/src/app.ts`) for the host's health checks.

## Consequences

**Positive**
- Each part runs on infrastructure that matches it: cheap, scalable static/SSR
  hosting for the frontend; a persistent process for the stateful backend.
- AI mode has zero backend dependency and keeps working even if the API is down.

**Negative / accepted trade-offs**
- Two deploy pipelines and two hosts to operate instead of one.
- Cross-origin coupling: CORS config and a correct `VITE_API_WS_URL` / `ORIGIN`
  pairing are required, and (per ADR 0002) cookie-based seat tokens across origins
  need `SameSite=None; Secure`.
- The backend host must be committed as reproducible deploy config (Dockerfile +
  platform config) so the project is runnable from a clone — this is the remediation
  for audit C1.

## Alternatives considered

- **Everything on Vercel serverless.** Rejected: the stateful WS backend cannot hold
  in-memory rooms, persistent sockets, or timers under a request-scoped, multi-instance
  model.
- **Everything on one long-lived server** (also host the SvelteKit app there).
  Possible, but gives up Vercel's frontend hosting/CDN benefits and puts the
  low-traffic UI on the same box as the stateful service for no real gain.
- **Make multiplayer serverless via a managed realtime service** (e.g. a hosted
  WebSocket/pub-sub provider with external state). A larger re-architecture that also
  implies the persistence in ADR 0001 was rejected; out of scope for a hobby project.
