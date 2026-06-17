# Architecture Decision Records

This directory records the deliberate design decisions behind Stalemates. Each ADR
follows a standard lightweight format — **Title, Status, Context, Decision,
Consequences, Alternatives considered** — and is immutable once accepted: to change a
decision, add a new ADR that supersedes the old one rather than editing it. Statuses
are `Proposed` (designed, not yet built), `Accepted` (in effect), or `Superseded`.
For the domain terms these decisions reference, see [`../../CONTEXT.md`](../../CONTEXT.md).

- [0001 — Single-instance, in-memory game state](0001-single-instance-in-memory-state.md)
  *(Accepted)* — Keep multiplayer game state in an in-memory `Map` on a single
  backend instance; no database or Redis.
- [0002 — Server-authoritative outcomes, colors, and clocks](0002-server-authoritative-outcomes.md)
  *(Proposed)* — Move winner/color/clock/end-condition authority server-side; detailed
  in [`../server-authority-plan.md`](../server-authority-plan.md).
- [0003 — Two deployment targets](0003-two-deployment-targets.md) *(Accepted)* —
  SvelteKit frontend on Vercel plus the stateful API on a long-lived host, because the
  backend cannot be serverless.
