/**
 * How long a graceful shutdown may take before the process force-exits
 * (index.ts). Must stay below the platform's kill timeout (`kill_timeout` in
 * fly.toml) so the server's own exit always wins (CR3-6).
 */
export const SHUTDOWN_FORCE_EXIT_MS = 5_000;
